/**
 * Author tooling for interactive stories. Validates and prints a story graph
 * without starting the app.
 *
 *   node scripts/story-tools.mjs check path/to/story.json
 *   node scripts/story-tools.mjs map   path/to/story.json
 *
 * The validator is bundled from src/ with esbuild at run time, so this script
 * never reimplements the rules the app enforces.
 */
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

/**
 * Loads the TypeScript sources through Vite's SSR loader so the CLI uses the
 * exact same validator as the app. `configFile: false` keeps the dev server
 * plugin (and its data directory side effects) out of this.
 */
async function loadEngine() {
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  try {
    const story = await server.ssrLoadModule('/src/lib/story.ts')
    const validation = await server.ssrLoadModule('/src/lib/validation.ts')
    return {
      validateStory: story.validateStory,
      reachableNodes: story.reachableNodes,
      findNode: story.findNode,
      parseImportedStory: validation.parseImportedStory,
    }
  } finally {
    await server.close()
  }
}

const [mode, file] = process.argv.slice(2)
if (!mode || !file) {
  console.error('用法：node scripts/story-tools.mjs <check|map> <story.json>')
  process.exit(1)
}

const engine = await loadEngine()
let raw
try {
  raw = JSON.parse(readFileSync(file, 'utf8'))
} catch (error) {
  console.error(`读不了 ${file}：${error instanceof Error ? error.message : error}`)
  process.exit(1)
}

const story = engine.parseImportedStory(raw)
if (!story) {
  console.error('这个文件不是故事格式：至少需要 id / title / start / nodes。')
  process.exit(1)
}

if (mode === 'check') {
  const errors = engine.validateStory(story)
  if (errors.length === 0) {
    console.log(`✓ ${story.title}：${story.nodes.length} 个节点，${story.endings.length} 个结局，没有问题。`)
    process.exit(0)
  }
  console.error(`✗ ${story.title}：发现 ${errors.length} 个问题`)
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

if (mode === 'map') {
  const problems = engine.validateStory(story)
  if (problems.length > 0) {
    console.error(`（注意：这个故事有 ${problems.length} 个结构问题，图可能不完整）`)
  }

  const lines = []
  const seen = new Set()

  const describeChoice = (choice) => {
    const parts = []
    if (choice.requires?.length) parts.push('需要条件')
    if (choice.effects?.length) parts.push('改变量')
    return parts.length > 0 ? ` [${parts.join(', ')}]` : ''
  }

  const walk = (nodeId, depth, label) => {
    const indent = '  '.repeat(depth)
    const node = engine.findNode(story, nodeId)
    if (!node) {
      lines.push(`${indent}${label}→ (缺失节点 ${nodeId})`)
      return
    }
    if (seen.has(nodeId)) {
      lines.push(`${indent}${label}→ ${nodeId} ↺`)
      return
    }
    seen.add(nodeId)

    const ending = node.ending ? `  ★ ${node.ending}` : ''
    lines.push(`${indent}${label}${nodeId}${ending}`)
    for (const choice of node.choices ?? []) {
      lines.push(`${indent}  · ${choice.label}${describeChoice(choice)}`)
      walk(choice.to, depth + 2, '')
    }
  }

  walk(story.start, 0, '')
  console.log(`${story.title}（${story.nodes.length} 节点 / ${story.endings.length} 结局）`)
  console.log(lines.join('\n'))
  const reachable = engine.reachableNodes(story).size
  console.log(`\n可达 ${reachable}/${story.nodes.length} 个节点`)
  process.exit(problems.length > 0 ? 1 : 0)
}

console.error(`未知模式：${mode}`)
process.exit(1)
