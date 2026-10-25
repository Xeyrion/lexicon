import { describe, it, expect } from 'vitest'
import type { CardRecord, DayStat } from '../../types'
import { addDays, dateKey } from '../date'
import { inspectStudyData } from '../health'

const NOW = new Date('2026-06-15T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function at(offsetDays: number): string {
  return new Date(NOW.getTime() + offsetDays * DAY_MS).toISOString()
}

function cardRecord(overrides: Partial<CardRecord> = {}, due = at(-3)): CardRecord {
  return {
    bookId: 'cet4',
    wordId: 'abandon',
    card: {
      due,
      stability: 3,
      difficulty: 5,
      elapsed_days: 2,
      scheduled_days: 3,
      learning_steps: 0,
      reps: 2,
      lapses: 0,
      state: 2,
      last_review: at(-3),
    },
    introducedAt: at(-10),
    updatedAt: at(-3),
    reviews: 2,
    ...overrides,
  }
}

function dayStat(date: string): DayStat {
  return {
    date,
    newCount: 5,
    reviewCount: 7,
    again: 1,
    hard: 1,
    good: 3,
    easy: 2,
  }
}

describe('inspectStudyData', () => {
  it('全部正常时 total 为 0', () => {
    const progress = { 'cet4:abandon': cardRecord() }
    const days = { [dateKey(NOW)]: dayStat(dateKey(NOW)) }
    expect(inspectStudyData(progress, days, NOW)).toEqual({
      farFutureDue: 0,
      futureTimestamps: 0,
      futureDays: 0,
      total: 0,
    })
  })

  it('due 在 100 年后时记入 farFutureDue', () => {
    const record = cardRecord({}, at(100 * 365))
    const issues = inspectStudyData({ 'cet4:abandon': record }, {}, NOW)
    expect(issues.farFutureDue).toBe(1)
    expect(issues.total).toBe(1)
  })

  it('last_review 在明天时记入 futureTimestamps', () => {
    const record = cardRecord()
    record.card.last_review = at(1.5)
    const issues = inspectStudyData({ 'cet4:abandon': record }, {}, NOW)
    expect(issues.futureTimestamps).toBe(1)
    expect(issues.total).toBe(1)
  })

  it('days 里有明天之后的 key 时记入 futureDays', () => {
    const futureKey = dateKey(addDays(NOW, 2))
    const issues = inspectStudyData({}, { [futureKey]: dayStat(futureKey) }, NOW)
    expect(issues.futureDays).toBe(1)
    expect(issues.total).toBe(1)
  })

  it('空对象全部为 0', () => {
    expect(inspectStudyData({}, {}, NOW)).toEqual({
      farFutureDue: 0,
      futureTimestamps: 0,
      futureDays: 0,
      total: 0,
    })
  })

  it('非法日期不计入 futureTimestamps 且不抛异常', () => {
    const record = cardRecord({ introducedAt: 'not-a-date', updatedAt: '' })
    record.card.last_review = 'oops'
    const issues = inspectStudyData({ 'cet4:abandon': record }, {}, NOW)
    expect(issues.futureTimestamps).toBe(0)
    expect(issues.total).toBe(0)
  })

  it('now 参数可控：同一份数据在不同 now 下结果不同', () => {
    const record = cardRecord({}, at(400))
    expect(inspectStudyData({ 'cet4:abandon': record }, {}, NOW).farFutureDue).toBe(0)
    const later = new Date(NOW.getTime() + 2000 * DAY_MS)
    expect(inspectStudyData({ 'cet4:abandon': record }, {}, later).farFutureDue).toBe(0)
    const earlier = new Date(NOW.getTime() - 5000 * DAY_MS)
    expect(inspectStudyData({ 'cet4:abandon': record }, {}, earlier).farFutureDue).toBe(1)
  })
})
