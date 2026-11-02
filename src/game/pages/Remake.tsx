import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Pause, Play, RefreshCw, RotateCcw, Search, Settings as SettingsIcon, Sparkles, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { end, next, pick, pull, start, summary } from '@remake/core'
import type { Allocation, GameState, ProfileState } from '@remake/core'
import { achievements as achievementTable, events, talents } from '@remake/data'
import type { TalentGrade } from '@remake/data'
import type { RNG } from '@remake/vitex'
import { InlineWords } from '../../components/reader/ReaderText'
import { WordPanel } from '../../components/reader/WordPanel'
import type { ReaderLookup } from '../../components/reader/types'
import PageFallback from '../../components/PageFallback'
import { useReaderDictionary } from '../../hooks/useReaderDictionary'
import { useAppStore } from '../../store/appStore'
import { useGameStore } from '../../store/gameStore'
import { enAchievements, enEvents, enPosts, enTalents } from '../i18n/en'
import {
  EMPTY_PROFILE,
  SPEED_PRESETS,
  deserializeGame,
  fromProfileState,
  serializeGame,
  shownAge,
  toProfileState,
  type GameLocale,
} from '../model'
import { effectiveRules } from '../rules'
import { randomSeed, seeded, type SeededRNG } from '../rng'
import { useGameHydrated } from '../useGameHydrated'

type Step = 'home' | 'talents' | 'alloc' | 'play' | 'summary'

interface LogEntry {
  age: number
  events: number[]
  talents: number[]
  achievements: number[]
}

const ATTRS: { key: keyof Allocation; label: string }[] = [
  { key: 'charm', label: '颜值' },
  { key: 'intelligence', label: '智力' },
  { key: 'strength', label: '体质' },
  { key: 'money', label: '家境' },
  { key: 'spirit', label: '快乐' },
]

const SPIRIT_BASE = 5

const GRADE_LABEL = ['普通', '稀有', '史诗', '传说']

export default function Remake() {
  const hydrated = useGameHydrated()
  if (!hydrated) return <PageFallback />
  return <RemakeGame />
}

function RemakeGame() {
  const [step, setStep] = useState<Step>('home')
  const profile = useGameStore((state) => state.profiles.remake) ?? EMPTY_PROFILE
  const savedRun = useGameStore((state) => state.runs.remake)
  const saveProfile = useGameStore((state) => state.setProfile)
  const saveRun = useGameStore((state) => state.setRun)
  const clearRun = useGameStore((state) => state.clearRun)
  const storeLocale = useGameStore((state) => state.settings.locale)
  const storeSpeed = useGameStore((state) => state.settings.speed)
  const applyLocale = useGameStore((state) => state.setLocale)
  const applySpeed = useGameStore((state) => state.setSpeed)
  // Rules are snapshotted at mount: changing them must not alter a run in flight.
  const [rules, setRules] = useState(() => effectiveRules(useGameStore.getState().settings.rules))
  const [rerollsLeft, setRerollsLeft] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSelected, setPickerSelected] = useState<number[]>([])
  const [pickerQuery, setPickerQuery] = useState('')
  const [drawn, setDrawn] = useState<number[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [finalTalents, setFinalTalents] = useState<number[]>([])
  const [bonus, setBonus] = useState(0)
  const [alloc, setAlloc] = useState<Allocation>({
    charm: 0,
    intelligence: 0,
    strength: 0,
    money: 0,
    spirit: SPIRIT_BASE,
  })
  const [game, setGame] = useState<GameState | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [ended, setEnded] = useState(false)
  const [auto, setAuto] = useState(false)
  const [seed, setSeed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [summaryResult, setSummaryResult] = useState<{ score: number; achievements: number[] } | null>(
    null,
  )
  const rngRef = useRef<SeededRNG | null>(null)

  const profileState = useMemo<ProfileState>(() => toProfileState(profile), [profile])

  const locale: GameLocale = storeLocale
  const presetSpeed = (SPEED_PRESETS as readonly number[]).includes(storeSpeed)
  const [speed, setSpeed] = useState(() => (presetSpeed ? storeSpeed : 1))
  const [customSpeed, setCustomSpeed] = useState(() => (presetSpeed ? 2 : storeSpeed))
  const [customOpen, setCustomOpen] = useState(() => !presetSpeed)
  const effectiveSpeed = customOpen ? customSpeed : speed

  useEffect(() => {
    // Guard the write: mounting with the stored speed must not rewrite game.json.
    if (useGameStore.getState().settings.speed !== effectiveSpeed) applySpeed(effectiveSpeed)
  }, [applySpeed, effectiveSpeed])

  const accent = useAppStore((state) => state.settings.accent)
  const rate = useAppStore((state) => state.settings.rate)
  const personalWords = useAppStore((state) => state.personalWords)
  const addPersonalWord = useAppStore((state) => state.addPersonalWord)
  const { lookupWord, wordLoading, wordError, retry: retryDictionary } = useReaderDictionary()
  const [panelQuery, setPanelQuery] = useState<string | null>(null)
  const [activeToken, setActiveToken] = useState<{ paragraph: number; token: number } | null>(null)

  const panel = useMemo<ReaderLookup | null>(() => {
    if (!panelQuery) return null
    return { kind: 'word', query: panelQuery, entry: lookupWord(panelQuery), words: [] }
  }, [lookupWord, panelQuery])

  const eventText = useCallback(
    (id: number, index: number) => {
      const event = events.get(id)
      const zh = event?.event ?? ''
      const raw = locale === 'en' ? (enEvents.get(id) ?? zh) : zh
      if (!event?.format) return raw
      return raw.replaceAll('{CurrentYear}', String(new Date().getFullYear() + index))
    },
    [locale],
  )

  const postText = useCallback(
    (id: number) => {
      const zh = events.get(id)?.postEvent
      if (!zh) return undefined
      return locale === 'en' ? (enPosts.get(id) ?? zh) : zh
    },
    [locale],
  )

  const talentName = (id: number) => {
    const zh = talents.get(id)?.name ?? String(id)
    return locale === 'en' ? (enTalents.get(id)?.name ?? zh) : zh
  }

  const talentDesc = (id: number) => {
    const zh = talents.get(id)?.description ?? ''
    return locale === 'en' ? (enTalents.get(id)?.description ?? zh) : zh
  }

  const achievementName = (id: number) => {
    const zh = achievementTable.get(id)?.name ?? String(id)
    return locale === 'en' ? (enAchievements.get(id)?.name ?? zh) : zh
  }

  /**
   * Talent and achievement names come from their own translation tables, not
   * from the event text, so they need a separate tokenizer pass to be
   * clickable. Paragraph ids are offset per line (events 0–49, posts 50–89,
   * talents 90–94, achievements 95–99) so a highlight cannot land on the
   * wrong line.
   */
  const nameWords = (text: string, paragraph: number, english: boolean) =>
    english ? (
      <InlineWords text={text} paragraph={paragraph} activeToken={activeToken} />
    ) : (
      <>{text}</>
    )

  const changeLocale = (next: GameLocale) => {
    applyLocale(next)
  }

  const closePanel = () => {
    setPanelQuery(null)
    setActiveToken(null)
  }

  const drawTalents = (rng: RNG) =>
    pull(
      {
        count: rules.pullCount,
        rate: {
          base: new Map<TalentGrade, number>([
            [0, 889],
            [1, 100],
            [2, 10],
            [3, 1],
          ]),
          additions: {},
        },
      },
      profileState,
      rng,
    )

  const begin = () => {
    const nextSeed = randomSeed()
    const rng = seeded(nextSeed)
    rngRef.current = rng
    setSeed(nextSeed)
    setDrawn(drawTalents(rng))
    setSelected([])
    setFinalTalents([])
    setBonus(0)
    setGame(null)
    setLogs([])
    setEnded(false)
    setAuto(false)
    setError(null)
    setSummaryResult(null)
    setRerollsLeft(rules.rerolls)
    setPickerOpen(false)
    setPickerSelected([])
    setPickerQuery('')
    setStep('talents')
  }

  const reroll = () => {
    if (rerollsLeft <= 0) return
    const rng = rngRef.current ?? seeded(seed)
    setDrawn(drawTalents(rng))
    setSelected([])
    setRerollsLeft((value) => value - 1)
  }

  const toggleTalent = (id: number) => {
    setSelected((previous) => {
      if (previous.includes(id)) return previous.filter((item) => item !== id)
      if (previous.length >= rules.pickCount) return previous
      return [...previous, id]
    })
  }

  const pickerList = [...talents.values()].filter((talent) => {
    if (talent.exclusive) return false
    const query = pickerQuery.trim().toLowerCase()
    if (!query) return true
    const en = enTalents.get(talent.id)
    return [talent.name, talent.description, en?.name ?? '', en?.description ?? '']
      .join(' ')
      .toLowerCase()
      .includes(query)
  })

  const togglePicker = (id: number) => {
    setPickerSelected((previous) => {
      if (previous.includes(id)) return previous.filter((item) => item !== id)
      if (previous.length >= rules.pickCount) return previous
      return [...previous, id]
    })
  }

  const confirmPicker = () => {
    if (pickerSelected.length !== rules.pickCount) return
    setDrawn([...pickerSelected])
    setSelected([...pickerSelected])
    setPickerOpen(false)
  }

  const confirmTalents = () => {
    const rng = rngRef.current ?? seeded(seed)
    const result = pick(selected, rng)
    const list = [...result.talents.talents]
    setFinalTalents(list)
    setBonus(result.additionalPoints.points)
    setAlloc({
      charm: 0,
      intelligence: 0,
      strength: 0,
      money: 0,
      spirit: SPIRIT_BASE,
    })
    setStep('alloc')
  }

  const totalPoints = rules.points + bonus
  const spent = ATTRS.reduce((sum, { key }) => sum + alloc[key], 0) - SPIRIT_BASE
  const remaining = totalPoints - spent

  const adjust = (key: keyof Allocation, delta: 1 | -1) => {
    setAlloc((previous) => {
      const floor = key === 'spirit' ? SPIRIT_BASE : 0
      if (delta > 0 && (remaining <= 0 || previous[key] >= rules.allocLimit)) return previous
      if (delta < 0 && previous[key] <= floor) return previous
      return { ...previous, [key]: previous[key] + delta }
    })
  }

  const setAllocValue = (key: keyof Allocation, value: number) => {
    setAlloc((previous) => {
      const floor = key === 'spirit' ? SPIRIT_BASE : 0
      const target = Math.max(floor, Math.min(rules.allocLimit, Math.round(value)))
      const delta = target - previous[key]
      if (delta > 0) {
        const spentNow =
          ATTRS.reduce((sum, item) => sum + previous[item.key], 0) - SPIRIT_BASE
        if (delta > totalPoints - spentNow) return previous
      }
      return { ...previous, [key]: target }
    })
  }

  const beginRun = () => {
    const result = start(profileState, alloc, finalTalents)
    setGame(result.state)
    setLogs([
      {
        age: -1,
        events: [],
        talents: finalTalents,
        achievements: result.achievements,
      },
    ])
    setEnded(false)
    setAuto(false)
    setSummaryResult(null)
    setError(null)
    setStep('play')
  }

  const advance = useCallback(() => {
    if (!game || ended) return
    const rng = rngRef.current ?? seeded(seed)
    try {
      const result = next(game, profileState, rng)
      setGame(result.state)
      setLogs((previous) => [
        ...previous,
        {
          age: result.age,
          events: result.events,
          talents: result.talents,
          achievements: result.achievements,
        },
      ])
      if (result.end) {
        setEnded(true)
        setAuto(false)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '这一局走不下去了')
      setEnded(true)
      setAuto(false)
    }
  }, [ended, game, profileState, seed])

  useEffect(() => {
    if (!auto || step !== 'play' || ended) return
    const timer = window.setTimeout(advance, Math.max(50, Math.round(1200 / effectiveSpeed)))
    return () => window.clearTimeout(timer)
  }, [advance, auto, effectiveSpeed, ended, logs.length, step])

  useEffect(() => {
    if (step !== 'play' || ended) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return
      event.preventDefault()
      advance()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, ended, step])

  const finish = () => {
    if (!game) return
    const result = summary(game, profileState)
    const finished = end(game, profileState)
    const nextProfile = fromProfileState(finished.profile)
    const meta = { ...(profile.achievementMeta ?? {}) }
    const runIds = new Set<number>()
    for (const log of logs) for (const id of log.achievements) runIds.add(id)
    for (const id of result.achievements) runIds.add(id)
    for (const id of finished.achievements) runIds.add(id)
    for (const id of runIds) {
      const existing = meta[id]
      if (!existing || (existing.mode === 'custom' && rules.preset === 'standard')) {
        meta[id] = { mode: rules.preset, at: existing?.at ?? new Date().toISOString() }
      }
    }
    nextProfile.achievementMeta = meta
    saveProfile('remake', nextProfile)
    setSummaryResult({
      score: result.summary,
      achievements: [...new Set([...result.achievements, ...finished.achievements])],
    })
    setAuto(false)
    setStep('summary')
  }

  const restart = () => {
    setStep('home')
    setGame(null)
    setLogs([])
    setEnded(false)
    setAuto(false)
    setSummaryResult(null)
    setDrawn([])
    setSelected([])
    setFinalTalents([])
    setError(null)
    clearRun('remake')
  }

  const resume = () => {
    const saved = useGameStore.getState().runs.remake
    if (!saved) return
    const restored = saved.game ? deserializeGame(saved.game) : null
    if (saved.step === 'play' && !restored) {
      clearRun('remake')
      return
    }
    // Restoring the RNG position keeps the rest of the run identical to what
    // it would have been without the interruption.
    rngRef.current = seeded(saved.rngState)
    setRules(saved.rules)
    setSeed(saved.seed)
    setDrawn(saved.drawn)
    setSelected(saved.selected)
    setFinalTalents(saved.finalTalents)
    setBonus(saved.bonus)
    setAlloc(saved.alloc)
    setRerollsLeft(saved.rerollsLeft)
    setGame(restored)
    setLogs(saved.logs)
    setEnded(saved.ended)
    setSummaryResult(saved.summary)
    setAuto(false)
    setError(null)
    setStep(saved.step)
  }

  /**
   * Persist the run as it goes. Leaving the page — by accident or on purpose —
   * must not throw away a life that is already half lived; the home screen
   * offers "继续这一局" instead.
   */
  useEffect(() => {
    if (step === 'home') return
    saveRun('remake', {
      step,
      savedAt: new Date().toISOString(),
      rules,
      seed,
      rngState: rngRef.current?.getState() ?? seed,
      rerollsLeft,
      drawn,
      selected,
      finalTalents,
      bonus,
      alloc,
      logs,
      game: game ? serializeGame(game) : null,
      ended,
      summary: summaryResult,
    })
  }, [
    alloc,
    bonus,
    drawn,
    ended,
    finalTalents,
    game,
    logs,
    rerollsLeft,
    rules,
    saveRun,
    seed,
    selected,
    step,
    summaryResult,
  ])

  const newAchievements = useMemo(() => {
    const ids = new Set<number>()
    for (const log of logs) for (const id of log.achievements) ids.add(id)
    return [...ids]
  }, [logs])

  const runAchievements = useMemo(
    () => [...new Set([...newAchievements, ...(summaryResult?.achievements ?? [])])],
    [newAchievements, summaryResult],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/game"
          className="inline-flex items-center gap-2 text-xs text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={1.8} />
          游戏
        </Link>
        <span className="text-[11px] text-faint">·</span>
        <p className="text-xs text-muted">人生模拟器</p>
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/game/remake/achievements"
            className="chip inline-flex items-center gap-1"
            title="成就"
          >
            <Trophy size={11} />
            {profile.achievements.length}
          </Link>
          <Link
            to="/game/remake/settings"
            className="icon-button"
            aria-label="设置"
            title="设置"
          >
            <SettingsIcon size={16} strokeWidth={1.8} />
          </Link>
          <div className="inline-flex gap-1 rounded-full border border-line bg-surface p-1">
            <button
              type="button"
              onClick={() => changeLocale('en')}
              className={`rounded-full px-2.5 py-1 text-[10px] transition-colors ${
                locale === 'en' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => changeLocale('zh')}
              className={`rounded-full px-2.5 py-1 text-[10px] transition-colors ${
                locale === 'zh' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
              }`}
            >
              中
            </button>
          </div>
        </div>
      </div>

      {step === 'home' && (
        <section className="surface-card p-6 sm:p-10">
          <p className="kicker">A life, one year at a time</p>
          <h1 className="display mt-3 text-[2.2rem] leading-tight text-ink sm:text-[2.8rem]">
            人生模拟器
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            抽十个天赋，选三个，分完属性，然后一年一年地活下去。没有倒计时，读到哪里算哪里。
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            内容含死亡、疾病、暴力等情节，基调是黑色幽默。
          </p>

          <div className="mt-8 flex flex-wrap gap-3 text-xs text-muted">
            <span className="chip">已重开 {profile.times} 次</span>
            <span className="chip">解锁天赋 {profile.talents.length}</span>
            <span className="chip">成就 {profile.achievements.length}</span>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={begin}>
              <Sparkles size={15} />
              开始新的一生
            </button>
            <span className="text-[11px] text-faint">标准局：10 抽 3 选，20 点属性</span>
          </div>

          {savedRun && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper-deep/40 px-4 py-3">
              <div>
                <p className="text-sm text-ink">上一局还没走完</p>
                <p className="mt-0.5 text-[11px] text-faint">
                  {savedRun.step === 'summary'
                    ? `走到 ${shownAge(savedRun.game?.props.current.age ?? 0)} 岁，可以回去看总结`
                    : `停在 ${shownAge(savedRun.game?.props.current.age ?? 0)} 岁 · 已过 ${Math.max(
                        0,
                        savedRun.logs.length - 1,
                      )} 年`}
                  ，开始新的一生会覆盖它
                </p>
              </div>
              <button type="button" className="btn btn-secondary text-xs" onClick={resume}>
                <RotateCcw size={13} />
                继续这一局
              </button>
            </div>
          )}
        </section>
      )}

      {step === 'talents' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="kicker">Talents</p>
              <h2 className="display mt-2 text-2xl text-ink">选 {rules.pickCount} 个天赋</h2>
            </div>
            <p className="text-xs text-muted">
              已选 {selected.length} / {rules.pickCount}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {drawn.map((id) => {
              const talent = talents.get(id)
              if (!talent) return null
              const active = selected.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleTalent(id)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-accent/60 bg-accent-wash'
                      : 'border-line bg-surface hover:border-accent/35'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-ink">{talentName(id)}</span>
                    <span className="chip">{GRADE_LABEL[talent.grade] ?? '普通'}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">{talentDesc(id)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-faint">
                    {talent.points ? <span>+{talent.points} 属性点</span> : null}
                    {talent.condition ? <span>条件触发</span> : null}
                  </div>
                </button>
              )
            })}
          </div>

          {rules.preset === 'custom' && (
            <p className="text-[11px] text-faint">
              自定义局：抽 {rules.pullCount} 选 {rules.pickCount}，属性点 {rules.points}，单项上限{' '}
              {rules.allocLimit}。
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={confirmTalents}
              disabled={selected.length !== rules.pickCount}
            >
              下一步
              <ChevronRight size={15} />
            </button>
            {rules.rerolls > 0 && (
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={reroll}
                disabled={rerollsLeft <= 0}
              >
                <RefreshCw size={13} />
                刷新（{rerollsLeft}）
              </button>
            )}
            {rules.selfSelect && (
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => {
                  setPickerSelected([])
                  setPickerQuery('')
                  setPickerOpen(true)
                }}
              >
                <Search size={13} />
                自选天赋
              </button>
            )}
            <button type="button" className="btn btn-ghost text-xs" onClick={restart}>
              回到开头
            </button>
          </div>
        </section>
      )}

      {step === 'alloc' && (
        <section className="surface-card p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="kicker">Allocation</p>
              <h2 className="display mt-2 text-2xl text-ink">分配属性</h2>
            </div>
            <p className="text-xs text-muted">
              剩余 <span className="tabular-nums text-ink">{remaining}</span> 点
            </p>
          </div>

          <div className="mt-6 space-y-3">
            {ATTRS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-4">
                <span className="w-10 text-xs text-muted">{label}</span>
                <input
                  type="range"
                  min={key === 'spirit' ? SPIRIT_BASE : 0}
                  max={rules.allocLimit}
                  value={alloc[key]}
                  onChange={(event) => setAllocValue(key, Number(event.currentTarget.value))}
                  className="flex-1 cursor-pointer accent-[var(--accent)]"
                  aria-label={`${label}属性`}
                />
                <span className="w-6 text-right text-sm tabular-nums text-ink">{alloc[key]}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="h-7 w-7 rounded-full border border-line text-xs text-muted transition-colors hover:text-ink"
                    onClick={() => adjust(key, -1)}
                    aria-label={`减少${label}`}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="h-7 w-7 rounded-full border border-line text-xs text-muted transition-colors hover:text-ink"
                    onClick={() => adjust(key, 1)}
                    aria-label={`增加${label}`}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-faint">
            基础 {rules.points} 点{bonus > 0 ? `，天赋额外 +${bonus}` : ''}；单项上限 {rules.allocLimit}。
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={beginRun}>
              开始这一生
            </button>
            <button type="button" className="btn btn-ghost text-xs" onClick={() => setStep('talents')}>
              返回天赋
            </button>
          </div>
        </section>
      )}

      {step === 'play' && game && (
        <section className="flex flex-col gap-5 lg:h-[calc(100dvh-10.5rem)] lg:min-h-[30rem]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <div className="rounded-xl border border-line bg-surface px-3 py-2">
              <p className="text-[10px] text-faint">年龄</p>
              <p className="display text-xl tabular-nums text-ink">
                {shownAge(game.props.current.age)}
              </p>
            </div>
            {ATTRS.map(({ key, label }) => (
              <div key={key} className="rounded-xl border border-line bg-surface px-3 py-2">
                <p className="text-[10px] text-faint">{label}</p>
                <p className="display text-xl tabular-nums text-ink">
                  {game.props.current[key]}
                </p>
              </div>
            ))}
          </div>

          <div
            className="surface-card min-h-[22rem] max-h-[28rem] flex-1 overflow-y-auto p-5 sm:p-7 lg:min-h-0 lg:max-h-none"
            onClick={(event) => {
              const target = (event.target as HTMLElement).closest<HTMLElement>('[data-word]')
              if (!target) return
              const raw = target.dataset.word
              if (!raw) return
              setPanelQuery(raw)
              setActiveToken({
                paragraph: Number(target.dataset.paragraph),
                token: Number(target.dataset.token),
              })
            }}
          >
            <div className="mx-auto max-w-[46rem] pb-20 lg:pb-4">
              {logs.map((log, index) => (
                <div key={`${log.age}-${index}`} className="border-b border-line/60 py-3 last:border-0">
                  <p className="text-[10px] tabular-nums text-faint">
                    {log.age < 0 ? '开局' : `${log.age} 岁`}
                  </p>
                  {log.talents.length > 0 && (
                    <p className="mt-1 text-[11px] text-accent">
                      [天赋]{' '}
                      {log.talents.map((id, i) => (
                        <span key={id}>
                          {i > 0 && '、'}
                          {nameWords(
                            talentName(id),
                            index * 100 + 90 + i,
                            locale === 'en' && enTalents.has(id),
                          )}
                        </span>
                      ))}
                    </p>
                  )}
                  {log.events.map((id, i) => {
                    const last = i === log.events.length - 1
                    const post = last ? postText(id) : undefined
                    const text = eventText(id, index)
                    const english = locale === 'en' && enEvents.has(id)
                    return (
                      <div
                        key={`${id}-${i}`}
                        className="mt-1 text-[0.95rem] leading-relaxed text-ink"
                      >
                        {english ? (
                          <p>
                            <InlineWords
                              text={text}
                              paragraph={index * 100 + i}
                              activeToken={activeToken}
                            />
                          </p>
                        ) : (
                          <p>{text}</p>
                        )}
                        {post &&
                          (english && enPosts.has(id) ? (
                            <p className="mt-0.5 text-[0.9rem] text-muted">
                              <InlineWords
                                text={post}
                                paragraph={index * 100 + 50 + i}
                                activeToken={activeToken}
                              />
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[0.9rem] text-muted">{post}</p>
                          ))}
                      </div>
                    )
                  })}
                  {log.achievements.length > 0 && (
                    <p className="mt-1 text-[11px] text-muted">
                      [成就]{' '}
                      {log.achievements.map((id, i) => (
                        <span key={id}>
                          {i > 0 && '、'}
                          {nameWords(
                            achievementName(id),
                            index * 100 + 95 + i,
                            locale === 'en' && enAchievements.has(id),
                          )}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-accent/25 bg-accent-wash px-4 py-3 text-[11px] text-accent">
              {error}
            </p>
          )}

          <div className="sticky bottom-20 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper/95 px-4 py-3 backdrop-blur-xl lg:bottom-4">
            {!ended ? (
              <>
                <button type="button" className="btn btn-primary" onClick={advance}>
                  下一年
                  <ChevronRight size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-secondary text-xs"
                  onClick={() => setAuto((value) => !value)}
                >
                  {auto ? <Pause size={13} /> : <Play size={13} />}
                  {auto ? '暂停自动' : '自动播放'}
                </button>
                <label className="flex items-center gap-1 text-[11px] text-faint">
                  速度
                  <select
                    value={customOpen ? 'custom' : String(speed)}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      if (value === 'custom') {
                        setCustomOpen(true)
                      } else {
                        setCustomOpen(false)
                        setSpeed(Number(value))
                      }
                    }}
                    className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink"
                    aria-label="自动播放速度"
                  >
                    {SPEED_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}×
                      </option>
                    ))}
                    <option value="custom">自定义</option>
                  </select>
                </label>
                {customOpen && (
                  <span className="flex items-center gap-1 text-[11px] text-faint">
                    <input
                      type="number"
                      min={0.5}
                      max={20}
                      step={0.5}
                      value={customSpeed}
                      onChange={(event) => {
                        const value = Number(event.currentTarget.value)
                        if (Number.isFinite(value) && value >= 0.5 && value <= 20) {
                          setCustomSpeed(value)
                        }
                      }}
                      className="w-16 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink"
                      aria-label="自定义倍数"
                    />
                    ×
                  </span>
                )}
                <span className="text-[11px] text-faint">空格 / 回车也能推进</span>
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={finish}>
                人生总结
                <ChevronRight size={15} />
              </button>
            )}
          </div>
        </section>
      )}

      {step === 'summary' && summaryResult && (
        <section className="surface-card mx-auto max-w-2xl p-6 sm:p-10">
          <p className="kicker">Summary</p>
          <h2 className="display mt-2 text-3xl text-ink">这一生结束了</h2>
          <p className="mt-4 text-sm text-muted">
            评分 <span className="display text-2xl text-ink">{summaryResult.score}</span>
          </p>
          <p className="mt-2 text-[11px] text-faint">
            共 {logs.length - 1} 年 · 触发 {runAchievements.length} 个成就
          </p>

          {runAchievements.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] text-faint">本局新解锁</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {runAchievements.map((id) => (
                  <span key={id} className="chip">
                    {achievementName(id)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={begin}>
              <RotateCcw size={14} />
              再来一局
            </button>
            <button type="button" className="btn btn-secondary" onClick={restart}>
              回到开头
            </button>
            <Link to="/game" className="btn btn-ghost">
              游戏中心
            </Link>
          </div>
        </section>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-[1.75rem] border border-line bg-surface p-6 shadow-[var(--shadow-float)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="kicker">Pick talents</p>
                <h2 className="display mt-1 text-xl text-ink">自选天赋</h2>
                <p className="mt-1 text-[11px] text-faint">
                  已选 {pickerSelected.length} / {rules.pickCount}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPickerOpen(false)}
                aria-label="关闭自选"
              >
                ×
              </button>
            </div>

            <input
              value={pickerQuery}
              onChange={(event) => setPickerQuery(event.currentTarget.value)}
              placeholder="搜索天赋（中英文都行）"
              className="mt-4 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-2 sm:grid-cols-2">
                {pickerList.map((talent) => {
                  const active = pickerSelected.includes(talent.id)
                  return (
                    <button
                      key={talent.id}
                      type="button"
                      onClick={() => togglePicker(talent.id)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        active
                          ? 'border-accent/60 bg-accent-wash'
                          : 'border-line bg-surface hover:border-accent/35'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-ink">{talentName(talent.id)}</span>
                        <span className="chip">{GRADE_LABEL[talent.grade] ?? '普通'}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted">
                        {talentDesc(talent.id)}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-line/60 pt-4">
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => setPickerOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmPicker}
                disabled={pickerSelected.length !== rules.pickCount}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {panel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.75rem] border border-line bg-surface p-6 shadow-[var(--shadow-float)]">
            <WordPanel
              key={`word:${panel.query}`}
              lookup={panel}
              accent={accent}
              rate={rate}
              personalWords={personalWords}
              loading={wordLoading}
              error={wordError}
              onRetry={retryDictionary}
              onAdd={(entry) => addPersonalWord(entry)}
              onOpenWord={(raw) => setPanelQuery(raw)}
              onClose={closePanel}
            />
          </div>
        </div>
      )}
    </div>
  )
}
