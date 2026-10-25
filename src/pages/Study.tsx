import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  Clock,
  Home,
  Plus,
  RotateCcw,
  Sparkles,
  Volume2,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PhoneticLine } from '../components/PhoneticLine'
import { ProgressRing } from '../components/ProgressRing'
import { useBookData } from '../hooks/useBookData'
import { useLearningSteps } from '../hooks/useLearningSteps'
import { useRegistry } from '../hooks/useRegistry'
import { cardKey, useAppStore } from '../store/appStore'
import type { GradeKey, SessionCard, SessionStage, WordBook } from '../types'
import { buildExtraNewCards, buildQueue, bookStats, getQueuePlan } from '../lib/stats'
import { cardFromRecord, previewIntervals, repeatStage } from '../lib/fsrs'
import { isIntroducedToday } from '../lib/reviewMetrics'
import { speakWord, speech } from '../lib/speech'

interface Results {
  newWords: number
  reviewWords: number
  ratings: number
  again: number
  hard: number
  good: number
  easy: number
}

const EMPTY_RESULTS: Results = {
  newWords: 0,
  reviewWords: 0,
  ratings: 0,
  again: 0,
  hard: 0,
  good: 0,
  easy: 0,
}

const STAGE_LABELS: Record<SessionStage, string> = {
  new: '新词',
  review: '复习',
  learning: '学习步',
  relearning: '重学',
}

const IN_SESSION_WAIT_LIMIT_MS = 30 * 60 * 1000

const GRADES: {
  key: GradeKey
  label: string
  keyHint: string
  card: string
  accent: string
}[] = [
  {
    key: 'again',
    label: '忘记',
    keyHint: '1',
    card: 'border-line bg-surface hover:border-accent/40 hover:bg-accent-wash',
    accent: 'bg-accent',
  },
  {
    key: 'hard',
    label: '模糊',
    keyHint: '2',
    card: 'border-line bg-surface hover:border-amber/45 hover:bg-amber-soft/70',
    accent: 'bg-amber',
  },
  {
    key: 'good',
    label: '认识',
    keyHint: '3',
    card: 'border-ink/15 bg-ink/[0.045] hover:border-ink/30 hover:bg-ink/[0.07]',
    accent: 'bg-ink',
  },
  {
    key: 'easy',
    label: '熟练',
    keyHint: '4',
    card: 'border-line bg-surface hover:border-forest/45 hover:bg-forest-soft/70',
    accent: 'bg-forest',
  },
]

function normalizePos(pos: string): string {
  const map: Record<string, string> = {
    'a.': 'adj.',
    'ad.': 'adv.',
    'adv.': 'adv.',
    'adj.': 'adj.',
    'n.': 'n.',
    'v.': 'v.',
    'vt.': 'v.',
    'vi.': 'v.',
    'aux.': 'aux.',
    'prep.': 'prep.',
    'conj.': 'conj.',
    'pron.': 'pron.',
    'num.': 'num.',
    'art.': 'art.',
  }
  return map[pos.toLowerCase()] ?? pos
}

function MeaningLine({ line }: { line: string }) {
  const match = line.match(/^([a-zA-Z]+\.|\[[^\]]+\])\s*(.+)$/)
  const pos = match?.[1] ?? ''
  const text = match?.[2] ?? line
  return (
    <div className="flex items-start gap-3 text-left">
      {pos ? (
        <span className="mt-0.5 inline-flex h-5 min-w-[2.4rem] shrink-0 items-center justify-center rounded-md bg-sunken px-1.5 text-[10px] font-medium text-muted">
          {normalizePos(pos)}
        </span>
      ) : (
        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
      )}
      <p className="text-[0.95rem] leading-relaxed text-ink-soft">{text}</p>
    </div>
  )
}

function formatDuration(startedAt: number): string {
  const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes} 分钟` : `${minutes} 分 ${rest} 秒`
}

function formatWait(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分 ${seconds} 秒`
  return `${seconds} 秒`
}

export default function Study() {
  const [searchParams] = useSearchParams()
  const currentBookId = useAppStore((state) => state.currentBookId)
  const setCurrentBook = useAppStore((state) => state.setCurrentBook)
  const requestedBookId = searchParams.get('book')
  const bookId = requestedBookId || currentBookId
  const extra = Math.max(0, Number(searchParams.get('extra') ?? 0) || 0)
  const ignoreReviewCap = searchParams.get('all') === '1'
  const { book, loading, error } = useBookData(bookId)
  const { registry } = useRegistry()
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)

  useEffect(() => {
    if (bookId !== currentBookId) setCurrentBook(bookId)
  }, [bookId, currentBookId, setCurrentBook])

  useEffect(() => {
    if (requestedBookId || loading || book || error === null) return
    if (!registry || registry.books.length === 0) return
    if (registry.books.some((meta) => meta.id === bookId)) return

    const fallback = registry.books[0]
    if (!fallback) return
    const timer = window.setTimeout(() => {
      setFallbackNotice(
        `当前词书「${bookId}」已不存在，已切换到《${fallback.nameZh}》。`,
      )
      setCurrentBook(fallback.id)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [book, bookId, error, loading, registry, requestedBookId, setCurrentBook])

  const fallbackBanner = fallbackNotice ? (
    <p className="mb-5 rounded-xl border border-amber/25 bg-amber-soft/60 px-4 py-3 text-xs leading-relaxed text-amber">
      {fallbackNotice}
    </p>
  ) : null

  if (loading) {
    return (
      <>
        {fallbackBanner}
        <div className="animate-pulse space-y-5">
          <div className="h-5 w-40 rounded-full bg-sunken" />
          <div className="h-2 rounded-full bg-sunken" />
          <div className="h-[30rem] rounded-[1.75rem] bg-sunken/70" />
        </div>
      </>
    )
  }

  if (error || !book) {
    return (
      <>
        {fallbackBanner}
        <EmptyState
          icon={BookOpen}
          title="没有找到这本词书"
          description={error ?? '换一本词书，或者回到首页继续。'}
          action={
            <Link to="/books" className="btn btn-primary">
              打开词库
            </Link>
          }
        />
      </>
    )
  }

  if (book.wordCount === 0) {
    return (
      <>
        {fallbackBanner}
        <EmptyState
          icon={Sparkles}
          title="我的词库还是空的"
          description="在词库页手动添加单词，或导入 CSV / JSON，就可以开始学习了。"
          action={
            <Link to="/books" className="btn btn-primary">
              去添加单词
            </Link>
          }
        />
      </>
    )
  }

  return (
    <>
      {fallbackBanner}
      <StudySession
        key={`${book.id}:${extra}:${ignoreReviewCap}:${book.words.length}`}
        book={book}
        extra={extra}
        ignoreReviewCap={ignoreReviewCap}
      />
    </>
  )
}

function StudySession({
  book,
  extra,
  ignoreReviewCap,
}: {
  book: WordBook
  extra: number
  ignoreReviewCap: boolean
}) {
  const settings = useAppStore((state) => state.settings)
  const progress = useAppStore((state) => state.progress)
  const days = useAppStore((state) => state.days)
  const setSetting = useAppStore((state) => state.setSetting)
  const recordReview = useAppStore((state) => state.recordReview)
  const reduceMotion = useReducedMotion()

  const [mainQueue, setMainQueue] = useState<SessionCard[]>(() => {
    const state = useAppStore.getState()
    return buildQueue(
      book,
      state.progress,
      state.settings,
      state.days,
      new Date(),
      extra,
      ignoreReviewCap,
    )
  })
  const [mainIndex, setMainIndex] = useState(0)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [meaningsKey, setMeaningsKey] = useState<string | null>(null)
  const [results, setResults] = useState<Results>(EMPTY_RESULTS)
  const [startedAt, setStartedAt] = useState(() => Date.now())

  const newSeenRef = useRef<Set<string>>(new Set())
  const reviewSeenRef = useRef<Set<string>>(new Set())

  const { pending, learning, now, add, shift, reset } = useLearningSteps()

  const current = learning[0] ?? mainQueue[mainIndex] ?? null
  const currentKey = current
    ? `${current.word.id}:${current.stage ?? current.kind}:${current.record?.updatedAt ?? 'new'}`
    : null
  const revealed = currentKey !== null && revealedKey === currentKey
  const showAllMeanings = currentKey !== null && meaningsKey === currentKey
  const remaining = mainQueue.length - mainIndex + learning.length + pending.length
  const hasSessionWork =
    results.ratings > 0 ||
    mainQueue.length > 0 ||
    learning.length > 0 ||
    pending.length > 0
  const progressPercent =
    results.ratings + remaining === 0
      ? 0
      : Math.min(100, Math.round((results.ratings / (results.ratings + remaining)) * 100))

  const plan = useMemo(
    () => getQueuePlan(book, progress, settings, days),
    [book, progress, settings, days],
  )

  const canAddMore = useMemo(() => {
    const inSession = new Set<string>()
    for (let index = mainIndex; index < mainQueue.length; index += 1) {
      inSession.add(mainQueue[index].word.id)
    }
    for (const card of learning) inSession.add(card.word.id)
    for (const item of pending) inSession.add(item.card.word.id)
    return book.words.some(
      (word) => !inSession.has(word.id) && !progress[cardKey(book.id, word.id)],
    )
  }, [book, learning, mainIndex, mainQueue, pending, progress])

  const preview = useMemo(() => {
    if (!current) return null
    return previewIntervals(cardFromRecord(current.record))
  }, [current])

  useEffect(() => {
    if (!current || !settings.autoSpeak) return
    const state = useAppStore.getState().settings
    void speakWord(current.word.word, state.accent, state.rate)
  }, [current, settings.autoSpeak])

  useEffect(() => {
    return () => speech.stop()
  }, [])

  const startSession = useCallback(
    (options?: { extra?: number; ignoreReviewCap?: boolean }) => {
      const state = useAppStore.getState()
      const next = buildQueue(
        book,
        state.progress,
        state.settings,
        state.days,
        new Date(),
        options?.extra ?? 0,
        options?.ignoreReviewCap ?? ignoreReviewCap,
      )
      setMainQueue(next)
      setMainIndex(0)
      reset()
      setRevealedKey(null)
      setMeaningsKey(null)
      setResults({ ...EMPTY_RESULTS })
      setStartedAt(Date.now())
      newSeenRef.current = new Set()
      reviewSeenRef.current = new Set()
    },
    [book, ignoreReviewCap, reset],
  )

  const addExtra = useCallback(
    (count: number) => {
      const state = useAppStore.getState()
      const exclude = new Set<string>()
      for (let index = mainIndex; index < mainQueue.length; index += 1) {
        exclude.add(mainQueue[index].word.id)
      }
      for (const card of learning) exclude.add(card.word.id)
      for (const item of pending) exclude.add(item.card.word.id)
      const cards = buildExtraNewCards(book, state.progress, exclude, count)
      if (cards.length === 0) return
      setMainQueue((prev) => {
        const existing = new Set(prev.map((card) => card.word.id))
        return [...prev, ...cards.filter((card) => !existing.has(card.word.id))]
      })
    },
    [book, learning, mainIndex, mainQueue, pending],
  )

  const handleRate = useCallback(
    (grade: GradeKey) => {
      if (!current || !revealed) return
      const fromLearning = learning.length > 0
      const ratingNow = new Date()
      const isOld = current.record ? !isIntroducedToday(current.record, ratingNow) : false
      const key = cardKey(book.id, current.word.id)

      recordReview({ bookId: book.id, wordId: current.word.id, grade })
      const updated = useAppStore.getState().progress[key]

      let newIncrement = 0
      let reviewIncrement = 0
      if (current.stage === 'new' && !newSeenRef.current.has(key)) {
        newSeenRef.current.add(key)
        newIncrement = 1
      }
      if (isOld && !reviewSeenRef.current.has(key)) {
        reviewSeenRef.current.add(key)
        reviewIncrement = 1
      }

      setResults((prev) => ({
        ...prev,
        newWords: prev.newWords + newIncrement,
        reviewWords: prev.reviewWords + reviewIncrement,
        ratings: prev.ratings + 1,
        [grade]: prev[grade] + 1,
      }))

      if (updated) {
        const stage = repeatStage(updated)
        const dueAt = new Date(updated.card.due).getTime()
        if (stage && dueAt - Date.now() <= IN_SESSION_WAIT_LIMIT_MS) {
          add(
            {
              ...current,
              kind: 'review',
              stage,
              record: updated,
              requeued: true,
            },
            dueAt,
          )
        }
      }

      if (fromLearning) shift()
      else setMainIndex((value) => value + 1)

      setRevealedKey(null)
      setMeaningsKey(null)
    },
    [add, book.id, current, learning.length, recordReview, revealed, shift],
  )

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!current) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      ) {
        return
      }
      if (event.code === 'Space') {
        if (
          target instanceof HTMLElement &&
          ['BUTTON', 'A', 'SUMMARY'].includes(target.tagName)
        ) {
          return
        }
        event.preventDefault()
        if (!revealed && currentKey) setRevealedKey(currentKey)
        return
      }
      if (!revealed) return
      const map: Record<string, GradeKey> = {
        '1': 'again',
        '2': 'hard',
        '3': 'good',
        '4': 'easy',
      }
      const grade = map[event.key]
      if (grade) {
        event.preventDefault()
        handleRate(grade)
      }
      if (event.key.toLowerCase() === 's' && current) {
        const state = useAppStore.getState().settings
        void speakWord(current.word.word, state.accent, state.rate)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [revealed, current, currentKey, handleRate])

  if (!current && pending.length > 0) {
    const waitMs = Math.max(0, (pending[0]?.dueAt ?? now) - now)
    return (
      <div className="mx-auto max-w-2xl">
        <div className="surface-card relative overflow-hidden p-7 text-center sm:p-12">
          <div className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full bg-forest/8 blur-2xl" />
          <p className="kicker">Learning steps</p>
          <h1 className="display relative mt-4 text-[2.1rem] leading-tight text-ink sm:text-[2.8rem]">
            学习步还在走。
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            还有 {pending.length} 个词在记忆冷却，最快 {formatWait(waitMs)} 后回来。
          </p>

          <div className="relative mt-8 flex justify-center">
            <ProgressRing
              value={progressPercent}
              size={136}
              label={`${progressPercent}%`}
              hint="本组进度"
            />
          </div>

          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => addExtra(10)}
              disabled={!canAddMore}
            >
              <Plus size={15} />
              加学 10 个
            </button>
            <Link to="/" className="btn btn-secondary">
              <Home size={15} />
              回首页
            </Link>
            <Link to="/stats" className="btn btn-ghost">
              <BarChart3 size={15} />
              查看统计
            </Link>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-faint">
            <Clock size={12} />
            {canAddMore
              ? '不想等的话，可以加学一组新词。'
              : '这本词书的词已经全部加入本组了。'}
          </p>
        </div>
        <p className="mt-5 text-center text-[10px] leading-relaxed text-faint">
          离开也没关系，到期的卡已经保存，下次会接着出现。
        </p>
      </div>
    )
  }

  if (!current && pending.length === 0 && hasSessionWork) {
    const stats = bookStats(book, progress)
    const retention =
      results.ratings === 0
        ? 0
        : Math.round(((results.ratings - results.again) / results.ratings) * 100)
    const backlog = plan.reviewBacklog + plan.learningDue
    return (
      <div className="mx-auto max-w-3xl">
        <div className="surface-card relative overflow-hidden p-7 text-center sm:p-12">
          <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-accent/5 blur-2xl" />
          <p className="kicker">Session complete</p>
          <h1 className="display relative mt-4 text-[2.2rem] leading-tight text-ink sm:text-[3rem]">
            今天的这一页，读完了。
          </h1>
          <p className="mt-3 text-sm text-muted">
            《{book.nameZh}》· 用时 {formatDuration(startedAt)}
          </p>

          <div className="relative mt-8 flex justify-center">
            <ProgressRing
              value={stats.percent}
              size={148}
              label={`${stats.percent}%`}
              hint="词书进度"
            />
          </div>
          <p className="relative mt-3 text-[11px] text-faint">
            已掌握 {stats.mastered} 个词
          </p>

          <div className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-line bg-paper-deep/35 p-4">
              <p className="kicker">新学</p>
              <p className="display mt-2 text-2xl text-ink">{results.newWords}</p>
            </div>
            <div className="rounded-2xl border border-line bg-paper-deep/35 p-4">
              <p className="kicker">已复习</p>
              <p className="display mt-2 text-2xl text-ink">{results.reviewWords}</p>
            </div>
            <div className="rounded-2xl border border-line bg-paper-deep/35 p-4">
              <p className="kicker">点击</p>
              <p className="display mt-2 text-2xl text-ink">{results.ratings}</p>
            </div>
            <div className="rounded-2xl border border-line bg-paper-deep/35 p-4">
              <p className="kicker">记忆率</p>
              <p className="display mt-2 text-2xl text-ink">{retention}%</p>
            </div>
          </div>

          {backlog > 0 && (
            <p className="relative mt-6 rounded-xl border border-forest/20 bg-forest-soft/50 px-4 py-3 text-xs text-forest">
              还有 {backlog} 个词待复习，可以继续。
            </p>
          )}

          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/" className="btn btn-secondary">
              <Home size={15} />
              回首页
            </Link>
            {backlog > 0 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => startSession({ ignoreReviewCap: true })}
              >
                <RotateCcw size={15} />
                继续复习 {backlog} 个
              </button>
            )}
            {stats.learned < stats.total ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => startSession({ extra: 10 })}
              >
                <Plus size={15} />
                再学一组
              </button>
            ) : (
              backlog === 0 && (
                <Link to="/books" className="btn btn-primary">
                  换一本词书
                </Link>
              )
            )}
            <Link to="/stats" className="btn btn-ghost">
              <BarChart3 size={15} />
              查看统计
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!current) {
    const stats = bookStats(book, progress)
    const backlog = plan.reviewBacklog + plan.learningDue
    const allLearned = stats.learned >= stats.total
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={Check}
          title={backlog > 0 ? '今日计划完成了' : '今天的任务完成了'}
          description={
            backlog > 0
              ? `《${book.nameZh}》今天还有 ${backlog} 个词待复习，可以继续。`
              : allLearned
                ? `《${book.nameZh}》的词已经全部学完了。`
                : `《${book.nameZh}》今天已经没有到期的词。可以加学一组，或者明天再来。`
          }
          action={
            <div className="flex flex-wrap justify-center gap-3">
              {backlog > 0 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => startSession({ ignoreReviewCap: true })}
                >
                  <RotateCcw size={15} />
                  继续复习 {backlog} 个
                </button>
              ) : allLearned ? (
                <Link to="/books" className="btn btn-primary">
                  换一本词书
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => startSession({ extra: 10 })}
                >
                  <Plus size={15} />
                  加学 10 个
                </button>
              )}
              <Link to="/" className="btn btn-secondary">
                回首页
              </Link>
            </div>
          }
        />
        <div className="mt-5 flex items-center justify-center gap-3 text-xs text-faint">
          <span>当前词书进度</span>
          <span className="h-1 w-28 overflow-hidden rounded-full bg-sunken">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${stats.percent}%` }}
            />
          </span>
          <span>{stats.percent}%</span>
        </div>
      </div>
    )
  }

  const stage = current.stage ?? (current.kind === 'new' ? 'new' : 'review')
  const meanings = showAllMeanings ? current.word.trans : current.word.trans.slice(0, 4)
  const hiddenMeanings = current.word.trans.length - meanings.length

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to="/" className="btn btn-ghost -ml-2">
          <ArrowLeft size={16} />
          退出学习
        </Link>
        <div className="flex items-center gap-2.5">
          <span className="chip">{book.nameZh}</span>
          <span className="text-[11px] tabular-nums text-faint">剩余 {remaining}</span>
        </div>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-sunken">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${current.word.id}-${results.ratings}`}
          initial={reduceMotion ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, x: -24 }}
          transition={{ duration: 0.26, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <div
            role="presentation"
            onClick={() => {
              if (!revealed && currentKey) setRevealedKey(currentKey)
            }}
            className={`surface-card relative mt-4 flex min-h-[29rem] flex-col p-6 sm:min-h-[33rem] sm:p-9 ${
              revealed ? '' : 'cursor-pointer'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`chip ${stage === 'new' ? 'chip-accent' : ''}`}>
                  {STAGE_LABELS[stage]}
                </span>
                {current.word.tags.includes('personal') && <span className="chip">自建</span>}
              </div>
              <span className="text-[10px] tabular-nums text-faint">剩余 {remaining}</span>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center sm:py-10">
              <p className="display max-w-full break-words text-[clamp(2.5rem,9vw,4.9rem)] leading-[1.02] text-ink">
                {current.word.word}
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <PhoneticLine
                  word={current.word.word}
                  us={current.word.phoneticUS}
                  uk={current.word.phoneticUK}
                  alt={current.word.phoneticAlt}
                  accent={settings.accent}
                  rate={settings.rate}
                  size="lg"
                  onAccent={(accent) => setSetting('accent', accent)}
                />
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    void speakWord(current.word.word, settings.accent, settings.rate)
                  }}
                  className="icon-button icon-button-bordered h-9 w-9"
                  aria-label="播放发音"
                  title="播放发音"
                >
                  <Volume2 size={15} strokeWidth={1.8} />
                </button>
              </div>

              <AnimatePresence initial={false}>
                {revealed ? (
                  <motion.div
                    key="answer"
                    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.24 }}
                    className="mt-9 w-full max-w-xl"
                  >
                    <div className="space-y-2.5">
                      {meanings.map((line) => (
                        <MeaningLine key={line} line={line} />
                      ))}
                    </div>
                    {hiddenMeanings > 0 && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          if (currentKey) setMeaningsKey(currentKey)
                        }}
                        className="mt-3 inline-flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-accent"
                      >
                        还有 {hiddenMeanings} 条释义
                        <ChevronDown size={12} />
                      </button>
                    )}
                    {settings.showDefinition && current.word.definition.length > 0 && (
                      <details
                        className="mt-5 text-left"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <summary className="cursor-pointer text-[11px] text-faint transition-colors hover:text-muted">
                          英文释义
                        </summary>
                        <div className="mt-2 space-y-1.5 border-l border-line pl-3">
                          {current.word.definition.slice(0, 3).map((line) => (
                            <p key={line} className="text-xs leading-relaxed text-muted">
                              {line.replace(/\\n/g, ' ')}
                            </p>
                          ))}
                        </div>
                      </details>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="hint"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    className="mt-12 flex flex-col items-center gap-2 text-faint"
                  >
                    <span className="h-px w-10 bg-line-strong" />
                    <span className="kicker">点击卡片或按空格查看释义</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {revealed && preview ? (
              <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {GRADES.map((grade) => (
                  <button
                    key={grade.key}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleRate(grade.key)
                    }}
                    className={`group relative flex flex-col items-start justify-between gap-4 overflow-hidden rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] active:translate-y-0 active:scale-[0.995] ${grade.card}`}
                  >
                    <span
                      className={`absolute inset-y-3 left-0 w-[2px] rounded-r-full opacity-80 transition-opacity group-hover:opacity-100 ${grade.accent}`}
                    />
                    <span className="flex w-full items-center justify-between gap-2 pl-2.5">
                      <span className="display text-[1.02rem] leading-none text-ink">
                        {grade.label}
                      </span>
                      <span className="flex h-5 w-5 items-center justify-center rounded-md border border-line bg-paper/70 text-[9px] tabular-nums text-faint transition-colors group-hover:border-line-strong group-hover:text-muted">
                        {grade.keyHint}
                      </span>
                    </span>
                    <span className="pl-2.5 text-[10px] tracking-wide text-muted">
                      {preview[grade.key]}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-faint">
                <span className="hidden sm:inline">空格查看释义 · 1-4 选择 · S 发音</span>
                <span className="sm:hidden">轻触卡片查看释义</span>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
