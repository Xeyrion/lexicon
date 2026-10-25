const STORAGE_ENDPOINT = '/api/storage'
const REQUEST_TIMEOUT_MS = 1500
const KINDS = ['study', 'reader', 'reader-progress'] as const

export type StorageKind = (typeof KINDS)[number]

export interface StorageFileInfo {
  exists: boolean
  revision?: number
  updatedAt?: string
  bytes?: number
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
  files: Record<StorageKind, StorageFileInfo>
  backups: StorageBackupInfo
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStorageFileInfo(value: unknown): value is StorageFileInfo {
  if (!isRecord(value) || typeof value.exists !== 'boolean') return false
  if (value.revision !== undefined && !isFiniteNumber(value.revision)) return false
  if (value.updatedAt !== undefined && typeof value.updatedAt !== 'string') return false
  if (value.bytes !== undefined && !isFiniteNumber(value.bytes)) return false
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
  if (!isRecord(value.files)) return false
  for (const kind of KINDS) {
    if (!isStorageFileInfo(value.files[kind])) return false
  }
  return isStorageBackupInfo(value.backups)
}

export async function fetchStorageInfo(): Promise<StorageInfo> {
  const abort = new AbortController()
  const timeout = window.setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS)

  try {
    let response: Response
    try {
      response = await fetch(STORAGE_ENDPOINT, {
        cache: 'no-store',
        signal: abort.signal,
      })
    } catch {
      if (abort.signal.aborted) {
        throw new Error('读取本地数据信息超时，请稍后重试。')
      }
      throw new Error('无法连接本地存储服务，请确认正在通过 Vite 启动应用。')
    }

    if (!response.ok) {
      throw new Error(`读取本地数据信息失败（HTTP ${response.status}）。`)
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error('本地存储服务返回的内容不是合法 JSON。')
    }

    if (!isStorageInfo(payload)) {
      throw new Error('本地存储服务返回的数据不完整。')
    }

    return payload
  } finally {
    window.clearTimeout(timeout)
  }
}
