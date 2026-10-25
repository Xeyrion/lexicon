import { useMemo } from 'react'
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Flame,
  Sparkles,
  Target,
  Volume2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { BookCard } from '../components/BookCard'
import { BookCover } from '../components/BookCover'
import { EmptyState } from '../components/EmptyState'
import { PhoneticLine } from '../components/PhoneticLine'
import { ProgressRing } from '../components/ProgressRing'
import { StatTile } from '../components/StatTile'
import { useBookData } from '../hooks/useBookData'
import { useRegistry } from '../hooks/useRegistry'
import {
  dateKey,
  dayTotal,
  formatLongDate,
  formatNumber,
  getLastDays,
  getStreak,
  greeting,
  reviewWordsForDay,
  todayIndex,
} from '../lib/date'
import { speakWord } from '../lib/speech'
import { accuracy, bookStats, getQueuePlan } from '../lib/stats'
import { useAppStore } from '../store/appStore'

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-52 rounded-full bg-sunken" />
      <div className="h-[22rem] rounded-[1.75rem] bg-sunken/70" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 rounded-2xl bg-sunken/70" />
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const settings = useAppStore((state) => state.settings)
  const currentBookId = useAppStore((state) => state.currentBookId)
  const progress = useAppStore((state) => state.progress)
  const days = useAppStore((state) => state.days)
  const setCurrentBook = useAppStore((state) => state.setCurrentBook)
  const { book, loading, error } = useBookData(currentBookId)
  const { registry } = useRegistry()

  const today = days[dateKey()]
  const streak = getStreak(days)
  const stats = book ? bookStats(book, progress) : null
  const plan = book ? getQueuePlan(book, progress, settings, days) : null
  const due = plan ? plan.reviewPlan + plan.learningDue : 0
  const fresh = plan ? plan.newPlan : 0
  const remaining = due + fresh
  const backlog = plan ? plan.reviewBacklog + plan.learningDue : 0
  const overflow = plan ? Math.max(0, plan.reviewBacklog - plan.reviewPlan) : 0
  const doneToday = dayTotal(today)
  const reviewedToday = reviewWordsForDay(today)
  const target = doneToday + remaining
  const percent =
    target === 0 ? 100 : Math.min(100, Math.round((doneToday / target) * 100))
  const wordOfDay = useMemo(() => {
    if (!book || book.words.length === 0) return null
    const dayIndex = todayIndex()
    return book.words[(dayIndex * 17 + book.words.length) % book.words.length]
  }, [book])

  const last7 = useMemo(() => {
    const items = getLastDays(7).map((key) => {
      const total = dayTotal(days[key])
      return {
        key,
        total,
        label: new Intl.DateTimeFormat('zh-CN', { weekday: 'narrow' }).format(
          new Date(`${key}T00:00:00`),
        ),
      }
    })
    return { items, max: Math.max(1, ...items.map((item) => item.total)) }
  }, [days])

  if (loading) return <DashboardSkeleton />
  if (error || !book || !stats) {
    return (
      <EmptyState
        icon={BookOpen}
        title="词库没有加载出来"
        description={error ?? '请检查网络后重试，或到词库页换一本词书。'}
        action={
          <Link to="/books" className="btn btn-primary">
            打开词库
          </Link>
        }
      />
    )
  }

  const shelf = registry?.books ?? []
  const allLearned = stats.learned >= stats.total
  const startHref =
    remaining > 0
      ? `/study?book=${book.id}`
      : backlog > 0
        ? `/study?book=${book.id}&all=1`
        : allLearned
          ? '/books'
          : `/study?book=${book.id}&extra=10`
  const startLabel =
    remaining > 0
      ? '开始今天的学习'
      : backlog > 0
        ? `继续复习 ${backlog} 个`
        : allLearned
          ? '换一本词书'
          : '再学一组'

  return (
    <div className="space-y-8">
      <header className="fade-up flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="kicker mb-3">{formatLongDate()}</p>
          <h1 className="display text-[2.4rem] leading-[1.05] text-ink sm:text-[3.2rem]">
            {greeting()}，今天读点什么？
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <CalendarDays size={15} strokeWidth={1.7} />
          <span>
            连续 {streak} 天 · 今天已学 {doneToday} 个词
          </span>
        </div>
      </header>

      <section className="fade-up grid gap-5 lg:grid-cols-[1.55fr_1fr]" style={{ animationDelay: '60ms' }}>
        <div className="surface-card relative overflow-hidden p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-accent/5 blur-2xl" />
          <div className="relative flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-lg">
              <p className="kicker">Today · 今日计划</p>
              <h2 className="display mt-3 text-[2rem] leading-[1.12] text-ink sm:text-[2.6rem]">
                {remaining > 0 ? (
                  <>
                    今天还有 <span className="text-accent">{remaining}</span> 个词。
                  </>
                ) : backlog > 0 ? (
                  <>今日计划，已经完成。</>
                ) : (
                  <>今天的词，已经读完。</>
                )}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                {remaining > 0
                  ? `《${book.nameZh}》按记忆节奏为你排好了 ${fresh} 个新词与 ${due} 个复习。`
                  : backlog > 0
                    ? `按每日上限已经复习完，待复习队列里还有 ${backlog} 个词。`
                    : '合上这一页，明天再见。也可以再学一组，趁热打铁。'}
              </p>
              {overflow > 0 && remaining > 0 && (
                <p className="mt-2 text-xs text-forest">
                  上限之外还有 {overflow} 个待复习，随时可以继续。
                </p>
              )}
            </div>
            <ProgressRing value={percent} label={`${percent}%`} hint="今日进度" />
          </div>

          <div className="relative mt-8 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line bg-paper-deep/35 p-4">
              <div className="flex items-center justify-between">
                <span className="kicker">新词</span>
                <Sparkles size={14} className="text-accent" strokeWidth={1.8} />
              </div>
              <p className="display mt-3 text-[1.9rem] leading-none text-ink">{fresh}</p>
              <p className="mt-2 text-[11px] text-faint">
                今日已学 {today?.newCount ?? 0} / {settings.dailyNew}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-paper-deep/35 p-4">
              <div className="flex items-center justify-between">
                <span className="kicker">复习</span>
                <Target size={14} className="text-forest" strokeWidth={1.8} />
              </div>
              <p className="display mt-3 text-[1.9rem] leading-none text-ink">{due}</p>
              <p className="mt-2 text-[11px] text-faint">
                {settings.dailyReview === 0
                  ? `今日已复习 ${reviewedToday} · 不限上限`
                  : `今日已复习 ${reviewedToday} / ${settings.dailyReview}`}
              </p>
              {backlog > due && (
                <p className="mt-1 text-[10px] text-forest">待复习队列 {backlog}</p>
              )}
            </div>
          </div>

          <div className="relative mt-7 flex flex-wrap items-center gap-3">
            <Link to={startHref} className="btn btn-primary">
              {startLabel}
              <ArrowRight size={16} strokeWidth={1.9} />
            </Link>
            {overflow > 0 && remaining > 0 && (
              <Link to={`/study?book=${book.id}&all=1`} className="btn btn-secondary">
                复习全部 {backlog} 个
              </Link>
            )}
            <Link to="/books" className="btn btn-ghost">
              换一本词书
            </Link>
          </div>
        </div>

        <div className="surface-card flex flex-col p-6">
          <div className="flex items-center justify-between">
            <p className="kicker">当前词书</p>
            <Link to="/books" className="text-[11px] text-faint transition-colors hover:text-accent">
              全部词书
            </Link>
          </div>
          <div className="mt-5 flex gap-4">
            <BookCover
              id={book.id}
              name={book.name}
              nameZh={book.nameZh}
              level={book.level}
              large
              className="h-[9.6rem] w-[7.1rem]"
            />
            <div className="flex min-w-0 flex-col">
              <h3 className="display text-2xl leading-tight text-ink">{book.nameZh}</h3>
              <p className="mt-1 text-xs text-muted">{book.description}</p>
              <div className="mt-auto grid grid-cols-2 gap-3 pt-4">
                <div>
                  <p className="text-[10px] text-faint">已学</p>
                  <p className="display mt-1 text-lg text-ink">{formatNumber(stats.learned)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-faint">已掌握</p>
                  <p className="display mt-1 text-lg text-ink">{formatNumber(stats.mastered)}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-auto pt-6">
            <div className="flex items-center justify-between text-[10px] text-faint">
              <span>
                {stats.learned.toLocaleString('zh-CN')} / {book.wordCount.toLocaleString('zh-CN')}
              </span>
              <span>{stats.percent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-700"
                style={{ width: `${stats.percent}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="fade-up grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ animationDelay: '120ms' }}>
        <StatTile label="连续学习" value={`${streak} 天`} hint="保持节奏" icon={Flame} tone="accent" />
        <StatTile label="已学单词" value={formatNumber(stats.learned)} hint={`共 ${formatNumber(stats.total)} 个`} icon={BookOpen} tone="blue" />
        <StatTile label="已掌握" value={formatNumber(stats.mastered)} hint="稳定记忆 21 天以上" icon={Sparkles} tone="forest" />
        <StatTile label="记忆率" value={`${accuracy(days)}%`} hint="所有点击中非遗忘占比" icon={Target} tone="amber" />
      </section>

      <section className="fade-up grid gap-5 lg:grid-cols-[1.1fr_1fr]" style={{ animationDelay: '180ms' }}>
        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <p className="kicker">Word of the day</p>
            {wordOfDay && (
              <button
                type="button"
                onClick={() => void speakWord(wordOfDay.word, settings.accent, settings.rate)}
                className="icon-button icon-button-bordered h-9 w-9"
                aria-label="播放发音"
              >
                <Volume2 size={15} strokeWidth={1.8} />
              </button>
            )}
          </div>
          {wordOfDay ? (
            <>
              <p className="display mt-6 break-words text-[2.7rem] leading-none text-ink sm:text-[3.4rem]">
                {wordOfDay.word}
              </p>
              <div className="mt-4">
                <PhoneticLine
                  word={wordOfDay.word}
                  us={wordOfDay.phoneticUS}
                  uk={wordOfDay.phoneticUK}
                  alt={wordOfDay.phoneticAlt}
                  accent={settings.accent}
                  rate={settings.rate}
                />
              </div>
              <p className="mt-5 text-sm leading-relaxed text-ink-soft">{wordOfDay.trans[0]}</p>
              {wordOfDay.trans.length > 1 && (
                <p className="mt-1.5 text-xs leading-relaxed text-faint">{wordOfDay.trans[1]}</p>
              )}
              <div className="mt-6 flex items-center gap-3">
                <Link to={`/study?book=${book.id}`} className="btn btn-secondary">
                  去学习
                </Link>
                <span className="text-[10px] text-faint">
                  今日一词 · 来自 {book.nameZh}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-8 text-sm text-muted">这个词库还是空的。</p>
          )}
        </div>

        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <p className="kicker">最近 7 天</p>
            <Link to="/stats" className="flex items-center gap-1 text-[11px] text-faint hover:text-accent">
              全部统计 <ChevronRight size={13} />
            </Link>
          </div>
          <div className="mt-6 flex h-32 items-end gap-2">
            {last7.items.map((item) => {
              const height = item.total === 0 ? 4 : Math.max(8, Math.round((item.total / last7.max) * 100))
              return (
                <div key={item.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t-md transition-all duration-500 ${
                        item.total > 0 ? 'bg-accent/80' : 'bg-sunken'
                      }`}
                      style={{ height: `${height}%` }}
                      title={`${item.key} · ${item.total} 个词`}
                    />
                  </div>
                  <span className="text-[9px] text-faint">{item.label}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
            <p className="text-xs text-muted">本周共学习</p>
            <p className="display text-xl text-ink">
              {last7.items.reduce((sum, item) => sum + item.total, 0)}
              <span className="ml-1 font-sans text-[10px] text-faint">个词</span>
            </p>
          </div>
        </div>
      </section>

      <section className="fade-up" style={{ animationDelay: '240ms' }}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="kicker mb-2">Library</p>
            <h2 className="display text-2xl text-ink">词书架</h2>
          </div>
          <Link to="/books" className="btn btn-ghost">
            全部词书 <ChevronRight size={15} />
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shelf.slice(0, 3).map((meta) => (
            <BookCard
              key={meta.id}
              book={meta}
              active={meta.id === currentBookId}
              learned={meta.id === currentBookId ? stats.learned : undefined}
              onSelect={setCurrentBook}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
