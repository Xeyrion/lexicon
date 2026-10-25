const STORAGE_ENDPOINT = '/api/storage'
const STATUS_TIMEOUT_MS = 1500
const LIST_TIMEOUT_MS = 3000
const MUTATION_TIMEOUT_MS = 20_000
const KINDS = ['study', 'reader', 'reader-progress', 'library'] as const

export type StorageKind = (typeof KINDS)[number]

export interface StorageFileInfo {
  exists: boolean
  revision?: number
  updatedAt?: string
  bytes?: number
  corrupted?: boolean
  error?: string
}

export interface StorageBackupKindInfo {
  count: number
  bytes: number
  latest?: string
}

export interface StorageBackupInfo {
  total: number
  bytes: number
  byKind: Record<StorageKind, StorageBackupKindInfo>
}

export interface StorageInfo {
  appId: string
  schemaVersion: number
  directory: string
  backupDirectory: string
  keepBackups: number
  /** Server-side cap for one import request body; absent on older builds. */
  maxImportBytes?: number
  files: Record<StorageKind, StorageFileInfo>
  backups: StorageBackupInfo
}

export interface StorageBackupEntry {
  kind: StorageKind
  name: string
  bytes: number
  modifiedAt: string
}

export interface StorageBackupList {
  directory: string
  keepBackups: number
  backups: StorageBackupEntry[]
}

export interface RestoreBackupResult {
  revision: number
  updatedAt: string
  restoredFrom: string
  safetyBackup: string | null
  replacedCorrupted: boolean
}

export interface ImportStorageInput {
  baseRevisions?: Partial<Record<StorageKind, number>>
  data: Partial<Record<StorageKind, unknown>>
}

export interface ImportStorageResult {
  revisions: Partial<Record<StorageKind, number>>
  quarantined: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStorageKind(value: unknown): value is StorageKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value)
}

function isStorageFileInfo(value: unknown): value is StorageFileInfo {
  if (!isRecord(value) || typeof value.exists !== 'boolean') return false
  if (value.revision !== undefined && !isFiniteNumber(value.revision)) return false
  if (value.updatedAt !== undefined && typeof value.updatedAt !== 'string') return false
  if (value.bytes !== undefined && !isFiniteNumber(value.bytes)) return false
  if (value.corrupted !== undefined && typeof value.corrupted !== 'boolean') return false
  if (value.error !== undefined && typeof value.error !== 'string') return false
  return true
}

function isStorageBackupInfo(value: unknown): value is StorageBackupInfo {
  if (!isRecord(value)) return false
  if (!isFiniteNumber(value.total) || !isFiniteNumber(value.bytes)) return false
  if (!isRecord(value.byKind)) return false
  for (const kind of KINDS) {
    const entry = value.byKind[kind]
    if (!isRecord(entry)) return false
    if (!isFiniteNumber(entry.count) || !isFiniteNumber(entry.bytes)) return false
    if (entry.latest !== undefined && typeof entry.latest !== 'string') return false
  }
  return true
}

function isStorageInfo(value: unknown): value is StorageInfo {
  if (!isRecord(value)) return false
  if (typeof value.appId !== 'string' || !isFiniteNumber(value.schemaVersion)) return false
  if (typeof value.directory !== 'string') return false
  if (typeof value.backupDirectory !== 'string') return false
  if (!isFiniteNumber(value.keepBackups)) return false
  if (value.maxImportBytes !== undefined && !isFiniteNumber(value.maxImportBytes)) return false
  if (!isRecord(value.files)) return false
  for (const kind of KINDS) {
    if (!isStorageFileInfo(value.files[kind])) return false
  }
  return isStorageBackupInfo(value.backups)
}

function isBackupEntry(value: unknown): value is StorageBackupEntry {
  return (
    isRecord(value) &&
    isStorageKind(value.kind) &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.bytes) &&
    typeof value.modifiedAt === 'string'
  )
}

function isBackupList(value: unknown): value is StorageBackupList {
  if (!isRecord(value)) return false
  if (typeof value.directory !== 'string' || !isFiniteNumber(value.keepBackups)) return false
  if (!Array.isArray(value.backups)) return false
  return value.backups.every(isBackupEntry)
}

function isRestoreResult(value: unknown): value is RestoreBackupResult {
  return (
    isRecord(value) &&
    isFiniteNumber(value.revision) &&
    typeof value.updatedAt === 'string' &&
    typeof value.restoredFrom === 'string' &&
    (value.safetyBackup === null || typeof value.safetyBackup === 'string') &&
    typeof value.replacedCorrupted === 'boolean'
  )
}

function isImportResult(value: unknown): value is ImportStorageResult {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.quarantined)) return false
  if (!value.quarantined.every((item) => typeof item === 'string')) return false
  if (!isRecord(value.revisions)) return false
  return Object.entries(value.revisions).every(
    ([kind, revision]) => isStorageKind(kind) && isFiniteNumber(revision),
  )
}

async function requestJson(
  path: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<unknown> {
  const abort = new AbortController()
  const timeout = window.setTimeout(() => abort.abort(), timeoutMs)

  try {
    let response: Response
    try {
      response = await fetch(`${STORAGE_ENDPOINT}${path}`, {
        ...init,
        cache: 'no-store',
        signal: abort.signal,
      })
    } catch {
      if (abort.signal.aborted) {
        throw new Error('请求本地存储服务超时，请稍后重试。')
      }
      throw new Error('无法连接本地存储服务，请确认正在通过 Vite 启动应用。')
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: unknown
      } | null
      const message =
        typeof payload?.error === 'string'
          ? payload.error
          : `本地存储服务返回 ${response.status}`
      throw new Error(message)
    }

    if (response.status === 204) return null
    return await response.json()
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function fetchStorageInfo(): Promise<StorageInfo> {
  const payload = await requestJson('', undefined, STATUS_TIMEOUT_MS)
  if (!isStorageInfo(payload)) {
    throw new Error('本地存储服务返回的数据不完整。')
  }
  return payload
}

export async function fetchBackupList(): Promise<StorageBackupList> {
  const payload = await requestJson('/backups', undefined, LIST_TIMEOUT_MS)
  if (!isBackupList(payload)) {
    throw new Error('备份列表格式不正确。')
  }
  return payload
}

/** Persists the import cap; the server clamps it and returns what it stored. */
export async function saveImportLimit(maxImportBytes: number): Promise<number> {
  const payload = await requestJson(
    '/config',
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ maxImportBytes }),
    },
    MUTATION_TIMEOUT_MS,
  )
  if (!isRecord(payload) || !isFiniteNumber(payload.maxImportBytes)) {
    throw new Error('保存导入上限失败：本地存储服务返回格式不正确。')
  }
  return payload.maxImportBytes
}

export async function quarantineKind(kind: StorageKind): Promise<string> {
  const payload = await requestJson(
    `/${kind}/quarantine`,
    { method: 'POST' },
    MUTATION_TIMEOUT_MS,
  )
  if (!isRecord(payload) || typeof payload.quarantined !== 'string') {
    throw new Error('隔离损坏文件的响应格式不正确。')
  }
  return payload.quarantined
}

export async function restoreBackup(
  kind: StorageKind,
  name: string,
): Promise<RestoreBackupResult> {
  const payload = await requestJson(
    '/backups/restore',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, name }),
    },
    MUTATION_TIMEOUT_MS,
  )
  if (!isRestoreResult(payload)) {
    throw new Error('恢复备份的响应格式不正确。')
  }
  return payload
}

export async function importStorageData(
  input: ImportStorageInput,
): Promise<ImportStorageResult> {
  const payload = await requestJson(
    '/import',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    MUTATION_TIMEOUT_MS,
  )
  if (!isImportResult(payload)) {
    throw new Error('导入数据的响应格式不正确。')
  }
  return payload
}
