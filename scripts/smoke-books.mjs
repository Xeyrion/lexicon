/**
 * Book-mode smoke test: builds a minimal EPUB, imports it through the UI,
 * edits the parsed TOC, then reads a chapter and follows "next chapter".
 *
 * Needs a running dev server with a throwaway data directory:
 *
 *   LEXICON_DATA_DIR=%TEMP%\lexicon-smoke npx vite --port 5260
 *   node scripts/smoke-books.mjs --base http://127.0.0.1:5260 --force-clean
 *
 * `--force-clean` deletes study/reader/reader-progress/library first.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'
import puppeteer from 'puppeteer-core'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const base = arg('base', 'http://127.0.0.1:5173').replace(/\/$/, '')
const forceClean = args.includes('--force-clean')
const epubPath = arg('epub', '.tmpcheck/sample.epub')
const shot = arg('screenshot', '.tmpcheck/smoke-books.png')
const KINDS = ['study', 'reader', 'reader-progress', 'library']

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

function buildEpub() {
  const chapter = (title, body) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head>
<body><h1>${title}</h1>${body}</body></html>`

  const files = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    'OEBPS/content.opf': strToU8(`<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Quiet Mornings</dc:title>
    <dc:creator>Ada Lovelace</dc:creator>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`),
    'OEBPS/nav.xhtml': strToU8(`<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body><nav epub:type="toc"><ol>
  <li><a href="ch1.xhtml">The First Light</a></li>
  <li><a href="ch2.xhtml">The Second Wind</a></li>
</ol></nav></body></html>`),
    'OEBPS/ch1.xhtml': strToU8(
      chapter(
        'The First Light',
        '<p>A quiet morning begins with attention rather than alarm clocks.</p><p>Notice the kettle, the window, the slow arrival of daylight.</p>',
      ),
    ),
    'OEBPS/ch2.xhtml': strToU8(
      chapter(
        'The Second Wind',
        '<p>By noon the day has its own momentum and the morning feels distant.</p><p>Still, the practice is to return to what is in front of you.</p>',
      ),
    ),
  }
  return Buffer.from(zipSync(files, { level: 6 }))
}

const markdownPath = arg('markdown', '.tmpcheck/sample.md')
mkdirSync(dirname(epubPath), { recursive: true })
writeFileSync(epubPath, buildEpub())
writeFileSync(
  markdownPath,
  [
    '# Quiet Mornings',
    '',
    'A short preface before any chapter.',
    '',
    '## The First Light',
    '',
    'A quiet morning begins with attention.',
    '',
    '## The Second Wind',
    '',
    'By noon the day has its own momentum.',
    '',
    '### A Deeper Note',
    '',
    'This sub-section only splits when level three is chosen.',
    '',
  ].join('\n'),
)

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

  // 1. Empty shelf
  await page.goto(`${base}/#/library`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.innerText.includes('书架'), { timeout: 15000 })
  results.emptyShelf = await page.evaluate(() =>
    document.body.innerText.includes('书架还是空的'),
  )

  // 2. Import page -> upload
  await page.goto(`${base}/#/library/import`, { waitUntil: 'domcontentloaded' })
  const input = await page.waitForSelector('input[type=file]', { timeout: 15000 })
  await input.uploadFile(epubPath)
  await page.waitForFunction(() => document.body.innerText.includes('确认目录'), {
    timeout: 15000,
  })
  results.preview = await page.evaluate(() => ({
    title: document.querySelector('input.input')?.value ?? null,
    chapters: document.querySelectorAll('section ul li').length,
    chapterTitles: [...document.querySelectorAll('section ul li input')].map((el) => el.value),
  }))

  // 3. Rename the first chapter, then import
  await page.evaluate(() => {
    const input = document.querySelector('section ul li input')
    if (input instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'Renamed Chapter')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('导入 2 章'),
    )
    button?.click()
  })
  await page.waitForFunction(() => location.hash.startsWith('#/library/'), { timeout: 10000 })
  await new Promise((resolve) => setTimeout(resolve, 800))
  results.detail = await page.evaluate(() => ({
    hash: location.hash,
    heading: document.querySelector('h1, h2')?.textContent?.trim() ?? null,
    text: document.body.innerText.slice(0, 400),
    renamed: document.body.innerText.includes('Renamed Chapter'),
  }))

  // 4. Open the first chapter and follow "next chapter"
  await page.evaluate(() => {
    const link = document.querySelector('a[href*="/read/"]')
    link?.click()
  })
  await page.waitForFunction(() => location.hash.startsWith('#/read/'), { timeout: 10000 })
  await page.waitForSelector('.reader-surface', { timeout: 15000 })
  await new Promise((resolve) => setTimeout(resolve, 700))
  results.chapter1 = await page.evaluate(() => ({
    hash: location.hash,
    firstParagraph: document.querySelector('.reader-surface p')?.textContent?.slice(0, 60),
    hasNext: document.body.innerText.includes('下一章'),
    title: document.querySelector('.reader-surface h1')?.textContent?.trim(),
  }))

  await page.evaluate(() => {
    const button = [...document.querySelectorAll('a, button')].find((item) =>
      item.textContent?.includes('下一章'),
    )
    button?.click()
  })
  await new Promise((resolve) => setTimeout(resolve, 900))
  results.chapter2 = await page.evaluate(() => ({
    hash: location.hash,
    title: document.querySelector('.reader-surface h1')?.textContent?.trim(),
  }))

  // 5. Markdown import: auto split, then re-split at level three.
  await page.goto(`${base}/#/library/import`, { waitUntil: 'domcontentloaded' })
  const mdInput = await page.waitForSelector('input[type=file]', { timeout: 15000 })
  await mdInput.uploadFile(markdownPath)
  await page.waitForFunction(() => document.body.innerText.includes('确认目录'), {
    timeout: 15000,
  })
  results.markdownAuto = await page.evaluate(() => ({
    title: document.querySelector('input.input')?.value ?? null,
    chapters: [...document.querySelectorAll('section ul li input')].map((el) => el.value),
  }))

  await page.evaluate(() => {
    const select = document.querySelector('select')
    if (select instanceof HTMLSelectElement) {
      select.value = '3'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
  })
  await new Promise((resolve) => setTimeout(resolve, 300))
  results.markdownLevel3 = await page.evaluate(() =>
    [...document.querySelectorAll('section ul li input')].map((el) => el.value),
  )

  await page.screenshot({ path: shot })
  results.errors = errors
} finally {
  await browser.close()
}

console.log(JSON.stringify(results, null, 2))
const ok =
  results.errors.length === 0 &&
  results.emptyShelf === true &&
  results.preview?.chapters === 2 &&
  results.preview?.title === 'Quiet Mornings' &&
  results.detail?.renamed === true &&
  results.chapter1?.title === 'Renamed Chapter' &&
  results.chapter2?.title === 'The Second Wind' &&
  results.markdownAuto?.title === 'Quiet Mornings' &&
  // H1 is the book title, so the split happens at H2; the text before the first
  // H2 becomes a preface chapter, which is why this is 3 and not 2.
  results.markdownAuto?.chapters?.length === 3 &&
  results.markdownLevel3?.length === 2
console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED')
process.exitCode = ok ? 0 : 1
