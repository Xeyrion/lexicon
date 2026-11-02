import type { ReaderAnchor, ReaderArticle, ReaderSettings } from '../../types'
import {
  type Parsed,
  UNSAFE_KEYS,
  clamp,
  finiteNumber,
  isPlainObject,
  sanitizeBookId,
  sanitizeDateString,
  warnRepairs,
} from './primitives'

export interface SanitizedReaderProgress {
  progress: number
  lastReadAt?: string
  anchor?: ReaderAnchor
}

function parseReaderArticle(value: unknown): Parsed<ReaderArticle> | null {
  if (!isPlainObject(value)) return null

  const id = sanitizeBookId(value.id)
  const text = typeof value.text === 'string' ? value.text : null
  if (!id || text === null || text.trim().length === 0) return null

  const createdAt = sanitizeDateString(value.createdAt)
  const updatedAt = sanitizeDateString(value.updatedAt)
  if (!createdAt || !updatedAt) return null

  let repaired = 0

  const title =
    typeof value.title === 'string' && value.title.trim()
      ? value.title.trim()
      : '未命名文章'
  if (value.title !== title) repaired += 1

  const source =
    typeof value.source === 'string' && value.source.trim()
      ? value.source.trim()
      : '粘贴'
  if (value.source !== source) repaired += 1

  const rawProgress = finiteNumber(value.progress)
  const progress = rawProgress === null ? 0 : clamp(rawProgress, 0, 1)
  if (rawProgress === null || progress !== rawProgress) repaired += 1

  const rawWordCount = finiteNumber(value.wordCount)
  const wordCount = rawWordCount === null ? 0 : Math.max(0, Math.round(rawWordCount))
  if (rawWordCount === null || wordCount !== rawWordCount) repaired += 1

  const lastReadAt =
    value.lastReadAt === undefined || value.lastReadAt === null
      ? undefined
      : sanitizeDateString(value.lastReadAt)
  if (
    value.lastReadAt !== undefined &&
    value.lastReadAt !== null &&
    !lastReadAt
  ) {
    repaired += 1
  }

  const anchor = sanitizeReaderAnchor(value.anchor)
  if (value.anchor !== undefined && !anchor) repaired += 1

  return {
    value: {
      id,
      title,
      source,
      text,
      createdAt,
      updatedAt,
      ...(lastReadAt ? { lastReadAt } : {}),
      progress,
      ...(anchor ? { anchor } : {}),
      wordCount,
    },
    repaired,
  }
}

export function sanitizeReaderArticles(value: unknown): ReaderArticle[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    console.warn('[Lexicon] 阅读文章格式不正确，已跳过。')
    return []
  }

  const articles: ReaderArticle[] = []
  const seen = new Set<string>()
  let dropped = 0
  let repaired = 0

  for (const entry of value) {
    const parsed = parseReaderArticle(entry)
    if (!parsed) {
      dropped += 1
      continue
    }
    repaired += parsed.repaired
    if (seen.has(parsed.value.id)) {
      dropped += 1
      continue
    }
    seen.add(parsed.value.id)
    articles.push(parsed.value)
  }

  warnRepairs('阅读文章', dropped, repaired)
  return articles
}

function parseReaderSettings(
  value: unknown,
  fallback: ReaderSettings,
): Parsed<ReaderSettings> {
  if (value === undefined) return { value: { ...fallback }, repaired: 0 }
  if (!isPlainObject(value)) return { value: { ...fallback }, repaired: 1 }

  const fontSize = finiteNumber(value.fontSize)
  if (fontSize === null) {
    return {
      value: { ...fallback },
      repaired: value.fontSize === undefined ? 0 : 1,
    }
  }

  const next = clamp(Math.round(fontSize), 16, 26)
  return {
    value: { fontSize: next },
    repaired: next === fontSize ? 0 : 1,
  }
}

export function sanitizeReaderSettings(
  value: unknown,
  fallback: ReaderSettings,
): ReaderSettings {
  const parsed = parseReaderSettings(value, fallback)
  if (parsed.repaired > 0) {
    console.warn('[Lexicon] 阅读设置中有无效字段，已修正。')
  }
  return parsed.value
}

/** Title tokens use paragraph -1, body tokens 0..n; anything else is dropped. */
function sanitizeReaderAnchor(value: unknown): ReaderAnchor | null {
  if (!isPlainObject(value)) return null
  const paragraph = finiteNumber(value.paragraph)
  const token = finiteNumber(value.token)
  if (paragraph === null || token === null) return null
  if (!Number.isInteger(paragraph) || paragraph < -1) return null
  if (!Number.isInteger(token) || token < 0) return null
  return { paragraph, token }
}

function parseReaderProgress(
  value: unknown,
): Parsed<SanitizedReaderProgress> | null {
  if (!isPlainObject(value)) return null

  const rawProgress = finiteNumber(value.progress)
  if (rawProgress === null) return null

  const progress = clamp(rawProgress, 0, 1)
  let repaired = progress === rawProgress ? 0 : 1

  const lastReadAt =
    value.lastReadAt === undefined || value.lastReadAt === null
      ? undefined
      : sanitizeDateString(value.lastReadAt)
  if (
    value.lastReadAt !== undefined &&
    value.lastReadAt !== null &&
    !lastReadAt
  ) {
    repaired += 1
  }

  const anchor = sanitizeReaderAnchor(value.anchor)
  if (value.anchor !== undefined && !anchor) repaired += 1

  return {
    value: {
      progress,
      ...(lastReadAt ? { lastReadAt } : {}),
      ...(anchor ? { anchor } : {}),
    },
    repaired,
  }
}

export function sanitizeReaderProgressItems(
  value: unknown,
): Record<string, SanitizedReaderProgress> {
  if (value === undefined) return {}
  if (!isPlainObject(value)) {
    console.warn('[Lexicon] 阅读进度格式不正确，已跳过。')
    return {}
  }

  const items: Record<string, SanitizedReaderProgress> = {}
  let dropped = 0
  let repaired = 0

  for (const [key, entry] of Object.entries(value)) {
    if (!key.trim() || UNSAFE_KEYS.has(key)) {
      dropped += 1
      continue
    }
    const parsed = parseReaderProgress(entry)
    if (!parsed) {
      dropped += 1
      continue
    }
    repaired += parsed.repaired
    items[key] = parsed.value
  }

  warnRepairs('阅读进度', dropped, repaired)
  return items
}
