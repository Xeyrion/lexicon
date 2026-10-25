import type { ReaderPhraseTuple, ReaderWordTuple, WordEntry } from '../types'

const WORD_PATTERN = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g
const WORDS_PER_MINUTE = 220

export const MAX_ARTICLE_CHARS = 200_000

export interface ReaderToken {
  type: 'word' | 'text'
  text: string
  lookup: string
}

export function normalizeArticleText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u200b/g, '')
    .replace(/\t/g, '  ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function defaultArticleTitle(now = new Date()): string {
  return `未命名文章 · ${new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
  }).format(now)}`
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/<[^>]+>/g, '')
}

export function prepareArticleBody(
  raw: string,
  options: { markdown?: boolean } = {},
): string {
  const text = normalizeArticleText(raw)
  return options.markdown ? normalizeArticleText(stripMarkdown(text)) : text
}

export function countWords(text: string): number {
  return text.match(WORD_PATTERN)?.length ?? 0
}

export function readingMinutes(words: number): number {
  if (words <= 0) return 0
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}

export function splitParagraphs(text: string): string[] {
  return normalizeArticleText(text)
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

export function normalizeLookup(raw: string): string {
  return raw.trim().toLowerCase().replace(/[’‘]/g, "'")
}

export function normalizePhrase(raw: string): string {
  return raw
    .replace(/[’‘]/g, "'")
    .replace(/[^A-Za-z'\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function lookupCandidates(raw: string): string[] {
  const base = normalizeLookup(raw)
  if (!base) return []

  const candidates = new Set<string>([base])
  const possessive = base.replace(/'s$/, '').replace(/s'$/, 's')
  if (possessive) candidates.add(possessive)

  if (base.includes("'")) {
    const [before, after] = base.split("'")
    if (before) candidates.add(before)
    if (after && after.length > 1) candidates.add(after)
  }

  if (base.includes('-')) {
    for (const part of base.split('-')) {
      if (part) candidates.add(part)
    }
  }

  for (const candidate of [...candidates]) {
    if (candidate.length < 4) continue
    if (candidate.endsWith('ies')) candidates.add(`${candidate.slice(0, -3)}y`)
    if (candidate.endsWith('es')) candidates.add(candidate.slice(0, -2))
    if (candidate.endsWith('s') && !candidate.endsWith('ss')) {
      candidates.add(candidate.slice(0, -1))
    }
    if (candidate.endsWith('ed')) {
      candidates.add(candidate.slice(0, -2))
      candidates.add(candidate.slice(0, -1))
    }
    if (candidate.endsWith('ing')) {
      const stem = candidate.slice(0, -3)
      candidates.add(stem)
      candidates.add(`${stem}e`)
      if (stem.length > 2 && stem.at(-1) === stem.at(-2)) {
        candidates.add(stem.slice(0, -1))
      }
    }
    if (candidate.endsWith('er')) {
      const stem = candidate.slice(0, -2)
      candidates.add(stem)
      candidates.add(`${stem}e`)
    }
    if (candidate.endsWith('est')) {
      const stem = candidate.slice(0, -3)
      candidates.add(stem)
      candidates.add(`${stem}e`)
    }
  }

  return [...candidates].filter((candidate) => candidate.length > 0)
}

export function tokenizeParagraph(text: string): ReaderToken[] {
  const tokens: ReaderToken[] = []
  let cursor = 0

  for (const match of text.matchAll(WORD_PATTERN)) {
    const index = match.index ?? 0
    if (index > cursor) {
      tokens.push({ type: 'text', text: text.slice(cursor, index), lookup: '' })
    }
    tokens.push({ type: 'word', text: match[0], lookup: normalizeLookup(match[0]) })
    cursor = index + match[0].length
  }

  if (cursor < text.length) {
    tokens.push({ type: 'text', text: text.slice(cursor), lookup: '' })
  }

  return tokens
}

export function isPhraseSelection(text: string): boolean {
  const phrase = normalizePhrase(text)
  if (!phrase || phrase.length > 100) return false
  const words = phrase.match(WORD_PATTERN) ?? []
  return words.length >= 2 && words.length <= 6
}

export function entryFromWordTuple(tuple: ReaderWordTuple): WordEntry {
  const [word, id, phoneticUS, phoneticUK, phoneticAlt, trans, pos, tags, rank] = tuple
  return {
    id,
    word,
    phoneticUS,
    phoneticUK,
    phoneticAlt,
    trans,
    definition: [],
    pos,
    tags,
    rank,
  }
}

export function entryFromPhraseTuple(tuple: ReaderPhraseTuple): WordEntry {
  const [word, id, trans, pos, tags, rank] = tuple
  return {
    id,
    word,
    phoneticUS: '',
    phoneticUK: '',
    phoneticAlt: '',
    trans,
    definition: [],
    pos,
    tags,
    rank,
  }
}

export function prefersAlias(direct: WordEntry | undefined, alias: WordEntry | undefined): boolean {
  if (!alias) return false
  if (!direct) return true
  if (direct.word === direct.word.toUpperCase() && direct.word.length > 1) return true
  if (direct.trans.some((line) => /过去式|过去分词|现在分词|第三人称|复数|pl\./i.test(line))) {
    return true
  }
  return false
}
