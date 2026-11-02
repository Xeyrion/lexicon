/**
 * Validate the English game translation overlay against the batch files.
 *
 *   node scripts/translate-check.mjs
 *
 * Checks ids, post lines, `{CurrentYear}` placeholders, and leftover Chinese.
 * Exit code 1 with a list of problems.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const BATCH_DIR = join(ROOT, 'docs/translate/batches')
const OUT_DIR = join(ROOT, 'src/game/i18n/en')

const batches = []
for (const file of readdirSync(BATCH_DIR).filter((name) => name.endsWith('.md')).sort()) {
  const text = readFileSync(join(BATCH_DIR, file), 'utf8').replace(/\r\n/g, '\n')
  const re = /## Batch (\d{2}-\d{2})[\s\S]*?```json\n([\s\S]*?)\n```/g
  let match
  while ((match = re.exec(text))) {
    batches.push({ id: match[1], input: JSON.parse(match[2]) })
  }
}

const errors = []
const warnings = []
let checked = 0
let missingFiles = 0

for (const { id: batch, input } of batches) {
  const kind = batch.startsWith('07') ? 'talents' : batch.startsWith('08') ? 'achievements' : 'events'
  const file = join(OUT_DIR, kind, `${batch}.json`)
  if (!existsSync(file)) {
    missingFiles++
    continue
  }

  checked += input.length
  let out
  try {
    out = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    errors.push(`${batch}: invalid JSON (${error.message})`)
    continue
  }

  const entries = kind === 'events' ? out.events : out.items
  if (!entries) {
    errors.push(`${batch}: missing ${kind === 'events' ? 'events' : 'items'} key`)
    continue
  }

  const posts = out.posts ?? {}
  const sourceIds = new Set(input.map((item) => String(item.id)))
  const outputIds = new Set(Object.keys(entries))
  for (const id of sourceIds) if (!outputIds.has(id)) errors.push(`${batch}: missing id ${id}`)
  for (const id of outputIds) if (!sourceIds.has(id)) errors.push(`${batch}: extra id ${id}`)

  if (kind === 'events') {
    for (const item of input) {
      const id = String(item.id)
      if (item.post && !posts[id]) errors.push(`${batch}: missing post ${id}`)
      if (!item.post && posts[id]) errors.push(`${batch}: extra post ${id}`)

      const en = entries[id]
      if (!en) continue
      if (/\p{Script=Han}/u.test(en)) errors.push(`${batch}: Chinese left in ${id}: ${en}`)
      if (item.zh.includes('{CurrentYear}') && !en.includes('{CurrentYear}')) {
        errors.push(`${batch}: placeholder lost ${id}`)
      }

      // Chinese is denser than English, so the ratio is only a smell test.
      // A Han character usually becomes 3–6 Latin characters (p50 ≈ 3.8,
      // p90 ≈ 5.2 in the current corpus), so 7 is the "unusually long" line.
      const isAscii = [...item.zh].every((char) => char.codePointAt(0) < 0x80)
      if (!isAscii && !/[▓★☆▁▂▃▄▅▆▇█]/.test(item.zh)) {
        const ratio = en.length / item.zh.length
        if (ratio < 1.1 || ratio > 7) {
          warnings.push(`${batch}: ${id} length ratio ${ratio.toFixed(2)} (${item.zh.length} -> ${en.length})`)
        }
      }
    }
    for (const id of Object.keys(posts)) {
      if (!sourceIds.has(id)) errors.push(`${batch}: extra post id ${id}`)
    }
  } else {
    for (const item of input) {
      const id = String(item.id)
      const en = entries[id]
      if (!en) continue
      if (!en.name || !en.description) errors.push(`${batch}: incomplete item ${id}`)
      if (/\p{Script=Han}/u.test(JSON.stringify(en))) errors.push(`${batch}: Chinese left in item ${id}`)
    }
  }
}

console.log(`Batches: ${batches.length}`)
console.log(`Translated entries checked: ${checked}`)
console.log(`Missing batch files: ${missingFiles}`)
console.log(`Errors: ${errors.length}`)
console.log(`Length warnings: ${warnings.length}`)
for (const error of errors) console.log(`  ${error}`)
for (const warning of warnings.slice(0, 20)) console.log(`  ${warning}`)

if (errors.length) process.exitCode = 1
