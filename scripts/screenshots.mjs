/**
 * Regenerates the screenshots in docs/images/.
 *
 * Seeds a throwaway data directory through the local API, then drives Chrome
 * through the main screens. Never point this at a data directory you care
 * about: `--force-clean` deletes everything first.
 *
 *   LEXICON_DATA_DIR=%TEMP%\lexicon-shots npx vite --port 5280
 *   node scripts/screenshots.mjs --base http://127.0.0.1:5280 --force-clean
 */
import { existsSync, mkdirSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
import sharp from 'sharp'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const base = arg('base', 'http://127.0.0.1:5173').replace(/\/$/, '')
const outDir = arg('out', 'docs/images')
const forceClean = args.includes('--force-clean')
const KINDS = ['study', 'reader', 'reader-progress', 'library', 'stories']

if (!forceClean) {
  console.error('这个脚本会清空数据目录。确认是临时目录后加 --force-clean 再运行。')
  process.exit(1)
}

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

const DAY = 86_400_000
const now = Date.now()
const iso = (offsetDays) => new Date(now + offsetDays * DAY).toISOString()
const dayKey = (offsetDays) => new Date(now + offsetDays * DAY).toISOString().slice(0, 10)

async function put(kind, data) {
  const head = await fetch(`${base}/api/storage/${kind}`)
  const revision = head.status === 404 ? 0 : (await head.json()).revision
  const response = await fetch(`${base}/api/storage/${kind}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseRevision: revision, data }),
  })
  if (!response.ok) throw new Error(`${kind}: ${response.status} ${await response.text()}`)
}

function card(bookId, wordId, { dueDays, state, reps, lapses = 0, stability = 3 }) {
  return {
    bookId,
    wordId,
    introducedAt: iso(-30),
    updatedAt: iso(-1),
    reviews: reps,
    card: {
      due: iso(dueDays),
      stability,
      difficulty: 5.2,
      elapsed_days: 3,
      scheduled_days: Math.max(1, Math.round(dueDays)),
      learning_steps: 0,
      reps,
      lapses,
      state,
      last_review: iso(-3),
    },
  }
}

const ARTICLES = [
  {
    id: 'shot-attention',
    title: 'The Quiet Practice of Noticing',
    source: '示例文章',
    text: `Most people think attention is something you either have or you do not. In practice it behaves more like a muscle: it tires, it recovers, and it responds to how you use it.

The simplest exercise is also the hardest. Sit somewhere ordinary, a kitchen table or a bus seat, and notice three things you have seen a hundred times without ever really looking at them. The grain of the wood. The way the light falls across the wall in the afternoon. The sound the kettle makes just before it boils.

None of this is profound. That is the point. Attention does not need dramatic objects; it needs a decision to stay a little longer than is comfortable.

Writers have known this for a long time. The best sentences are rarely about extraordinary events. They are about ordinary events seen clearly, which is much harder than it sounds.

Try it for a week. Five minutes a day, no phone, no music, nothing to accomplish. You will probably be bored. Then, somewhere in the second week, the boredom will turn into something else — a kind of quiet that feels less like waiting and more like arriving.

That shift is not a trick. It is what happens when you stop treating the present moment as a corridor to somewhere better.`,
  },
  {
    id: 'shot-morning',
    title: 'Six Minutes Before the City Wakes',
    source: '示例文章',
    text: `There is a particular quality to the air at six in the morning, before the traffic finds its rhythm. The street belongs to delivery drivers and dog walkers and people who could not sleep.

I started walking at that hour because I wanted to read more, and reading requires a mind that has not yet been filled with other people's urgencies. The walk was not the point. The walk was the thing that made the reading possible.

You notice different things at that hour. A bakery with its lights already on. A man folding chairs outside a cafe, though nobody will sit there for another hour. The city rehearsing.

By eight the rehearsal is over and the performance begins. By nine I have usually forgotten what the street looked like when it was empty, which is why I keep the walk. Not for the exercise, but because some things are only visible before everyone agrees on what the day is about.`,
  },
]

function chapterOf(bookSlug, title, body) {
  return {
    id: `shot-${bookSlug}-${title.replace(/\W+/g, '-').toLowerCase()}`,
    title,
    text: body,
    wordCount: body.split(/\s+/).length,
    createdAt: iso(-12),
    updatedAt: iso(-12),
  }
}

function bookChapters(bookSlug = 'lh') {
  const chapter = (title, body) => chapterOf(bookSlug, title, body)

  return [
    chapter(
      'The Causeway',
      `The road to the lighthouse was underwater twice a day, and the timetable was posted on a board that nobody had repainted since the war. I read it anyway, as if the numbers might have changed out of sympathy.

A man was standing at the far end with a bucket. He did not wave. He watched me cross the stones and he waited until I was close enough to hear him say that the tide would turn in forty minutes, and that I should not be long.`,
    ),
    chapter(
      'The Lamp Room',
      `The stairs turned tighter as they climbed, and the air got colder in a way that had nothing to do with the weather. At the top there was glass on every side and the whole sea, grey and enormous, doing what it has always done.

The lens was clean. That was the first thing I noticed, because everything else in the tower had been left to the salt. Someone had been taking care of it.`,
    ),
    chapter(
      'The Logbook',
      `The logbook was open at the last page. The entries were all in the same hand, and they stopped eleven days ago, in the middle of a sentence about the weather.

I read the last line three times. Then I read the one before it, and the one before that, looking for the place where the writing changed, where a person stopped recording the sea and started talking to someone.`,
    ),
  ]
}

async function seed() {
  for (const kind of KINDS) {
    await fetch(`${base}/api/storage/${kind}`, { method: 'DELETE' })
  }

  const book = await (await fetch(`${base}/data/books/cet4.json`)).json()
  const words = book.words.slice(0, 200)

  const progress = {}
  words.forEach((word, index) => {
    const key = `cet4:${word.id}`
    if (index < 55) {
      // Due now: gives the dashboard a review backlog.
      progress[key] = card('cet4', word.id, { dueDays: -0.2, state: 2, reps: 3 })
    } else if (index < 95) {
      // Long intervals so the "mastered" tile is not zero.
      progress[key] = card('cet4', word.id, {
        dueDays: 30 + (index % 20),
        state: 2,
        reps: 5,
        stability: 45,
      })
    } else if (index < 120) {
      progress[key] = card('cet4', word.id, {
        dueDays: 1 + (index % 9),
        state: 2,
        reps: 2,
        stability: 8,
      })
    } else if (index < 150) {
      progress[key] = card('cet4', word.id, { dueDays: 0, state: 1, reps: 1, stability: 1 })
    }
  })

  const days = {}
  const pattern = [12, 18, 0, 24, 31, 9, 15, 22, 0, 27, 34, 11, 19, 26, 0, 21, 30, 14, 25, 33, 17]
  pattern.forEach((newCount, index) => {
    const offset = -(pattern.length - 1 - index)
    if (newCount === 0) return
    days[dayKey(offset)] = {
      date: dayKey(offset),
      newCount,
      reviewCount: Math.round(newCount * 1.8),
      again: Math.round(newCount * 0.3),
      hard: Math.round(newCount * 0.5),
      good: Math.round(newCount * 0.9),
      easy: Math.round(newCount * 0.4),
    }
  })

  await put('study', {
    state: {
      settings: {
        accent: 'us',
        dailyNew: 20,
        dailyReview: 100,
        autoSpeak: false,
        rate: 1,
        theme: 'light',
        showDefinition: true,
      },
      currentBookId: 'cet4',
      progress,
      days,
      personalWords: [
        {
          id: 'pw-1',
          word: 'serendipity',
          phoneticUS: '/ˌserənˈdɪpəti/',
          phoneticUK: '/ˌserənˈdɪpɪti/',
          phoneticAlt: '',
          trans: ['n. 意外发现珍奇事物的才能'],
          definition: ['n. the occurrence of events by chance in a happy way'],
          pos: 'n.',
          tags: ['personal'],
          rank: 0,
          addedAt: iso(-8),
        },
        {
          id: 'pw-2',
          word: 'threshold',
          phoneticUS: '/ˈθreʃhoʊld/',
          phoneticUK: '/ˈθreʃhəʊld/',
          phoneticAlt: '',
          trans: ['n. 门槛, 入口, 开端'],
          definition: ['n. a strip of wood or stone forming the bottom of a doorway'],
          pos: 'n.',
          tags: ['personal'],
          rank: 0,
          addedAt: iso(-5),
        },
      ],
    },
    version: 1,
  })

  const articles = ARTICLES.map((article) => ({
    ...article,
    createdAt: iso(-6),
    updatedAt: iso(-6),
    progress: 0,
    wordCount: article.text.split(/\s+/).length,
  }))

  await put('reader', { state: { articles, settings: { fontSize: 19 } }, version: 1 })

  const lighthouse = bookChapters('lh')
  const walking = bookChapters('wk').slice(0, 1)
  const rain = bookChapters('rn').slice(0, 1)

  const books = [
    {
      id: 'shot-book',
      title: 'The Lighthouse Keeper',
      author: 'A. N. Other',
      source: 'epub',
      chapters: lighthouse,
      createdAt: iso(-12),
      updatedAt: iso(-3),
    },
    {
      id: 'shot-book-2',
      title: 'Notes on Walking',
      author: 'M. Hale',
      source: 'epub',
      chapters: [
        ...walking,
        chapterOf('wk', 'The Long Way Round', 'I took the long way round because the short way ended at a gate that had been locked since spring, and I had stopped believing the sign.'),
        chapterOf('wk', 'Weather', 'Rain changes the arithmetic of a walk. Ten minutes becomes a decision, and every doorway becomes an argument with yourself.'),
        chapterOf('wk', 'Arriving', 'There is no ceremony to arriving on foot. You are simply there, slightly warmer than the air, and the day continues without comment.'),
      ],
      createdAt: iso(-20),
      updatedAt: iso(-9),
    },
    {
      id: 'shot-book-3',
      title: 'A Small Grammar of Rain',
      author: 'T. Okada',
      source: 'markdown',
      chapters: [
        ...rain,
        chapterOf('rn', 'Drizzle', 'Drizzle is the polite form of rain: it asks before it soaks you, and it never quite finishes its sentence.'),
        chapterOf('rn', 'Downpour', 'A downpour is not interested in your plans. It arrives with the confidence of something that has been rehearsed elsewhere.'),
        chapterOf('rn', 'After', 'The after-rain is the part people photograph, and the part nobody writes down, because it is mostly a smell and a change in the light.'),
      ],
      createdAt: iso(-30),
      updatedAt: iso(-25),
    },
  ]

  await put('library', { state: { books }, version: 1 })

  // Some chapter progress so the shelf cards are not all at zero.
  await put('reader-progress', {
    state: {
      items: {
        'shot-attention': {
          progress: 0.42,
          lastReadAt: iso(-1),
          anchor: { paragraph: 4, token: 0 },
        },
        'shot-morning': { progress: 0.15, lastReadAt: iso(-2) },
        [lighthouse[0].id]: { progress: 1, lastReadAt: iso(-3) },
        [lighthouse[1].id]: { progress: 0.55, lastReadAt: iso(-1) },
        [books[1].chapters[0].id]: { progress: 1, lastReadAt: iso(-8) },
        [books[2].chapters[0].id]: { progress: 0.3, lastReadAt: iso(-6) },
      },
    },
    version: 1,
  })

  await put('stories', {
    state: {
      stories: [],
      saves: {},
      meta: { 'the-lighthouse': { unlockedEndings: ['stay'], runs: 2 } },
    },
    version: 1,
  })
}

async function shoot() {
  mkdirSync(outDir, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--disable-gpu', '--hide-scrollbars', '--no-first-run', '--force-device-scale-factor=2'],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1360, height: 900, deviceScaleFactor: 2 })

  const settle = (ms = 900) => new Promise((resolve) => setTimeout(resolve, ms))
  const save = async (name) => {
    const file = `${outDir}/${name}.png`
    await page.screenshot({ path: file })
    // Halve the pixel density: the README never needs 2x on a 1360px canvas.
    await sharp(file)
      .resize({ width: 1360 })
      .png({ quality: 82, compressionLevel: 9, palette: false })
      .toFile(`${file}.tmp`)
    const { renameSync } = await import('node:fs')
    renameSync(`${file}.tmp`, file)
    console.log(`  ${file}`)
  }

  console.log('截图：')
  await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.innerText.includes('连续'), { timeout: 20000 })
  await settle(1200)
  await save('dashboard')

  await page.goto(`${base}/#/study`, { waitUntil: 'domcontentloaded' })
  await settle(1500)
  // Flip the card so the screenshot shows the meaning and the rating buttons.
  await page.keyboard.press('Space')
  await settle(700)
  await save('study')

  await page.goto(`${base}/#/read/shot-attention`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.reader-surface [data-word]', { timeout: 20000 })
  await settle(1600)
  // Open a word so the panel is visible.
  await page.evaluate(() => {
    const word = [...document.querySelectorAll('.reader-surface [data-word]')].find(
      (item) => item.getAttribute('data-word') === 'attention',
    )
    word?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await settle(800)
  await save('reader')

  await page.goto(`${base}/#/library`, { waitUntil: 'domcontentloaded' })
  await settle(1200)
  await save('library')

  await page.goto(`${base}/#/stories/the-lighthouse`, { waitUntil: 'domcontentloaded' })
  await settle(1200)
  await page.evaluate(() => {
    const start = [...document.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === '开始',
    )
    start?.click()
  })
  await settle(700)
  for (let step = 0; step < 3; step += 1) {
    await page.evaluate(() => {
      const choice = [...document.querySelectorAll('button')].find(
        (item) => item.className.includes('rounded-2xl') && !item.disabled,
      )
      choice?.click()
    })
    await settle(500)
  }
  await save('story')

  await page.goto(`${base}/#/stats`, { waitUntil: 'domcontentloaded' })
  await settle(1600)
  await save('stats')

  // Dark mode last, so only this shot is dark.
  await page.goto(`${base}/#/read/shot-attention`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.reader-surface [data-word]', { timeout: 20000 })
  await settle(1200)
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('深色模式'),
    )
    button?.click()
  })
  await settle(900)
  await save('reader-dark')

  await browser.close()
}

await seed()
await shoot()
console.log('完成。')
