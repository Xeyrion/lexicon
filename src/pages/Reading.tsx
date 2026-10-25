import { useMemo, useState } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { ProgressRing } from '../components/ProgressRing'
import { ArticleCard } from '../components/reader/ArticleCard'
import { ArticleComposer } from '../components/reader/ArticleComposer'
import { formatShortDate } from '../lib/date'
import { readingMinutes } from '../lib/reader'
import { useReaderHydrated } from '../lib/useReaderHydrated'
import { useReaderProgressStore } from '../store/readerProgressStore'
import { useReaderStore } from '../store/readerStore'

function ReadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-40 rounded-full bg-sunken" />
      <div className="h-64 rounded-[1.75rem] bg-sunken/70" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-36 rounded-2xl bg-sunken/70" />
        <div className="h-36 rounded-2xl bg-sunken/70" />
      </div>
    </div>
  )
}

export default function Reading() {
  const hydrated = useReaderHydrated()
  const articles = useReaderStore((state) => state.articles)
  const removeArticle = useReaderStore((state) => state.removeArticle)
  const progressItems = useReaderProgressStore((state) => state.items)
  const navigate = useNavigate()
  const [composing, setComposing] = useState(false)

  const sorted = useMemo(
    () =>
      [...articles].sort((a, b) => {
        const aDate =
          progressItems[a.id]?.lastReadAt ?? a.lastReadAt ?? a.updatedAt
        const bDate =
          progressItems[b.id]?.lastReadAt ?? b.lastReadAt ?? b.updatedAt
        return new Date(bDate).getTime() - new Date(aDate).getTime()
      }),
    [articles, progressItems],
  )

  if (!hydrated) return <ReadingSkeleton />

  const latest = sorted[0]
  const latestRecord = latest ? progressItems[latest.id] : undefined
  const showComposer = articles.length === 0 || composing
  const percent = latest
    ? Math.round((latestRecord?.progress ?? latest.progress) * 100)
    : 0

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Reading"
        title="阅读"
        description="把文章放进来，慢慢读。悬停看词义，点击固定词条，选中多个词可以查短语。文章保存在本机本地文件中。"
        actions={
          articles.length > 0 && !composing ? (
            <button type="button" className="btn btn-primary" onClick={() => setComposing(true)}>
              <Plus size={15} strokeWidth={2} />
              新建阅读
            </button>
          ) : undefined
        }
      />

      {showComposer && (
        <ArticleComposer
          onSave={(article) => navigate(`/read/${article.id}`)}
          onCancel={articles.length > 0 ? () => setComposing(false) : undefined}
        />
      )}

      {!showComposer && latest && (
        <section className="surface-card relative overflow-hidden p-5 sm:p-8">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-60"
            style={{
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--accent) 16%, transparent), transparent 68%)',
            }}
          />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="max-w-xl">
              <p className="kicker">Continue reading</p>
              <div className="mt-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="display text-[1.8rem] leading-[1.08] text-ink sm:text-[2.4rem] sm:leading-[1.1]">
                    {latest.title}
                  </h2>
                  <p className="mt-2.5 text-xs text-faint sm:mt-3">
                    {latest.source} · {latest.wordCount.toLocaleString('zh-CN')} 词 ·{' '}
                    {readingMinutes(latest.wordCount)} 分钟 ·{' '}
                    {formatShortDate(
                      new Date(
                        latestRecord?.lastReadAt ??
                          latest.lastReadAt ??
                          latest.updatedAt,
                      ),
                    )}
                  </p>
                </div>
                <div className="shrink-0 sm:hidden">
                  <ProgressRing value={percent} size={68} stroke={5} label={`${percent}%`} />
                </div>
              </div>
              <Link
                to={
                  percent >= 98
                    ? `/read/${latest.id}?from=start`
                    : `/read/${latest.id}`
                }
                className="btn btn-primary mt-4 sm:mt-5"
              >
                {percent >= 98 ? '重新阅读' : percent > 0 ? '继续阅读' : '开始阅读'}
                <ArrowRight size={15} strokeWidth={1.8} />
              </Link>
            </div>
            <div className="hidden sm:block">
              <ProgressRing
                value={percent}
                size={104}
                stroke={6}
                label={`${percent}%`}
                hint={percent >= 98 ? '已读完' : '进度'}
              />
            </div>
          </div>
        </section>
      )}

      {articles.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="kicker">Library</p>
              <h2 className="display mt-2 text-2xl text-ink">全部文章</h2>
            </div>
            <p className="text-xs text-faint">{articles.length} 篇</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {sorted.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                onDelete={() => {
                  if (window.confirm(`删除「${article.title}」？`)) {
                    removeArticle(article.id)
                  }
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
