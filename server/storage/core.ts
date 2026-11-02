import os from 'node:os'
import path from 'node:path'

export const APP_ID = 'lexicon'
export const SCHEMA_VERSION = 1
export const KINDS = ['study', 'reader', 'reader-progress', 'library', 'stories', 'game'] as const

export type Kind = (typeof KINDS)[number]

export function resolveDataDir(): string {
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

export let dataDir = resolveDataDir()
export let backupDir = path.join(dataDir, 'backups')
export let configFile = path.join(dataDir, 'config.json')

/** Test hook: point the module at a throwaway directory. */
export function setDataDir(directory: string): void {
  dataDir = path.resolve(directory)
  backupDir = path.join(dataDir, 'backups')
  configFile = path.join(dataDir, 'config.json')
}

export function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value)
}

export function fileFor(kind: Kind): string {
  return path.join(dataDir, `${kind}.json`)
}

export function dateStamp(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

export const CORRUPT_HINT = '可在设置页「本地数据」中隔离该文件，或使用备份恢复。'
