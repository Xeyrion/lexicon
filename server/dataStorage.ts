import type { IncomingMessage, ServerResponse } from 'node:http'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Plugin } from 'vite'

const APP_ID = 'lexicon'
const SCHEMA_VERSION = 1
const KINDS = ['study', 'reader', 'reader-progress'] as const
const MAX_BODY_BYTES = 64 * 1024 * 1024
const KEEP_BACKUPS = 30

type Kind = (typeof KINDS)[number]

interface Envelope {
  appId: string
  schemaVersion: number
  kind: Kind
  revision: number
  updatedAt: string
  data: unknown
}

interface FileInfo {
  exists: boolean
  revision?: number
  updatedAt?: string
  bytes?: number
}

interface BackupKindInfo {
  count: number
  bytes: number
  latest?: string
}

interface BackupInfo {
  total: number
  bytes: number
  byKind: Record<Kind, BackupKindInfo>
}

function resolveDataDir(): string {
  const override = process.env.LEXICON_DATA_DIR?.trim()
  if (override) return path.resolve(override)
  if (process.env.APPDATA) return path.join(process.env.APPDATA, 'lexicon')
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'lexicon')
  }
  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Roaming', 'lexicon')
  }
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'), 'lexicon')
}

const DATA_DIR = resolveDataDir()
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const writeQueues = new Map<Kind, Promise<unknown>>()

function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value)
}

function fileFor(kind: Kind): string {
  return path.join(DATA_DIR, `${kind}.json`)
}

function dateStamp(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

async function readEnvelope(kind: Kind): Promise<Envelope | null> {
  const file = fileFor(kind)
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    const detail = error instanceof Error ? error.message : String(error)
    throw httpError(
      500,
      `无法读取数据文件 ${file}：${detail}。请先备份或重命名该文件，然后重启应用。`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw httpError(
      500,
      `数据文件 ${file} 不是合法的 JSON（${detail}）。请先备份或重命名该文件，然后重启应用。`,
    )
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw httpError(
      500,
      `数据文件 ${file} 格式不正确（顶层应为包含 appId、kind、revision、data 的对象）。请先备份或重命名该文件，然后重启应用。`,
    )
  }

  const envelope = parsed as Partial<Envelope>
  if (
    envelope.appId !== APP_ID ||
    envelope.kind !== kind ||
    typeof envelope.revision !== 'number' ||
    !('data' in envelope)
  ) {
    throw httpError(
      500,
      `数据文件 ${file} 格式不正确（缺少 appId、kind、revision 或 data 等必要字段）。请先备份或重命名该文件，然后重启应用。`,
    )
  }
  return envelope as Envelope
}

async function writeEnvelopeAtomic(kind: Kind, envelope: Envelope): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  const target = fileFor(kind)
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temp, `${JSON.stringify(envelope)}\n`, 'utf8')
  try {
    await rename(temp, target)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

async function pruneBackups(kind: Kind): Promise<void> {
  let names: string[]
  try {
    names = await readdir(BACKUP_DIR)
  } catch {
    return
  }
  const prefix = `${kind}-`
  const stale = names
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .sort()
    .slice(0, -KEEP_BACKUPS)
  await Promise.all(stale.map((name) => rm(path.join(BACKUP_DIR, name), { force: true })))
}

async function ensureDailyBackup(kind: Kind): Promise<void> {
  const target = fileFor(kind)
  try {
    await stat(target)
  } catch {
    return
  }
  await mkdir(BACKUP_DIR, { recursive: true })
  const backup = path.join(BACKUP_DIR, `${kind}-${dateStamp()}.json`)
  try {
    await stat(backup)
  } catch {
    await copyFile(target, backup)
    await pruneBackups(kind)
  }
}

const BACKUP_NAME_PATTERN =
  /^(reader-progress|reader|study)-(\d{4}-\d{2}-\d{2})\.json$/

function emptyBackupInfo(): BackupInfo {
  return {
    total: 0,
    bytes: 0,
    byKind: {
      study: { count: 0, bytes: 0 },
      reader: { count: 0, bytes: 0 },
      'reader-progress': { count: 0, bytes: 0 },
    },
  }
}

async function readBackupInfo(): Promise<BackupInfo> {
  const info = emptyBackupInfo()
  let names: string[]
  try {
    names = await readdir(BACKUP_DIR)
  } catch {
    // 备份目录还不存在（或暂时不可读）时按 0 处理，不影响数据状态接口。
    return info
  }

  await Promise.all(
    names.map(async (name) => {
      const match = BACKUP_NAME_PATTERN.exec(name)
      if (!match) return
      const kind = match[1] as Kind
      let size: number
      try {
        const file = await stat(path.join(BACKUP_DIR, name))
        if (!file.isFile()) return
        size = file.size
      } catch {
        return
      }
      const entry = info.byKind[kind]
      entry.count += 1
      entry.bytes += size
      if (!entry.latest || name > entry.latest) entry.latest = name
      info.total += 1
      info.bytes += size
    }),
  )

  return info
}

function withLock<T>(kind: Kind, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(kind) ?? Promise.resolve()
  const next = previous.then(task, task)
  writeQueues.set(
    kind,
    next.then(
      () => undefined,
      () => undefined,
    ),
  )
  return next
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(payload))
}

function isLocalOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (!origin) return true
  try {
    const { hostname } = new URL(origin)
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1'
  } catch {
    return false
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw httpError(413, '数据文件太大。')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function statusPayload(): Promise<{
  appId: string
  schemaVersion: number
  directory: string
  backupDirectory: string
  keepBackups: number
  files: Record<Kind, FileInfo>
  backups: BackupInfo
}> {
  const files = {} as Record<Kind, FileInfo>
  for (const kind of KINDS) {
    let bytes: number
    try {
      bytes = (await stat(fileFor(kind))).size
    } catch (error) {
      files[kind] =
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? { exists: false }
          : { exists: true }
      continue
    }
    try {
      const envelope = await readEnvelope(kind)
      files[kind] = {
        exists: true,
        revision: envelope?.revision,
        updatedAt: envelope?.updatedAt,
        bytes,
      }
    } catch {
      // 文件存在但内容损坏时仍返回大小，方便设置页判断磁盘占用。
      files[kind] = { exists: true, bytes }
    }
  }
  return {
    appId: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    directory: DATA_DIR,
    backupDirectory: BACKUP_DIR,
    keepBackups: KEEP_BACKUPS,
    files,
    backups: await readBackupInfo(),
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!isLocalOrigin(request)) {
    sendJson(response, 403, { error: '只允许本机页面访问。' })
    return
  }

  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'api' || parts[1] !== 'storage') {
    sendJson(response, 404, { error: '接口不存在。' })
    return
  }

  if (parts.length === 2) {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: '不支持该请求方法。' })
      return
    }
    sendJson(response, 200, await statusPayload())
    return
  }

  const kind = parts[2]
  if (parts.length !== 3 || !isKind(kind)) {
    sendJson(response, 404, { error: '未知的数据类型。' })
    return
  }

  if (request.method === 'GET') {
    const envelope = await readEnvelope(kind)
    if (!envelope) {
      sendJson(response, 404, { error: '数据文件还不存在。' })
      return
    }
    sendJson(response, 200, envelope)
    return
  }

  if (request.method === 'DELETE') {
    await withLock(kind, async () => {
      try {
        await stat(fileFor(kind))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
        throw error
      }
      await ensureDailyBackup(kind)
      await rm(fileFor(kind), { force: true })
    })
    response.statusCode = 204
    response.end()
    return
  }

  if (request.method !== 'PUT') {
    sendJson(response, 405, { error: '不支持该请求方法。' })
    return
  }

  const raw = await readBody(request)
  let body: { baseRevision?: unknown; data?: unknown }
  try {
    body = JSON.parse(raw) as { baseRevision?: unknown; data?: unknown }
  } catch {
    throw httpError(400, '请求内容不是合法 JSON。')
  }
  const baseRevision = body.baseRevision
  if (
    typeof baseRevision !== 'number' ||
    !Number.isInteger(baseRevision) ||
    baseRevision < 0 ||
    !body.data ||
    typeof body.data !== 'object' ||
    Array.isArray(body.data)
  ) {
    throw httpError(400, '请求内容缺少 baseRevision 或 data。')
  }

  const result = await withLock(kind, async () => {
    const existing = await readEnvelope(kind)
    const currentRevision = existing?.revision ?? 0
    if (baseRevision !== currentRevision) {
      throw Object.assign(httpError(409, '数据已被另一个页面更新。'), {
        revision: currentRevision,
        updatedAt: existing?.updatedAt,
      })
    }
    await ensureDailyBackup(kind)
    const envelope: Envelope = {
      appId: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      kind,
      revision: currentRevision + 1,
      updatedAt: new Date().toISOString(),
      data: body.data,
    }
    await writeEnvelopeAtomic(kind, envelope)
    return { revision: envelope.revision, updatedAt: envelope.updatedAt }
  })

  sendJson(response, 200, result)
}

function createMiddleware() {
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (!request.url?.startsWith('/api/storage')) {
      next()
      return
    }
    void handleRequest(request, response).catch((error: unknown) => {
      if (response.headersSent) return
      const status =
        typeof (error as { status?: unknown }).status === 'number'
          ? (error as { status: number }).status
          : 500
      const payload: Record<string, unknown> = {
        error: error instanceof Error ? error.message : '本地存储服务出错。',
      }
      const revision = (error as { revision?: unknown }).revision
      if (typeof revision === 'number') payload.revision = revision
      sendJson(response, status, payload)
    })
  }
}

export function lexiconStorage(): Plugin {
  return {
    name: 'lexicon-storage',
    configureServer(server) {
      server.config.logger.info(`  Lexicon data: ${DATA_DIR}`)
      server.middlewares.use(createMiddleware())
    },
    configurePreviewServer(server) {
      server.config.logger.info(`  Lexicon data: ${DATA_DIR}`)
      server.middlewares.use(createMiddleware())
    },
  }
}
