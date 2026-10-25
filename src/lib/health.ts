import type { CardRecord, DayStat } from '../types'
import { addDays, dateKey } from './date'

/**
 * A due date more than 10 years out cannot come from normal FSRS scheduling
 * (intervals top out at a few years for realistic stability values), so it is a
 * strong signal that the system clock jumped forward.
 */
const FAR_FUTURE_MS = 10 * 365 * 24 * 60 * 60 * 1000

/**
 * One day of slack absorbs ordinary clock drift and the widest possible
 * timezone/UTC-offset spread, without hiding a genuinely wrong clock.
 */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000

/** Canonical local date key, as produced by `dateKey()`. */
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

export interface ClockIssues {
  /** `due` later than now + 10 years. */
  farFutureDue: number
  /** Records whose `last_review` / `introducedAt` / `updatedAt` is later than now + 1 day. */
  futureTimestamps: number
  /** Day-stat keys later than tomorrow. */
  futureDays: number
  total: number
}

function toMs(value: string | undefined): number {
  if (typeof value !== 'string') return Number.NaN
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : Number.NaN
}

/**
 * Read-only scan for timestamps that disagree with the current clock. It never
 * mutates or repairs anything: rewrites of `due` / `days` are left to the user.
 */
export function inspectStudyData(
  progress: Record<string, CardRecord>,
  days: Record<string, DayStat>,
  now: Date = new Date(),
): ClockIssues {
  const issues: ClockIssues = {
    farFutureDue: 0,
    futureTimestamps: 0,
    futureDays: 0,
    total: 0,
  }

  try {
    const nowMs = now.getTime()
    if (!Number.isFinite(nowMs)) return issues

    const farFutureLimit = nowMs + FAR_FUTURE_MS
    const futureLimit = nowMs + FUTURE_TOLERANCE_MS

    for (const record of Object.values(progress)) {
      if (!record || typeof record !== 'object') continue

      const due = toMs(record.card?.due)
      if (Number.isFinite(due) && due > farFutureLimit) issues.farFutureDue += 1

      // Counted once per record: several stale fields still mean one bad record.
      const timestamps = [record.card?.last_review, record.introducedAt, record.updatedAt]
      const hasFuture = timestamps.some((value) => {
        const ms = toMs(value)
        return Number.isFinite(ms) && ms > futureLimit
      })
      if (hasFuture) issues.futureTimestamps += 1
    }

    const cutoff = dateKey(addDays(now, 1))
    for (const key of Object.keys(days)) {
      if (DAY_KEY.test(key) && key > cutoff) issues.futureDays += 1
    }

    issues.total = issues.farFutureDue + issues.futureTimestamps + issues.futureDays
  } catch {
    // Defensive only: unreadable input must never break the settings page.
    return issues
  }

  return issues
}
