import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type {
  CardRecord,
  DayStat,
  GradeKey,
  PersonalWord,
  Settings,
  Snapshot,
} from '../types'
import { dateKey } from '../lib/date'
import {
  deserializeCard,
  gradeToRating,
  newCard,
  scheduler,
  serializeCard,
} from '../lib/fsrs'
import { createPersonalWord, type PersonalInput } from '../lib/personal'
import { countOldReviewsToday, isFirstOldReviewToday } from '../lib/reviewMetrics'
import { clearPersistedKind, createFileBackedStorage } from '../lib/storage'
import {
  isPlainObject,
  sanitizeBookId,
  sanitizeDays,
  sanitizePersonalWords,
  sanitizeProgress,
  sanitizeSettings,
} from '../lib/validation'

export const DEFAULT_SETTINGS: Settings = {
  accent: 'us',
  dailyNew: 20,
  dailyReview: 60,
  autoSpeak: true,
  rate: 1,
  theme: 'system',
  showDefinition: true,
}

interface AppState {
  settings: Settings
  currentBookId: string
  progress: Record<string, CardRecord>
  days: Record<string, DayStat>
  personalWords: PersonalWord[]
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  setCurrentBook: (bookId: string) => void
  recordReview: (input: { bookId: string; wordId: string; grade: GradeKey }) => void
  addPersonalWord: (input: PersonalInput) => string | null
  importPersonalWords: (words: PersonalWord[]) => number
  removePersonalWord: (wordId: string) => void
  resetProgress: () => void
  resetAll: () => Promise<void>
  snapshot: () => Snapshot
  restore: (data: unknown) => string | null
}

export function cardKey(bookId: string, wordId: string): string {
  return `${bookId}:${wordId}`
}

function emptyDay(date: string): DayStat {
  return {
    date,
    newCount: 0,
    reviewCount: 0,
    uniqueReviewCount: 0,
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  }
}

const STORAGE_NAME = 'lexicon-study-v1'

export const useAppStore = create<AppState>()(
  persist(
    (setState, getState) => ({
      settings: DEFAULT_SETTINGS,
      currentBookId: 'cet4',
      progress: {},
      days: {},
      personalWords: [],

      setSetting: (key, value) =>
        setState((state) => ({ settings: { ...state.settings, [key]: value } })),

      setCurrentBook: (bookId) => setState({ currentBookId: bookId }),

      recordReview: ({ bookId, wordId, grade }) => {
        const now = new Date()
        const key = cardKey(bookId, wordId)
        const state = getState()
        const existing = state.progress[key]
        const base = existing ? deserializeCard(existing.card) : newCard(now)
        const { card } = scheduler.next(base, now, gradeToRating[grade])

        const day = state.days[dateKey(now)] ?? emptyDay(dateKey(now))
        const firstOldReview = existing ? isFirstOldReviewToday(existing, now) : false
        const uniqueReviewBase = day.uniqueReviewCount ?? countOldReviewsToday(state.progress, now)
        const nextDay: DayStat = {
          ...day,
          [grade]: day[grade] + 1,
          uniqueReviewCount: uniqueReviewBase + (firstOldReview ? 1 : 0),
        }
        if (existing) {
          nextDay.reviewCount += 1
        } else {
          nextDay.newCount += 1
        }

        const record: CardRecord = {
          bookId,
          wordId,
          card: serializeCard(card),
          introducedAt: existing?.introducedAt ?? now.toISOString(),
          updatedAt: now.toISOString(),
          reviews: (existing?.reviews ?? 0) + 1,
        }

        setState({
          progress: { ...state.progress, [key]: record },
          days: { ...state.days, [dateKey(now)]: nextDay },
        })
      },

      addPersonalWord: (input) => {
        const word = createPersonalWord(input)
        if (!word) return '请填写单词和释义'
        if (getState().personalWords.some((item) => item.id === word.id)) {
          return '这个单词已经在词库里了'
        }
        setState((state) => ({ personalWords: [word, ...state.personalWords] }))
        return null
      },

      importPersonalWords: (words) => {
        const state = getState()
        const seen = new Set(state.personalWords.map((word) => word.id))
        const unique: PersonalWord[] = []
        for (const word of words) {
          if (seen.has(word.id)) continue
          seen.add(word.id)
          unique.push(word)
        }
        if (unique.length > 0) {
          setState({ personalWords: [...unique, ...state.personalWords] })
        }
        return unique.length
      },

      removePersonalWord: (wordId) => {
        const state = getState()
        const progress = { ...state.progress }
        delete progress[cardKey('personal', wordId)]
        setState({
          personalWords: state.personalWords.filter((word) => word.id !== wordId),
          progress,
        })
      },

      resetProgress: () => setState({ progress: {}, days: {} }),

      resetAll: async () => {
        await clearPersistedKind('study')
        await clearPersistedKind('reader')
        await clearPersistedKind('reader-progress')
        await clearPersistedKind('library')
        setState({
          settings: DEFAULT_SETTINGS,
          currentBookId: 'cet4',
          progress: {},
          days: {},
          personalWords: [],
        })
      },

      snapshot: () => {
        const state = getState()
        return {
          app: 'lexicon',
          version: 1,
          exportedAt: new Date().toISOString(),
          settings: state.settings,
          currentBookId: state.currentBookId,
          progress: state.progress,
          days: state.days,
          personalWords: state.personalWords,
        }
      },

      restore: (data) => {
        if (!isPlainObject(data)) return '文件格式不正确'
        if (data.app !== 'lexicon' && data.app !== 'learnword') {
          return '这不是词间导出的备份文件'
        }
        if (
          !isPlainObject(data.progress) ||
          !isPlainObject(data.days) ||
          !Array.isArray(data.personalWords)
        ) {
          return '备份内容不完整'
        }
        setState({
          settings: sanitizeSettings(data.settings, DEFAULT_SETTINGS),
          currentBookId: sanitizeBookId(data.currentBookId) ?? 'cet4',
          progress: sanitizeProgress(data.progress),
          days: sanitizeDays(data.days),
          personalWords: sanitizePersonalWords(data.personalWords),
        })
        return null
      },
    }),
    {
      name: STORAGE_NAME,
      version: 1,
      storage: createJSONStorage(() =>
        createFileBackedStorage({ kind: 'study', debounceMs: 400 }),
      ),
      partialize: (state) => ({
        settings: state.settings,
        currentBookId: state.currentBookId,
        progress: state.progress,
        days: state.days,
        personalWords: state.personalWords,
      }),
      merge: (persisted, current) => {
        const saved = isPlainObject(persisted) ? persisted : {}
        if (persisted !== undefined && !isPlainObject(persisted)) {
          console.warn('[Lexicon] 本地学习数据格式异常，已忽略无法识别的字段。')
        }
        return {
          ...current,
          settings: sanitizeSettings(saved.settings, current.settings),
          currentBookId: sanitizeBookId(saved.currentBookId) ?? current.currentBookId,
          progress: sanitizeProgress(saved.progress),
          days: sanitizeDays(saved.days),
          personalWords: sanitizePersonalWords(saved.personalWords),
        }
      },
    },
  ),
)
