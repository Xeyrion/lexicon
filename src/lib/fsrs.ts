import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  type Card,
  type Grade,
} from 'ts-fsrs'
import type { CardRecord, GradeKey, SerializedCard, SessionStage } from '../types'

export const scheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
})

export const gradeToRating: Record<GradeKey, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
}

export const gradeOrder: GradeKey[] = ['again', 'hard', 'good', 'easy']

export function serializeCard(card: Card): SerializedCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review?.toISOString(),
  }
}

export function deserializeCard(card: SerializedCard): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as State,
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  }
}

export function newCard(now = new Date()): Card {
  return createEmptyCard(now)
}

export function cardFromRecord(record?: CardRecord, now = new Date()): Card {
  return record ? deserializeCard(record.card) : newCard(now)
}

export function isDue(record: CardRecord, now = new Date()): boolean {
  return record.card.state !== State.New && new Date(record.card.due).getTime() <= now.getTime()
}

export function isMastered(record: CardRecord): boolean {
  return record.card.state === State.Review && record.card.stability >= 21
}

export function isReviewState(record: CardRecord): boolean {
  return record.card.state === State.Review
}

export function repeatStage(record: CardRecord): SessionStage | null {
  if (record.card.state === State.Learning) return 'learning'
  if (record.card.state === State.Relearning) return 'relearning'
  return null
}

export function dueTimestamp(record: CardRecord): number {
  return new Date(record.card.due).getTime()
}

export function formatInterval(due: Date, now = new Date()): string {
  const minutes = Math.max(0, Math.round((due.getTime() - now.getTime()) / 60000))
  if (minutes < 1) return '<1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} 天`
  const months = Math.round(days / 30)
  if (months < 12) return `${months} 个月`
  return `${Math.round(months / 12)} 年`
}

export function previewIntervals(card: Card, now = new Date()): Record<GradeKey, string> {
  const preview = scheduler.repeat(card, now)
  return {
    again: formatInterval(preview[Rating.Again].card.due, now),
    hard: formatInterval(preview[Rating.Hard].card.due, now),
    good: formatInterval(preview[Rating.Good].card.due, now),
    easy: formatInterval(preview[Rating.Easy].card.due, now),
  }
}

export function stateLabel(state: number): string {
  switch (state) {
    case State.New:
      return '新词'
    case State.Learning:
      return '学习中'
    case State.Review:
      return '复习'
    case State.Relearning:
      return '重学'
    default:
      return '未知'
  }
}
