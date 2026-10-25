import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReaderArticle, ReaderSettings, Settings } from '../../types'
import type {
  ParsedReaderSnapshot,
  ParsedSnapshot,
  ParsedStudySnapshot,
  SnapshotParseResult,
} from '../snapshotImport'
import {
  parseSnapshot,
  buildStudyPayload,
  buildReaderPayload,
  buildReaderProgressPayload,
} from '../snapshotImport'

const ISO = '2026-01-01T00:00:00.000Z'
const ISO2 = '2026-01-02T03:04:05.000Z'

const settings: Settings = {
  accent: 'us',
  dailyNew: 20,
  dailyReview: 100,
  autoSpeak: false,
  rate: 1,
  theme: 'system',
  showDefinition: true,
}

const readerSettings: ReaderSettings = { fontSize: 18 }

const defaults = {
  settings,
  currentBookId: 'cet4',
  readerSettings,
}

const card = {
  due: ISO,
  stability: 1.5,
  difficulty: 5,
  elapsed_days: 0,
  scheduled_days: 3,
  learning_steps: 0,
  reps: 2,
  lapses: 0,
  state: 2,
  last_review: ISO2,
}

const article: ReaderArticle = {
  id: 'art-1',
  title: '标题',
  source: '粘贴',
  text: 'Some English text.',
  createdAt: ISO,
  updatedAt: ISO2,
  progress: 0.5,
  wordCount: 3,
}

function studyBackup(): Record<string, unknown> {
  return {
    app: 'lexicon',
    version: 2,
    exportedAt: ISO2,
    settings: { ...settings },
    currentBookId: 'cet6',
    progress: {
      'cet6:abandon': {
        bookId: 'cet6',
        wordId: 'abandon',
        card: { ...card },
        introducedAt: ISO,
        updatedAt: ISO2,
        reviews: 2,
      },
    },
    days: {
      '2026-01-01': {
        date: '2026-01-01',
        newCount: 5,
        reviewCount: 7,
        again: 1,
        hard: 1,
        good: 3,
        easy: 2,
      },
    },
    personalWords: [
      {
        id: 'pw-1',
        word: 'abandon',
        phoneticUS: '',
        phoneticUK: '',
        phoneticAlt: '',
        trans: ['放弃'],
        definition: [],
        pos: 'v.',
        tags: ['personal'],
        rank: 1,
        addedAt: ISO,
      },
    ],
  }
}

function ok(result: SnapshotParseResult): ParsedSnapshot {
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`)
  return result.value
}

function err(result: SnapshotParseResult): string {
  if (result.ok) throw new Error('expected failure, got ok')
  return result.error
}

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

describe('parseSnapshot', () => {
  it('解析正常的学习库备份', () => {
    const value = ok(parseSnapshot(studyBackup(), defaults))
    expect(Object.keys(value.study.progress)).toEqual(['cet6:abandon'])
    expect(Object.keys(value.study.days)).toEqual(['2026-01-01'])
    expect(value.study.personalWords).toHaveLength(1)
    expect(value.study.currentBookId).toBe('cet6')
    expect(value.study.settings).toEqual(settings)
    expect(value.reader).toBeUndefined()
  })

  it('接受旧版 app 名 learnword', () => {
    const value = ok(parseSnapshot({ ...studyBackup(), app: 'learnword' }, defaults))
    expect(value.study.progress).toHaveProperty('cet6:abandon')
  })

  it('app 不是 lexicon/learnword 时拒绝', () => {
    expect(err(parseSnapshot({ ...studyBackup(), app: 'other' }, defaults))).toBeTruthy()
    expect(err(parseSnapshot({ ...studyBackup(), app: undefined }, defaults))).toBeTruthy()
  })

  it('非对象输入被拒绝', () => {
    expect(err(parseSnapshot(null, defaults))).toBeTruthy()
    expect(err(parseSnapshot('{}', defaults))).toBeTruthy()
    expect(err(parseSnapshot([], defaults))).toBeTruthy()
  })

  it('缺 progress 时拒绝', () => {
    const backup = studyBackup()
    delete backup.progress
    expect(err(parseSnapshot(backup, defaults))).toBeTruthy()
  })

  it('缺 days 时拒绝', () => {
    const backup = studyBackup()
    delete backup.days
    expect(err(parseSnapshot(backup, defaults))).toBeTruthy()
  })

  it('缺 personalWords 或类型不对时拒绝', () => {
    const missing = studyBackup()
    delete missing.personalWords
    expect(err(parseSnapshot(missing, defaults))).toBeTruthy()

    const wrongType = { ...studyBackup(), personalWords: {} }
    expect(err(parseSnapshot(wrongType, defaults))).toBeTruthy()
  })

  it('缺少 currentBookId 时回落到 defaults', () => {
    const backup = studyBackup()
    delete backup.currentBookId
    expect(ok(parseSnapshot(backup, defaults)).study.currentBookId).toBe('cet4')
  })

  it('缺少 settings 时回落到 defaults', () => {
    const backup = studyBackup()
    delete backup.settings
    expect(ok(parseSnapshot(backup, defaults)).study.settings).toEqual(settings)
  })

  it('只有学习库时 reader 为 undefined', () => {
    expect(ok(parseSnapshot(studyBackup(), defaults)).reader).toBeUndefined()
  })

  it('解析阅读库备份', () => {
    const backup = { ...studyBackup(), reader: { articles: [article], settings: readerSettings } }
    const value = ok(parseSnapshot(backup, defaults))
    expect(value.reader).toBeDefined()
    expect(value.reader?.articles).toEqual([article])
    expect(value.reader?.settings).toEqual(readerSettings)
  })

  it('阅读库所有文章都无法识别时整份拒绝', () => {
    const backup = {
      ...studyBackup(),
      reader: { articles: [{ foo: 1 }, { id: '', text: '' }, null], settings: readerSettings },
    }
    expect(err(parseSnapshot(backup, defaults))).toBeTruthy()
  })

  it('阅读库文章数组为空时允许通过', () => {
    const backup = { ...studyBackup(), reader: { articles: [], settings: readerSettings } }
    const value = ok(parseSnapshot(backup, defaults))
    expect(value.reader?.articles).toEqual([])
  })

  it('reader 结构不完整时拒绝', () => {
    expect(err(parseSnapshot({ ...studyBackup(), reader: {} }, defaults))).toBeTruthy()
    expect(err(parseSnapshot({ ...studyBackup(), reader: 'x' }, defaults))).toBeTruthy()
    expect(err(parseSnapshot({ ...studyBackup(), reader: { articles: {} } }, defaults))).toBeTruthy()
  })

  it('阅读设置无效时回落到 defaults 的 readerSettings', () => {
    const backup = { ...studyBackup(), reader: { articles: [article], settings: {} } }
    expect(ok(parseSnapshot(backup, defaults)).reader?.settings).toEqual(readerSettings)
  })
})

describe('buildStudyPayload', () => {
  it('返回 { state, version: 1 }', () => {
    const study = ok(parseSnapshot(studyBackup(), defaults)).study as ParsedStudySnapshot
    expect(buildStudyPayload(study)).toEqual({ state: study, version: 1 })
  })
})

describe('buildReaderPayload', () => {
  it('返回 { state: { articles, settings }, version: 1 }', () => {
    const reader: ParsedReaderSnapshot = { articles: [article], settings: readerSettings }
    expect(buildReaderPayload(reader)).toEqual({
      state: { articles: [article], settings: readerSettings },
      version: 1,
    })
  })
})

describe('buildReaderProgressPayload', () => {
  it('从文章生成进度条目，形状为 { state: { items }, version: 1 }', () => {
    const reader: ParsedReaderSnapshot = { articles: [article], settings: readerSettings }
    expect(buildReaderProgressPayload(reader)).toEqual({
      state: { items: { 'art-1': { progress: 0.5 } } },
      version: 1,
    })
  })

  it('保留 lastReadAt 并把 progress 夹紧到 [0,1]', () => {
    const reader: ParsedReaderSnapshot = {
      articles: [
        { ...article, id: 'a', progress: 2, lastReadAt: ISO2 },
        { ...article, id: 'b', progress: -1 },
      ],
      settings: readerSettings,
    }
    expect(buildReaderProgressPayload(reader)).toEqual({
      state: {
        items: {
          a: { progress: 1, lastReadAt: ISO2 },
          b: { progress: 0 },
        },
      },
      version: 1,
    })
  })
})
