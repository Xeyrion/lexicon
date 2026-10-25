import type { PersonalWord } from '../types'
import { createPersonalWord } from './personal'

interface ImportResult {
  words: PersonalWord[]
  skipped: number
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((item) => item.some((cell) => cell.trim()))
}

function splitLines(value: string): string[] {
  return value
    .split(/\n|\||[;；]/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key]
    }
  }
  return undefined
}

function fromRecord(record: Record<string, unknown>): PersonalWord | null {
  const rawWord = pick(record, ['word', 'name', '单词', 'Word', 'Name'])
  if (rawWord === undefined) return null
  const rawTrans = pick(record, [
    'trans',
    'translation',
    'meaning',
    'meanings',
    '释义',
    '中文',
    'Translation',
    'Meaning',
  ])
  const trans = Array.isArray(rawTrans)
    ? rawTrans.map((item) => String(item))
    : splitLines(String(rawTrans ?? ''))
  return createPersonalWord({
    word: String(rawWord),
    trans,
    phoneticUS: String(pick(record, ['phoneticUS', 'phoneticus', 'usphone', '美音', 'PhoneticUS']) ?? ''),
    phoneticUK: String(pick(record, ['phoneticUK', 'phoneticuk', 'ukphone', '英音', 'PhoneticUK']) ?? ''),
    phoneticAlt: String(
      pick(record, ['phonetic', 'phoneticAlt', '音标', 'Phonetic', 'phone']) ?? '',
    ),
  })
}

export function parseImport(text: string, filename: string): ImportResult {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (!trimmed) return { words: [], skipped: 0 }

  const records: Record<string, unknown>[] = []

  if (filename.toLowerCase().endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as unknown
    const list = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { words?: unknown }).words)
        ? ((parsed as { words: unknown[] }).words)
        : []
    for (const item of list) {
      if (item && typeof item === 'object') records.push(item as Record<string, unknown>)
    }
  } else {
    const rows = parseCsv(trimmed)
    if (rows.length === 0) return { words: [], skipped: 0 }
    const header = rows[0].map((cell) => cell.trim().toLowerCase())
    const known = new Set([
      'word',
      'name',
      '单词',
      'trans',
      'translation',
      'meaning',
      'meanings',
      '释义',
      '中文',
      'phonetic',
      'phoneticus',
      'phoneticuk',
      'usphone',
      'ukphone',
      '音标',
      '美音',
      '英音',
    ])
    const hasHeader = header.some((cell) => known.has(cell))
    const dataRows = hasHeader ? rows.slice(1) : rows
    for (const row of dataRows) {
      const record: Record<string, unknown> = {}
      if (hasHeader) {
        header.forEach((key, index) => {
          record[key] = row[index]?.trim() ?? ''
        })
      } else {
        record.word = row[0]?.trim() ?? ''
        record.meaning = row[1]?.trim() ?? ''
        record.phonetic = row[2]?.trim() ?? ''
      }
      records.push(record)
    }
  }

  const words: PersonalWord[] = []
  let skipped = 0
  const seen = new Set<string>()
  for (const record of records) {
    const word = fromRecord(record)
    if (!word || seen.has(word.id)) {
      skipped += 1
      continue
    }
    seen.add(word.id)
    words.push(word)
  }

  return { words, skipped }
}
