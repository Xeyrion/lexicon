import { Link, useLocation } from 'react-router-dom'

/**
 * One entry point, two routes: /read holds articles, /library holds books.
 * Two routes (instead of local state) keep back/forward and refresh working.
 */
export function ReadingTabs() {
  const { pathname } = useLocation()
  const onBooks = pathname.startsWith('/library')
  const onStories = pathname.startsWith('/stories')

  const base = 'rounded-full px-3 py-1.5 text-xs transition-colors'
  const active = 'bg-ink text-paper'
  const idle = 'text-muted hover:bg-sunken hover:text-ink'

  return (
    <div className="inline-flex gap-1 rounded-full border border-line bg-surface p-1">
      <Link
        to="/read"
        className={`${base} ${onBooks || onStories ? idle : active}`}
        aria-current={onBooks || onStories ? undefined : 'page'}
      >
        文章
      </Link>
      <Link
        to="/library"
        className={`${base} ${onBooks ? active : idle}`}
        aria-current={onBooks ? 'page' : undefined}
      >
        书籍
      </Link>
      <Link
        to="/stories"
        className={`${base} ${onStories ? active : idle}`}
        aria-current={onStories ? 'page' : undefined}
      >
        故事
      </Link>
    </div>
  )
}
