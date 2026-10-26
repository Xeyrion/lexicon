/**
 * App-level smoke test: onboarding card, keyboard word lookup, and the clock
 * anomaly panel. Complements scripts/smoke-reader.mjs (anchor + title lookup).
 *
 * Needs a running dev server and Chrome (CHROME_PATH or the default Windows
 * install). Example, against a throwaway data directory:
 *
 *   LEXICON_DATA_DIR=%TEMP%\lexicon-smoke npx vite --port 5252
 *   node scripts/smoke-app.mjs --base http://127.0.0.1:5252 --force-clean
 *
 * `--force-clean` deletes study/reader/reader-progress first, which the
 * onboarding check needs (it only renders on an empty install). Never point it
 * at a data directory you care about.
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
const forceClean = args.includes('--force-clean')
const shot = arg('screenshot', '.tmpcheck/smoke-app.png')
const KINDS = ['study', 'reader', 'reader-progress']

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

  // 1. Onboarding card on an empty install.
  await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' })
  const onboarding = await page
    .waitForSelector('#onboarding-title', { timeout: forceClean ? 15000 : 3000 })
    .then(() => true)
    .catch(() => false)
  results.onboarding = onboarding
    ? await page.evaluate(() => ({
        title: document.querySelector('#onboarding-title')?.textContent?.trim(),
        steps: document.querySelectorAll('#onboarding-title ~ ol li').length,
      }))
    : 'skipped (data not empty; use --force-clean)'

  if (onboarding) {
    // 2. Step three creates the sample article directly, no editor round trip.
    await page.evaluate(() => {
      const target = [...document.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('示例'),
      )
      target?.click()
    })
    await page.waitForFunction(() => location.hash.startsWith('#/read/'), { timeout: 8000 })
    await page.waitForSelector('.reader-surface', { timeout: 15000 })
    await new Promise((resolve) => setTimeout(resolve, 600))
    results.sampleArticle = await page.evaluate(() => ({
      hash: location.hash,
      titleTokens: document.querySelectorAll('h1 [data-word]').length,
    }))

    // 3. Keyboard: focus the article, move with arrows, open with Enter.
    await page.focus('.reader-surface')
    await new Promise((resolve) => setTimeout(resolve, 200))
    const readFocus = () =>
      page.evaluate(() => {
        const element = document.querySelector('.reader-word-focus')
        return element
          ? {
              word: element.getAttribute('data-word'),
              paragraph: element.getAttribute('data-paragraph'),
            }
          : null
      })
    const first = await readFocus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    const moved = await readFocus()
    await page.keyboard.press('Enter')
    await page
      .waitForSelector('[aria-label="关闭词条"]', { timeout: 5000 })
      .catch(() => null)
    const panelOpen = await page.evaluate(
      () => document.querySelector('[aria-label="关闭词条"]') !== null,
    )
    results.keyboard = { first, moved, movedChanged: first?.word !== moved?.word, panelOpen }
    await page.keyboard.press('Escape')
  }

  // 4. Clock anomaly panel: a due date in 2200 can only mean the clock moved.
  const head = await fetch(`${base}/api/storage/study`)
  const revision = head.status === 404 ? 0 : (await head.json()).revision
  const now = new Date().toISOString()
  await fetch(`${base}/api/storage/study`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseRevision: revision,
      data: {
        state: {
          settings: {
            accent: 'us',
            dailyNew: 20,
            dailyReview: 100,
            autoSpeak: false,
            rate: 1,
            theme: 'system',
            showDefinition: true,
          },
          currentBookId: 'cet4',
          progress: {
            'cet4:abandon': {
              bookId: 'cet4',
              wordId: 'abandon',
              introducedAt: now,
              updatedAt: now,
              reviews: 1,
              card: {
                due: '2200-01-01T00:00:00.000Z',
                stability: 1,
                difficulty: 5,
                elapsed_days: 0,
                scheduled_days: 1,
                learning_steps: 0,
                reps: 1,
                lapses: 0,
                state: 2,
                last_review: now,
              },
            },
          },
          days: {},
          personalWords: [],
        },
        version: 1,
      },
    }),
  })
  await page.goto(`${base}/#/settings`, { waitUntil: 'domcontentloaded' })
  // Hash navigation alone does not reload the document, so force a real load.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page
    .waitForFunction(() => document.body.innerText.includes('时间与当前系统时间'), {
      timeout: 15000,
    })
    .catch(() => null)
  results.clockPanel = await page.evaluate(() => {
    const line = document.body.innerText
      .split('\n')
      .find((text) => text.includes('时间与当前系统时间'))
    return line ? line.trim().slice(0, 60) : null
  })

  await page.screenshot({ path: shot })
  results.errors = errors
} finally {
  await browser.close()
}

console.log(JSON.stringify(results, null, 2))
const ok =
  results.errors.length === 0 &&
  results.clockPanel !== null &&
  (results.onboarding === 'skipped (data not empty; use --force-clean)' ||
    (results.onboarding?.steps === 3 && results.keyboard?.panelOpen && results.keyboard?.movedChanged))
console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED')
process.exitCode = ok ? 0 : 1
