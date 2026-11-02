import { Check, Plus, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import type { WordBook } from '../../types'

interface SessionIdleProps {
  book: WordBook
  stats: { percent: number; learned: number; total: number }
  backlog: number
  onStart: (options?: { extra?: number; ignoreReviewCap?: boolean }) => void
}

/** Nothing left to study today and no work done in this visit. */
export function SessionIdle({ book, stats, backlog, onStart }: SessionIdleProps) {
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
                onClick={() => onStart({ ignoreReviewCap: true })}
              >
                <RotateCcw size={15} />
                继续复习 {backlog} 个
              </button>
            ) : allLearned ? (
              <Link to="/books" className="btn btn-primary">
                换一本词书
              </Link>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => onStart({ extra: 10 })}>
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
