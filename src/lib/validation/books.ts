import type { Book, Chapter } from '../../types'
import { countWords } from '../reader'
import {
  type Parsed,
  finiteNumber,
  isPlainObject,
  sanitizeBookId,
  sanitizeDateString,
  warnRepairs,
} from './primitives'

const BOOK_SOURCES = new Set<Book['source']>(['epub', 'markdown', 'manual'])
/** Same ceiling the article editor enforces, so a chapter cannot be a whole novel. */
const MAX_CHAPTER_CHARS = 200_000

function parseChapter(value: unknown): Parsed<Chapter> | null {
  if (!isPlainObject(value)) return null

  const id = sanitizeBookId(value.id)
  const text = typeof value.text === 'string' ? value.text : null
  if (!id || text === null) return null

  const trimmed = text.trim()
  if (!trimmed || trimmed.length > MAX_CHAPTER_CHARS) return null

  let repaired = 0
  const title =
    typeof value.title === 'string' && value.title.trim()
      ? value.title.trim()
      : '未命名章节'
  if (value.title !== title) repaired += 1

  const createdAt = sanitizeDateString(value.createdAt)
  const updatedAt = sanitizeDateString(value.updatedAt)
  if (!createdAt || !updatedAt) repaired += 1

  const rawWordCount = finiteNumber(value.wordCount)
  const wordCount = rawWordCount === null ? countWords(trimmed) : Math.max(0, Math.round(rawWordCount))
  if (rawWordCount === null || wordCount !== rawWordCount) repaired += 1

  const now = new Date().toISOString()
  return {
    value: {
      id,
      title,
      text: trimmed,
      wordCount,
      createdAt: createdAt ?? now,
      updatedAt: updatedAt ?? now,
    },
    repaired,
  }
}

/**
 * Books and chapters share one id space (chapter ids key the progress store),
 * so duplicates are dropped rather than silently shadowing each other.
 */
export function sanitizeBooks(value: unknown): Book[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    console.warn('[Lexicon] 书架格式不正确，已跳过。')
    return []
  }

  const books: Book[] = []
  const seenBooks = new Set<string>()
  const seenChapters = new Set<string>()
  let dropped = 0
  let repaired = 0

  for (const entry of value) {
    if (!isPlainObject(entry)) {
      dropped += 1
      continue
    }
    const id = sanitizeBookId(entry.id)
    if (!id || seenBooks.has(id)) {
      dropped += 1
      continue
    }
    seenBooks.add(id)

    const title =
      typeof entry.title === 'string' && entry.title.trim()
        ? entry.title.trim()
        : '未命名书籍'
    if (entry.title !== title) repaired += 1

    const author = typeof entry.author === 'string' ? entry.author.trim() : ''
    if (entry.author !== undefined && entry.author !== author) repaired += 1

    const source = BOOK_SOURCES.has(entry.source as Book['source'])
      ? (entry.source as Book['source'])
      : 'manual'
    if (entry.source !== source) repaired += 1

    const chapters: Chapter[] = []
    if (Array.isArray(entry.chapters)) {
      for (const rawChapter of entry.chapters) {
        const parsed = parseChapter(rawChapter)
        if (!parsed || seenChapters.has(parsed.value.id)) {
          dropped += 1
          continue
        }
        seenChapters.add(parsed.value.id)
        repaired += parsed.repaired
        chapters.push(parsed.value)
      }
    } else if (entry.chapters !== undefined) {
      repaired += 1
    }

    const createdAt = sanitizeDateString(entry.createdAt)
    const updatedAt = sanitizeDateString(entry.updatedAt)
    if (!createdAt || !updatedAt) repaired += 1
    const now = new Date().toISOString()

    books.push({
      id,
      title,
      author,
      source,
      chapters,
      createdAt: createdAt ?? now,
      updatedAt: updatedAt ?? now,
    })
  }

  warnRepairs('书架', dropped, repaired)
  return books
}
