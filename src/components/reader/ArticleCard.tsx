import { Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReaderArticle } from '../../types'
import { formatShortDate } from '../../lib/date'
import { readingMinutes } from '../../lib/reader'
import { useReaderProgressStore } from '../../store/readerProgressStore'

interface ArticleCardProps {
  article: ReaderArticle
  onDelete: () => void
}

export function ArticleCard({ article, onDelete }: ArticleCardProps) {
  const record = useReaderProgressStore((state) => state.items[article.id])
  const percent = Math.round((record?.progress ?? article.progress) * 100)
  const initial = article.title.trim().charAt(0).toUpperCase() || 'A'
  const date = formatShortDate(
    new Date(record?.lastReadAt ?? article.lastReadAt ?? article.updatedAt),
  )

  return (
    <div className="group surface-flat relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-card)]">
      <Link
        to={`/read/${article.id}`}
        className="absolute inset-0 z-10"
        aria-label={`继续阅读 ${article.title}`}
      />
      <div className="flex gap-4">
        <span className="display flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-wash text-xl text-accent">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="display truncate text-xl leading-tight text-ink">{article.title}</p>
              <p className="mt-1 truncate text-[11px] text-faint">
                {article.source} · {article.wordCount.toLocaleString('zh-CN')} 词 ·{' '}
                {readingMinutes(article.wordCount)} 分钟 · {date}
              </p>
            </div>
            <div className="relative z-20 -mr-1 -mt-1 flex shrink-0 items-center gap-0.5">
              <Link
                to={`/read/${article.id}/edit`}
                className="icon-button h-8 w-8 text-faint opacity-100 transition-opacity hover:text-accent sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                onClick={(event) => event.stopPropagation()}
                aria-label={`编辑 ${article.title}`}
                title="编辑文章"
              >
                <Pencil size={15} strokeWidth={1.8} />
              </Link>
              <button
                type="button"
                className="icon-button h-8 w-8 text-faint opacity-100 transition-opacity hover:text-accent sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onDelete()
                }}
                aria-label={`删除 ${article.title}`}
                title="删除文章"
              >
                <Trash2 size={15} strokeWidth={1.8} />
              </button>
            </div>
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
      </div>
    </div>
  )
}
