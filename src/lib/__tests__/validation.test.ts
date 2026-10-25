import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CardRecord, PersonalWord, ReaderArticle, Settings } from '../../types'
import {
  sanitizeProgress,
  sanitizeDays,
  sanitizeReaderArticles,
  sanitizeSettings,
  sanitizePersonalWords,
  sanitizeReaderProgressItems,
} from '../validation'

const ISO = '2026-01-01T00:00:00.000Z'
const ISO2 = '2026-01-02T03:04:05.000Z'

const baseSettings: Settings = {
  accent: 'us',
  dailyNew: 20,
  dailyReview: 100,
  autoSpeak: false,
  rate: 1,
  theme: 'system',
  showDefinition: true,
}

function cardRecord(): CardRecord {
  return {
    bookId: 'cet4',
    wordId: 'abandon',
    card: {
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
    },
    introducedAt: ISO,
    updatedAt: ISO2,
    reviews: 2,
  }
}

function personalWord(): PersonalWord {
  return {
    id: 'pw-1',
    word: 'abandon',
    phoneticUS: '/əˈbændən/',
    phoneticUK: '/əˈbændən/',
    phoneticAlt: '',
    trans: ['放弃'],
    definition: ['to give up'],
    pos: 'v.',
    tags: ['personal'],
    rank: 1,
    addedAt: ISO,
  }
}

function readerArticle(): ReaderArticle {
  return {
    id: 'art-1',
    title: '标题',
    source: '粘贴',
    text: 'Some English text.',
    createdAt: ISO,
    updatedAt: ISO2,
    lastReadAt: ISO2,
    progress: 0.4,
    wordCount: 3,
  }
}

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

describe('sanitizeProgress', () => {
  it('合法记录原样保留', () => {
    const record = cardRecord()
    expect(sanitizeProgress({ 'cet4:abandon': record })).toEqual({ 'cet4:abandon': record })
  })

  it('undefined / 非对象返回空对象', () => {
    expect(sanitizeProgress(undefined)).toEqual({})
    expect(sanitizeProgress('nope')).toEqual({})
    expect(sanitizeProgress([])).toEqual({})
  })

  it('丢弃缺少 bookId / wordId / card 的条目', () => {
    expect(
      sanitizeProgress({
        a: { wordId: 'w', card: cardRecord().card },
        b: { bookId: 'cet4', card: cardRecord().card },
        c: { bookId: 'cet4', wordId: 'w' },
        d: null,
        e: 42,
      }),
    ).toEqual({})
  })

  it('丢弃 ts-fsrs 扁平卡片（缺少外层 bookId/wordId）', () => {
    expect(sanitizeProgress({ 'cet4:abandon': cardRecord().card })).toEqual({})
  })

  it('state 越界或非整数时丢弃', () => {
    const bad = (state: number) => {
      const record = cardRecord()
      record.card.state = state
      return { 'cet4:abandon': record }
    }
    expect(sanitizeProgress(bad(4))).toEqual({})
    expect(sanitizeProgress(bad(-1))).toEqual({})
    expect(sanitizeProgress(bad(1.5))).toEqual({})
  })

  it('due 无效时丢弃', () => {
    const record = cardRecord()
    record.card.due = 'not-a-date'
    expect(sanitizeProgress({ 'cet4:abandon': record })).toEqual({})
  })

  it('把非规范 key 重写为 bookId:wordId', () => {
    const record = cardRecord()
    const result = sanitizeProgress({ legacyKey: record })
    expect(Object.keys(result)).toEqual(['cet4:abandon'])
    expect(result['cet4:abandon']).toEqual(record)
  })

  it('同一条目重复出现时去重，保留先到的', () => {
    const record = cardRecord()
    const result = sanitizeProgress({ 'cet4:abandon': record, legacy: record })
    expect(Object.keys(result)).toEqual(['cet4:abandon'])
  })

  it('__proto__ 键不会污染 Object.prototype', () => {
    const payload = JSON.parse(
      `{"__proto__":${JSON.stringify({ ...cardRecord(), polluted: true })}}`,
    ) as unknown
    const result = sanitizeProgress(payload)
    expect(Object.keys(result)).toEqual(['cet4:abandon'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('负数的 reviews / 计数字段被夹紧到 0', () => {
    const record = cardRecord()
    record.reviews = -5
    record.card.reps = -2
    const result = sanitizeProgress({ 'cet4:abandon': record })
    expect(result['cet4:abandon'].reviews).toBe(0)
    expect(result['cet4:abandon'].card.reps).toBe(0)
  })
})

describe('sanitizeDays', () => {
  const day = {
    date: '2026-01-01',
    newCount: 5,
    reviewCount: 7,
    again: 1,
    hard: 1,
    good: 3,
    easy: 2,
  }

  it('合法统计原样保留', () => {
    expect(sanitizeDays({ '2026-01-01': day })).toEqual({ '2026-01-01': day })
  })

  it('保留可选的 uniqueReviewCount', () => {
    const withUnique = { ...day, uniqueReviewCount: 6 }
    expect(sanitizeDays({ '2026-01-01': withUnique })).toEqual({ '2026-01-01': withUnique })
  })

  it('undefined / 非对象返回空对象', () => {
    expect(sanitizeDays(undefined)).toEqual({})
    expect(sanitizeDays([day])).toEqual({})
  })

  it('丢弃日期非法或不存在的条目', () => {
    expect(sanitizeDays({ 'not-a-date': {} })).toEqual({})
    expect(sanitizeDays({ '2026-02-30': {} })).toEqual({})
    expect(sanitizeDays({ '2026-01-01': 'nope' })).toEqual({})
  })

  it('从 value.date 修补出规范 key', () => {
    const result = sanitizeDays({ legacy: { ...day } })
    expect(Object.keys(result)).toEqual(['2026-01-01'])
  })

  it('同一天重复时只保留一条', () => {
    const result = sanitizeDays({ '2026-01-01': day, other: { ...day } })
    expect(Object.keys(result)).toEqual(['2026-01-01'])
  })

  it('负数计数被夹紧到 0，缺失计数补 0', () => {
    const result = sanitizeDays({
      '2026-01-01': { date: '2026-01-01', newCount: -3, reviewCount: 2 },
    })
    expect(result['2026-01-01']).toEqual({
      date: '2026-01-01',
      newCount: 0,
      reviewCount: 2,
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
    })
  })
})

describe('sanitizeReaderArticles', () => {
  it('合法文章原样保留', () => {
    const article = readerArticle()
    expect(sanitizeReaderArticles([article])).toEqual([article])
  })

  it('undefined / 非数组返回空数组', () => {
    expect(sanitizeReaderArticles(undefined)).toEqual([])
    expect(sanitizeReaderArticles({})).toEqual([])
  })

  it('丢弃缺 id / text / createdAt / updatedAt 的条目', () => {
    const base = readerArticle()
    expect(sanitizeReaderArticles([{ ...base, id: '' }])).toEqual([])
    expect(sanitizeReaderArticles([{ ...base, text: '   ' }])).toEqual([])
    expect(sanitizeReaderArticles([{ ...base, createdAt: 'bad' }])).toEqual([])
    expect(sanitizeReaderArticles([{ ...base, updatedAt: undefined }])).toEqual([])
    expect(sanitizeReaderArticles([null, 3, 'x'])).toEqual([])
  })

  it('缺 title / source 时补默认值，progress 夹紧到 [0,1]', () => {
    const article = readerArticle() as unknown as Record<string, unknown>
    delete article.title
    delete article.source
    const result = sanitizeReaderArticles([{ ...article, progress: 1.7, wordCount: -2 }])
    expect(result).toHaveLength(1)
    expect(result[0].title.length).toBeGreaterThan(0)
    expect(result[0].source.length).toBeGreaterThan(0)
    expect(result[0].progress).toBe(1)
    expect(result[0].wordCount).toBe(0)
    expect(sanitizeReaderArticles([{ ...article, progress: -0.5 }])[0].progress).toBe(0)
  })

  it('重复 id 去重，保留先到的', () => {
    const first = readerArticle()
    const second = { ...readerArticle(), title: '第二条' }
    const result = sanitizeReaderArticles([first, second])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe(first.title)
  })
})

describe('sanitizeSettings', () => {
  it('合法设置原样保留', () => {
    expect(sanitizeSettings({ ...baseSettings }, baseSettings)).toEqual(baseSettings)
  })

  it('undefined 时返回 fallback 副本', () => {
    const result = sanitizeSettings(undefined, baseSettings)
    expect(result).toEqual(baseSettings)
    expect(result).not.toBe(baseSettings)
  })

  it('数值越界被夹紧', () => {
    expect(sanitizeSettings({ ...baseSettings, dailyNew: 999 }, baseSettings).dailyNew).toBe(60)
    expect(sanitizeSettings({ ...baseSettings, dailyNew: 1 }, baseSettings).dailyNew).toBe(5)
    expect(sanitizeSettings({ ...baseSettings, dailyReview: 500 }, baseSettings).dailyReview).toBe(200)
    expect(sanitizeSettings({ ...baseSettings, dailyReview: 5 }, baseSettings).dailyReview).toBe(20)
    expect(sanitizeSettings({ ...baseSettings, dailyReview: 0 }, baseSettings).dailyReview).toBe(0)
    expect(sanitizeSettings({ ...baseSettings, rate: 5 }, baseSettings).rate).toBe(1.3)
    expect(sanitizeSettings({ ...baseSettings, rate: 0.1 }, baseSettings).rate).toBe(0.7)
  })

  it('非法枚举值回落到 fallback', () => {
    const result = sanitizeSettings(
      { ...baseSettings, accent: 'au', theme: 'sepia' },
      baseSettings,
    )
    expect(result.accent).toBe(baseSettings.accent)
    expect(result.theme).toBe(baseSettings.theme)
  })

  it('类型错误的字段回落到 fallback', () => {
    const result = sanitizeSettings(
      { accent: 'uk', dailyNew: 'many', autoSpeak: 'yes', rate: null, theme: 'dark', showDefinition: 1 },
      baseSettings,
    )
    expect(result.dailyNew).toBe(baseSettings.dailyNew)
    expect(result.autoSpeak).toBe(baseSettings.autoSpeak)
    expect(result.rate).toBe(baseSettings.rate)
    expect(result.showDefinition).toBe(baseSettings.showDefinition)
    expect(result.accent).toBe('uk')
    expect(result.theme).toBe('dark')
  })

  it('非对象输入返回 fallback', () => {
    expect(sanitizeSettings([], baseSettings)).toEqual(baseSettings)
    expect(sanitizeSettings('x', baseSettings)).toEqual(baseSettings)
  })
})

describe('sanitizePersonalWords', () => {
  it('合法词条原样保留', () => {
    const word = personalWord()
    expect(sanitizePersonalWords([word])).toEqual([word])
  })

  it('undefined / 非数组返回空数组', () => {
    expect(sanitizePersonalWords(undefined)).toEqual([])
    expect(sanitizePersonalWords({})).toEqual([])
  })

  it('丢弃缺 id / word / trans 的条目', () => {
    const base = personalWord()
    expect(sanitizePersonalWords([{ ...base, id: '' }])).toEqual([])
    expect(sanitizePersonalWords([{ ...base, word: '  ' }])).toEqual([])
    expect(sanitizePersonalWords([{ ...base, trans: [] }])).toEqual([])
    expect(sanitizePersonalWords([{ ...base, trans: [1, 2] }])).toEqual([])
    expect(sanitizePersonalWords(['x', null])).toEqual([])
  })

  it('重复 id 去重，保留先到的', () => {
    const first = personalWord()
    const second = { ...personalWord(), word: '另一个' }
    const result = sanitizePersonalWords([first, second])
    expect(result).toHaveLength(1)
    expect(result[0].word).toBe(first.word)
  })

  it('rank 为负数或小数时修正为非负整数', () => {
    expect(sanitizePersonalWords([{ ...personalWord(), rank: -3 }])[0].rank).toBe(0)
    expect(sanitizePersonalWords([{ ...personalWord(), rank: 2.7 }])[0].rank).toBe(3)
    expect(sanitizePersonalWords([{ ...personalWord(), rank: undefined }])[0].rank).toBe(0)
  })

  it('tags 为空时补 personal，addedAt 缺失时补当前时间', () => {
    const result = sanitizePersonalWords([{ ...personalWord(), tags: [], addedAt: undefined }])
    expect(result[0].tags).toEqual(['personal'])
    expect(Number.isNaN(Date.parse(result[0].addedAt))).toBe(false)
  })
})

describe('阅读锚点', () => {
  it('合法的 anchor 原样保留', () => {
    expect(
      sanitizeReaderProgressItems({
        'art-1': { progress: 0.5, anchor: { paragraph: 3, token: 7 } },
      }),
    ).toEqual({ 'art-1': { progress: 0.5, anchor: { paragraph: 3, token: 7 } } })
  })

  it('标题锚点（paragraph = -1）允许', () => {
    expect(
      sanitizeReaderProgressItems({
        'art-1': { progress: 0, anchor: { paragraph: -1, token: 2 } },
      }),
    ).toEqual({ 'art-1': { progress: 0, anchor: { paragraph: -1, token: 2 } } })
  })

  it('anchor 非法时只丢 anchor，保留进度', () => {
    for (const anchor of [
      { paragraph: -2, token: 0 },
      { paragraph: 1.5, token: 0 },
      { paragraph: 0, token: -1 },
      { paragraph: '1', token: 0 },
      { token: 0 },
      'nope',
    ]) {
      expect(
        sanitizeReaderProgressItems({ 'art-1': { progress: 0.4, anchor } }),
      ).toEqual({ 'art-1': { progress: 0.4 } })
    }
  })

  it('文章里的 anchor 也会被解析出来', () => {
    const [article] = sanitizeReaderArticles([
      {
        id: 'a1',
        title: 'T',
        text: 'hello world',
        createdAt: ISO,
        updatedAt: ISO,
        progress: 0.3,
        wordCount: 2,
        anchor: { paragraph: 2, token: 4 },
      },
    ])
    expect(article?.anchor).toEqual({ paragraph: 2, token: 4 })
  })
})

describe('sanitizeReaderProgressItems', () => {
  it('合法条目原样保留', () => {
    expect(
      sanitizeReaderProgressItems({ 'art-1': { progress: 0.5, lastReadAt: ISO2 } }),
    ).toEqual({ 'art-1': { progress: 0.5, lastReadAt: ISO2 } })
  })

  it('undefined / 非对象返回空对象', () => {
    expect(sanitizeReaderProgressItems(undefined)).toEqual({})
    expect(sanitizeReaderProgressItems([])).toEqual({})
  })

  it('progress 缺失或非数字时丢弃整条', () => {
    expect(sanitizeReaderProgressItems({ a: {}, b: { progress: 'x' }, c: null })).toEqual({})
  })

  it('progress 越界被夹紧', () => {
    expect(sanitizeReaderProgressItems({ a: { progress: 3 } })).toEqual({ a: { progress: 1 } })
    expect(sanitizeReaderProgressItems({ a: { progress: -1 } })).toEqual({ a: { progress: 0 } })
  })

  it('lastReadAt 非法时丢弃该字段但保留条目', () => {
    expect(sanitizeReaderProgressItems({ a: { progress: 0.2, lastReadAt: 'bad' } })).toEqual({
      a: { progress: 0.2 },
    })
  })

  it('__proto__ / constructor / prototype 键被丢弃且不污染原型', () => {
    const payload = JSON.parse(
      '{"__proto__":{"progress":1,"polluted":true},"constructor":{"progress":1},"prototype":{"progress":1},"ok":{"progress":0.5}}',
    ) as unknown
    const result = sanitizeReaderProgressItems(payload)
    expect(Object.keys(result)).toEqual(['ok'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
