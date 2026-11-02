import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { KINDS, backupDir, dateStamp, fileFor, type Kind } from './core.ts'

export const KEEP_BACKUPS = 30

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

export interface BackupInfo {
  total: number
  bytes: number
  byKind: Record<Kind, BackupKindInfo>
}

export async function pruneBackups(kind: Kind): Promise<void> {
  let names: string[]
  try {
    names = await readdir(backupDir)
  } catch {
    return
  }
  const prefix = `${kind}-`
  const stale = names
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .sort()
    .slice(0, -KEEP_BACKUPS)
  await Promise.all(stale.map((name) => rm(path.join(backupDir, name), { force: true })))
}

export async function ensureDailyBackup(kind: Kind): Promise<void> {
  const target = fileFor(kind)
  try {
    await stat(target)
  } catch {
    return
  }
  await mkdir(backupDir, { recursive: true })
  const backup = path.join(backupDir, `${kind}-${dateStamp()}.json`)
  try {
    await stat(backup)
  } catch {
    await copyFile(target, backup)
    await pruneBackups(kind)
  }
}

export const BACKUP_NAME_PATTERN =
  /^(reader-progress|library|stories|reader|study)-(\d{4}-\d{2}-\d{2})(?:-[a-z0-9-]+)?\.json$/

export function timeStamp(date = new Date()): string {
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')
  return `${hours}${minutes}${seconds}`
}

export async function createSafetyBackup(kind: Kind): Promise<string | null> {
  const target = fileFor(kind)
  try {
    await stat(target)
  } catch {
    return null
  }
  await mkdir(backupDir, { recursive: true })
  const base = `${kind}-${dateStamp()}-restore-${timeStamp()}`
  let name = `${base}.json`
  let attempt = 1
  for (;;) {
    try {
      await stat(path.join(backupDir, name))
      name = `${base}-${attempt}.json`
      attempt += 1
    } catch {
      break
    }
  }
  await copyFile(target, path.join(backupDir, name))
  await pruneBackups(kind)
  return name
}

export async function listBackups(): Promise<BackupList> {
  let names: string[]
  try {
    names = await readdir(backupDir)
  } catch {
    return { directory: backupDir, keepBackups: KEEP_BACKUPS, backups: [] }
  }

  const entries = await Promise.all(
    names.map(async (name): Promise<BackupEntry | null> => {
      const match = BACKUP_NAME_PATTERN.exec(name)
      if (!match) return null
      let info
      try {
        info = await stat(path.join(backupDir, name))
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

  return { directory: backupDir, keepBackups: KEEP_BACKUPS, backups }
}

export function emptyBackupInfo(): BackupInfo {
  // Derived from KINDS so adding a data file cannot leave the summary short a key.
  const byKind = Object.fromEntries(
    KINDS.map((kind) => [kind, { count: 0, bytes: 0 }]),
  ) as BackupInfo['byKind']
  return { total: 0, bytes: 0, byKind }
}

export async function readBackupInfo(): Promise<BackupInfo> {
  const info = emptyBackupInfo()
  let names: string[]
  try {
    names = await readdir(backupDir)
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
        const file = await stat(path.join(backupDir, name))
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
