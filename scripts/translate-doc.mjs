/**
 * Regenerate the translation progress snapshot.
 *
 *   node scripts/translate-doc.mjs
 *
 * Reads the batches and the English overlay, writes docs/translate/PROGRESS.md,
 * and refreshes the status column in docs/translate/README.md.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const BATCH_DIR = join(ROOT, 'docs/translate/batches')
const OUT_DIR = join(ROOT, 'src/game/i18n/en')
const PROGRESS = join(ROOT, 'docs/translate/PROGRESS.md')
const README = join(ROOT, 'docs/translate/README.md')

const rows = []
const categoryStatuses = new Map()

for (const file of readdirSync(BATCH_DIR).filter((name) => name.endsWith('.md')).sort()) {
  const text = readFileSync(join(BATCH_DIR, file), 'utf8').replace(/\r\n/g, '\n')
  const category = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? file
  const re = /## Batch (\d{2}-\d{2})\n\n(\d+) 条 · (\d+) 字[\s\S]*?```json\n([\s\S]*?)\n```/g
  let match
  while ((match = re.exec(text))) {
    const batch = match[1]
    const count = Number(match[2])
    const chars = Number(match[3])
    const input = JSON.parse(match[4])
    const kind = batch.startsWith('07') ? 'talents' : batch.startsWith('08') ? 'achievements' : 'events'
    const outFile = join(OUT_DIR, kind, `${batch}.json`)

    let done = 0
    if (existsSync(outFile)) {
      const out = JSON.parse(readFileSync(outFile, 'utf8'))
      const entries = kind === 'events' ? out.events : out.items
      if (entries) done = input.filter((item) => String(item.id) in entries).length
    }

    const status = done === 0 ? '未开始' : done < input.length ? '进行中' : '待校对'
    rows.push({ batch, category, count, chars, status, file })
    const list = categoryStatuses.get(category) ?? []
    list.push(status)
    categoryStatuses.set(category, list)
  }
}

const summarize = (statuses) => {
  if (statuses.every((status) => status === '未开始')) return '未开始'
  if (statuses.every((status) => status === '已校对')) return '已校对'
  if (statuses.every((status) => status === '待校对' || status === '已校对')) return '待校对'
  return '进行中'
}

const totalCount = rows.reduce((sum, row) => sum + row.count, 0)
const totalChars = rows.reduce((sum, row) => sum + row.chars, 0)
const table = [
  '| 批次 | 范围 | 条数 | 中文字数 | 状态 |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map(
    (row) =>
      `| [${row.batch}](./batches/${row.file}#batch-${row.batch}) | ${row.category} | ${row.count} | ${row.chars} | ${row.status} |`,
  ),
].join('\n')

const progress = `# 翻译进度

> 由 \`scripts/translate-doc.mjs\` 生成。

${table}

合计：${rows.length} 批 / ${totalCount} 条 / ${totalChars} 字。
`
writeFileSync(PROGRESS, progress)

const readme = readFileSync(README, 'utf8')
const lines = readme.split('\n')
let inProgress = false
for (let i = 0; i < lines.length; i++) {
  if (lines[i] === '## 进度') {
    inProgress = true
    continue
  }
  if (inProgress && lines[i].startsWith('## ')) {
    inProgress = false
    continue
  }
  if (!inProgress || !lines[i].startsWith('|')) continue

  const cells = lines[i].split('|')
  if (cells.length < 7) continue
  const status = categoryStatuses.get(cells[1].trim())
  if (!status) continue
  cells[5] = ` ${summarize(status)} `
  lines[i] = cells.join('|')
}
writeFileSync(README, lines.join('\n'))

console.log(`Wrote ${rows.length} batches to docs/translate/PROGRESS.md`)
for (const [category, statuses] of categoryStatuses) {
  console.log(`  ${category}: ${summarize(statuses)} (${statuses.length} batches)`)
}
