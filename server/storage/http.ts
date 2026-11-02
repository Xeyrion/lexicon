import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import {
  APP_ID,
  KINDS,
  SCHEMA_VERSION,
  type Kind,
  backupDir,
  dataDir,
  fileFor,
  httpError,
  isKind,
} from './core.ts'
import { currentMaxImportBytes, saveMaxImportBytes } from './config.ts'
import {
  type Envelope,
  quarantineFile,
  readEnvelope,
  readEnvelopeAt,
  readRawFile,
  writeEnvelopeAtomic,
} from './envelope.ts'
import {
  BACKUP_NAME_PATTERN,
  type BackupInfo,
  KEEP_BACKUPS,
  createSafetyBackup,
  ensureDailyBackup,
  listBackups,
  readBackupInfo,
} from './backups.ts'
import { withLock } from './lock.ts'

interface FileInfo {
  exists: boolean
  revision?: number
  updatedAt?: string
  bytes?: number
  corrupted?: boolean
  error?: string
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(payload))
}

export function isLocalOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (!origin) return true
  try {
    const { hostname } = new URL(origin)
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1'
  } catch {
    return false
  }
}

export async function readBody(request: IncomingMessage): Promise<string> {
  const limit = await currentMaxImportBytes()
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw httpError(413, '数据文件太大。')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function statusPayload(): Promise<{
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
    directory: dataDir,
    backupDirectory: backupDir,
    keepBackups: KEEP_BACKUPS,
    // Lets the client reject an oversized backup before it reads the whole file
    // into memory, using the same number the request body cap enforces.
    maxImportBytes: await currentMaxImportBytes(),
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

export async function restoreBackupByName(
  kind: Kind,
  name: string,
): Promise<RestoreResult> {
  const match = BACKUP_NAME_PATTERN.exec(name)
  if (!match || match[1] !== kind || path.basename(name) !== name) {
    throw httpError(400, '备份文件名无效。')
  }
  const source = path.join(backupDir, name)
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

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function restoreRawFile(kind: Kind, raw: string | null): Promise<void> {
  const target = fileFor(kind)
  if (raw === null) {
    await rm(target, { force: true })
    return
  }
  const temporary = `${target}.rollback.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, raw, 'utf8')
  await rename(temporary, target)
}

export async function importKinds(body: ImportBody): Promise<{
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
      await mkdir(dataDir, { recursive: true })
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

export async function readJsonBody(
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

export async function handleRequest(
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

  if (parts[2] === 'config') {
    if (parts.length !== 3) {
      sendJson(response, 404, { error: '配置接口不存在。' })
      return
    }
    if (request.method !== 'PUT') {
      sendJson(response, 405, { error: '不支持该请求方法。' })
      return
    }
    const raw = await readJsonBody(request)
    const value = raw.maxImportBytes
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw httpError(400, '请求缺少 maxImportBytes。')
    }
    const saved = await withLock(null, () => saveMaxImportBytes(value))
    sendJson(response, 200, { maxImportBytes: saved })
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

/**
 * Connect-style middleware for `/api/storage`. Exported so the integration tests
 * can mount it on a plain http server instead of booting Vite.
 */
export function createStorageMiddleware() {
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
