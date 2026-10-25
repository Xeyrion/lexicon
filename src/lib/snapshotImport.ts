import type {
  Book,
  CardRecord,
  DayStat,
  PersonalWord,
  ReaderAnchor,
  ReaderArticle,
  ReaderSettings,
  Settings,
  Story,
  StoryMeta,
  StorySave,
} from '../types'
import {
  isPlainObject,
  sanitizeBookId,
  sanitizeBooks,
  sanitizeStories,
  sanitizeDays,
  sanitizePersonalWords,
  sanitizeProgress,
  sanitizeReaderArticles,
  sanitizeReaderSettings,
  sanitizeSettings,
} from './validation'

export interface ParsedStudySnapshot {
  settings: Settings
  currentBookId: string
  progress: Record<string, CardRecord>
  days: Record<string, DayStat>
  personalWords: PersonalWord[]
}

export interface ParsedReaderSnapshot {
  articles: ReaderArticle[]
  settings: ReaderSettings
}

export interface ParsedSnapshot {
  study: ParsedStudySnapshot
  reader?: ParsedReaderSnapshot
  library?: { books: Book[] }
  stories?: {
    stories: Story[]
    saves?: Record<string, StorySave>
    meta?: Record<string, StoryMeta>
  }
}

export interface SnapshotDefaults {
  settings: Settings
  currentBookId: string
  readerSettings: ReaderSettings
}

export type SnapshotParseResult =
  | { ok: true; value: ParsedSnapshot }
  | { ok: false; error: string }

export function parseSnapshot(
  data: unknown,
  defaults: SnapshotDefaults,
): SnapshotParseResult {
  if (!isPlainObject(data)) return { ok: false, error: '文件格式不正确' }
  if (data.app !== 'lexicon' && data.app !== 'learnword') {
    return { ok: false, error: '这不是词间导出的备份文件' }
  }
  if (
    !isPlainObject(data.progress) ||
    !isPlainObject(data.days) ||
    !Array.isArray(data.personalWords)
  ) {
    return { ok: false, error: '备份内容不完整' }
  }

  const study: ParsedStudySnapshot = {
    settings: sanitizeSettings(data.settings, defaults.settings),
    currentBookId: sanitizeBookId(data.currentBookId) ?? defaults.currentBookId,
    progress: sanitizeProgress(data.progress),
    days: sanitizeDays(data.days),
    personalWords: sanitizePersonalWords(data.personalWords),
  }

  let reader: ParsedReaderSnapshot | undefined
  if (data.reader !== undefined) {
    if (!isPlainObject(data.reader) || !Array.isArray(data.reader.articles)) {
      return { ok: false, error: '备份中的阅读库内容不完整。' }
    }
    const articles = sanitizeReaderArticles(data.reader.articles)
    // 所有文章都无法识别时，宁可拒绝导入，也不要用空阅读库覆盖现有数据。
    if (data.reader.articles.length > 0 && articles.length === 0) {
      return { ok: false, error: '备份中的阅读库内容不完整。' }
    }
    reader = {
      articles,
      settings: sanitizeReaderSettings(data.reader.settings, defaults.readerSettings),
    }
  }

  let library: { books: Book[] } | undefined
  if (data.library !== undefined) {
    if (!isPlainObject(data.library) || !Array.isArray(data.library.books)) {
      return { ok: false, error: '备份中的书架内容不完整。' }
    }
    const books = sanitizeBooks(data.library.books)
    // Same rule as the reader library: refuse rather than replace with nothing.
    if (data.library.books.length > 0 && books.length === 0) {
      return { ok: false, error: '备份中的书架内容不完整。' }
    }
    library = { books }
  }

  let stories: ParsedSnapshot['stories']
  if (data.stories !== undefined) {
    if (!isPlainObject(data.stories) || !Array.isArray(data.stories.stories)) {
      return { ok: false, error: '备份中的故事内容不完整。' }
    }
    const parsedStories = sanitizeStories(data.stories.stories)
    if (data.stories.stories.length > 0 && parsedStories.length === 0) {
      return { ok: false, error: '备份中的故事内容不完整。' }
    }
    stories = {
      stories: parsedStories,
      ...(isPlainObject(data.stories.saves)
        ? { saves: data.stories.saves as ParsedSnapshot['stories'] extends { saves?: infer S } ? S : never }
        : {}),
      ...(isPlainObject(data.stories.meta)
        ? { meta: data.stories.meta as ParsedSnapshot['stories'] extends { meta?: infer M } ? M : never }
        : {}),
    }
  }

  return { ok: true, value: { study, reader, library, stories } }
}

export function readerProgressItems(
  articles: ReaderArticle[],
): Record<string, { progress: number; lastReadAt?: string; anchor?: ReaderAnchor }> {
  const items: Record<string, { progress: number; lastReadAt?: string; anchor?: ReaderAnchor }> = {}
  for (const article of articles) {
    items[article.id] = {
      progress: Math.min(1, Math.max(0, article.progress)),
      ...(article.lastReadAt ? { lastReadAt: article.lastReadAt } : {}),
      ...(article.anchor ? { anchor: article.anchor } : {}),
    }
  }
  return items
}

export function buildStudyPayload(study: ParsedStudySnapshot): unknown {
  return { state: study, version: 1 }
}

export function buildReaderPayload(reader: ParsedReaderSnapshot): unknown {
  return {
    state: {
      articles: reader.articles,
      settings: reader.settings,
    },
    version: 1,
  }
}

export function buildStoriesPayload(stories: {
  stories: Story[]
  saves?: Record<string, StorySave>
  meta?: Record<string, StoryMeta>
}): unknown {
  return {
    state: {
      stories: stories.stories,
      ...(stories.saves ? { saves: stories.saves } : {}),
      ...(stories.meta ? { meta: stories.meta } : {}),
    },
    version: 1,
  }
}

export function buildLibraryPayload(library: { books: Book[] }): unknown {
  return { state: { books: library.books }, version: 1 }
}

export function buildReaderProgressPayload(reader: ParsedReaderSnapshot): unknown {
  return {
    state: { items: readerProgressItems(reader.articles) },
    version: 1,
  }
}
