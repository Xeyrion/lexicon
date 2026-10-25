import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { BookMeta } from '../types'
import { BookCover } from './BookCover'

interface BookCardProps {
  book: BookMeta
  learned?: number
  active?: boolean
  onSelect?: (id: string) => void
}

export function BookCard({ book, learned, active = false, onSelect }: BookCardProps) {
  const percent =
    learned === undefined || book.wordCount === 0
      ? 0
      : Math.round((learned / book.wordCount) * 100)

  return (
    <div
      className={`group relative overflow-hidden rounded-[1.6rem] border p-4 transition-all duration-300 ${
        active
          ? 'border-accent/35 bg-surface shadow-[var(--shadow-card)]'
          : 'border-line bg-surface/80 hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface hover:shadow-[var(--shadow-card)]'
      }`}
    >
      <Link
        to={`/study?book=${book.id}`}
        onClick={() => onSelect?.(book.id)}
        className="absolute inset-0 z-10"
        aria-label={`开始学习 ${book.nameZh}`}
      />
      <div className="flex gap-4">
        <BookCover
          id={book.id}
          name={book.name}
          nameZh={book.nameZh}
          level={book.level}
          className="h-[6.6rem] w-[4.9rem]"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="display truncate text-xl leading-tight text-ink">{book.name}</p>
              <p className="mt-0.5 text-xs text-muted">{book.nameZh}</p>
            </div>
            {active ? (
              <span className="chip chip-accent shrink-0">当前</span>
            ) : (
              <ArrowUpRight
                size={15}
                className="shrink-0 text-faint transition-colors group-hover:text-accent"
              />
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-faint">
            {book.description}
          </p>
          <div className="mt-auto pt-3">
            {learned === undefined ? (
              <p className="text-[10px] text-faint">{book.wordCount.toLocaleString('zh-CN')} 个词</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-[10px] text-faint">
                  <span>
                    {learned.toLocaleString('zh-CN')} / {book.wordCount.toLocaleString('zh-CN')}
                  </span>
                  <span>{percent}%</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-700"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
