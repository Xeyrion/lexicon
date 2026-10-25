import type { BookMeta, BookRegistry, PersonalWord, WordBook } from '../types'

const BASE = import.meta.env.BASE_URL

let registryPromise: Promise<BookRegistry> | null = null
const bookCache = new Map<string, Promise<WordBook>>()

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`加载失败（${response.status}）`)
  }
  return (await response.json()) as T
}

export function getRegistry(): Promise<BookRegistry> {
  if (!registryPromise) {
    registryPromise = fetchJson<BookRegistry>(`${BASE}data/books/index.json`).catch((error) => {
      registryPromise = null
      throw error
    })
  }
  return registryPromise
}

export function getBook(id: string): Promise<WordBook> {
  const cached = bookCache.get(id)
  if (cached) return cached
  const promise = fetchJson<WordBook>(`${BASE}data/books/${id}.json`).catch((error) => {
    bookCache.delete(id)
    throw error
  })
  bookCache.set(id, promise)
  return promise
}

export const PERSONAL_META: BookMeta = {
  id: 'personal',
  name: 'Personal',
  nameZh: '我的词库',
  description: '自己收藏与导入的单词，随时开始学。',
  level: '自定义',
  wordCount: 0,
  custom: true,
}

export function personalMeta(words: PersonalWord[]): BookMeta {
  return { ...PERSONAL_META, wordCount: words.length }
}

export function makePersonalBook(words: PersonalWord[]): WordBook {
  return {
    ...personalMeta(words),
    words,
    custom: true,
  }
}
