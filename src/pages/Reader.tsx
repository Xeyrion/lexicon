import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react'
import { ArrowLeft, ArrowRight, BookOpenText, Languages, Minus, MousePointer2, Pencil, Plus } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { HoverPreview } from '../components/reader/HoverPreview'
import { ReaderProgress, type ReaderProgressStore } from '../components/reader/ReaderProgress'
import { ReaderText, ReaderTitle } from '../components/reader/ReaderText'
import { SelectionAction } from '../components/reader/SelectionAction'
import { WordPanel } from '../components/reader/WordPanel'
import type { ReaderLookup, ReaderRect } from '../components/reader/types'
import { useReaderDictionary } from '../hooks/useReaderDictionary'
import { findChapter, useLibraryStore } from '../store/libraryStore'
import { formatShortDate } from '../lib/date'
import { isPhraseSelection, readingMinutes } from '../lib/reader'
import { useReaderHydrated } from '../lib/useReaderHydrated'
import { useAppStore } from '../store/appStore'
import { useReaderStore } from '../store/readerStore'
import { useReaderProgressStore } from '../store/readerProgressStore'
import type { ReaderAnchor, ReaderArticle, WordEntry } from '../types'

interface HoverState {
  word: string
  entry: WordEntry
  rect: ReaderRect
}

interface SelectionState {
  text: string
  rect: ReaderRect
}

interface ReaderPanelQuery {
  kind: 'word' | 'phrase'
  query: string
}

function createReaderProgressStore(initialProgress: number): ReaderProgressStore {
  let percent = Math.round(Math.min(1, Math.max(0, initialProgress)) * 100)
  const listeners = new Set<() => void>()

  return {
    getPercent: () => percent,
    setPercent: (next) => {
      const clamped = Math.min(100, Math.max(0, next))
      if (clamped === percent) return
      percent = clamped
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Restoring puts the anchor token this far below the viewport top. */
const ANCHOR_OFFSET = 96

/**
 * Finds the first word the reader can actually see. Probing by point beats
 * walking every token: one layout read per frame instead of hundreds.
 */
function readAnchor(container: HTMLElement): ReaderAnchor | null {
  const rect = container.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  if (x < 0 || x > window.innerWidth) return null
  const start = Math.max(rect.top, ANCHOR_OFFSET)
  for (let y = start + 12; y < start + 160; y += 24) {
    if (y > window.innerHeight) break
    const element = document.elementFromPoint(x, y)
    const word = element?.closest<HTMLElement>('[data-word]')
    if (!word) continue
    const paragraph = Number(word.dataset.paragraph)
    const token = Number(word.dataset.token)
    if (Number.isInteger(paragraph) && Number.isInteger(token) && token >= 0) {
      return { paragraph, token }
    }
  }
  return null
}

/**
 * 在 rAF 中测量文章滚动进度，只写入独立 store（百分比变化时才通知进度条），
 * 避免每帧重渲染整个阅读页。
 */
function useReaderProgressTracker(
  store: ReaderProgressStore,
  articleRef: RefObject<HTMLElement | null>,
  initialProgress: number,
  onProgress: (progress: number, anchor: ReaderAnchor | null) => void,
) {
  useEffect(() => {
    let frame = 0

    const measure = () => {
      const element = articleRef.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      // 不足一屏的短文直接视为读完，避免永远停在 0%。
      const progress = total <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / total))
      onProgress(progress, readAnchor(element))
      store.setPercent(Math.round(progress * 100))
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }

    // 有保存进度时先让恢复滚动触发测量，避免挂载瞬间把进度闪成 0%。
    if (initialProgress <= 0) measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [articleRef, initialProgress, onProgress, store])
}

function toRect(rect: DOMRect): ReaderRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

function ReaderSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-12 rounded-2xl bg-sunken/70" />
      <div className="surface-card h-[34rem] p-8">
        <div className="mx-auto h-full max-w-2xl space-y-4">
          <div className="h-8 w-2/3 rounded-full bg-sunken" />
          <div className="h-4 w-1/3 rounded-full bg-sunken/70" />
          <div className="mt-10 space-y-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-3 rounded-full bg-sunken/60" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReaderHint({
  loading,
  error,
  wordCount,
  phraseCount,
  onRetry,
}: {
  loading: boolean
  error: string | null
  wordCount: number
  phraseCount: number
  onRetry: () => void
}) {
  if (loading && !error) {
    return (
      <div className="surface-flat animate-pulse p-5">
        <div className="h-3 w-20 rounded-full bg-sunken" />
        <div className="mt-4 h-5 w-36 rounded-full bg-sunken" />
        <div className="mt-4 space-y-2">
          <div className="h-3 rounded-full bg-sunken/70" />
          <div className="h-3 w-4/5 rounded-full bg-sunken/70" />
        </div>
      </div>
    )
  }

  return (
    <div className="surface-flat p-5">
      <p className="kicker">Dictionary</p>
      <p className="display mt-3 text-xl text-ink">读的时候，随手查</p>
      {error ? (
        <div className="mt-3">
          <p className="text-xs leading-relaxed text-accent">{error}</p>
          <button type="button" className="btn btn-secondary mt-3 w-full" onClick={onRetry}>
            重试加载
          </button>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-2.5 text-[11px] leading-relaxed text-muted">
            <li className="flex items-start gap-2">
              <MousePointer2 size={13} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.8} />
              悬停单词，看简要释义
            </li>
            <li className="flex items-start gap-2">
              <BookOpenText size={13} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.8} />
              点击单词，固定完整词条
            </li>
            <li className="flex items-start gap-2">
              <Languages size={13} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.8} />
              选中多个词，查短语
            </li>
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-[10px] text-faint">
            {wordCount.toLocaleString('zh-CN')} 个词条 · {phraseCount.toLocaleString('zh-CN')} 个短语
          </p>
        </>
      )}
    </div>
  )
}

interface ChapterNav {
  bookId: string
  bookTitle: string
  index: number
  total: number
  prevId?: string
  nextId?: string
}

function ReaderView({
  article,
  fromStart,
  nav,
}: {
  article: ReaderArticle
  fromStart: boolean
  nav?: ChapterNav
}) {
  const fontSize = useReaderStore((state) => state.settings.fontSize)
  const setFontSize = useReaderStore((state) => state.setFontSize)
  const setArticleProgress = useReaderProgressStore((state) => state.setProgress)
  const touchArticle = useReaderProgressStore((state) => state.touch)
  const progressRecord = useReaderProgressStore((state) => state.items[article.id])
  const savedProgress = progressRecord?.progress ?? article.progress
  const accent = useAppStore((state) => state.settings.accent)
  const rate = useAppStore((state) => state.settings.rate)
  const personalWords = useAppStore((state) => state.personalWords)
  const addPersonalWord = useAppStore((state) => state.addPersonalWord)
  const {
    lookupWord,
    lookupPhrase,
    lookupWordsInPhrase,
    loading: dictionaryLoading,
    wordLoading,
    phraseLoading,
    wordError,
    phraseError,
    wordCount,
    phraseCount,
    retry: retryDictionary,
  } = useReaderDictionary()

  const dictionaryErrorText = wordError
    ? `单词词典加载失败：${wordError}${phraseError ? `；短语词典也加载失败：${phraseError}` : ''}`
    : phraseError
      ? `短语词典加载失败：${phraseError}（单词查询不受影响）`
      : null

  const articleRef = useRef<HTMLElement>(null)
  const [initialProgress] = useState(() => (fromStart ? 0 : savedProgress))
  // Captured once: if this came from the live store, every scroll update would
  // re-run the restore effect and yank the page back.
  const [initialAnchor] = useState<ReaderAnchor | null>(() =>
    fromStart ? null : (progressRecord?.anchor ?? article.anchor ?? null),
  )
  const progressRef = useRef(initialProgress)
  const anchorRef = useRef<ReaderAnchor | null>(initialAnchor)
  const [progressStore] = useState(() => createReaderProgressStore(initialProgress))
  const saveTimer = useRef<number | undefined>(undefined)
  const hoverTimer = useRef<number | undefined>(undefined)
  const hideTimer = useRef<number | undefined>(undefined)

  const [panelQuery, setPanelQuery] = useState<ReaderPanelQuery | null>(null)
  const [activeToken, setActiveToken] = useState<{ paragraph: number; token: number } | null>(null)
  const [focusToken, setFocusToken] = useState<
    { paragraph: number; token: number; word: string } | null
  >(null)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [selectionAction, setSelectionAction] = useState<SelectionState | null>(null)
  const panelOpen = panelQuery !== null

  // 词条只在查询时记录 query，词典加载完成后自动按最新词典重算。
  const panel = useMemo<ReaderLookup | null>(() => {
    if (!panelQuery) return null
    if (panelQuery.kind === 'phrase') {
      return {
        ...panelQuery,
        entry: lookupPhrase(panelQuery.query),
        words: lookupWordsInPhrase(panelQuery.query),
      }
    }
    return {
      ...panelQuery,
      entry: lookupWord(panelQuery.query),
      words: [],
    }
  }, [lookupPhrase, lookupWord, lookupWordsInPhrase, panelQuery])

  const closePanel = useCallback(() => {
    setPanelQuery(null)
    setActiveToken(null)
  }, [])

  const openWord = useCallback(
    (raw: string, token?: { paragraph: number; token: number }) => {
      setPanelQuery({ kind: 'word', query: raw })
      setActiveToken(token ?? null)
      setHover(null)
      setSelectionAction(null)
    },
    [],
  )

  const openPhrase = useCallback((raw: string) => {
    setPanelQuery({ kind: 'phrase', query: raw })
    setActiveToken(null)
    setHover(null)
    setSelectionAction(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  const addEntry = useCallback(
    (entry: WordEntry) =>
      addPersonalWord({
        word: entry.word,
        trans: entry.trans,
        phoneticUS: entry.phoneticUS,
        phoneticUK: entry.phoneticUK,
        phoneticAlt: entry.phoneticAlt,
      }),
    [addPersonalWord],
  )

  useEffect(() => {
    touchArticle(article.id, article.progress)
  }, [article.id, article.progress, touchArticle])

  const handleProgress = useCallback(
    (next: number, anchor: ReaderAnchor | null) => {
      progressRef.current = next
      // A probe that lands between words returns null; keep the last good one.
      if (anchor) anchorRef.current = anchor
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        setArticleProgress(article.id, progressRef.current, anchorRef.current)
      }, 600)
    },
    [article.id, setArticleProgress],
  )

  useEffect(() => {
    if (!hover && !selectionAction) return
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        setHover(null)
        setSelectionAction(null)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [hover, selectionAction])

  useEffect(() => {
    if (fromStart) {
      setArticleProgress(article.id, 0, null)
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    if (initialProgress <= 0 && !initialAnchor) return
    let cancelled = false
    const restore = () => {
      const element = articleRef.current
      if (!element || cancelled) return
      // The anchor wins: it survives font/image reflow, the percentage does not.
      if (initialAnchor) {
        const target = element.querySelector<HTMLElement>(
          `[data-paragraph="${initialAnchor.paragraph}"][data-token="${initialAnchor.token}"]`,
        )
        if (target) {
          const top =
            window.scrollY + target.getBoundingClientRect().top - ANCHOR_OFFSET
          window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
          return
        }
      }
      const rect = element.getBoundingClientRect()
      const total = Math.max(0, rect.height - window.innerHeight)
      const top = window.scrollY + rect.top + total * initialProgress
      window.scrollTo({ top, behavior: 'instant' })
    }
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(restore)
    })
    if (document.fonts) void document.fonts.ready.then(restore)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [article.id, fromStart, initialAnchor, initialProgress, setArticleProgress])

  useReaderProgressTracker(progressStore, articleRef, initialProgress, handleProgress)

  useEffect(() => {
    const save = () => setArticleProgress(article.id, progressRef.current, anchorRef.current)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save()
    }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', onVisibility)
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      save()
    }
  }, [article.id, setArticleProgress])

  useEffect(() => {
    if (!panelOpen) return
    if (!window.matchMedia('(max-width: 1023px)').matches) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [panelOpen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setPanelQuery(null)
      setActiveToken(null)
      setHover(null)
      setSelectionAction(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [])

  const handleMouseOver = (event: ReactMouseEvent<HTMLElement>) => {
    if (window.matchMedia('(hover: none)').matches) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-word]')
    if (!target) return
    const raw = target.dataset.word
    if (!raw) return
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hoverTimer.current = window.setTimeout(() => {
      const entry = lookupWord(raw)
      if (!entry) return
      setHover({ word: raw, entry, rect: toRect(target.getBoundingClientRect()) })
    }, 280)
  }

  const handleMouseOut = (event: ReactMouseEvent<HTMLElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-word]')
    if (!target) return
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    hideTimer.current = window.setTimeout(() => setHover(null), 80)
  }

  const handleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-word]')
    if (!target) return
    const raw = target.dataset.word
    if (!raw) return
    const paragraph = Number(target.dataset.paragraph)
    const token = Number(target.dataset.token)
    setFocusToken({ paragraph, token, word: raw })
    openWord(raw, { paragraph, token })
  }

  /** Moves the keyboard cursor one word at a time, in DOM order. */
  const moveFocus = useCallback(
    (delta: number) => {
      const container = articleRef.current
      if (!container) return
      const words = [...container.querySelectorAll<HTMLElement>('[data-word]')]
      if (words.length === 0) return
      const current = focusToken
        ? words.findIndex(
            (word) =>
              Number(word.dataset.paragraph) === focusToken.paragraph &&
              Number(word.dataset.token) === focusToken.token,
          )
        : -1
      const next =
        current < 0
          ? delta > 0
            ? 0
            : words.length - 1
          : Math.min(words.length - 1, Math.max(0, current + delta))
      const element = words[next]
      const paragraph = Number(element.dataset.paragraph)
      const token = Number(element.dataset.token)
      setFocusToken({ paragraph, token, word: element.dataset.word ?? '' })
      element.scrollIntoView({ block: 'nearest' })
    },
    [focusToken],
  )

  const handleArticleFocus = useCallback(() => {
    if (focusToken) return
    const container = articleRef.current
    if (!container) return
    const anchor = readAnchor(container)
    if (!anchor) return
    const element = container.querySelector<HTMLElement>(
      `[data-paragraph="${anchor.paragraph}"][data-token="${anchor.token}"]`,
    )
    setFocusToken({ ...anchor, word: element?.dataset.word ?? '' })
  }, [focusToken])

  const handleArticleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      // Let the page keep vertical scrolling; only hijack the horizontal keys.
      event.preventDefault()
      moveFocus(event.key === 'ArrowRight' ? 1 : -1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (!focusToken) return
      event.preventDefault()
      openWord(focusToken.word, { paragraph: focusToken.paragraph, token: focusToken.token })
    }
  }

  const handleMouseUp = () => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) {
      setSelectionAction(null)
      return
    }
    const text = selection.toString().trim()
    if (!isPhraseSelection(text)) {
      setSelectionAction(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!articleRef.current?.contains(range.commonAncestorContainer)) {
      setSelectionAction(null)
      return
    }
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      setSelectionAction(null)
      return
    }
    setHover(null)
    setSelectionAction({ text, rect: toRect(rect) })
  }

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 border-b border-line/70 bg-paper/85 backdrop-blur-xl sm:-mx-6 lg:-mx-10">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <Link
            to={nav ? `/library/${nav.bookId}` : '/read'}
            className="icon-button -ml-1 shrink-0"
            aria-label={nav ? '回到目录' : '回到阅读库'}
          >
            <ArrowLeft size={18} strokeWidth={1.8} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="kicker">{nav ? nav.bookTitle : 'Reading'}</p>
            <p className="truncate text-xs text-muted">
              {nav ? `${nav.index + 1}/${nav.total} · ${article.title}` : article.title}
            </p>
          </div>
          <ReaderProgress store={progressStore} variant="inline" />
          <Link
            to={
              nav
                ? `/library/${nav.bookId}/chapters/${article.id}/edit`
                : `/read/${article.id}/edit`
            }
            className="icon-button h-8 w-8 shrink-0"
            aria-label={nav ? '编辑本章' : '编辑文章'}
            title={nav ? '编辑本章' : '编辑文章'}
          >
            <Pencil size={15} strokeWidth={1.8} />
          </Link>
          <div className="flex items-center gap-0.5 rounded-full border border-line bg-surface/70 p-0.5">
            <button
              type="button"
              className="icon-button h-8 w-8"
              onClick={() => setFontSize(fontSize - 1)}
              disabled={fontSize <= 16}
              aria-label="缩小字号"
            >
              <Minus size={14} strokeWidth={1.8} />
            </button>
            <span className="w-7 text-center text-[10px] tabular-nums text-faint">{fontSize}</span>
            <button
              type="button"
              className="icon-button h-8 w-8"
              onClick={() => setFontSize(fontSize + 1)}
              disabled={fontSize >= 26}
              aria-label="放大字号"
            >
              <Plus size={14} strokeWidth={1.8} />
            </button>
          </div>
        </div>
        <ReaderProgress store={progressStore} variant="bar" />
      </div>

      <div className="grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article
          ref={articleRef}
          className="reader-surface surface-card px-6 py-10 sm:px-10 lg:px-14"
          tabIndex={0}
          aria-label="文章正文。左右方向键在单词间移动，回车查看释义，Esc 关闭词条。"
          onFocus={handleArticleFocus}
          onKeyDown={handleArticleKeyDown}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
        >
          <span className="sr-only" aria-live="polite">
            {focusToken ? `当前单词：${focusToken.word}` : ''}
          </span>
          <div className="mx-auto max-w-[42rem]">
            <header className="border-b border-line pb-8">
              <p className="kicker">Reading</p>
              <h1 className="display mt-3 text-[2.2rem] leading-[1.08] text-ink sm:text-[2.8rem]">
                <ReaderTitle
                  text={article.title}
                  activeToken={activeToken}
                  focusToken={focusToken}
                />
              </h1>
              <p className="mt-4 text-[11px] text-faint">
                {article.source} · {article.wordCount.toLocaleString('zh-CN')} 词 ·{' '}
                {readingMinutes(article.wordCount)} 分钟 ·{' '}
                {formatShortDate(new Date(article.createdAt))}
              </p>
              <p className="mt-3 text-[11px] leading-relaxed text-faint sm:hidden">
                轻点单词查看释义，长按选择多个词查短语。
              </p>
              <p className="mt-3 hidden text-[11px] leading-relaxed text-faint sm:block">
                点击单词查看释义，拖选多个词查短语；用 Tab 进入正文后，方向键选词、回车查词。
              </p>
            </header>

            {(dictionaryLoading || wordError || phraseError) && (
              <div className="mt-5 rounded-xl border border-line bg-sunken/50 px-4 py-3 text-[11px] leading-relaxed text-muted lg:hidden">
                {wordError && <p className="text-accent">单词词典加载失败：{wordError}</p>}
                {phraseError && (
                  <p className={wordError ? 'mt-1 text-accent' : 'text-accent'}>
                    短语词典加载失败：{phraseError}
                    {!wordError ? '（单词查询不受影响）' : ''}
                  </p>
                )}
                {!wordError && !phraseError && (
                  <p>正在加载阅读词典…首次加载约 7 MB，加载完成后即可点击单词或短语查询。</p>
                )}
                {(wordError || phraseError) && (
                  <button
                    type="button"
                    className="btn btn-secondary mt-2"
                    onClick={retryDictionary}
                  >
                    重试加载
                  </button>
                )}
              </div>
            )}

            <div className="pt-8">
              <ReaderText
                text={article.text}
                fontSize={fontSize}
                activeToken={activeToken}
                focusToken={focusToken}
              />
            </div>

            <footer className="mt-12 border-t border-line pt-5">
              <div className="flex items-center gap-3 text-[10px] text-faint">
                <span className="h-px w-8 bg-accent" />
                读到这里
              </div>
              {nav && (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {nav.prevId ? (
                    <Link to={`/read/${nav.prevId}`} className="btn btn-secondary">
                      <ArrowLeft size={14} strokeWidth={1.8} />
                      上一章
                    </Link>
                  ) : null}
                  <Link to={`/library/${nav.bookId}`} className="btn btn-ghost">
                    目录
                  </Link>
                  {nav.nextId ? (
                    <Link to={`/read/${nav.nextId}`} className="btn btn-primary">
                      下一章
                      <ArrowRight size={14} strokeWidth={1.8} />
                    </Link>
                  ) : null}
                </div>
              )}
            </footer>
          </div>
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            {panel ? (
              <WordPanel
                key={`${panel.kind}:${panel.query}`}
                lookup={panel}
                accent={accent}
                rate={rate}
                personalWords={personalWords}
                loading={panel.kind === 'word' ? wordLoading : phraseLoading}
                error={panel.kind === 'word' ? wordError : phraseError}
                onRetry={retryDictionary}
                onAdd={addEntry}
                onOpenWord={openWord}
                onClose={closePanel}
              />
            ) : (
              <ReaderHint
                loading={dictionaryLoading}
                error={dictionaryErrorText}
                wordCount={wordCount}
                phraseCount={phraseCount}
                onRetry={retryDictionary}
              />
            )}
          </div>
        </aside>
      </div>

      {hover && <HoverPreview word={hover.word} entry={hover.entry} rect={hover.rect} />}

      {selectionAction && (
        <SelectionAction
          text={selectionAction.text}
          rect={selectionAction.rect}
          onLookup={() => openPhrase(selectionAction.text)}
          onDismiss={() => setSelectionAction(null)}
        />
      )}

      {panel && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
            onClick={closePanel}
            aria-label="关闭词条"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-[1.75rem] border-t border-line bg-paper p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-float)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
            <WordPanel
              key={`${panel.kind}:${panel.query}`}
              lookup={panel}
              accent={accent}
              rate={rate}
              personalWords={personalWords}
              loading={panel.kind === 'word' ? wordLoading : phraseLoading}
              error={panel.kind === 'word' ? wordError : phraseError}
              onRetry={retryDictionary}
              onAdd={addEntry}
              onOpenWord={openWord}
              onClose={closePanel}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function Reader() {
  const { articleId } = useParams<{ articleId: string }>()
  const [searchParams] = useSearchParams()
  const fromStart = searchParams.get('from') === 'start'
  const hydrated = useReaderHydrated()
  const articles = useReaderStore((state) => state.articles)
  const books = useLibraryStore((state) => state.books)

  const article = articles.find((item) => item.id === articleId)
  // One route serves both: ids are uuids, and articles are checked first.
  const located = article ? null : findChapter(books, articleId ?? '')

  if (!hydrated) return <ReaderSkeleton />

  if (!article && !located) {
    return (
      <EmptyState
        icon={BookOpenText}
        title="内容没有找到"
        description="它可能已经被删除，或者链接不完整。"
        action={
          <Link to="/read" className="btn btn-primary">
            回到阅读库
          </Link>
        }
      />
    )
  }

  const document: ReaderArticle = article ?? {
    id: located!.chapter.id,
    title: located!.chapter.title,
    source: located!.book.title,
    text: located!.chapter.text,
    createdAt: located!.chapter.createdAt,
    updatedAt: located!.chapter.updatedAt,
    progress: 0,
    wordCount: located!.chapter.wordCount,
  }

  const nav: ChapterNav | undefined = located
    ? {
        bookId: located.book.id,
        bookTitle: located.book.title,
        index: located.index,
        total: located.book.chapters.length,
        prevId: located.book.chapters[located.index - 1]?.id,
        nextId: located.book.chapters[located.index + 1]?.id,
      }
    : undefined

  return (
    <ReaderView
      key={`${document.id}:${fromStart ? 'start' : 'resume'}`}
      article={document}
      fromStart={fromStart}
      nav={nav}
    />
  )
}
