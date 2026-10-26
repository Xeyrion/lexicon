/**
 * Reader smoke test: verifies that (1) the page restores to the stored anchor
 * instead of the scroll percentage, and (2) words in the title are clickable.
 *
 * Needs a running dev server and an article whose reader-progress record has an
 * `anchor`. Example seed:
 *
 *   node scripts/smoke-reader.mjs --base http://127.0.0.1:5173 --article art-1
 *
 * Chrome is taken from CHROME_PATH or the default Windows install path.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import puppeteer from 'puppeteer-core'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const base = arg('base', 'http://127.0.0.1:5173').replace(/\/$/, '')
const articleId = arg('article', 'art-1')
const shot = arg('screenshot', '.tmpcheck/reader-shot.png')

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

mkdirSync(dirname(shot), { recursive: true })

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

  await page.goto(`${base}/#/read/${articleId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-word]', { timeout: 20000 })
  // The restore runs in rAF and again after fonts resolve.
  await new Promise((resolve) => setTimeout(resolve, 1200))

  const state = await page.evaluate(() => {
    const words = [...document.querySelectorAll('[data-word]')]
    const firstVisible = words.find((word) => {
      const rect = word.getBoundingClientRect()
      return rect.top >= 90 && rect.bottom <= window.innerHeight
    })
    return {
      scrollY: Math.round(window.scrollY),
      docHeight: document.documentElement.scrollHeight,
      firstVisibleWord: firstVisible?.getAttribute('data-word') ?? null,
      firstVisibleParagraph: firstVisible?.getAttribute('data-paragraph') ?? null,
      titleTokens: document.querySelectorAll('h1 [data-word][data-paragraph="-1"]').length,
    }
  })

  // Title lookup: click the first title word and wait for the word panel.
  await page.click('h1 [data-word]')
  await page.waitForSelector('[aria-label="关闭词条"]', { timeout: 5000 }).catch(() => null)
  const panelOpen = await page.evaluate(
    () => document.querySelector('[aria-label="关闭词条"]') !== null,
  )

  await page.screenshot({ path: shot })
  console.log(JSON.stringify({ ...state, panelOpen, errors }, null, 2))

  const ok = state.scrollY > 200 && panelOpen && errors.length === 0
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED')
  process.exitCode = ok ? 0 : 1
} finally {
  await browser.close()
}
