import type {
  Book,
  CardRecord,
  Chapter,
  DayStat,
  PersonalWord,
  ReaderAnchor,
  ReaderArticle,
  ReaderSettings,
  SerializedCard,
  Settings,
  Story,
  StoryChoice,
  StoryCondition,
  StoryEffect,
  StoryEnding,
  StoryNode,
  StoryVarValue,
} from '../types'
import { countWords } from './reader'

type PlainRecord = Record<string, unknown>

interface Parsed<T> {
  value: T
  repaired: number
}

export interface SanitizedReaderProgress {
  progress: number
  lastReadAt?: string
  anchor?: ReaderAnchor
}

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const DAILY_NEW_MIN = 5
const DAILY_NEW_MAX = 60
const DAILY_REVIEW_MIN = 20
const DAILY_REVIEW_MAX = 200
const RATE_MIN = 0.7
const RATE_MAX = 1.3

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

function warnRepairs(label: string, dropped: number, repaired: number): void {
  if (dropped === 0 && repaired === 0) return
  const details: string[] = []
  if (dropped > 0) details.push(`丢弃 ${dropped} 条`)
  if (repaired > 0) details.push(`修正 ${repaired} 处`)
  console.warn(`[Lexicon] ${label}：${details.join('，')}损坏或无效数据。`)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function dayKey(value: unknown): string | null {
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

function parseSettings(value: unknown, fallback: Settings): Parsed<Settings> {
  if (value === undefined) return { value: { ...fallback }, repaired: 0 }
  if (!isPlainObject(value)) return { value: { ...fallback }, repaired: 1 }

  let repaired = 0
  const settings: Settings = { ...fallback }

  if (value.accent === 'us' || value.accent === 'uk') {
    settings.accent = value.accent
  } else if (value.accent !== undefined) {
    repaired += 1
  }

  const dailyNew = finiteNumber(value.dailyNew)
  if (dailyNew !== null) {
    const next = clamp(Math.round(dailyNew), DAILY_NEW_MIN, DAILY_NEW_MAX)
    settings.dailyNew = next
    if (next !== dailyNew) repaired += 1
  } else if (value.dailyNew !== undefined) {
    repaired += 1
  }

  const dailyReview = finiteNumber(value.dailyReview)
  if (dailyReview !== null) {
    const next =
      dailyReview === 0
        ? 0
        : clamp(Math.round(dailyReview), DAILY_REVIEW_MIN, DAILY_REVIEW_MAX)
    settings.dailyReview = next
    if (next !== dailyReview) repaired += 1
  } else if (value.dailyReview !== undefined) {
    repaired += 1
  }

  if (typeof value.autoSpeak === 'boolean') {
    settings.autoSpeak = value.autoSpeak
  } else if (value.autoSpeak !== undefined) {
    repaired += 1
  }

  const rate = finiteNumber(value.rate)
  if (rate !== null) {
    const next = rounded(clamp(rate, RATE_MIN, RATE_MAX))
    settings.rate = next
    if (next !== rate) repaired += 1
  } else if (value.rate !== undefined) {
    repaired += 1
  }

  if (value.theme === 'light' || value.theme === 'dark' || value.theme === 'system') {
    settings.theme = value.theme
  } else if (value.theme !== undefined) {
    repaired += 1
  }

  if (typeof value.showDefinition === 'boolean') {
    settings.showDefinition = value.showDefinition
  } else if (value.showDefinition !== undefined) {
    repaired += 1
  }

  return { value: settings, repaired }
}

export function sanitizeSettings(value: unknown, fallback: Settings): Settings {
  const parsed = parseSettings(value, fallback)
  if (parsed.repaired > 0) {
    console.warn('[Lexicon] 设置中有无效字段，已按默认值修正。')
  }
  return parsed.value
}

function parseCardRecord(value: unknown): Parsed<CardRecord> | null {
  if (!isPlainObject(value)) return null

  const bookId = sanitizeBookId(value.bookId)
  const wordId = sanitizeBookId(value.wordId)
  if (!bookId || !wordId) return null
  if (!isPlainObject(value.card)) return null

  const rawCard = value.card
  const due = sanitizeDateString(rawCard.due)
  const stability = finiteNumber(rawCard.stability)
  const difficulty = finiteNumber(rawCard.difficulty)
  const state = finiteNumber(rawCard.state)

  if (!due || stability === null || stability < 0) return null
  if (difficulty === null || difficulty < 0) return null
  if (state === null || !Number.isInteger(state) || state < 0 || state > 3) return null

  let repaired = 0

  const nonNegativeInteger = (raw: unknown, fallback = 0): number => {
    const number = finiteNumber(raw)
    if (number === null) {
      repaired += 1
      return fallback
    }
    const next = Math.max(0, Math.round(number))
    if (next !== number) repaired += 1
    return next
  }

  const elapsedDays = nonNegativeInteger(rawCard.elapsed_days)
  const scheduledDays = nonNegativeInteger(rawCard.scheduled_days)
  const learningSteps = nonNegativeInteger(rawCard.learning_steps)
  const reps = nonNegativeInteger(rawCard.reps)
  const lapses = nonNegativeInteger(rawCard.lapses)

  const lastReview =
    rawCard.last_review === undefined || rawCard.last_review === null
      ? undefined
      : sanitizeDateString(rawCard.last_review)
  if (
    rawCard.last_review !== undefined &&
    rawCard.last_review !== null &&
    !lastReview
  ) {
    repaired += 1
  }

  const introducedAt = sanitizeDateString(value.introducedAt)
  const updatedAt = sanitizeDateString(value.updatedAt)
  if (!introducedAt || !updatedAt) repaired += 1

  const rawReviews = finiteNumber(value.reviews)
  const reviews =
    rawReviews === null ? 0 : Math.max(0, Math.round(rawReviews))
  if (rawReviews === null || reviews !== rawReviews) repaired += 1

  const card: SerializedCard = {
    due,
    stability,
    difficulty,
    elapsed_days: elapsedDays,
    scheduled_days: scheduledDays,
    learning_steps: learningSteps,
    reps,
    lapses,
    state,
    ...(lastReview ? { last_review: lastReview } : {}),
  }

  return {
    value: {
      bookId,
      wordId,
      card,
      introducedAt: introducedAt ?? updatedAt ?? due,
      updatedAt: updatedAt ?? introducedAt ?? due,
      reviews,
    },
    repaired,
  }
}

export function sanitizeProgress(value: unknown): Record<string, CardRecord> {
  if (value === undefined) return {}
  if (!isPlainObject(value)) {
    console.warn('[Lexicon] 学习记录格式不正确，已跳过。')
    return {}
  }

  const progress: Record<string, CardRecord> = {}
  let dropped = 0
  let repaired = 0

  for (const [key, entry] of Object.entries(value)) {
    const parsed = parseCardRecord(entry)
    if (!parsed) {
      dropped += 1
      continue
    }
    repaired += parsed.repaired
    const record = parsed.value
    const canonicalKey = `${record.bookId}:${record.wordId}`
    if (key !== canonicalKey) repaired += 1
    if (progress[canonicalKey]) {
      dropped += 1
      continue
    }
    progress[canonicalKey] = record
  }

  warnRepairs('学习记录', dropped, repaired)
  return progress
}

function parseDayStat(value: unknown, key: string): Parsed<DayStat> | null {
  if (!isPlainObject(value)) return null

  const canonicalDate = dayKey(key) ?? dayKey(value.date)
  if (!canonicalDate) return null

  let repaired = 0
  if (key !== canonicalDate) repaired += 1
  if (value.date !== canonicalDate) repaired += 1

  const count = (raw: unknown): number => {
    const number = finiteNumber(raw)
    if (number === null) {
      repaired += 1
      return 0
    }
    const next = Math.max(0, Math.round(number))
    if (next !== number) repaired += 1
    return next
  }

  let uniqueReviewCount: number | undefined
  if (value.uniqueReviewCount !== undefined && value.uniqueReviewCount !== null) {
    const raw = finiteNumber(value.uniqueReviewCount)
    if (raw === null) {
      repaired += 1
    } else {
      uniqueReviewCount = Math.max(0, Math.round(raw))
      if (uniqueReviewCount !== raw) repaired += 1
    }
  }

  return {
    value: {
      date: canonicalDate,
      newCount: count(value.newCount),
      reviewCount: count(value.reviewCount),
      ...(uniqueReviewCount === undefined ? {} : { uniqueReviewCount }),
      again: count(value.again),
      hard: count(value.hard),
      good: count(value.good),
      easy: count(value.easy),
    },
    repaired,
  }
}

export function sanitizeDays(value: unknown): Record<string, DayStat> {
  if (value === undefined) return {}
  if (!isPlainObject(value)) {
    console.warn('[Lexicon] 每日统计格式不正确，已跳过。')
    return {}
  }

  const days: Record<string, DayStat> = {}
  let dropped = 0
  let repaired = 0

  for (const [key, entry] of Object.entries(value)) {
    const parsed = parseDayStat(entry, key)
    if (!parsed) {
      dropped += 1
      continue
    }
    repaired += parsed.repaired
    if (days[parsed.value.date]) {
      dropped += 1
      continue
    }
    days[parsed.value.date] = parsed.value
  }

  warnRepairs('每日统计', dropped, repaired)
  return days
}

function parsePersonalWord(value: unknown): Parsed<PersonalWord> | null {
  if (!isPlainObject(value)) return null

  const id = sanitizeBookId(value.id)
  const word = sanitizeBookId(value.word)
  const trans = stringList(value.trans)
  if (!id || !word || trans.length === 0) return null

  let repaired = 0

  const text = (raw: unknown): string => {
    if (typeof raw === 'string') return raw
    if (raw !== undefined) repaired += 1
    return ''
  }

  const tagList = stringList(value.tags)
  if (value.tags !== undefined && !Array.isArray(value.tags)) repaired += 1
  if (value.definition !== undefined && !Array.isArray(value.definition)) repaired += 1

  const rank = finiteNumber(value.rank)
  const normalizedRank = rank === null ? 0 : Math.max(0, Math.round(rank))
  if (rank === null || normalizedRank !== rank) repaired += 1

  const addedAt = sanitizeDateString(value.addedAt)
  if (!addedAt) repaired += 1

  return {
    value: {
      id,
      word,
      phoneticUS: text(value.phoneticUS),
      phoneticUK: text(value.phoneticUK),
      phoneticAlt: text(value.phoneticAlt),
      trans,
      definition: stringList(value.definition),
      pos: text(value.pos),
      tags: tagList.length > 0 ? tagList : ['personal'],
      rank: normalizedRank,
      addedAt: addedAt ?? new Date().toISOString(),
    },
    repaired,
  }
}

export function sanitizePersonalWords(value: unknown): PersonalWord[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    console.warn('[Lexicon] 个人词库格式不正确，已跳过。')
    return []
  }

  const words: PersonalWord[] = []
  const seen = new Set<string>()
  let dropped = 0
  let repaired = 0

  for (const entry of value) {
    const parsed = parsePersonalWord(entry)
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
    words.push(parsed.value)
  }

  warnRepairs('个人词库', dropped, repaired)
  return words
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

function parseVarValue(value: unknown): StoryVarValue | null {
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function parseCondition(value: unknown): StoryCondition | null {
  if (!isPlainObject(value)) return null

  if (Array.isArray(value.all)) {
    const items = value.all.map(parseCondition)
    return items.every((item): item is StoryCondition => item !== null)
      ? { all: items }
      : null
  }
  if (Array.isArray(value.any)) {
    const items = value.any.map(parseCondition)
    return items.every((item): item is StoryCondition => item !== null)
      ? { any: items }
      : null
  }
  if (value.not !== undefined) {
    const inner = parseCondition(value.not)
    return inner ? { not: inner } : null
  }

  const name = sanitizeBookId(value.var)
  if (!name) return null
  if ('is' in value) {
    const target = parseVarValue(value.is)
    return target === null ? null : { var: name, is: target }
  }
  const gte = finiteNumber(value.gte)
  if (gte !== null) return { var: name, gte }
  const lte = finiteNumber(value.lte)
  if (lte !== null) return { var: name, lte }
  return null
}

function parseEffect(value: unknown): StoryEffect | null {
  if (!isPlainObject(value)) return null
  const name = sanitizeBookId(value.var)
  if (!name) return null
  if ('set' in value) {
    const target = parseVarValue(value.set)
    return target === null ? null : { var: name, set: target }
  }
  const add = finiteNumber(value.add)
  return add === null ? null : { var: name, add }
}

function parseChoice(value: unknown): StoryChoice | null {
  if (!isPlainObject(value)) return null
  const id = sanitizeBookId(value.id)
  const label = typeof value.label === 'string' ? value.label.trim() : ''
  const to = sanitizeBookId(value.to)
  if (!id || !label || !to) return null

  const requires = Array.isArray(value.requires)
    ? value.requires.map(parseCondition)
    : []
  const effects = Array.isArray(value.effects) ? value.effects.map(parseEffect) : []
  if (requires.some((item) => item === null) || effects.some((item) => item === null)) {
    return null
  }

  return {
    id,
    label,
    to,
    ...(requires.length > 0 ? { requires: requires as StoryCondition[] } : {}),
    ...(effects.length > 0 ? { effects: effects as StoryEffect[] } : {}),
  }
}

function parseNode(value: unknown): StoryNode | null {
  if (!isPlainObject(value)) return null
  const id = sanitizeBookId(value.id)
  const text = typeof value.text === 'string' ? value.text.trim() : ''
  if (!id || !text) return null

  const choices: StoryChoice[] = []
  for (const raw of Array.isArray(value.choices) ? value.choices : []) {
    const choice = parseChoice(raw)
    if (choice) choices.push(choice)
  }

  const variants: { when: StoryCondition[]; text: string }[] = []
  for (const raw of Array.isArray(value.variants) ? value.variants : []) {
    if (!isPlainObject(raw) || typeof raw.text !== 'string' || !raw.text.trim()) continue
    const when = Array.isArray(raw.when) ? raw.when.map(parseCondition) : []
    if (when.some((item) => item === null)) continue
    variants.push({ when: when as StoryCondition[], text: raw.text.trim() })
  }

  const ending = sanitizeBookId(value.ending)
  return {
    id,
    text,
    ...(variants.length > 0 ? { variants } : {}),
    ...(choices.length > 0 ? { choices } : {}),
    ...(ending ? { ending } : {}),
  }
}

function parseStory(value: unknown): Story | null {
  if (!isPlainObject(value)) return null
  const id = sanitizeBookId(value.id)
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const start = sanitizeBookId(value.start)
  if (!id || !title || !start) return null

  const nodes: StoryNode[] = []
  for (const raw of Array.isArray(value.nodes) ? value.nodes : []) {
    const node = parseNode(raw)
    if (node) nodes.push(node)
  }
  if (nodes.length === 0) return null

  const endings: StoryEnding[] = []
  for (const raw of Array.isArray(value.endings) ? value.endings : []) {
    if (!isPlainObject(raw)) continue
    const endingId = sanitizeBookId(raw.id)
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!endingId || !name) continue
    endings.push({
      id: endingId,
      name,
      ...(typeof raw.hint === 'string' && raw.hint.trim() ? { hint: raw.hint.trim() } : {}),
      ...(raw.hidden === true ? { hidden: true } : {}),
    })
  }

  const initialVars: Record<string, StoryVarValue> = {}
  if (isPlainObject(value.initialVars)) {
    for (const [name, raw] of Object.entries(value.initialVars)) {
      const parsed = parseVarValue(raw)
      if (parsed !== null) initialVars[name] = parsed
    }
  }

  return {
    id,
    title,
    author: typeof value.author === 'string' ? value.author.trim() : '',
    ...(typeof value.level === 'string' && value.level.trim() ? { level: value.level.trim() } : {}),
    ...(typeof value.description === 'string' && value.description.trim()
      ? { description: value.description.trim() }
      : {}),
    start,
    initialVars,
    endings,
    nodes,
  }
}

/** Drops stories that cannot be parsed at all; structural checks live in story.ts. */
export function sanitizeStories(value: unknown): Story[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    console.warn('[Lexicon] 故事数据格式不正确，已跳过。')
    return []
  }

  const stories: Story[] = []
  const seen = new Set<string>()
  let dropped = 0

  for (const entry of value) {
    const story = parseStory(entry)
    if (!story || seen.has(story.id)) {
      dropped += 1
      continue
    }
    seen.add(story.id)
    stories.push(story)
  }

  warnRepairs('故事', dropped, 0)
  return stories
}

export function parseImportedStory(value: unknown): Story | null {
  return parseStory(value)
}
