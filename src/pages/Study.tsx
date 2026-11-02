import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, Sparkles } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { useBookData } from '../hooks/useBookData'
import { useLearningSteps } from '../hooks/useLearningSteps'
import { useRegistry } from '../hooks/useRegistry'
import { cardKey, useAppStore } from '../store/appStore'
import type { GradeKey, SessionCard, WordBook } from '../types'
import { buildExtraNewCards, buildQueue, bookStats, getQueuePlan } from '../lib/stats'
import { cardFromRecord, previewIntervals, repeatStage } from '../lib/fsrs'
import { isIntroducedToday } from '../lib/reviewMetrics'
import { speakWord, speech } from '../lib/speech'
import { EMPTY_RESULTS, IN_SESSION_WAIT_LIMIT_MS, type Results } from './study/labels'
import { SessionCard as StudyCard } from './study/SessionCard'
import { SessionIdle } from './study/SessionIdle'
import { SessionSummary } from './study/SessionSummary'
import { SessionWaiting } from './study/SessionWaiting'

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
      setFallbackNotice(`当前词书「${bookId}」已不存在，已切换到《${fallback.nameZh}》。`)
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
    results.ratings > 0 || mainQueue.length > 0 || learning.length > 0 || pending.length > 0
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
        if (target instanceof HTMLElement && ['BUTTON', 'A', 'SUMMARY'].includes(target.tagName)) {
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
    return (
      <SessionWaiting
        pendingCount={pending.length}
        waitMs={Math.max(0, (pending[0]?.dueAt ?? now) - now)}
        progressPercent={progressPercent}
        canAddMore={canAddMore}
        onAddExtra={addExtra}
      />
    )
  }

  if (!current && pending.length === 0 && hasSessionWork) {
    return (
      <SessionSummary
        book={book}
        results={results}
        stats={bookStats(book, progress)}
        backlog={plan.reviewBacklog + plan.learningDue}
        startedAt={startedAt}
        onStart={startSession}
      />
    )
  }

  if (!current) {
    return (
      <SessionIdle
        book={book}
        stats={bookStats(book, progress)}
        backlog={plan.reviewBacklog + plan.learningDue}
        onStart={startSession}
      />
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
        <StudyCard
          animationKey={`${current.word.id}-${results.ratings}`}
          word={current.word}
          stage={stage}
          remaining={remaining}
          revealed={revealed}
          meanings={meanings}
          hiddenMeanings={hiddenMeanings}
          showDefinition={settings.showDefinition}
          preview={preview}
          accent={settings.accent}
          rate={settings.rate}
          onReveal={() => {
            if (!revealed && currentKey) setRevealedKey(currentKey)
          }}
          onRate={handleRate}
          onShowAll={() => {
            if (currentKey) setMeaningsKey(currentKey)
          }}
          onAccent={(accent) => setSetting('accent', accent)}
        />
      </AnimatePresence>
    </div>
  )
}
