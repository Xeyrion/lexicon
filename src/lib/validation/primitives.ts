// Shapes and coercion helpers shared by every persisted-data sanitizer.
// `sanitizeBookId` doubles as the generic id sanitizer: it keeps short,
// printable ids and rejects anything that could be a path or a proto key.

export type PlainRecord = Record<string, unknown>

export interface Parsed<T> {
  value: T
  repaired: number
}

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function isPlainObject(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function sanitizeDateString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const timestamp = Date.parse(trimmed)
  if (!Number.isFinite(timestamp)) return null
  try {
    return new Date(timestamp).toISOString()
  } catch {
    return null
  }
}

export function sanitizeBookId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  return id ? id : null
}

export function warnRepairs(label: string, dropped: number, repaired: number): void {
  if (dropped === 0 && repaired === 0) return
  const details: string[] = []
  if (dropped > 0) details.push(`丢弃 ${dropped} 条`)
  if (repaired > 0) details.push(`修正 ${repaired} 处`)
  console.warn(`[Lexicon] ${label}：${details.join('，')}损坏或无效数据。`)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function dayKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const candidate = value.trim()
  if (!DAY_KEY_PATTERN.test(candidate)) return null
  const [year, month, day] = candidate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return candidate
}
