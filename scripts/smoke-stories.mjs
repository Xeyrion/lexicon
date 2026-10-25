/**
 * Story-mode smoke test: plays the built-in story to an ending, checks the
 * atlas unlocks, and verifies that undo walks back a step.
 *
 *   LEXICON_DATA_DIR=%TEMP%\lexicon-smoke npx vite --port 5270
 *   node scripts/smoke-stories.mjs --base http://127.0.0.1:5270 --force-clean
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const base = arg('base', 'http://127.0.0.1:5173').replace(/\/$/, '')
const forceClean = args.includes('--force-clean')
const shot = arg('screenshot', '.tmpcheck/smoke-stories.png')
const KINDS = ['study', 'reader', 'reader-progress', 'library', 'stories']

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const executablePath = candidates.find((path) => existsSync(path))
if (!executablePath) {
  console.error('找不到 Chrome，请设置 CHROME_PATH。')
  process.exit(1)
}

if (forceClean) {
  for (const kind of KINDS) {
    await fetch(`${base}/api/storage/${kind}`, { method: 'DELETE' })
  }
}

const results = {}
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--disable-gpu', '--hide-scrollbars', '--no-first-run'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))

  // 1. Story list shows the built-in story and a locked atlas.
  await page.goto(`${base}/#/stories`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.innerText.includes('The Lighthouse'), {
    timeout: 15000,
  })
  results.list = await page.evaluate(() => ({
    hasBuiltin: document.body.innerText.includes('The Lighthouse'),
    atlas: document.body.innerText.includes('结局图鉴'),
    unlockedText: document.body.innerText.match(/已解锁\s*\d+\s*\/\s*\d+/g)?.slice(0, 2) ?? [],
  }))

  // 2. Start the story. Navigating by URL keeps this independent of whether
  // the card renders its action as a link or a button.
  await page.goto(`${base}/#/stories/the-lighthouse`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.innerText.includes('个段落'), { timeout: 10000 })
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === '开始',
    )
    button?.click()
  })
  await page.waitForSelector('article', { timeout: 10000 })
  results.started = await page.evaluate(
    () => document.querySelector('article')?.innerText.slice(0, 80) ?? null,
  )

  // 3. Walk the first available choice until an ending shows up.
  let steps = 0
  let reachedEnding = false
  while (steps < 25) {
    // The ending card is the only place with a "再玩一次" button; the kicker
    // text is CSS-uppercased, so matching on it is fragile.
    const state = await page.evaluate(() => {
      const replay = [...document.querySelectorAll('button')].find((item) =>
        item.textContent?.includes('再玩一次'),
      )
      const heading = replay?.closest('section')?.querySelector('h2')
      const choices = [...document.querySelectorAll('button')].filter(
        (item) =>
          item.className.includes('rounded-2xl') && !item.hasAttribute('disabled'),
      )
      return {
        ending: heading?.textContent?.trim() ?? null,
        choices: choices.map((item) => item.textContent?.trim() ?? ''),
      }
    })
    if (state.ending) {
      reachedEnding = true
      results.ending = state.ending
      break
    }
    if (state.choices.length === 0) break
    await page.evaluate(() => {
      const choice = [...document.querySelectorAll('button')].find(
        (item) =>
          item.className.includes('rounded-2xl') && !item.hasAttribute('disabled'),
      )
      choice?.click()
    })
    await new Promise((resolve) => setTimeout(resolve, 220))
    steps += 1
  }
  results.steps = steps
  results.reachedEnding = reachedEnding

  // 4. Undo walks back one step, so the ending card disappears.
  if (reachedEnding) {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((item) =>
        item.textContent?.includes('撤销一步'),
      )
      button?.click()
    })
    await new Promise((resolve) => setTimeout(resolve, 300))
    results.afterUndo = await page.evaluate(() => ({
      stillEnding: [...document.querySelectorAll('button')].some((item) =>
        item.textContent?.includes('再玩一次'),
      ),
      hasChoices: [...document.querySelectorAll('button')].some((item) =>
        item.className.includes('rounded-2xl'),
      ),
    }))
  }

  // 5. The atlas should now report one unlocked ending. Wait past the store's
  // debounce first: a reload cancels the in-flight flush.
  await new Promise((resolve) => setTimeout(resolve, 1200))
  await page.goto(`${base}/#/stories`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.innerText.includes('结局图鉴'), {
    timeout: 15000,
  })
  results.atlasAfter = await page.evaluate(
    () => document.body.innerText.match(/已解锁\s*\d+\s*\/\s*\d+/g)?.slice(0, 2) ?? [],
  )

  await page.screenshot({ path: shot })
  results.errors = errors
} finally {
  await browser.close()
}

console.log(JSON.stringify(results, null, 2))
const unlocked = results.atlasAfter?.some((text) => text.includes('1 / 3'))
const ok =
  results.errors.length === 0 &&
  results.list?.hasBuiltin === true &&
  results.list?.atlas === true &&
  results.reachedEnding === true &&
  results.afterUndo?.stillEnding === false &&
  results.afterUndo?.hasChoices === true &&
  unlocked === true
console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED')
process.exitCode = ok ? 0 : 1
