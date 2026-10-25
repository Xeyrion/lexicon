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
  corrupted?: boolean
  error?: string
}

interface BackupEntry {
  kind: Kind
  name: string
  bytes: number
  modifiedAt: string
}

interface BackupList {
  directory: string
  keepBackups: number
  backups: BackupEntry[]
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
let writeQueue: Promise<unknown> = Promise.resolve()

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

const CORRUPT_HINT = '可在设置页「本地数据」中隔离该文件，或使用备份恢复。'

function parseEnvelope(raw: string, file: string, kind: Kind): Envelope {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw httpError(
      500,
      `数据文件 ${file} 不是合法的 JSON（${detail}）。${CORRUPT_HINT}`,
    )
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw httpError(
      500,
      `数据文件 ${file} 格式不正确（顶层应为包含 appId、kind、revision、data 的对象）。${CORRUPT_HINT}`,
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
      `数据文件 ${file} 格式不正确（缺少 appId、kind、revision 或 data 等必要字段）。${CORRUPT_HINT}`,
    )
  }
  return envelope as Envelope
}

async function readEnvelopeAt(file: string, kind: Kind): Promise<Envelope> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw httpError(404, `数据文件 ${file} 不存在。`)
    }
    const detail = error instanceof Error ? error.message : String(error)
    throw httpError(500, `无法读取数据文件 ${file}：${detail}。`)
  }
  return parseEnvelope(raw, file, kind)
}

async function readEnvelope(kind: Kind): Promise<Envelope | null> {
  const file = fileFor(kind)
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    const detail = error instanceof Error ? error.message : String(error)
    throw httpError(500, `无法读取数据文件 ${file}：${detail}。${CORRUPT_HINT}`)
  }
  return parseEnvelope(raw, file, kind)
}

async function readRawFile(kind: Kind): Promise<string | null> {
  try {
    return await readFile(fileFor(kind), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function quarantineName(kind: Kind): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${kind}.corrupt-${stamp}-${process.pid}.json`
}

async function quarantineFile(kind: Kind): Promise<string | null> {
  const target = fileFor(kind)
  try {
    await stat(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  const destination = path.join(DATA_DIR, quarantineName(kind))
  await rename(target, destination)
  return destination
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
  /^(reader-progress|reader|study)-(\d{4}-\d{2}-\d{2})(?:-[a-z0-9-]+)?\.json$/

function timeStamp(date = new Date()): string {
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')
  return `${hours}${minutes}${seconds}`
}

async function createSafetyBackup(kind: Kind): Promise<string | null> {
  const target = fileFor(kind)
  try {
    await stat(target)
  } catch {
    return null
  }
  await mkdir(BACKUP_DIR, { recursive: true })
  const base = `${kind}-${dateStamp()}-restore-${timeStamp()}`
  let name = `${base}.json`
  let attempt = 1
  for (;;) {
    try {
      await stat(path.join(BACKUP_DIR, name))
      name = `${base}-${attempt}.json`
      attempt += 1
    } catch {
      break
    }
  }
  await copyFile(target, path.join(BACKUP_DIR, name))
  await pruneBackups(kind)
  return name
}

async function listBackups(): Promise<BackupList> {
  let names: string[]
  try {
    names = await readdir(BACKUP_DIR)
  } catch {
    return { directory: BACKUP_DIR, keepBackups: KEEP_BACKUPS, backups: [] }
  }

  const entries = await Promise.all(
    names.map(async (name): Promise<BackupEntry | null> => {
      const match = BACKUP_NAME_PATTERN.exec(name)
      if (!match) return null
      let info
      try {
        info = await stat(path.join(BACKUP_DIR, name))
      } catch {
        return null
      }
      if (!info.isFile()) return null
      return {
        kind: match[1] as Kind,
        name,
        bytes: info.size,
        modifiedAt: info.mtime.toISOString(),
      }
    }),
  )

  const backups = entries
    .filter((entry): entry is BackupEntry => entry !== null)
    .sort(
      (a, b) =>
        b.modifiedAt.localeCompare(a.modifiedAt) || b.name.localeCompare(a.name),
    )

  return { directory: BACKUP_DIR, keepBackups: KEEP_BACKUPS, backups }
}

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

// A single queue keeps multi-file imports and single-file writes from
// interleaving. The app is local and single-user, so serializing mutations is
// cheap and makes rollback/revision checks predictable.
function withLock<T>(_kind: Kind | null, task: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(task, task)
  writeQueue = next.then(
    () => undefined,
    () => undefined,
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
  maxImportBytes: number
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
    } catch (error) {
      // 文件存在但内容损坏时仍返回大小，方便设置页判断磁盘占用并给出隔离入口。
      files[kind] = {
        exists: true,
        bytes,
        corrupted: true,
        error: error instanceof Error ? error.message : '数据文件无法解析。',
      }
    }
  }
  return {
    appId: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    directory: DATA_DIR,
    backupDirectory: BACKUP_DIR,
    keepBackups: KEEP_BACKUPS,
    // Lets the client reject an oversized backup before it reads the whole file
    // into memory, using the same number the request body cap enforces.
    maxImportBytes: MAX_BODY_BYTES,
    files,
    backups: await readBackupInfo(),
  }
}

interface RestoreResult {
  revision: number
  updatedAt: string
  restoredFrom: string
  safetyBackup: string | null
  replacedCorrupted: boolean
}

async function restoreBackupByName(
  kind: Kind,
  name: string,
): Promise<RestoreResult> {
  const match = BACKUP_NAME_PATTERN.exec(name)
  if (!match || match[1] !== kind || path.basename(name) !== name) {
    throw httpError(400, '备份文件名无效。')
  }
  const source = path.join(BACKUP_DIR, name)
  const info = await stat(source).catch(() => null)
  if (!info?.isFile()) throw httpError(404, '备份文件不存在。')

  return withLock(kind, async () => {
    const backup = await readEnvelopeAt(source, kind)
    let current: Envelope | null = null
    let replacedCorrupted = false
    try {
      current = await readEnvelope(kind)
    } catch {
      // 当前文件损坏时仍允许恢复，损坏内容会通过安全备份保留下来。
      replacedCorrupted = true
    }
    const safetyBackup = await createSafetyBackup(kind)
    const revision = (current?.revision ?? 0) + 1
    const envelope: Envelope = {
      appId: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      kind,
      revision,
      updatedAt: new Date().toISOString(),
      data: backup.data,
    }
    await writeEnvelopeAtomic(kind, envelope)
    return {
      revision,
      updatedAt: envelope.updatedAt,
      restoredFrom: name,
      safetyBackup,
      replacedCorrupted,
    }
  })
}

interface ImportBody {
  baseRevisions?: Partial<Record<Kind, number>>
  data?: Partial<Record<Kind, unknown>>
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function restoreRawFile(kind: Kind, raw: string | null): Promise<void> {
  const target = fileFor(kind)
  if (raw === null) {
    await rm(target, { force: true })
    return
  }
  const temporary = `${target}.rollback.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, raw, 'utf8')
  await rename(temporary, target)
}

async function importKinds(body: ImportBody): Promise<{
  revisions: Partial<Record<Kind, number>>
  quarantined: string[]
}> {
  if (!isPlainRecord(body.data)) {
    throw httpError(400, '请求内容缺少 data。')
  }
  const kinds = KINDS.filter((kind) => body.data?.[kind] !== undefined)
  if (kinds.length === 0) {
    throw httpError(400, '导入内容为空。')
  }

  const values = new Map<Kind, unknown>()
  for (const kind of kinds) {
    const value = body.data?.[kind]
    if (!isPlainRecord(value)) {
      throw httpError(400, `${kind} 的导入内容格式不正确。`)
    }
    values.set(kind, value)
  }

  return withLock(null, async () => {
    const previousRaw = new Map<Kind, string | null>()
    const currentRevisions = new Map<Kind, number>()
    const corrupted: Kind[] = []

    for (const kind of kinds) {
      previousRaw.set(kind, await readRawFile(kind))
      let existing: Envelope | null = null
      let isCorrupted = false
      try {
        existing = await readEnvelope(kind)
      } catch {
        isCorrupted = true
      }
      if (isCorrupted) {
        corrupted.push(kind)
        currentRevisions.set(kind, 0)
        continue
      }
      const current = existing?.revision ?? 0
      const base = body.baseRevisions?.[kind]
      if (typeof base === 'number' && base !== current) {
        const revisions: Partial<Record<Kind, number>> = {}
        for (const other of KINDS) {
          if (currentRevisions.has(other)) {
            revisions[other] = currentRevisions.get(other)
          }
        }
        throw Object.assign(httpError(409, '数据已被另一个页面更新，请刷新后重新导入。'), {
          revisions,
          revision: current,
        })
      }
      currentRevisions.set(kind, current)
    }

    // All preflight checks passed. Only now touch the existing corrupted files.
    const quarantined: string[] = []
    for (const kind of corrupted) {
      const destination = await quarantineFile(kind)
      if (destination) quarantined.push(destination)
    }

    const envelopes = new Map<Kind, Envelope>()
    for (const kind of kinds) {
      const revision = (currentRevisions.get(kind) ?? 0) + 1
      if (!corrupted.includes(kind)) await ensureDailyBackup(kind)
      envelopes.set(kind, {
        appId: APP_ID,
        schemaVersion: SCHEMA_VERSION,
        kind,
        revision,
        updatedAt: new Date().toISOString(),
        data: values.get(kind),
      })
    }

    const temporaryFiles: { kind: Kind; temporary: string; target: string }[] = []
    const written: Kind[] = []
    try {
      await mkdir(DATA_DIR, { recursive: true })
      for (const kind of kinds) {
        const envelope = envelopes.get(kind)
        if (!envelope) continue
        const target = fileFor(kind)
        const temporary = `${target}.${process.pid}.${Date.now()}.${Math.random()
          .toString(36)
          .slice(2)}.tmp`
        await writeFile(temporary, `${JSON.stringify(envelope)}\n`, 'utf8')
        temporaryFiles.push({ kind, temporary, target })
      }
      for (const entry of temporaryFiles) {
        await rename(entry.temporary, entry.target)
        written.push(entry.kind)
      }
    } catch (error) {
      await Promise.allSettled(
        temporaryFiles.map((entry) => rm(entry.temporary, { force: true })),
      )
      for (const kind of written) {
        await restoreRawFile(kind, previousRaw.get(kind) ?? null).catch(() => undefined)
      }
      throw error
    }

    const revisions: Partial<Record<Kind, number>> = {}
    for (const kind of kinds) {
      revisions[kind] = envelopes.get(kind)?.revision
    }
    return { revisions, quarantined }
  })
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const raw = await readBody(request)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw httpError(400, '请求内容不是合法 JSON。')
  }
  if (!isPlainRecord(parsed)) {
    throw httpError(400, '请求内容格式不正确。')
  }
  return parsed
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

  if (parts[2] === 'import') {
    if (parts.length !== 3 || request.method !== 'POST') {
      sendJson(response, 405, { error: '不支持该请求方法。' })
      return
    }
    const raw = await readJsonBody(request)
    const baseRevisions = isPlainRecord(raw.baseRevisions)
      ? (raw.baseRevisions as Partial<Record<Kind, number>>)
      : undefined
    const result = await importKinds({
      baseRevisions,
      data: isPlainRecord(raw.data)
        ? (raw.data as Partial<Record<Kind, unknown>>)
        : undefined,
    })
    sendJson(response, 200, result)
    return
  }

  if (parts[2] === 'backups') {
    if (parts.length === 3 && request.method === 'GET') {
      sendJson(response, 200, await listBackups())
      return
    }
    if (parts.length === 4 && parts[3] === 'restore' && request.method === 'POST') {
      const raw = await readJsonBody(request)
      if (typeof raw.kind !== 'string' || !isKind(raw.kind) || typeof raw.name !== 'string') {
        throw httpError(400, '请求缺少 kind 或 name。')
      }
      sendJson(response, 200, await restoreBackupByName(raw.kind, raw.name))
      return
    }
    sendJson(response, 404, { error: '备份接口不存在。' })
    return
  }

  const kind = parts[2]
  if (!isKind(kind)) {
    sendJson(response, 404, { error: '未知的数据类型。' })
    return
  }

  if (parts.length === 4 && parts[3] === 'quarantine') {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: '不支持该请求方法。' })
      return
    }
    const result = await withLock(kind, async () => {
      try {
        await readEnvelope(kind)
      } catch {
        const quarantined = await quarantineFile(kind)
        if (!quarantined) throw httpError(404, '数据文件不存在。')
        return { quarantined }
      }
      throw httpError(400, '数据文件内容正常，无需隔离。')
    })
    sendJson(response, 200, result)
    return
  }

  if (parts.length !== 3) {
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
