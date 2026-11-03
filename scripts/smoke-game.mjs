/**
 * Game smoke test: play one life end to end and check that the run survives
 * the trip through game.json.
 *
 * Covers the paths that only exist at runtime: begin, the autosave effect,
 * resuming mid-run (the engine state and the RNG position), finishing a life
 * (the achievement merge), and "回到开头" clearing the saved run.
 *
 * Needs a running dev or preview server and Chrome (CHROME_PATH or the default
 * Windows install). Example, against a throwaway data directory:
 *
 *   LEXICON_DATA_DIR=%TEMP%\lexicon-smoke npx vite --port 5252
 *   node scripts/smoke-game.mjs --base http://127.0.0.1:5252
 *
 * It starts a fresh run and finishes it, so point it at a scratch data
 * directory rather than one you care about.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import puppeteer from 'puppeteer-core'

const args = process.argv.slice(2)
const base = (args[args.indexOf('--base') + 1] ?? 'http://127.0.0.1:5173').replace(/\/$/, '')
const shot = '.tmpcheck/smoke-game.png'
mkdirSync(dirname(shot), { recursive: true })

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].filter(Boolean)
const executablePath = candidates.find((path) => existsSync(path))
if (!executablePath) throw new Error('找不到 Chrome')

const problems = []
const steps = []
const step = (name) => steps.push(name)

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--disable-gpu', '--hide-scrollbars', '--no-first-run'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })

page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  // A fresh install answers 404 for every data file; the app treats that as
  // "missing" and the browser logs it. Not a failure.
  if (message.type() === 'error' && !message.text().includes('404')) {
    problems.push(`console: ${message.text()}`)
  }
})

const buttonLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('button')].map((button) => button.textContent?.trim() ?? ''),
  )

/** Clicks the first enabled button whose text starts with `text`; false if none. */
const tryClick = (text) =>
  page.evaluate((label) => {
    const target = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim().startsWith(label) && !button.disabled,
    )
    if (!target) return false
    target.click()
    return true
  }, text)

const clickText = async (text) => {
  if (await tryClick(text)) return
  throw new Error(`找不到可点击的按钮：${text}\n可用按钮：\n${(await buttonLabels()).join('\n')}`)
}

const waitForText = (text, timeout = 10000) =>
  page.waitForFunction((label) => document.body.innerText.includes(label), { timeout }, text)

const readSave = async () => {
  const body = await page.evaluate(async () => {
    const response = await fetch('/api/storage/game')
    if (!response.ok) return { status: response.status }
    return { status: 200, body: await response.json() }
  })
  if (body.status !== 200) throw new Error(`读取 game.json 失败：${body.status}`)
  return { envelope: body.body, state: body.body?.data?.state }
}

try {
  await page.goto(`${base}/#/game/remake`, { waitUntil: 'domcontentloaded' })
  await waitForText('开始新的一生')
  step('home renders')

  await clickText('开始新的一生')
  await waitForText('下一步')
  step('talents screen opens')

  const cardCount = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('button')].filter((button) =>
      button.querySelector('.chip'),
    )
    cards.slice(0, 3).forEach((card) => card.click())
    return cards.length
  })
  if (cardCount < 3) problems.push(`天赋卡数量异常：${cardCount}`)
  step(`picked 3 of ${cardCount} talents`)

  await clickText('下一步')
  await waitForText('开始这一生')
  await clickText('开始这一生')
  await waitForText('下一年')
  step('play screen opens')

  // Mid-run resume: the engine state and the RNG position must come back, so
  // the next year continues from where it stopped rather than starting over.
  await tryClick('下一年')
  await tryClick('下一年')
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const midAge = (await readSave()).state?.runs?.remake?.game?.props?.current?.age
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForText('继续这一局')
  await clickText('继续这一局')
  await waitForText('下一年')
  await tryClick('下一年')
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const afterResumeAge = (await readSave()).state?.runs?.remake?.game?.props?.current?.age
  if (typeof midAge !== 'number') problems.push('中局存档里没有年龄')
  else if (afterResumeAge !== midAge + 1) {
    problems.push(`中局恢复后年龄不对：${midAge} + 1 -> ${afterResumeAge}`)
  }
  step(`mid-run resume: age ${midAge} -> ${afterResumeAge}`)

  // Run the life out. The engine decides when it ends; cap the loop so a stuck
  // state fails instead of hanging.
  let advances = 0
  while (advances < 150) {
    if (!(await tryClick('下一年'))) break
    advances += 1
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  await waitForText('人生总结', 15000)
  step(`life ended after ${advances} years`)

  await new Promise((resolve) => setTimeout(resolve, 1200))
  const beforeFinish = await readSave()
  const runBefore = beforeFinish.state?.runs?.remake
  if (!runBefore) throw new Error('存档里没有 runs.remake')
  if (runBefore.ended !== true) problems.push('走到结局时 ended 仍不是 true')
  if (!Array.isArray(runBefore.logs) || runBefore.logs.length < 2) {
    problems.push(`logs 异常：${runBefore.logs?.length}`)
  }
  if (typeof runBefore.rngState !== 'number') problems.push('rngState 没有落盘')
  step(`autosave: ${runBefore.logs.length} log entries, step=${runBefore.step}`)

  await clickText('人生总结')
  await waitForText('这一生结束了')
  step('summary screen opens')

  await new Promise((resolve) => setTimeout(resolve, 1200))
  const afterFinish = await readSave()
  const runAfter = afterFinish.state?.runs?.remake
  const profile = afterFinish.state?.profiles?.remake
  if (runAfter?.step !== 'summary') problems.push(`总结后 step=${runAfter?.step}`)
  if (typeof runAfter?.summary?.score !== 'number') problems.push('summary.score 缺失')
  const metaKeys = Object.keys(profile?.achievementMeta ?? {})
  const unlocked = runAfter?.summary?.achievements ?? []
  if (!Array.isArray(unlocked)) problems.push('summary.achievements 不是数组')
  // A life can end at four years old with nothing unlocked; only require the
  // meta table to cover what the run actually earned.
  for (const id of unlocked) {
    if (!metaKeys.includes(String(id))) problems.push(`成就 ${id} 没有写进 profile.achievementMeta`)
  }
  step(`summary: score=${runAfter.summary.score}, unlocked=${unlocked.length}, meta=${metaKeys.length}`)

  const scoreBefore = runAfter.summary.score

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForText('继续这一局')
  step('home offers 继续这一局 after reload')

  await clickText('继续这一局')
  await waitForText('这一生结束了')
  const scoreShown = await page.evaluate(() => {
    const text = document.body.innerText
    const match = text.match(/评分\s*(\d+)/)
    return match ? Number(match[1]) : null
  })
  if (scoreShown !== scoreBefore) {
    problems.push(`恢复后的评分不一致：${scoreBefore} -> ${scoreShown}`)
  }
  step(`resumed summary with score ${scoreShown}`)

  await clickText('回到开头')
  await waitForText('开始新的一生')
  // `clearRun` reaches the file through the same 600ms debounce.
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const afterRestart = await readSave()
  if (afterRestart.state?.runs?.remake) problems.push('回到开头后仍留着进行中的一局')
  step('restart clears the saved run')

  await page.screenshot({ path: shot })
} catch (error) {
  problems.push(`流程中断：${error.message}`)
} finally {
  await browser.close()
}

for (const name of steps) console.log(`  ok  ${name}`)
if (problems.length > 0) {
  console.error('\n失败：')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log('\n游戏流程冒烟通过')
