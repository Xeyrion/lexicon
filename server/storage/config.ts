import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { configFile, dataDir } from './core.ts'

const DEFAULT_MAX_IMPORT_MB = 64
const MIN_MAX_IMPORT_MB = 8
const MAX_MAX_IMPORT_MB = 512
const MB = 1024 * 1024

export function clampImportBytes(bytes: number): number {
  const mb = Math.round(bytes / MB)
  return Math.min(MAX_MAX_IMPORT_MB, Math.max(MIN_MAX_IMPORT_MB, mb)) * MB
}

export function envMaxImportBytes(): number {
  const raw = process.env.LEXICON_MAX_IMPORT_MB?.trim()
  const parsed = raw ? Number(raw) : Number.NaN
  return Number.isFinite(parsed) ? clampImportBytes(parsed * MB) : DEFAULT_MAX_IMPORT_MB * MB
}

export let savedMaxImportBytes: number | null | undefined

export async function currentMaxImportBytes(): Promise<number> {
  if (savedMaxImportBytes === undefined) {
    try {
      const raw = await readFile(configFile, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      savedMaxImportBytes =
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as { maxImportBytes?: unknown }).maxImportBytes === 'number'
          ? clampImportBytes((parsed as { maxImportBytes: number }).maxImportBytes)
          : null
    } catch {
      // Missing or unreadable config is not an error: fall back to the default.
      savedMaxImportBytes = null
    }
  }
  return savedMaxImportBytes ?? envMaxImportBytes()
}

export async function saveMaxImportBytes(bytes: number): Promise<number> {
  const value = clampImportBytes(bytes)
  await mkdir(dataDir, { recursive: true })
  await writeFile(configFile, `${JSON.stringify({ maxImportBytes: value })}\n`, 'utf8')
  savedMaxImportBytes = value
  return value
}

export function resetConfigCache(): void {
  savedMaxImportBytes = undefined
}
