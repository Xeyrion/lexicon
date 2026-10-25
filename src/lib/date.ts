import type { DayStat } from '../types'

export function dateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export function formatLongDate(date = new Date()): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date)
}

export function formatShortDate(date = new Date()): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

export function formatMonthDay(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function reviewWordsForDay(day: DayStat | undefined): number {
  if (!day) return 0
  return day.uniqueReviewCount ?? day.reviewCount
}

export function dayTotal(day: DayStat | undefined): number {
  if (!day) return 0
  return day.newCount + reviewWordsForDay(day)
}

export function getStreak(days: Record<string, DayStat>, now = new Date()): number {
  let streak = 0
  let cursor = new Date(now)
  if (dayTotal(days[dateKey(cursor)]) === 0) {
    cursor = addDays(cursor, -1)
  }
  while (dayTotal(days[dateKey(cursor)]) > 0) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function getLastDays(count: number, now = new Date()): string[] {
  const keys: string[] = []
  for (let index = count - 1; index >= 0; index -= 1) {
    keys.push(dateKey(addDays(now, -index)))
  }
  return keys
}

export function startOfWeek(date: Date): Date {
  const result = new Date(date)
  const weekday = (result.getDay() + 6) % 7
  result.setDate(result.getDate() - weekday)
  result.setHours(0, 0, 0, 0)
  return result
}

export function startOfToday(): Date {
  const result = new Date()
  result.setHours(0, 0, 0, 0)
  return result
}

export function todayIndex(): number {
  return Math.floor(Date.now() / 86_400_000)
}

export function formatNumber(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1).replace(/\.0$/, '')}万`
  }
  return new Intl.NumberFormat('zh-CN').format(value)
}

export function relativeDayLabel(key: string, now = new Date()): string {
  if (key === dateKey(now)) return '今天'
  if (key === dateKey(addDays(now, -1))) return '昨天'
  return formatMonthDay(new Date(`${key}T00:00:00`))
}
