import { useCallback, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, FileText, History } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { useLibraryHydrated } from '../components/library/useLibraryHydrated'
import { useArticleDraft, type ArticleDraft } from '../hooks/useArticleDraft'
import { countWords } from '../lib/reader'
import { MAX_CHAPTER_CHARS, useLibraryStore } from '../store/libraryStore'
import type { Book, Chapter } from '../types'

function formatClock(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface ChapterEditorProps {
  book: Book
  chapter: Chapter
  index: number
}

function ChapterEditor({ book, chapter, index }: ChapterEditorProps) {
  const updateChapter = useLibraryStore((state) => state.updateChapter)
  const navigate = useNavigate()
  const [title, setTitle] = useState(chapter.title)
  const [text, setText] = useState(chapter.text)
  const [error, setError] = useState<string | null>(null)

  const applyDraft = useCallback((draft: ArticleDraft) => {
    setTitle(draft.title)
    setText(draft.text)
    setError(null)
  }, [])

  const { pendingDraft, restoreDraft, discardDraft, clearDraft } = useArticleDraft({
    articleId: chapter.id,
    title,
    text,
    source: book.title,
    onRestore: applyDraft,
  })

  const words = countWords(text)
  const tooLong = text.length > MAX_CHAPTER_CHARS
  const blank = text.trim().length === 0

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (blank) {
      setError('正文不能为空。')
      return
    }
    if (tooLong) {
      setError('这一章太长了，请拆成两章，或把内容控制在 20 万字符以内。')
      return
    }
    const updated = updateChapter(book.id, chapter.id, { title, text })
    if (!updated) {
      setError('章节已经不存在了，可能已被删除。')
      return
    }
    clearDraft()
    navigate(`/read/${updated.id}`)
  }

  return (
    <div className="space-y-5">
      <Link
        to={`/library/${book.id}`}
        className="inline-flex items-center gap-2 text-xs text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} strokeWidth={1.8} />
        返回《{book.title}》
      </Link>

      <form onSubmit={submit} className="surface-card overflow-hidden">
        {pendingDraft && (
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-accent-wash px-6 py-3 sm:px-8">
            <History size={15} className="shrink-0 text-accent" strokeWidth={1.8} />
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-soft">
              发现未保存的草稿（保存于 {formatClock(pendingDraft.savedAt)}）
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-medium text-ink transition-colors hover:border-accent/40 hover:text-accent"
                onClick={restoreDraft}
              >
                恢复
              </button>
              <button
                type="button"
                className="rounded-full px-3 py-1 text-[11px] text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                onClick={discardDraft}
              >
                丢弃
              </button>
            </div>
          </div>
        )}

        <div className="border-b border-line px-6 py-6 sm:px-8">
          <p className="kicker">Edit chapter</p>
          <h2 className="display mt-2 text-2xl text-ink">{chapter.title}</h2>
          <p className="mt-2 text-xs text-muted">
            来自《{book.title}》 · 第 {index + 1} 章
          </p>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <label className="block">
            <span className="text-[11px] font-medium tracking-wide text-muted">章节标题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              className="input mt-2"
              placeholder="留空会保存为「未命名章节」"
            />
          </label>

          <label className="mt-5 block">
            <span className="flex items-center justify-between text-[11px] font-medium tracking-wide text-muted">
              <span>正文</span>
              <span className="flex items-center gap-1.5 font-normal text-faint">
                <FileText size={12} strokeWidth={1.8} />
                {book.title}
              </span>
            </span>
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.currentTarget.value)
                if (error) setError(null)
              }}
              className="input mt-2 min-h-[24rem] resize-y px-5 py-4 leading-relaxed"
              placeholder="在这里粘贴或输入这一章的英文正文。"
              spellCheck={false}
            />
          </label>

          {error && <p className="mt-3 text-xs text-accent">{error}</p>}

          <div className="mt-5 flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-faint">
              {words > 0 ? `${words.toLocaleString('zh-CN')} 个词` : '还没有内容'}
              {tooLong && (
                <span className="ml-2 text-accent">
                  超过 {MAX_CHAPTER_CHARS.toLocaleString('zh-CN')} 字符，请先精简
                </span>
              )}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate(`/library/${book.id}`)}
              >
                取消
              </button>
              <button type="submit" className="btn btn-primary" disabled={blank || tooLong}>
                保存章节
                <ArrowRight size={15} strokeWidth={1.8} />
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

export default function EditChapter() {
  const { bookId, chapterId } = useParams<{ bookId: string; chapterId: string }>()
  const hydrated = useLibraryHydrated()
  const books = useLibraryStore((state) => state.books)

  const book = books.find((item) => item.id === bookId)
  const index = book ? book.chapters.findIndex((chapter) => chapter.id === chapterId) : -1
  const chapter = book && index >= 0 ? book.chapters[index] : undefined

  if (!hydrated) {
    return (
      <div className="animate-pulse space-y-5">
        <div className="h-4 w-24 rounded-full bg-sunken/70" />
        <div className="surface-card overflow-hidden">
          <div className="border-b border-line px-6 py-6 sm:px-8">
            <div className="h-3 w-20 rounded-full bg-sunken" />
            <div className="mt-3 h-7 w-40 rounded-full bg-sunken" />
          </div>
          <div className="space-y-5 px-6 py-6 sm:px-8">
            <div className="h-10 rounded-xl bg-sunken/70" />
            <div className="h-96 rounded-xl bg-sunken/60" />
          </div>
        </div>
      </div>
    )
  }

  if (!book || !chapter) {
    return (
      <EmptyState
        icon={FileText}
        title="章节没有找到"
        description="它可能已经被删除，或者链接不完整。"
        action={
          <Link to="/library" className="btn btn-primary">
            回到书架
          </Link>
        }
      />
    )
  }

  return <ChapterEditor key={chapter.id} book={book} chapter={chapter} index={index} />
}
