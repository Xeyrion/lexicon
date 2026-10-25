import type {
  CardRecord,
  DayStat,
  PersonalWord,
  ReaderArticle,
  ReaderSettings,
  Settings,
} from '../types'
import {
  isPlainObject,
  sanitizeBookId,
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

  return { ok: true, value: { study, reader } }
}

export function readerProgressItems(
  articles: ReaderArticle[],
): Record<string, { progress: number; lastReadAt?: string }> {
  const items: Record<string, { progress: number; lastReadAt?: string }> = {}
  for (const article of articles) {
    items[article.id] = {
      progress: Math.min(1, Math.max(0, article.progress)),
      ...(article.lastReadAt ? { lastReadAt: article.lastReadAt } : {}),
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

export function buildReaderProgressPayload(reader: ParsedReaderSnapshot): unknown {
  return {
    state: { items: readerProgressItems(reader.articles) },
    version: 1,
  }
}
