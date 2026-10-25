import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, BookOpen, Flame, Sparkles, Target, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BookCover } from '../components/BookCover'
import { EmptyState } from '../components/EmptyState'
import { Heatmap } from '../components/Heatmap'
import { PageHeader } from '../components/PageHeader'
import { StatTile } from '../components/StatTile'
import { useRegistry } from '../hooks/useRegistry'
import { dayTotal, formatNumber, getStreak } from '../lib/date'
import {
  accuracy,
  activitySeries,
  masteredTotal,
  ratingTotals,
  totalNew,
  totalReviews,
  totalReviewWords,
} from '../lib/stats'
import { personalMeta } from '../lib/books'
import { useAppStore } from '../store/appStore'

const RATING_ROWS = [
  { key: 'again' as const, label: '忘记', color: 'var(--accent)' },
  { key: 'hard' as const, label: '模糊', color: 'var(--amber)' },
  { key: 'good' as const, label: '认识', color: 'var(--ink-soft)' },
  { key: 'easy' as const, label: '熟练', color: 'var(--forest)' },
]

export default function Stats() {
  const progress = useAppStore((state) => state.progress)
  const days = useAppStore((state) => state.days)
  const personalWords = useAppStore((state) => state.personalWords)
  const { registry } = useRegistry()

  const learned = Object.keys(progress).length
  const mastered = masteredTotal(progress)
  const clicks = totalReviews(days)
  const reviewWords = totalReviewWords(days)
  const newWords = totalNew(days)
  const streak = getStreak(days)
  const retention = accuracy(days)
  const activeDays = Object.values(days).filter((day) => dayTotal(day) > 0).length

  const series = useMemo(() => activitySeries(days, 30), [days])
  const ratings = useMemo(() => ratingTotals(days), [days])
  const ratingTotal = ratings.again + ratings.hard + ratings.good + ratings.easy

  const books = useMemo(() => {
    const list = [...(registry?.books ?? []), personalMeta(personalWords)]
    return list.map((book) => {
      const learnedCount = Math.min(
        book.wordCount,
        Object.values(progress).filter((record) => record.bookId === book.id).length,
      )
      return {
        ...book,
        learnedCount,
        percent:
          book.wordCount === 0 ? 0 : Math.round((learnedCount / book.wordCount) * 100),
      }
    })
  }, [registry, personalWords, progress])

  if (clicks === 0 && learned === 0) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Insights"
          title="学习统计"
          description="这里会记录你的节奏、记忆率和每一本词书的进度。"
        />
        <EmptyState
          icon={BarChart3}
          title="还没有学习记录"
          description="开始第一组单词后，这里会慢慢长出属于你的曲线。"
          action={
            <Link to="/study" className="btn btn-primary">
              开始学习
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Insights"
        title="学习统计"
        description="不追求连续打卡的数字，只看记忆有没有真正留下来。"
        actions={
          <Link to="/study" className="btn btn-primary">
            <BookOpen size={15} />
            继续学习
          </Link>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="连续学习" value={`${streak} 天`} hint={`累计 ${activeDays} 天有记录`} icon={Flame} tone="accent" />
        <StatTile label="累计点击" value={formatNumber(clicks)} hint={`新词 ${formatNumber(newWords)} 个 · 复习 ${formatNumber(reviewWords)} 词次`} icon={BarChart3} tone="blue" />
        <StatTile label="已学单词" value={formatNumber(learned)} hint="包含所有词书" icon={BookOpen} tone="amber" />
        <StatTile label="已掌握" value={formatNumber(mastered)} hint={`记忆率 ${retention}%`} icon={Sparkles} tone="forest" />
      </section>

      <section className="surface-card p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="kicker">Activity · 最近 30 天</p>
            <h2 className="display mt-2 text-xl text-ink">每天读了多少</h2>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-faint">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-accent" /> 新词
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-forest" /> 复习词
            </span>
          </div>
        </div>
        <div className="mt-5 h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} barCategoryGap="18%" margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 6" />
              <XAxis
                dataKey="label"
                interval={4}
                tick={{ fontSize: 10, fill: 'var(--faint)' }}
                axisLine={false}
                tickLine={false}
                dy={8}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: 'var(--faint)' }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                cursor={{ fill: 'var(--accent-wash)' }}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  fontSize: 12,
                  color: 'var(--ink)',
                  boxShadow: 'var(--shadow-card)',
                }}
                labelStyle={{ color: 'var(--muted)' }}
                itemStyle={{ color: 'var(--ink)' }}
              />
              <Bar dataKey="newWords" name="新词" stackId="a" fill="var(--accent)" />
              <Bar dataKey="reviews" name="复习词" stackId="a" fill="var(--forest)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="surface-card p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="kicker">Consistency</p>
              <h2 className="display mt-2 text-xl text-ink">学习热力图</h2>
            </div>
            <span className="text-[10px] text-faint">最近 26 周</span>
          </div>
          <div className="mt-6">
            <Heatmap days={days} weeks={26} />
          </div>
        </div>

        <div className="surface-card p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="kicker">Recall</p>
              <h2 className="display mt-2 text-xl text-ink">点击分布</h2>
            </div>
            <Target size={18} className="text-faint" strokeWidth={1.6} />
          </div>
          <div className="mt-6 space-y-4">
            {RATING_ROWS.map((row) => {
              const value = ratings[row.key]
              const percent = ratingTotal === 0 ? 0 : Math.round((value / ratingTotal) * 100)
              return (
                <div key={row.key}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted">{row.label}</span>
                    <span className="tabular-nums text-faint">
                      {value} · {percent}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${percent}%`, background: row.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-6 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-xs text-muted">记忆率</span>
            <span className="display text-2xl text-ink">{retention}%</span>
          </div>
        </div>
      </section>

      <section className="surface-card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="kicker">Books</p>
            <h2 className="display mt-2 text-xl text-ink">词书进度</h2>
          </div>
          <TrendingUp size={18} className="text-faint" strokeWidth={1.6} />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {books.map((book) => (
            <Link
              key={book.id}
              to={`/study?book=${book.id}`}
              className="group flex items-center gap-3 rounded-2xl border border-line bg-paper-deep/25 p-3 transition-colors hover:border-line-strong hover:bg-surface"
            >
              <BookCover
                id={book.id}
                name={book.name}
                nameZh={book.nameZh}
                level={book.level}
                className="h-14 w-10"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink">{book.nameZh}</p>
                  <span className="text-[10px] tabular-nums text-faint">{book.percent}%</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-700"
                    style={{ width: `${book.percent}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-faint">
                  {book.learnedCount} / {book.wordCount} 个词
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
