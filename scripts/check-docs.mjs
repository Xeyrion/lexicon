/**
 * Documentation drift check.
 *
 * The docs in this repo have a habit of going stale in ways nobody notices:
 * a script renamed in package.json but not in the README, a duplicated section
 * pasted twice, a test count copied into prose and never updated. This script
 * checks the facts that can be checked mechanically, so `npm test` fails instead
 * of a reader finding out six months later.
 *
 *   node scripts/check-docs.mjs
 *
 * Exit code 1 with a list of problems.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const problems = []
// The working tree can be CRLF (core.autocrlf) while other files are LF, so
// every check reads normalised text and never worries about line endings.
const read = (file) => readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')
const fail = (file, message, line) => {
  problems.push(`${file}${line ? `:${line}` : ''}  ${message}`)
}
const lineOf = (text, index) => text.slice(0, index).split('\n').length

/** Scripts that exist for npm's lifecycle and are not user-facing. */
const INTERNAL_SCRIPTS = new Set(['pretest', 'prebuild'])

const DOCS = ['README.md', 'docs/ISSUES.md', 'docs/HISTORY.md', 'docs/PLAN-next.md']
const README = read('README.md')
const pkg = JSON.parse(read('package.json'))

// --- 1. package.json scripts <-> README "常用脚本" -------------------------
const scriptSection = README.match(/## 常用脚本[\s\S]*?```[a-z]*\n([\s\S]*?)```/)
if (!scriptSection) {
  fail('README.md', '找不到「## 常用脚本」下的命令清单')
} else {
  const documented = new Set(
    [...scriptSection[1].matchAll(/npm (?:run )?([a-z][\w:-]*)/g)]
      .map((match) => match[1])
      .filter((name) => name !== 'install'),
  )
  const actual = new Set(Object.keys(pkg.scripts).filter((name) => !INTERNAL_SCRIPTS.has(name)))

  for (const name of actual) {
    if (!documented.has(name)) fail('README.md', `「常用脚本」缺少 npm run ${name}`)
  }
  for (const name of documented) {
    if (!actual.has(name)) fail('README.md', `「常用脚本」里的 ${name} 在 package.json 中不存在`)
  }
}

// --- 2. persisted data kinds <-> README file table ------------------------
const core = read('server/storage/core.ts')
const kindsMatch = core.match(/const KINDS = \[([^\]]+)\]/)
if (!kindsMatch) {
  fail('server/storage/core.ts', '找不到 KINDS 数组')
} else {
  const kinds = [...kindsMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  for (const kind of kinds) {
    if (!README.includes(`${kind}.json`)) {
      fail('README.md', `数据文件清单缺少 ${kind}.json（KINDS 里有）`)
    }
  }
}

// --- 3. LEXICON_* env vars: code -> README, README -> code ----------------
const codeFiles = [
  ...readdirSync(path.join(root, 'server'), { recursive: true })
    .filter((name) => typeof name === 'string' && name.endsWith('.ts'))
    .map((name) => `server/${name.split(path.sep).join('/')}`),
  ...readdirSync(path.join(root, 'scripts'))
    .filter((name) => name.endsWith('.mjs'))
    .map((name) => `scripts/${name}`),
  'start.cmd',
]

const envInCode = new Set()
for (const file of codeFiles) {
  if (!existsSync(path.join(root, file))) continue
  for (const match of read(file).matchAll(/LEXICON_[A-Z0-9_]+/g)) envInCode.add(match[0])
}
for (const name of envInCode) {
  if (!README.includes(name)) fail('README.md', `没有说明环境变量 ${name}（代码在用）`)
}
for (const match of README.matchAll(/LEXICON_[A-Z0-9_]+/g)) {
  if (!envInCode.has(match[0])) {
    fail('README.md', `提到的环境变量 ${match[0]} 在代码里不存在`, lineOf(README, match.index))
  }
}

// --- 4/5. duplicated sections and duplicated lines -----------------------
for (const file of DOCS) {
  if (!existsSync(path.join(root, file))) continue
  const text = read(file)
  const lines = text.split('\n')

  const headings = new Map()
  lines.forEach((line, index) => {
    if (!line.startsWith('## ')) return
    const key = line.trim()
    if (headings.has(key)) {
      fail(file, `标题重复：「${key}」（首次在第 ${headings.get(key)} 行）`, index + 1)
    } else {
      headings.set(key, index + 1)
    }
  })

  let previous = ''
  lines.forEach((line, index) => {
    const normalized = line.trim().replace(/\s+/g, ' ')
    if (normalized.length >= 12 && normalized === previous) {
      fail(file, `连续两行完全相同：${normalized.slice(0, 48)}`, index + 1)
    }
    previous = normalized
  })
}

// --- 6. ISSUES.md holds open issues only ---------------------------------
if (existsSync(path.join(root, 'docs/ISSUES.md'))) {
  const issues = read('docs/ISSUES.md')
  const batch = issues.match(/^## \d{4}-\d{2}-\d{2} 第/m)
  if (batch) {
    fail('docs/ISSUES.md', '出现批次日志；修复记录应写进 docs/HISTORY.md', lineOf(issues, batch.index))
  }
}

// --- 7. no copied test counts in prose -----------------------------------
for (const file of ['README.md', 'docs/ISSUES.md']) {
  const text = read(file)
  for (const match of text.matchAll(/\d+\s*条[^\n]{0,10}(?:测试|全绿)/g)) {
    fail(file, `写死了测试条数「${match[0]}」，会过期；让读者自己跑 npm test`, lineOf(text, match.index))
  }
}

// --- 8. relative markdown links resolve ----------------------------------
const markdownFiles = [...DOCS, ...readdirSync(path.join(root, 'docs'))
  .filter((name) => name.endsWith('.md'))
  .map((name) => `docs/${name}`)]

for (const file of new Set(markdownFiles)) {
  if (!existsSync(path.join(root, file))) continue
  const text = read(file)
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1]
    if (/^(https?:|mailto:|#)/.test(target)) continue
    const clean = decodeURI(target.split('#')[0])
    if (!clean) continue
    const resolved = path.resolve(path.dirname(path.join(root, file)), clean)
    if (!existsSync(resolved)) {
      fail(file, `链接指向不存在的文件：${target}`, lineOf(text, match.index))
    }
  }
}

// --- report --------------------------------------------------------------
if (problems.length > 0) {
  console.error(`docs:check 发现 ${problems.length} 处漂移：\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('\n改完再跑一次：npm run docs:check')
  process.exit(1)
}

const checked = DOCS.filter((file) => existsSync(path.join(root, file)))
console.log(`docs:check 通过（${checked.length} 份文档，${statSync(path.join(root, 'README.md')).size} 字节 README）`)
