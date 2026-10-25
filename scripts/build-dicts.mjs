import { createReadStream, createWriteStream, statSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import os from 'node:os'
import { parse } from 'csv-parse'

const ROOT = path.resolve(import.meta.dirname, '..')
const RAW_DIR = process.env.LEARNWORD_RAW_DIR ?? path.join(os.tmpdir(), 'opencode', 'learnword-data')
const OUT_DIR = path.join(ROOT, 'public', 'data', 'books')

const SOURCES = {
  ecdict: 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv',
  ipaUS: 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_US.txt',
  ipaUK: 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_UK.txt',
}

const BOOKS = [
  {
    id: 'cet4',
    name: 'CET-4',
    nameZh: '大学英语四级',
    description: '四级核心词汇，按当代语料库词频排序，先学最常用的词。',
    level: '大学',
    match: (entry) => entry.tags.includes('cet4'),
  },
  {
    id: 'cet6',
    name: 'CET-6',
    nameZh: '大学英语六级',
    description: '六级进阶词汇，覆盖阅读、听力与写作中的高频表达。',
    level: '大学',
    match: (entry) => entry.tags.includes('cet6'),
  },
  {
    id: 'ky',
    name: '考研',
    nameZh: '考研英语',
    description: '考研英语大纲词汇，按真题语料高频优先排列。',
    level: '进阶',
    match: (entry) => entry.tags.includes('ky'),
  },
  {
    id: 'ielts',
    name: 'IELTS',
    nameZh: '雅思',
    description: '雅思听说读写常见词汇，适合留学备考与学术表达。',
    level: '留学',
    match: (entry) => entry.tags.includes('ielts'),
  },
  {
    id: 'toefl',
    name: 'TOEFL',
    nameZh: '托福',
    description: '托福学术词汇，覆盖校园场景与学科主题。',
    level: '留学',
    match: (entry) => entry.tags.includes('toefl'),
  },
  {
    id: 'oxford3000',
    name: 'Oxford 3000',
    nameZh: '牛津核心三千',
    description: '牛津核心词表，英语世界最值得先掌握的 3000 个词。',
    level: '核心',
    match: (entry) => entry.oxford === '1',
    limit: 3000,
  },
]

function cleanPhonetic(raw) {
  if (!raw) return ''
  let value = raw.trim()
  const first = value.split(',')[0]?.trim() ?? ''
  if (!first) return ''
  if (!first.startsWith('/')) value = `/${first}`
  if (!value.endsWith('/')) value = `${value}/`
  return value.replace(/^\/+/, '/').replace(/\/+$/, '/')
}

function cleanTranslation(raw) {
  if (!raw) return []
  return raw
    .replace(/\r/g, '')
    .split(/\n|\\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => /[\u4e00-\u9fff]/.test(line))
    .filter((line) => !/^\[(网络|人名|地名|医|化|计|经|法|生|物|数|物化|农|机|电|航海|航空|地质|天|气|冶|矿|纺|印|测|心|逻|语|修|建|军|体育)\]/.test(line))
    .filter((line, index, arr) => arr.indexOf(line) === index)
    .slice(0, 8)
}

async function download(url, target) {
  try {
    const info = await stat(target)
    if (info.size > 1000) return
  } catch {
    // ignore
  }
  console.log(`↓ ${url}`)
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Download failed ${response.status}: ${url}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target))
}

async function ensureSources() {
  await mkdir(RAW_DIR, { recursive: true })
  await download(SOURCES.ecdict, path.join(RAW_DIR, 'ecdict.csv'))
  await download(SOURCES.ipaUS, path.join(RAW_DIR, 'en_US.txt'))
  await download(SOURCES.ipaUK, path.join(RAW_DIR, 'en_UK.txt'))
}

async function loadIpa(filename) {
  const map = new Map()
  const rl = createInterface({
    input: createReadStream(path.join(RAW_DIR, filename), 'utf8'),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const word = line.slice(0, tab).trim().toLowerCase()
    const phonetic = cleanPhonetic(line.slice(tab + 1))
    if (word && phonetic && !map.has(word)) map.set(word, phonetic)
  }
  return map
}

async function loadEcdict() {
  const entries = []
  const parser = createReadStream(path.join(RAW_DIR, 'ecdict.csv')).pipe(
    parse({
      columns: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }),
  )

  for await (const row of parser) {
    const word = (row.word ?? '').trim()
    if (!word || !/^[a-zA-Z][a-zA-Z'’\- ]*$/.test(word)) continue
    if (word.length > 40) continue
    const translation = cleanTranslation(row.translation)
    if (translation.length === 0) continue
    const tags = (row.tag ?? '').split(/\s+/).filter(Boolean)
    entries.push({
      word,
      key: word.toLowerCase(),
      phoneticAlt: cleanPhonetic(row.phonetic),
      translation,
      definition: (row.definition ?? '').replace(/\r/g, '').split('\n').filter(Boolean).slice(0, 4),
      pos: (row.pos ?? '').trim(),
      tags,
      collins: Number(row.collins) || 0,
      oxford: (row.oxford ?? '').trim(),
      bnc: Number(row.bnc) || 0,
      frq: Number(row.frq) || 0,
    })
  }
  return entries
}

function rankOf(entry) {
  if (entry.frq > 0) return entry.frq
  if (entry.bnc > 0) return entry.bnc + 1_000_000
  return 9_999_999
}

function buildBook(book, entries, ipaUS, ipaUK) {
  const seen = new Set()
  const words = entries
    .filter(book.match)
    .sort((a, b) => rankOf(a) - rankOf(b) || a.key.localeCompare(b.key))
    .filter((entry) => {
      if (seen.has(entry.key)) return false
      seen.add(entry.key)
      return true
    })
    .slice(0, book.limit ?? undefined)
    .map((entry) => ({
      id: entry.key,
      word: entry.word,
      phoneticUS: ipaUS.get(entry.key) ?? '',
      phoneticUK: ipaUK.get(entry.key) ?? '',
      phoneticAlt: entry.phoneticAlt,
      trans: entry.translation,
      definition: entry.definition,
      pos: entry.pos,
      tags: entry.tags,
      rank: rankOf(entry),
    }))

  return {
    id: book.id,
    name: book.name,
    nameZh: book.nameZh,
    description: book.description,
    level: book.level,
    wordCount: words.length,
    words,
  }
}

async function main() {
  await ensureSources()
  console.log('Reading IPA dictionaries…')
  const ipaUS = await loadIpa('en_US.txt')
  const ipaUK = await loadIpa('en_UK.txt')
  console.log(`IPA entries: US ${ipaUS.size}, UK ${ipaUK.size}`)

  console.log('Reading ECDICT…')
  const entries = await loadEcdict()
  console.log(`ECDICT entries with Chinese translation: ${entries.length}`)

  await mkdir(OUT_DIR, { recursive: true })
  const registry = []

  for (const book of BOOKS) {
    const data = buildBook(book, entries, ipaUS, ipaUK)
    if (data.wordCount === 0) {
      console.warn(`! ${book.id} is empty, skipped`)
      continue
    }
    await writeFile(path.join(OUT_DIR, `${book.id}.json`), JSON.stringify(data))
    registry.push({
      id: data.id,
      name: data.name,
      nameZh: data.nameZh,
      description: data.description,
      level: data.level,
      wordCount: data.wordCount,
      file: `/data/books/${data.id}.json`,
    })
    console.log(`✓ ${book.id}: ${data.wordCount} words`)
  }

  await writeFile(
    path.join(OUT_DIR, 'index.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sources: [
          { name: 'ECDICT', url: 'https://github.com/skywind3000/ECDICT', license: 'MIT' },
          { name: 'ipa-dict', url: 'https://github.com/open-dict-data/ipa-dict', license: 'MIT' },
        ],
        books: registry,
      },
      null,
      2,
    ),
  )

  const totalBytes = registry.reduce((sum, item) => sum + (statSyncSafe(path.join(OUT_DIR, `${item.id}.json`)) ?? 0), 0)
  console.log(`Done. ${registry.length} books, ${(totalBytes / 1024 / 1024).toFixed(2)} MB`)
}

function statSyncSafe(file) {
  try {
    return statSync(file).size
  } catch {
    return 0
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
