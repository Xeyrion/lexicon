import type { CardRecord, DayStat, PersonalWord, SerializedCard, Settings } from '../../types'
import {
  type Parsed,
  clamp,
  dayKey,
  finiteNumber,
  isPlainObject,
  rounded,
  sanitizeBookId,
  sanitizeDateString,
  stringList,
  warnRepairs,
} from './primitives'

const DAILY_NEW_MIN = 5
const DAILY_NEW_MAX = 60
const DAILY_REVIEW_MIN = 20
const DAILY_REVIEW_MAX = 200
const RATE_MIN = 0.7
const RATE_MAX = 1.3

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
