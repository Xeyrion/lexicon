import type { CardRecord, DayStat, SessionCard, SessionStage, Settings, WordBook } from '../types'
import { dateKey, dayTotal, getLastDays, relativeDayLabel, reviewWordsForDay } from './date'
import { isDue, isMastered, isReviewState, repeatStage } from './fsrs'
import { countOldReviewsToday } from './reviewMetrics'
import { cardKey } from '../store/appStore'

export interface BookStats {
  total: number
  learned: number
  mastered: number
  percent: number
}

export interface QueuePlan {
  reviewBacklog: number
  learningDue: number
  reviewPlan: number
  newPlan: number
}

export interface RatingTotals {
  again: number
  hard: number
  good: number
  easy: number
}

export interface StudySummary {
  learned: number
  mastered: number
  clicks: number
  reviewWords: number
  newWords: number
  activeDays: number
  ratings: RatingTotals
  retention: number
}

export function bookStats(book: WordBook, progress: Record<string, CardRecord>): BookStats {
  let learned = 0
  let mastered = 0
  for (const word of book.words) {
    const record = progress[cardKey(book.id, word.id)]
    if (record) {
      learned += 1
      if (isMastered(record)) mastered += 1
    }
  }
  return {
    total: book.words.length,
    learned,
    mastered,
    percent: book.words.length === 0 ? 0 : Math.round((learned / book.words.length) * 100),
  }
}

function sortByDue(records: CardRecord[]): CardRecord[] {
  return records.sort(
    (a, b) => new Date(a.card.due).getTime() - new Date(b.card.due).getTime(),
  )
}

export function dueRecords(
  book: WordBook,
  progress: Record<string, CardRecord>,
  now = new Date(),
): CardRecord[] {
  const wordIds = new Set(book.words.map((word) => word.id))
  return sortByDue(
    Object.values(progress).filter(
      (record) =>
        record.bookId === book.id && wordIds.has(record.wordId) && isDue(record, now),
    ),
  )
}

export function dueReviewRecords(
  book: WordBook,
  progress: Record<string, CardRecord>,
  now = new Date(),
): CardRecord[] {
  const wordIds = new Set(book.words.map((word) => word.id))
  return sortByDue(
    Object.values(progress).filter(
      (record) =>
        record.bookId === book.id &&
        wordIds.has(record.wordId) &&
        isReviewState(record) &&
        isDue(record, now),
    ),
  )
}

export function dueLearningRecords(
  book: WordBook,
  progress: Record<string, CardRecord>,
  now = new Date(),
): CardRecord[] {
  const wordIds = new Set(book.words.map((word) => word.id))
  return sortByDue(
    Object.values(progress).filter(
      (record) =>
        record.bookId === book.id &&
        wordIds.has(record.wordId) &&
        repeatStage(record) !== null &&
        isDue(record, now),
    ),
  )
}

function remainingNewAllowance(
  settings: Settings,
  days: Record<string, DayStat>,
  now: Date,
): number {
  const today = days[dateKey(now)]
  return Math.max(0, settings.dailyNew - (today?.newCount ?? 0))
}

function remainingReviewAllowance(
  settings: Settings,
  days: Record<string, DayStat>,
  progress: Record<string, CardRecord>,
  now: Date,
): number {
  if (settings.dailyReview === 0) return Number.POSITIVE_INFINITY
  const today = days[dateKey(now)]
  const done = today?.uniqueReviewCount ?? countOldReviewsToday(progress, now)
  return Math.max(0, settings.dailyReview - done)
}

export function getQueuePlan(
  book: WordBook,
  progress: Record<string, CardRecord>,
  settings: Settings,
  days: Record<string, DayStat>,
  now = new Date(),
  ignoreReviewCap = false,
): QueuePlan {
  const reviewBacklog = dueReviewRecords(book, progress, now).length
  const learningDue = dueLearningRecords(book, progress, now).length
  const allowance = ignoreReviewCap
    ? Number.POSITIVE_INFINITY
    : remainingReviewAllowance(settings, days, progress, now)
  return {
    reviewBacklog,
    learningDue,
    reviewPlan: Math.min(reviewBacklog, allowance),
    newPlan: newCount(book, progress, settings, days, now),
  }
}

function recordToCard(
  record: CardRecord,
  word: WordBook['words'][number],
  stage: SessionStage,
): SessionCard {
  return {
    word,
    kind: stage === 'new' ? 'new' : 'review',
    stage,
    record,
  }
}

export function buildQueue(
  book: WordBook,
  progress: Record<string, CardRecord>,
  settings: Settings,
  days: Record<string, DayStat>,
  now = new Date(),
  extra = 0,
  ignoreReviewCap = false,
): SessionCard[] {
  const byId = new Map(book.words.map((word) => [word.id, word]))

  const learning: SessionCard[] = []
  for (const record of dueLearningRecords(book, progress, now)) {
    const word = byId.get(record.wordId)
    if (word) learning.push(recordToCard(record, word, repeatStage(record) ?? 'learning'))
  }

  const reviewAllowance = ignoreReviewCap
    ? Number.POSITIVE_INFINITY
    : remainingReviewAllowance(settings, days, progress, now)
  const reviews: SessionCard[] = []
  for (const record of dueReviewRecords(book, progress, now).slice(0, reviewAllowance)) {
    const word = byId.get(record.wordId)
    if (word) reviews.push(recordToCard(record, word, 'review'))
  }

  const learned = new Set(
    Object.values(progress)
      .filter((record) => record.bookId === book.id)
      .map((record) => record.wordId),
  )
  const newQuota = remainingNewAllowance(settings, days, now) + Math.max(0, extra)
  const newWords = book.words
    .filter((word) => !learned.has(word.id))
    .slice(0, newQuota)
    .map((word) => ({ word, kind: 'new', stage: 'new' }) satisfies SessionCard)

  return [...learning, ...reviews, ...newWords]
}

export function buildExtraNewCards(
  book: WordBook,
  progress: Record<string, CardRecord>,
  exclude: Set<string>,
  count: number,
): SessionCard[] {
  const learned = new Set(
    Object.values(progress)
      .filter((record) => record.bookId === book.id)
      .map((record) => record.wordId),
  )
  return book.words
    .filter((word) => !learned.has(word.id) && !exclude.has(word.id))
    .slice(0, Math.max(0, count))
    .map((word) => ({ word, kind: 'new', stage: 'new' }) satisfies SessionCard)
}

export function newCount(
  book: WordBook,
  progress: Record<string, CardRecord>,
  settings: Settings,
  days: Record<string, DayStat>,
  now = new Date(),
): number {
  const quota = remainingNewAllowance(settings, days, now)
  const learned = new Set(
    Object.values(progress)
      .filter((record) => record.bookId === book.id)
      .map((record) => record.wordId),
  )
  return Math.min(book.words.filter((word) => !learned.has(word.id)).length, quota)
}

export function summarizeStudy(
  progress: Record<string, CardRecord>,
  days: Record<string, DayStat>,
  // 传入已知词书 id 集合，用于排除已删除词书遗留的孤儿记录。
  validBookIds?: Set<string>,
): StudySummary {
  let learned = 0
  let mastered = 0
  for (const record of Object.values(progress)) {
    if (validBookIds && !validBookIds.has(record.bookId)) continue
    learned += 1
    if (isMastered(record)) mastered += 1
  }

  let clicks = 0
  let reviewWords = 0
  let newWords = 0
  let activeDays = 0
  const ratings: RatingTotals = { again: 0, hard: 0, good: 0, easy: 0 }
  for (const day of Object.values(days)) {
    ratings.again += day.again
    ratings.hard += day.hard
    ratings.good += day.good
    ratings.easy += day.easy
    clicks += day.again + day.hard + day.good + day.easy
    reviewWords += reviewWordsForDay(day)
    newWords += day.newCount
    if (dayTotal(day) > 0) activeDays += 1
  }

  return {
    learned,
    mastered,
    clicks,
    reviewWords,
    newWords,
    activeDays,
    ratings,
    retention: clicks === 0 ? 0 : Math.round(((clicks - ratings.again) / clicks) * 100),
  }
}

export function totalReviews(days: Record<string, DayStat>): number {
  return Object.values(days).reduce(
    (sum, day) => sum + day.again + day.hard + day.good + day.easy,
    0,
  )
}

export function totalReviewWords(days: Record<string, DayStat>): number {
  return Object.values(days).reduce((sum, day) => sum + reviewWordsForDay(day), 0)
}

export function totalNew(days: Record<string, DayStat>): number {
  return Object.values(days).reduce((sum, day) => sum + day.newCount, 0)
}

export function accuracy(days: Record<string, DayStat>): number {
  let again = 0
  let total = 0
  for (const day of Object.values(days)) {
    again += day.again
    total += day.again + day.hard + day.good + day.easy
  }
  return total === 0 ? 0 : Math.round(((total - again) / total) * 100)
}

export function masteredTotal(progress: Record<string, CardRecord>): number {
  return Object.values(progress).filter(isMastered).length
}

export function activitySeries(days: Record<string, DayStat>, count: number, now = new Date()) {
  return getLastDays(count, now).map((key) => {
    const day = days[key]
    return {
      key,
      label: relativeDayLabel(key, now),
      newWords: day?.newCount ?? 0,
      reviews: reviewWordsForDay(day),
    }
  })
}

export function ratingTotals(days: Record<string, DayStat>): RatingTotals {
  return Object.values(days).reduce(
    (totals, day) => ({
      again: totals.again + day.again,
      hard: totals.hard + day.hard,
      good: totals.good + day.good,
      easy: totals.easy + day.easy,
    }),
    { again: 0, hard: 0, good: 0, easy: 0 },
  )
}
