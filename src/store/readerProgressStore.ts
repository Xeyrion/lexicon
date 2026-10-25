import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ReaderAnchor, ReaderArticle } from '../types'
import { createFileBackedStorage } from '../lib/storage'
import {
  isPlainObject,
  sanitizeReaderProgressItems,
} from '../lib/validation'

const STORAGE_NAME = 'lexicon-reader-progress-v1'

export interface ReaderProgressRecord {
  progress: number
  lastReadAt?: string
  anchor?: ReaderAnchor
}

interface ReaderProgressState {
  items: Record<string, ReaderProgressRecord>
  /** `anchor: null` clears it; `undefined` keeps the previous one. */
  setProgress: (id: string, progress: number, anchor?: ReaderAnchor | null) => void
  touch: (id: string, progress?: number) => void
  removeArticle: (id: string) => void
  replaceAll: (articles: ReaderArticle[]) => void
}

export const useReaderProgressStore = create<ReaderProgressState>()(
  persist(
    (setState) => ({
      items: {},

      setProgress: (id, progress, anchor) => {
        const clamped = Math.min(1, Math.max(0, progress))
        setState((state) => {
          const current = state.items[id]
          const nextAnchor = anchor === null ? undefined : (anchor ?? current?.anchor)
          const record: ReaderProgressRecord = {
            progress: clamped,
            lastReadAt: current?.lastReadAt ?? new Date().toISOString(),
          }
          if (nextAnchor) record.anchor = nextAnchor
          return { items: { ...state.items, [id]: record } }
        })
      },

      touch: (id, progress = 0) => {
        const now = new Date().toISOString()
        setState((state) => {
          const current = state.items[id]
          return {
            items: {
              ...state.items,
              [id]: {
                progress: current?.progress ?? Math.min(1, Math.max(0, progress)),
                lastReadAt: now,
              },
            },
          }
        })
      },

      removeArticle: (id) => {
        setState((state) => {
          if (!(id in state.items)) return state
          const items = { ...state.items }
          delete items[id]
          return { items }
        })
      },

      replaceAll: (articles) => {
        const items: Record<string, ReaderProgressRecord> = {}
        for (const article of articles) {
          items[article.id] = {
            progress: Math.min(1, Math.max(0, article.progress)),
            ...(article.lastReadAt ? { lastReadAt: article.lastReadAt } : {}),
            ...(article.anchor ? { anchor: article.anchor } : {}),
          }
        }
        setState({ items })
      },
    }),
    {
      name: STORAGE_NAME,
      version: 1,
      storage: createJSONStorage(() =>
        createFileBackedStorage({ kind: 'reader-progress', debounceMs: 800 }),
      ),
      partialize: (state) => ({ items: state.items }),
      merge: (persisted, current) => {
        const saved = isPlainObject(persisted) ? persisted : {}
        if (persisted !== undefined && !isPlainObject(persisted)) {
          console.warn('[Lexicon] 本地阅读进度格式异常，已忽略无法识别的字段。')
        }
        return {
          ...current,
          items: sanitizeReaderProgressItems(saved.items),
        }
      },
    },
  ),
)

export function articlesWithProgress(articles: ReaderArticle[]): ReaderArticle[] {
  const items = useReaderProgressStore.getState().items
  return articles.map((article) => {
    const record = items[article.id]
    if (!record) return article
    const merged: ReaderArticle = {
      ...article,
      progress: record.progress,
    }
    if (record.lastReadAt) merged.lastReadAt = record.lastReadAt
    else delete merged.lastReadAt
    if (record.anchor) merged.anchor = record.anchor
    else delete merged.anchor
    return merged
  })
}
