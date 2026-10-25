import { useState, type FormEvent } from 'react'
import { Library as LibraryIcon, Plus, Trash2, Upload } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { ReadingTabs } from '../components/ReadingTabs'
import { useLibraryHydrated } from '../components/library/useLibraryHydrated'
import { bookProgress, useLibraryStore } from '../store/libraryStore'
import { useReaderProgressStore } from '../store/readerProgressStore'
import type { Book } from '../types'

function totalWords(book: Book): number {
  return book.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)
}

function BookShelfCard({ book, onDelete }: { book: Book; onDelete: () => void }) {
  const progressItems = useReaderProgressStore((state) => state.items)
  const percent = Math.round(bookProgress(book, progressItems) * 100)
  const words = totalWords(book)

  return (
    <div className="group surface-flat relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-card)]">
      <Link
        to={`/library/${book.id}`}
        className="absolute inset-0 z-10"
        aria-label={`打开《${book.title}》`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="display truncate text-xl leading-tight text-ink">{book.title}</p>
          {book.author && <p className="mt-1 truncate text-xs text-muted">{book.author}</p>}
          <p className="mt-1.5 text-[11px] text-faint">
            {book.chapters.length} 章 · 共 {words.toLocaleString('zh-CN')} 词
          </p>
        </div>
        <button
          type="button"
          className="icon-button relative z-20 -mr-1 -mt-1 h-8 w-8 shrink-0 text-faint opacity-100 transition-opacity hover:text-accent sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onDelete()
          }}
          aria-label={`删除《${book.title}》`}
          title="删除书籍"
        >
          <Trash2 size={15} strokeWidth={1.8} />
        </button>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between text-[10px] text-faint">
          <span>{percent >= 98 ? '已读完' : percent > 0 ? '继续阅读' : '未开始'}</span>
          <span>{percent}%</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export default function Library() {
  const hydrated = useLibraryHydrated()
  const books = useLibraryStore((state) => state.books)
  const addBook = useLibraryStore((state) => state.addBook)
  const removeBook = useLibraryStore((state) => state.removeBook)
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')

  const closeForm = () => {
    setCreating(false)
    setTitle('')
    setAuthor('')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const name = title.trim()
    if (!name) return
    const book = addBook({ title: name, author: author.trim(), source: 'manual' })
    closeForm()
    navigate(`/library/${book.id}`)
  }

  if (!hydrated) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-40 rounded-full bg-sunken" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-36 rounded-2xl bg-sunken/70" />
          <div className="h-36 rounded-2xl bg-sunken/70" />
          <div className="h-36 rounded-2xl bg-sunken/70" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Library"
        title="书架"
        description="把整本书放进来，拆成章节一章一章读。书籍、章节和阅读进度都保存在本机。"
      />

      <ReadingTabs />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setCreating(true)
            setTitle('')
            setAuthor('')
          }}
        >
          <Plus size={15} strokeWidth={2} />
          新建书籍
        </button>
        <Link to="/library/import" className="btn btn-secondary">
          <Upload size={15} strokeWidth={1.8} />
          导入 EPUB / Markdown
        </Link>
      </div>

      {creating && (
        <form onSubmit={submit} className="surface-card p-5 sm:p-6">
          <p className="kicker">New book</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-medium tracking-wide text-muted">书名</span>
              <input
                value={title}
                autoFocus
                onChange={(event) => setTitle(event.currentTarget.value)}
                className="input mt-2"
                placeholder="必填"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium tracking-wide text-muted">作者（可选）</span>
              <input
                value={author}
                onChange={(event) => setAuthor(event.currentTarget.value)}
                className="input mt-2"
                placeholder="留空也可以"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={closeForm}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
              创建书籍
            </button>
          </div>
        </form>
      )}

      {books.length === 0 ? (
        <EmptyState
          icon={LibraryIcon}
          title="书架还是空的"
          description="导入一本 EPUB，或者自己新建一本"
          action={
            <Link to="/library/import" className="btn btn-primary">
              导入一本书
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <BookShelfCard
              key={book.id}
              book={book}
              onDelete={() => {
                if (window.confirm(`删除《${book.title}》？它下面的所有章节和阅读进度都会一起删除。`)) {
                  removeBook(book.id)
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
