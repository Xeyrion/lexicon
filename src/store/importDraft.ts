import { create } from 'zustand'
import type { ParsedBook } from '../lib/bookParse'

interface ImportDraftState {
  draft: ParsedBook | null
  setDraft: (draft: ParsedBook | null) => void
  /** Structural edits made on the preview page before anything is saved. */
  patchChapter: (index: number, title: string) => void
  removeChapter: (index: number) => void
  mergeIntoPrevious: (index: number) => void
  moveChapter: (index: number, delta: number) => void
  setMeta: (meta: { title?: string; author?: string }) => void
}

/**
 * Parsed but not yet saved. Deliberately not persisted: a half-reviewed import
 * should never survive a reload and get mistaken for real data.
 */
export const useImportDraft = create<ImportDraftState>((set) => ({
  draft: null,

  setDraft: (draft) => set({ draft }),

  patchChapter: (index, title) =>
    set((state) => {
      if (!state.draft) return state
      const chapters = state.draft.chapters.map((chapter, i) =>
        i === index ? { ...chapter, title: title.trim() || chapter.title } : chapter,
      )
      return { draft: { ...state.draft, chapters } }
    }),

  removeChapter: (index) =>
    set((state) => {
      if (!state.draft) return state
      return {
        draft: {
          ...state.draft,
          chapters: state.draft.chapters.filter((_, i) => i !== index),
        },
      }
    }),

  mergeIntoPrevious: (index) =>
    set((state) => {
      if (!state.draft || index <= 0) return state
      const chapters = [...state.draft.chapters]
      const previous = chapters[index - 1]
      const current = chapters[index]
      chapters.splice(index - 1, 2, {
        title: previous.title,
        text: `${previous.text}\n\n${current.text}`.trim(),
      })
      return { draft: { ...state.draft, chapters } }
    }),

  moveChapter: (index, delta) =>
    set((state) => {
      if (!state.draft) return state
      const target = index + delta
      const chapters = [...state.draft.chapters]
      if (target < 0 || target >= chapters.length) return state
      const [moved] = chapters.splice(index, 1)
      chapters.splice(target, 0, moved)
      return { draft: { ...state.draft, chapters } }
    }),

  setMeta: (meta) =>
    set((state) => {
      if (!state.draft) return state
      return {
        draft: {
          ...state.draft,
          title: meta.title ?? state.draft.title,
          author: meta.author ?? state.draft.author,
        },
      }
    }),
}))
