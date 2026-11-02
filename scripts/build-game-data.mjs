/**
 * Build the game data (xlsx -> JSON) for the vendored remake engine.
 *
 * The upstream project builds these files with `v-transform` + bun. We only
 * need five simple sheets, so this script parses them directly with fflate and
 * applies the same transformers as `packages/data/src/*.types.ts`.
 *
 * Run: npm run game:data
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, strFromU8 } from 'fflate'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'scripts/game-data')
const OUT = join(ROOT, 'src/game/data/generated/zh')
const UPSTREAM = 'd20aa815cf2f92d489302e64ae13ba39d3d17d63'

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

function colIndex(ref) {
  let n = 0
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function readSheet(path) {
  const zip = unzipSync(readFileSync(path))
  const sharedXml = zip['xl/sharedStrings.xml'] ? strFromU8(zip['xl/sharedStrings.xml']) : ''
  const shared = []
  for (const m of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decode(x[1]))
    shared.push(parts.join(''))
  }
  const sheetXml = strFromU8(zip['xl/worksheets/sheet1.xml'])
  const rows = []
  for (const rm of sheetXml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = []
    // Cells can be self-closing (`<c r="Q9" s="21"/>`); a naive `<c>...</c>`
    // regex would pair that opening tag with the next cell's closing tag and
    // shift every value after it.
    for (const cm of rm[2].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]
      const inner = cm[2] ?? ''
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1]
      if (!ref) continue
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1]
      let value = ''
      if (type === 's') {
        const idx = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
        value = shared[Number(idx)] ?? ''
      } else if (type === 'inlineStr') {
        value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decode(x[1])).join('')
      } else {
        value = decode(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '')
      }
      row[colIndex(ref)] = value
    }
    rows[Number(rm[1])] = row
  }
  return rows.filter(Boolean)
}

function schemaOf(header) {
  return header.map((name, i) => {
    if (!name) return null
    const arr = name.endsWith('[]')
    const base = arr ? name.slice(0, -2) : name
    const colon = base.indexOf(':')
    const group = colon >= 0 ? base.slice(0, colon) : null
    const field = colon >= 0 ? base.slice(colon + 1) : base
    return { i, arr, group, field }
  })
}

function rawRow(row, schema) {
  const raw = {}
  for (const s of schema) {
    if (!s) continue
    const value = row[s.i] ?? ''
    if (s.arr) {
      if (value === '') continue
      const target = s.group ? (raw[s.group] ??= {}) : raw
      ;(target[s.field] ??= []).push(value)
    } else if (s.group) {
      if (value === '') continue
      ;(raw[s.group] ??= {})[s.field] = value
    } else {
      raw[s.field] = value
    }
  }
  return raw
}

const truthy = (v) => v === '1' || v === 'true' || v === 'TRUE' || v === 'True'
const numObj = (obj) => {
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[k] = Number(v)
  return out
}

function toEvent(raw) {
  const event = {
    id: Number(raw.$id),
    event: raw.event ?? '',
    grade: Number(raw.grade) || 0,
  }
  if (raw.postEvent) event.postEvent = raw.postEvent
  if (raw.format) event.format = truthy(raw.format)
  if (raw.NoRandom) event.NoRandom = truthy(raw.NoRandom)
  if (raw.include) event.include = raw.include
  if (raw.exclude) event.exclude = raw.exclude
  if (raw.effect) event.effect = numObj(raw.effect)
  if (raw.branch) {
    event.branch = raw.branch.map((s) => {
      const i = s.indexOf(':')
      return { condition: s.slice(0, i), event: Number(s.slice(i + 1)) }
    })
  }
  return event
}

function toAge(raw) {
  const values = raw.event ?? []
  const ab = [[], []]
  for (const value of values) {
    if (value === '') continue
    const [weighted, levelText] = String(value).split('|')
    const [id, weight] = weighted.split('*')
    const level = Number(levelText) || 0
    const bucket = level < 0 ? ab[1] : ab[0]
    const index = Math.abs(level)
    ;(bucket[index] ??= []).push([Number(id), Number(weight) || 1])
  }
  ab[1].shift()
  const levels = ab[0].reverse().concat(ab[1])
  for (let i = 0; i < levels.length; i++) {
    levels[i] ??= []
    const level = levels[i]
    const pow = level.reduce((max, [, w]) => Math.max(max, String(w).split('.')[1]?.length || 0), 0)
    if (pow <= 1) continue
    const scale = 10 ** pow
    for (const item of level) item[1] = Math.floor(item[1] * scale)
  }
  return { age: Number(raw.$age), event: levels }
}

function toTalent(raw) {
  const talent = {
    id: Number(raw.$id),
    name: raw.name ?? '',
    description: raw.description ?? '',
    max: Number(raw.max) || 1,
    grade: Number(raw.grade) || 0,
  }
  if (raw.condition) talent.condition = raw.condition
  if (raw.exclusive) talent.exclusive = truthy(raw.exclusive)
  if (raw.points) talent.points = Number(raw.points)
  if (raw.effect) talent.effect = numObj(raw.effect)
  if (raw.exclude) talent.exclude = raw.exclude.map(Number)
  if (raw.replacement) {
    const replacement = {}
    if (raw.replacement.grade) replacement.grade = Number(raw.replacement.grade)
    if (raw.replacement.talent) {
      replacement.talent = raw.replacement.talent.map((v) => {
        const [id, weight] = String(v).split('*')
        return [Number(id), weight ? Number(weight) : 1]
      })
    }
    talent.replacement = replacement
  }
  return talent
}

function toAchievement(raw) {
  return {
    id: Number(raw.$id),
    name: raw.name ?? '',
    description: raw.description ?? '',
    grade: Number(raw.grade) || 0,
    condition: raw.condition ?? '',
    hide: truthy(raw.hide),
    opportunity: raw.opportunity,
  }
}

function toCharacter(raw) {
  return {
    id: Number(raw.$id),
    name: raw.name ?? '',
    property: numObj(raw.property ?? {}),
    talent: (raw.talent ?? []).map(Number),
  }
}

function build(file, transform, idKey = '$id') {
  const rows = readSheet(join(SRC, file))
  const schema = schemaOf(rows[0])
  return rows
    .slice(2)
    .map((row) => rawRow(row, schema))
    .filter((raw) => raw[idKey] !== undefined && raw[idKey] !== '')
    .map(transform)
    .sort((a, b) => a.id - b.id)
}

const events = build('event.xlsx', toEvent)

/**
 * Local content patches, keyed by event id. Kept outside the xlsx so a
 * regeneration does not silently restore text we intentionally rewrote.
 */
const overridesPath = join(SRC, 'overrides.json')
if (existsSync(overridesPath)) {
  const overrides = JSON.parse(readFileSync(overridesPath, 'utf8'))
  const byId = new Map(events.map((event) => [event.id, event]))
  for (const [id, patch] of Object.entries(overrides)) {
    const event = byId.get(Number(id))
    if (!event) {
      console.warn(`override for unknown event ${id}`)
      continue
    }
    Object.assign(event, patch)
  }
}

/**
 * `age.xlsx` has several rows per age — one per event level. The upstream
 * `v-transform` feeds the whole column set for an age into the transformer, so
 * rows must be merged before `toAge` (otherwise later levels overwrite earlier
 * ones and age pools lose most of their events).
 */
function buildAges() {
  const rows = readSheet(join(SRC, 'age.xlsx'))
  const schema = schemaOf(rows[0])
  const byAge = new Map()
  for (const row of rows.slice(2)) {
    const raw = rawRow(row, schema)
    if (raw.$age === undefined || raw.$age === '') continue
    const age = Number(raw.$age)
    const list = byAge.get(age) ?? []
    list.push(...(raw.event ?? []))
    byAge.set(age, list)
  }
  return [...byAge.entries()]
    .map(([age, event]) => toAge({ $age: String(age), event }))
    .sort((a, b) => a.age - b.age)
}

const ages = buildAges()
const talents = build('talent.xlsx', toTalent)
const achievements = build('achievement.xlsx', toAchievement)
const characters = build('character.xlsx', toCharacter)

const eventIds = new Set(events.map((e) => e.id))
const missingAge = new Set()
for (const age of ages) {
  for (const level of age.event) for (const [id] of level) if (!eventIds.has(id)) missingAge.add(id)
}
const missingBranch = []
for (const event of events) {
  for (const branch of event.branch ?? []) {
    if (!eventIds.has(branch.event)) missingBranch.push([event.id, branch.event])
  }
}

mkdirSync(OUT, { recursive: true })
const write = (name, data) => writeFileSync(join(OUT, name), JSON.stringify(data))
write('events.json', events)
write('ages.json', ages)
write('talents.json', talents)
write('achievements.json', achievements)
write('characters.json', characters)
writeFileSync(
  join(OUT, 'meta.json'),
  JSON.stringify(
    {
      upstream: UPSTREAM,
      license: 'MIT',
      copyright: 'Copyright (c) 2021-2026 神戸小鳥 and 神户小德',
      generatedAt: new Date().toISOString(),
      counts: {
        events: events.length,
        ages: ages.length,
        talents: talents.length,
        achievements: achievements.length,
        characters: characters.length,
      },
    },
    null,
    2,
  ),
)

console.log(
  `events ${events.length} · ages ${ages.length} · talents ${talents.length} · achievements ${achievements.length} · characters ${characters.length}`,
)
console.log(`missing age event ids: ${missingAge.size}`)
console.log(`missing branch targets: ${missingBranch.length}`)
if (missingAge.size) console.warn('  age ids:', [...missingAge].slice(0, 20))
if (missingBranch.length) console.warn('  branches:', missingBranch.slice(0, 10))
