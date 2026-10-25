import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Book, Chapter } from '../types'
import { countWords, normalizeArticleText } from '../lib/reader'
import { createFileBackedStorage } from '../lib/storage'
import { isPlainObject, sanitizeBooks } from '../lib/validation'
import { useReaderProgressStore } from './readerProgressStore'

const STORAGE_NAME = 'lexicon-library-v1'
/** Matches the article editor so one chapter cannot swallow a whole novel. */
export const MAX_CHAPTER_CHARS = 200_000

export interface ChapterInput {
  title?: string
  text?: string
}

export interface BookInput {
  title: string
  author?: string
  source?: Book['source']
  chapters?: ChapterInput[]
}

interface LibraryState {
  books: Book[]
  addBook: (input: BookInput) => Book
  updateBook: (id: string, input: { title?: string; author?: string }) => void
  removeBook: (id: string) => void
  addChapter: (bookId: string, input: ChapterInput) => Chapter | null
  updateChapter: (bookId: string, chapterId: string, input: ChapterInput) => Chapter | null
  removeChapter: (bookId: string, chapterId: string) => void
  moveChapter: (bookId: string, chapterId: string, toIndex: number) => void
  /** Replaces the whole shelf; used by import and restore. */
  replaceBooks: (books: Book[]) => void
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function makeChapter(input: ChapterInput): Chapter {
  const now = new Date().toISOString()
  const text = normalizeArticleText(input.text ?? '').slice(0, MAX_CHAPTER_CHARS)
  return {
    id: makeId(),
    title: input.title?.trim() || '未命名章节',
    text,
    wordCount: countWords(text),
    createdAt: now,
    updatedAt: now,
  }
}

/** Book-level timestamp follows its chapters so sorting by "recent" works. */
function touch(book: Book): Book {
  return { ...book, updatedAt: new Date().toISOString() }
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (setState, get) => ({
      books: [],

      addBook: (input) => {
        const now = new Date().toISOString()
        const book: Book = {
          id: makeId(),
          title: input.title.trim() || '未命名书籍',
          author: input.author?.trim() ?? '',
          source: input.source ?? 'manual',
          chapters: (input.chapters ?? []).map(makeChapter),
          createdAt: now,
          updatedAt: now,
        }
        setState((state) => ({ books: [book, ...state.books] }))
        return book
      },

      updateBook: (id, input) => {
        setState((state) => ({
          books: state.books.map((book) =>
            book.id === id
              ? {
                  ...book,
                  title:
                    input.title === undefined
                      ? book.title
                      : input.title.trim() || '未命名书籍',
                  author: input.author === undefined ? book.author : input.author.trim(),
                  updatedAt: new Date().toISOString(),
                }
              : book,
          ),
        }))
      },

      removeBook: (id) => {
        const book = get().books.find((item) => item.id === id)
        if (!book) return
        const progress = useReaderProgressStore.getState()
        for (const chapter of book.chapters) progress.removeArticle(chapter.id)
        setState((state) => ({ books: state.books.filter((item) => item.id !== id) }))
      },

      addChapter: (bookId, input) => {
        const chapter = makeChapter(input)
        let added = false
        setState((state) => ({
          books: state.books.map((book) => {
            if (book.id !== bookId) return book
            added = true
            return touch({ ...book, chapters: [...book.chapters, chapter] })
          }),
        }))
        return added ? chapter : null
      },

      updateChapter: (bookId, chapterId, input) => {
        let updated: Chapter | null = null
        setState((state) => ({
          books: state.books.map((book) => {
            if (book.id !== bookId) return book
            const chapters = book.chapters.map((chapter) => {
              if (chapter.id !== chapterId) return chapter
              const text =
                input.text === undefined
                  ? chapter.text
                  : normalizeArticleText(input.text).slice(0, MAX_CHAPTER_CHARS)
              const next: Chapter = {
                ...chapter,
                title:
                  input.title === undefined
                    ? chapter.title
                    : input.title.trim() || '未命名章节',
                text,
                wordCount: countWords(text),
                updatedAt: new Date().toISOString(),
              }
              updated = next
              return next
            })
            return touch({ ...book, chapters })
          }),
        }))

        // A token anchor points at a word; once the text changes it is meaningless.
        const result: Chapter | null = updated
        if (result && input.text !== undefined) {
          const progress = useReaderProgressStore.getState()
          const record = progress.items[chapterId]
          progress.setProgress(chapterId, record?.progress ?? 0, null)
        }
        return result
      },

      removeChapter: (bookId, chapterId) => {
        useReaderProgressStore.getState().removeArticle(chapterId)
        setState((state) => ({
          books: state.books.map((book) =>
            book.id === bookId
              ? touch({
                  ...book,
                  chapters: book.chapters.filter((chapter) => chapter.id !== chapterId),
                })
              : book,
          ),
        }))
      },

      moveChapter: (bookId, chapterId, toIndex) => {
        setState((state) => ({
          books: state.books.map((book) => {
            if (book.id !== bookId) return book
            const from = book.chapters.findIndex((chapter) => chapter.id === chapterId)
            if (from < 0) return book
            const chapters = [...book.chapters]
            const [moved] = chapters.splice(from, 1)
            const target = Math.min(chapters.length, Math.max(0, toIndex))
            chapters.splice(target, 0, moved)
            return touch({ ...book, chapters })
          }),
        }))
      },

      replaceBooks: (books) => setState({ books }),
    }),
    {
      name: STORAGE_NAME,
      version: 1,
      storage: createJSONStorage(() =>
        createFileBackedStorage({ kind: 'library', debounceMs: 800 }),
      ),
      partialize: (state) => ({ books: state.books }),
      merge: (persisted, current) => {
        const saved = isPlainObject(persisted) ? persisted : {}
        if (persisted !== undefined && !isPlainObject(persisted)) {
          console.warn('[Lexicon] 书架数据格式异常，已忽略无法识别的字段。')
        }
        return { ...current, books: sanitizeBooks(saved.books) }
      },
    },
  ),
)

/** Book progress = share of words read, weighted by chapter length. */
export function bookProgress(
  book: Book,
  items: Record<string, { progress: number }>,
): number {
  let total = 0
  let done = 0
  for (const chapter of book.chapters) {
    const weight = Math.max(1, chapter.wordCount)
    total += weight
    done += weight * Math.min(1, Math.max(0, items[chapter.id]?.progress ?? 0))
  }
  return total === 0 ? 0 : done / total
}

export function findChapter(
  books: Book[],
  chapterId: string,
): { book: Book; chapter: Chapter; index: number } | null {
  for (const book of books) {
    const index = book.chapters.findIndex((chapter) => chapter.id === chapterId)
    if (index >= 0) return { book, chapter: book.chapters[index], index }
  }
  return null
}
