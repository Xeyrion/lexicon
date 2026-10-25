import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ReaderArticle, ReaderSettings } from '../types'
import { countWords, normalizeArticleText } from '../lib/reader'
import { createFileBackedStorage } from '../lib/storage'
import { useReaderProgressStore } from './readerProgressStore'

const STORAGE_NAME = 'lexicon-reader-v1'

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 19,
}

interface ArticleInput {
  title: string
  text: string
  source: string
}

interface ReaderState {
  articles: ReaderArticle[]
  settings: ReaderSettings
  createArticle: (input: ArticleInput) => ReaderArticle
  updateArticle: (id: string, input: ArticleInput) => ReaderArticle | null
  renameArticle: (id: string, title: string) => void
  removeArticle: (id: string) => void
  setFontSize: (size: number) => void
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const useReaderStore = create<ReaderState>()(
  persist(
    (setState, get) => ({
      articles: [],
      settings: DEFAULT_READER_SETTINGS,

      createArticle: (input) => {
        const now = new Date().toISOString()
        const text = normalizeArticleText(input.text)
        const article: ReaderArticle = {
          id: makeId(),
          title: input.title.trim() || '未命名文章',
          source: input.source.trim() || '粘贴',
          text,
          createdAt: now,
          updatedAt: now,
          progress: 0,
          wordCount: countWords(text),
        }
        setState((state) => ({ articles: [article, ...state.articles] }))
        return article
      },

      updateArticle: (id, input) => {
        const existing = get().articles.find((article) => article.id === id)
        if (!existing) return null
        const text = normalizeArticleText(input.text)
        const updated: ReaderArticle = {
          ...existing,
          title: input.title.trim() || '未命名文章',
          source: input.source.trim() || '粘贴',
          text,
          updatedAt: new Date().toISOString(),
          wordCount: countWords(text),
        }
        setState((state) => ({
          articles: state.articles.map((article) => (article.id === id ? updated : article)),
        }))
        return updated
      },

      renameArticle: (id, title) => {
        const nextTitle = title.trim()
        if (!nextTitle) return
        setState((state) => ({
          articles: state.articles.map((article) =>
            article.id === id ? { ...article, title: nextTitle, updatedAt: new Date().toISOString() } : article,
          ),
        }))
      },

      removeArticle: (id) => {
        setState((state) => ({ articles: state.articles.filter((article) => article.id !== id) }))
        useReaderProgressStore.getState().removeArticle(id)
      },

      setFontSize: (size) => {
        const fontSize = Math.min(26, Math.max(16, Math.round(size)))
        setState((state) => ({ settings: { ...state.settings, fontSize } }))
      },
    }),
    {
      name: STORAGE_NAME,
      version: 1,
      storage: createJSONStorage(() =>
        createFileBackedStorage({ kind: 'reader', debounceMs: 1000 }),
      ),
      partialize: (state) => ({
        articles: state.articles,
        settings: state.settings,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ReaderState>
        return {
          ...current,
          ...saved,
          articles: saved.articles ?? [],
          settings: { ...current.settings, ...(saved.settings ?? {}) },
        }
      },
    },
  ),
)
