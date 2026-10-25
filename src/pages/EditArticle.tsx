import { ArrowLeft, Pencil } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ArticleComposer } from '../components/reader/ArticleComposer'
import { useReaderHydrated } from '../lib/useReaderHydrated'
import { useReaderStore } from '../store/readerStore'

function EditSkeleton() {
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
          <div className="h-72 rounded-xl bg-sunken/60" />
        </div>
      </div>
    </div>
  )
}

export default function EditArticle() {
  const { articleId } = useParams<{ articleId: string }>()
  const hydrated = useReaderHydrated()
  const articles = useReaderStore((state) => state.articles)
  const article = articles.find((item) => item.id === articleId)
  const navigate = useNavigate()

  if (!hydrated) return <EditSkeleton />

  if (!article) {
    return (
      <EmptyState
        icon={Pencil}
        title="文章没有找到"
        description="它可能已经被删除，或者链接不完整。"
        action={
          <Link to="/read" className="btn btn-primary">
            回到阅读库
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-5">
      <Link
        to={`/read/${article.id}`}
        className="inline-flex items-center gap-2 text-xs text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} strokeWidth={1.8} />
        返回阅读
      </Link>
      <ArticleComposer
        key={article.id}
        article={article}
        onSave={(updated) => navigate(`/read/${updated.id}`)}
        onCancel={() => navigate(`/read/${article.id}`)}
      />
    </div>
  )
}
