import { ArrowRight, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Story } from '../../types'

interface StoryCardProps {
  story: Story
  unlocked: number
  hasSave: boolean
  /** Only imported stories get a delete button; the built-in one cannot go. */
  onDelete?: () => void
}

export function StoryCard({ story, unlocked, hasSave, onDelete }: StoryCardProps) {
  const total = story.endings.length

  return (
    <div className="group surface-flat relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-card)]">
      <Link
        to={`/stories/${encodeURIComponent(story.id)}`}
        className="absolute inset-0 z-10"
        aria-label={`打开《${story.title}》`}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="display truncate text-xl leading-tight text-ink">{story.title}</p>
            {story.level && (
              <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted">
                {story.level}
              </span>
            )}
          </div>
          {story.author && <p className="mt-1 truncate text-xs text-muted">{story.author}</p>}
        </div>

        {onDelete && (
          <button
            type="button"
            className="icon-button relative z-20 -mr-1 -mt-1 h-8 w-8 shrink-0 text-faint opacity-100 transition-opacity hover:text-accent sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onDelete()
            }}
            aria-label={`删除《${story.title}》`}
            title="删除故事"
          >
            <Trash2 size={15} strokeWidth={1.8} />
          </button>
        )}
      </div>

      {story.description && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted">{story.description}</p>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-[11px] text-faint">
          {total === 0 ? '暂无结局' : `已解锁 ${unlocked} / ${total}`}
        </span>
        <span className="pointer-events-none inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[11px] font-medium text-paper transition-colors group-hover:bg-accent">
          {hasSave ? '继续阅读' : '开始'}
          <ArrowRight size={13} strokeWidth={1.8} />
        </span>
      </div>
    </div>
  )
}
