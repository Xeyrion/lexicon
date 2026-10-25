import type { PersonalWord } from '../types'

export interface PersonalInput {
  word: string
  trans: string[]
  phoneticUS?: string
  phoneticUK?: string
  phoneticAlt?: string
}

export function normalizePhonetic(raw?: string): string {
  const value = (raw ?? '').trim()
  if (!value) return ''
  const first = value.split(',')[0]?.trim() ?? ''
  if (!first) return ''
  if (first.startsWith('/') && first.endsWith('/')) return first
  return `/${first.replace(/^\/+|\/+$/g, '')}/`
}

export function createPersonalWord(input: PersonalInput): PersonalWord | null {
  const word = input.word.trim().replace(/\s+/g, ' ')
  if (!word) return null
  const trans = input.trans.map((line) => line.trim()).filter(Boolean)
  if (trans.length === 0) return null
  return {
    id: word.toLowerCase(),
    word,
    phoneticUS: normalizePhonetic(input.phoneticUS),
    phoneticUK: normalizePhonetic(input.phoneticUK),
    phoneticAlt: normalizePhonetic(input.phoneticAlt),
    trans,
    definition: [],
    pos: '',
    tags: ['personal'],
    rank: 0,
    addedAt: new Date().toISOString(),
  }
}

function escapeCsv(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function personalWordsToCsv(words: PersonalWord[]): string {
  const rows = [
    ['word', 'meaning', 'phoneticUS', 'phoneticUK'],
    ...words.map((item) => [
      item.word,
      item.trans.join('；'),
      item.phoneticUS,
      item.phoneticUK,
    ]),
  ]
  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n') + '\n'
}

export const PERSONAL_TEMPLATE = `word,meaning,phoneticUS,phoneticUK
serendipity,意外发现美好事物的运气,/ˌserənˈdɪpəti/,/ˌserənˈdɪpəti/
ephemeral,短暂的；转瞬即逝的,/ɪˈfemərəl/,/ɪˈfemərəl/
`
