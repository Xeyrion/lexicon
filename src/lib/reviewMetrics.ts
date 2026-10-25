import type { CardRecord } from '../types'
import { dateKey } from './date'

export function isIntroducedToday(record: CardRecord, now = new Date()): boolean {
  return dateKey(new Date(record.introducedAt)) === dateKey(now)
}

export function isFirstOldReviewToday(record: CardRecord, now = new Date()): boolean {
  return (
    !isIntroducedToday(record, now) &&
    dateKey(new Date(record.updatedAt)) !== dateKey(now)
  )
}

export function countOldReviewsToday(
  progress: Record<string, CardRecord>,
  now = new Date(),
): number {
  const today = dateKey(now)
  let count = 0
  for (const record of Object.values(progress)) {
    if (dateKey(new Date(record.updatedAt)) !== today) continue
    if (dateKey(new Date(record.introducedAt)) === today) continue
    count += 1
  }
  return count
}
