import { ArrowDown, ArrowLeft, ArrowUp, Library as LibraryIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { InlineEdit } from '../components/library/InlineEdit'
import { useLibraryHydrated } from '../components/library/useLibraryHydrated'
import { bookProgress, useLibraryStore } from '../store/libraryStore'
import { useReaderProgressStore } from '../store/readerProgressStore'
import type { Book, Chapter } from '../types'

function chapterPercent(items: Record<string, { progress: number }>, id: string): number {
  return Math.round(Math.min(1, Math.max(0, items[id]?.progress ?? 0)) * 100)
}

interface ChapterRowProps {
  book: Book
  chapter: Chapter
  index: number
  percent: number
  onMove: (toIndex: number) => void
  onDelete: () => void
}

function ChapterRow({ book, chapter, index, percent, onMove, onDelete }: ChapterRowProps) {
  const last = book.chapters.length - 1

  return (
    <li className="group relative flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-muted sm:px-5">
      <Link
        to={`/read/${chapter.id}`}
        className="absolute inset-0 z-10"
        aria-label={`阅读 ${chapter.title}`}
      />
      <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-faint">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{chapter.title}</p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-faint">
          <span>{chapter.wordCount.toLocaleString('zh-CN')} 词</span>
          <span className="hidden h-1 w-16 overflow-hidden rounded-full bg-sunken sm:block">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${percent}%` }}
            />
          </span>
          <span>{percent >= 98 ? '已读完' : percent > 0 ? `${percent}%` : '未开始'}</span>
        </div>
      </div>
      <div className="relative z-20 flex shrink-0 items-center gap-0.5">
        <Link
          to={`/library/${book.id}/chapters/${chapter.id}/edit`}
          className="icon-button h-8 w-8 text-faint hover:text-accent"
          aria-label={`编辑 ${chapter.title}`}
          title="编辑章节"
        >
          <Pencil size={15} strokeWidth={1.8} />
        </Link>
        <button
          type="button"
          className="icon-button h-8 w-8 text-faint hover:text-accent disabled:pointer-events-none disabled:opacity-30"
          onClick={() => onMove(index - 1)}
          disabled={index === 0}
          aria-label={`上移 ${chapter.title}`}
          title="上移"
        >
          <ArrowUp size={15} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="icon-button h-8 w-8 text-faint hover:text-accent disabled:pointer-events-none disabled:opacity-30"
          onClick={() => onMove(index + 1)}
          disabled={index === last}
          aria-label={`下移 ${chapter.title}`}
          title="下移"
        >
          <ArrowDown size={15} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="icon-button h-8 w-8 text-faint hover:text-accent"
          onClick={onDelete}
          aria-label={`删除 ${chapter.title}`}
          title="删除章节"
        >
          <Trash2 size={15} strokeWidth={1.8} />
        </button>
      </div>
    </li>
  )
}

export default function BookDetail() {
  const { bookId } = useParams<{ bookId: string }>()
  const hydrated = useLibraryHydrated()
  const books = useLibraryStore((state) => state.books)
  const updateBook = useLibraryStore((state) => state.updateBook)
  const addChapter = useLibraryStore((state) => state.addChapter)
  const removeChapter = useLibraryStore((state) => state.removeChapter)
  const moveChapter = useLibraryStore((state) => state.moveChapter)
  const progressItems = useReaderProgressStore((state) => state.items)
  const navigate = useNavigate()

  const book = books.find((item) => item.id === bookId)

  if (!hydrated) {
    return (
      <div className="animate-pulse space-y-5">
        <div className="h-4 w-24 rounded-full bg-sunken/70" />
        <div className="h-40 rounded-[1.75rem] bg-sunken/60" />
        <div className="h-64 rounded-2xl bg-sunken/50" />
      </div>
    )
  }

  if (!book) {
    return (
      <EmptyState
        icon={LibraryIcon}
        title="书籍没有找到"
        description="它可能已经被删除，或者链接不完整。"
        action={
          <Link to="/library" className="btn btn-primary">
            回到书架
          </Link>
        }
      />
    )
  }

  const words = book.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)
  const percent = Math.round(bookProgress(book, progressItems) * 100)

  const handleAddChapter = () => {
    const chapter = addChapter(book.id, { title: '新章节', text: '' })
    if (chapter) navigate(`/library/${book.id}/chapters/${chapter.id}/edit`)
  }

  return (
    <div className="space-y-7">
      <Link
        to="/library"
        className="inline-flex items-center gap-2 text-xs text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} strokeWidth={1.8} />
        返回书架
      </Link>

      <section className="surface-card p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="kicker">Book</p>
            <div className="mt-3">
              <InlineEdit
                value={book.title}
                label="书名"
                placeholder="书名"
                className="display max-w-full truncate text-[2rem] leading-tight text-ink"
                onSubmit={(title) => updateBook(book.id, { title })}
              />
            </div>
            <div className="mt-2">
              <InlineEdit
                value={book.author}
                label="作者"
                placeholder="作者"
                emptyText="添加作者"
                className="max-w-full truncate text-sm text-muted"
                onSubmit={(author) => updateBook(book.id, { author })}
              />
            </div>
            <p className="mt-3 text-xs text-faint">
              {book.chapters.length} 章 · 共 {words.toLocaleString('zh-CN')} 词
            </p>
          </div>
          <div className="w-full shrink-0 sm:w-56">
            <div className="flex items-center justify-between text-[11px] text-faint">
              <span>整书进度</span>
              <span>{percent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-700"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="kicker">Chapters</p>
            <h2 className="display mt-2 text-2xl text-ink">章节</h2>
          </div>
          <p className="text-xs text-faint">{book.chapters.length} 章</p>
        </div>

        {book.chapters.length === 0 ? (
          <EmptyState
            icon={LibraryIcon}
            title="还没有章节"
            description="添加一章，或者回到书架重新导入这本书。"
          />
        ) : (
          <ul className="surface-card divide-y divide-line overflow-hidden">
            {book.chapters.map((chapter, index) => (
              <ChapterRow
                key={chapter.id}
                book={book}
                chapter={chapter}
                index={index}
                percent={chapterPercent(progressItems, chapter.id)}
                onMove={(toIndex) => moveChapter(book.id, chapter.id, toIndex)}
                onDelete={() => {
                  if (
                    window.confirm(
                      `删除章节「${chapter.title}」？这一章的阅读进度也会一起删除。`,
                    )
                  ) {
                    removeChapter(book.id, chapter.id)
                  }
                }}
              />
            ))}
          </ul>
        )}

        <div className="flex justify-center pt-1">
          <button type="button" className="btn btn-secondary" onClick={handleAddChapter}>
            <Plus size={15} strokeWidth={1.8} />
            添加章节
          </button>
        </div>
      </section>
    </div>
  )
}
