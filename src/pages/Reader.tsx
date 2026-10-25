import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { ArrowLeft, BookOpenText, Languages, Minus, MousePointer2, Pencil, Plus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { HoverPreview } from '../components/reader/HoverPreview'
import { ReaderText } from '../components/reader/ReaderText'
import { SelectionAction } from '../components/reader/SelectionAction'
import { WordPanel } from '../components/reader/WordPanel'
import type { ReaderLookup, ReaderRect } from '../components/reader/types'
import { useReaderDictionary } from '../hooks/useReaderDictionary'
import { formatShortDate } from '../lib/date'
import { isPhraseSelection, readingMinutes } from '../lib/reader'
import { useReaderHydrated } from '../lib/useReaderHydrated'
import { useAppStore } from '../store/appStore'
import { useReaderStore } from '../store/readerStore'
import { useReaderProgressStore } from '../store/readerProgressStore'
import type { ReaderArticle, WordEntry } from '../types'

interface HoverState {
  word: string
  entry: WordEntry
  rect: ReaderRect
}

interface SelectionState {
  text: string
  rect: ReaderRect
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
}: {
  loading: boolean
  error: string | null
  wordCount: number
  phraseCount: number
}) {
  if (loading) {
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
        <p className="mt-3 text-xs leading-relaxed text-accent">{error}</p>
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

function ReaderView({ article }: { article: ReaderArticle }) {
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
  const dictionary = useReaderDictionary()

  const articleRef = useRef<HTMLElement>(null)
  const [initialProgress] = useState(savedProgress)
  const progressRef = useRef(savedProgress)
  const saveTimer = useRef<number | undefined>(undefined)
  const hoverTimer = useRef<number | undefined>(undefined)
  const hideTimer = useRef<number | undefined>(undefined)

  const [panel, setPanel] = useState<ReaderLookup | null>(null)
  const [activeToken, setActiveToken] = useState<{ paragraph: number; token: number } | null>(null)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [selectionAction, setSelectionAction] = useState<SelectionState | null>(null)
  const [displayProgress, setDisplayProgress] = useState(savedProgress)

  const closePanel = useCallback(() => {
    setPanel(null)
    setActiveToken(null)
  }, [])

  const openWord = useCallback(
    (raw: string, token?: { paragraph: number; token: number }) => {
      setPanel({
        kind: 'word',
        query: raw,
        entry: dictionary.lookupWord(raw),
        words: [],
      })
      setActiveToken(token ?? null)
      setHover(null)
      setSelectionAction(null)
    },
    [dictionary],
  )

  const openPhrase = useCallback(
    (raw: string) => {
      setPanel({
        kind: 'phrase',
        query: raw,
        entry: dictionary.lookupPhrase(raw),
        words: dictionary.lookupWordsInPhrase(raw),
      })
      setActiveToken(null)
      setHover(null)
      setSelectionAction(null)
      window.getSelection()?.removeAllRanges()
    },
    [dictionary],
  )

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

  const updateProgress = useCallback(() => {
    const element = articleRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const total = Math.max(1, rect.height - window.innerHeight)
    const next = Math.min(1, Math.max(0, -rect.top / total))
    progressRef.current = next
    setDisplayProgress(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      setArticleProgress(article.id, progressRef.current)
    }, 600)
  }, [article.id, setArticleProgress])

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        updateProgress()
        setHover(null)
        setSelectionAction(null)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [updateProgress])

  useEffect(() => {
    if (initialProgress <= 0) return
    let cancelled = false
    const restore = () => {
      const element = articleRef.current
      if (!element || cancelled) return
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
  }, [initialProgress])

  useEffect(() => {
    const save = () => setArticleProgress(article.id, progressRef.current)
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
    if (!panel) return
    if (!window.matchMedia('(max-width: 1023px)').matches) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [panel])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setPanel(null)
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
      const entry = dictionary.lookupWord(raw)
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
    openWord(raw, { paragraph, token })
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

  const percent = Math.round(displayProgress * 100)

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 border-b border-line/70 bg-paper/85 backdrop-blur-xl sm:-mx-6 lg:-mx-10">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <Link to="/read" className="icon-button -ml-1 shrink-0" aria-label="回到阅读库">
            <ArrowLeft size={18} strokeWidth={1.8} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="kicker">Reading</p>
            <p className="truncate text-xs text-muted">{article.title}</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-[10px] tabular-nums text-faint">{percent}%</span>
            <div className="h-1 w-16 overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          <Link
            to={`/read/${article.id}/edit`}
            className="icon-button h-8 w-8 shrink-0"
            aria-label="编辑文章"
            title="编辑文章"
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
        <div className="h-px bg-line/70">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article ref={articleRef} className="surface-card px-6 py-10 sm:px-10 lg:px-14">
          <div className="mx-auto max-w-[42rem]">
            <header className="border-b border-line pb-8">
              <p className="kicker">Reading</p>
              <h1 className="display mt-3 text-[2.2rem] leading-[1.08] text-ink sm:text-[2.8rem]">
                {article.title}
              </h1>
              <p className="mt-4 text-[11px] text-faint">
                {article.source} · {article.wordCount.toLocaleString('zh-CN')} 词 ·{' '}
                {readingMinutes(article.wordCount)} 分钟 ·{' '}
                {formatShortDate(new Date(article.createdAt))}
              </p>
              <p className="mt-3 text-[11px] leading-relaxed text-faint sm:hidden">
                轻点单词查看释义，长按选择多个词查短语。
              </p>
            </header>

            <div
              className="pt-8"
              onMouseOver={handleMouseOver}
              onMouseOut={handleMouseOut}
              onMouseUp={handleMouseUp}
              onClick={handleClick}
            >
              <ReaderText text={article.text} fontSize={fontSize} activeToken={activeToken} />
            </div>

            <footer className="mt-12 flex items-center gap-3 border-t border-line pt-5 text-[10px] text-faint">
              <span className="h-px w-8 bg-accent" />
              读到这里
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
                onAdd={addEntry}
                onOpenWord={openWord}
                onClose={closePanel}
              />
            ) : (
              <ReaderHint
                loading={dictionary.loading}
                error={dictionary.error}
                wordCount={dictionary.wordCount}
                phraseCount={dictionary.phraseCount}
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
  const hydrated = useReaderHydrated()
  const articles = useReaderStore((state) => state.articles)
  const article = articles.find((item) => item.id === articleId)

  if (!hydrated) return <ReaderSkeleton />

  if (!article) {
    return (
      <EmptyState
        icon={BookOpenText}
        title="文章没有找到"
        description="它可能已经被删除，或者链接不完整。"
        action={
          <Link to="/read" className="btn btn-primary">
            回到阅读库
          </Link>
        }
      />
    )
  }

  return <ReaderView key={article.id} article={article} />
}
