import { BarChart3, Home, Plus, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ProgressRing } from '../../components/ProgressRing'
import type { WordBook } from '../../types'
import { formatDuration, type Results } from './labels'

interface SessionSummaryProps {
  book: WordBook
  results: Results
  stats: { percent: number; mastered: number; learned: number; total: number }
  backlog: number
  startedAt: number
  onStart: (options?: { extra?: number; ignoreReviewCap?: boolean }) => void
}

/** End-of-session summary, shown once the queue is empty after real work. */
export function SessionSummary({
  book,
  results,
  stats,
  backlog,
  startedAt,
  onStart,
}: SessionSummaryProps) {
  const retention =
    results.ratings === 0
      ? 0
      : Math.round(((results.ratings - results.again) / results.ratings) * 100)

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
        <p className="relative mt-3 text-[11px] text-faint">已掌握 {stats.mastered} 个词</p>

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
              onClick={() => onStart({ ignoreReviewCap: true })}
            >
              <RotateCcw size={15} />
              继续复习 {backlog} 个
            </button>
          )}
          {stats.learned < stats.total ? (
            <button type="button" className="btn btn-primary" onClick={() => onStart({ extra: 10 })}>
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
