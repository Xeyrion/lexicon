import type { GradeKey, SessionStage } from '../../types'

export interface Results {
  newWords: number
  reviewWords: number
  ratings: number
  again: number
  hard: number
  good: number
  easy: number
}

export const EMPTY_RESULTS: Results = {
  newWords: 0,
  reviewWords: 0,
  ratings: 0,
  again: 0,
  hard: 0,
  good: 0,
  easy: 0,
}

/** Cards due later than this are left for the next session instead of requeued. */
export const IN_SESSION_WAIT_LIMIT_MS = 30 * 60 * 1000

export const STAGE_LABELS: Record<SessionStage, string> = {
  new: '新词',
  review: '复习',
  learning: '学习步',
  relearning: '重学',
}

export const GRADES: {
  key: GradeKey
  label: string
  keyHint: string
  card: string
  accent: string
}[] = [
  {
    key: 'again',
    label: '忘记',
    keyHint: '1',
    card: 'border-line bg-surface hover:border-accent/40 hover:bg-accent-wash',
    accent: 'bg-accent',
  },
  {
    key: 'hard',
    label: '模糊',
    keyHint: '2',
    card: 'border-line bg-surface hover:border-amber/45 hover:bg-amber-soft/70',
    accent: 'bg-amber',
  },
  {
    key: 'good',
    label: '认识',
    keyHint: '3',
    card: 'border-ink/15 bg-ink/[0.045] hover:border-ink/30 hover:bg-ink/[0.07]',
    accent: 'bg-ink',
  },
  {
    key: 'easy',
    label: '熟练',
    keyHint: '4',
    card: 'border-line bg-surface hover:border-forest/45 hover:bg-forest-soft/70',
    accent: 'bg-forest',
  },
]

export function normalizePos(pos: string): string {
  const map: Record<string, string> = {
    'a.': 'adj.',
    'ad.': 'adv.',
    'adv.': 'adv.',
    'adj.': 'adj.',
    'n.': 'n.',
    'v.': 'v.',
    'vt.': 'v.',
    'vi.': 'v.',
    'aux.': 'aux.',
    'prep.': 'prep.',
    'conj.': 'conj.',
    'pron.': 'pron.',
    'num.': 'num.',
    'art.': 'art.',
  }
  return map[pos.toLowerCase()] ?? pos
}

export function formatDuration(startedAt: number): string {
  const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes} 分钟` : `${minutes} 分 ${rest} 秒`
}

export function formatWait(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分 ${seconds} 秒`
  return `${seconds} 秒`
}
