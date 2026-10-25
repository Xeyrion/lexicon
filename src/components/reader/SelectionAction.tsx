import { Languages, X } from 'lucide-react'
import type { ReaderRect } from './types'

interface SelectionActionProps {
  text: string
  rect: ReaderRect
  onLookup: () => void
  onDismiss: () => void
}

export function SelectionAction({ text, rect, onLookup, onDismiss }: SelectionActionProps) {
  const width = 132
  const margin = 12
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
  const left = Math.min(
    Math.max(rect.left + rect.width / 2, margin + width / 2),
    viewportWidth - margin - width / 2,
  )
  const above = rect.top > 80
  const top = above ? rect.top - 8 : rect.bottom + 8
  const transform = above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'

  return (
    <div
      className="fixed z-50 flex items-center gap-1 rounded-full border border-line bg-raised p-1 shadow-[var(--shadow-float)]"
      style={{ left, top, transform }}
      title={text}
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-ink transition-colors hover:bg-accent-wash"
        onClick={onLookup}
      >
        <Languages size={13} strokeWidth={1.8} />
        查短语
      </button>
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded-full text-faint transition-colors hover:bg-surface-muted hover:text-ink"
        onClick={onDismiss}
        aria-label="关闭短语查询"
      >
        <X size={12} strokeWidth={1.8} />
      </button>
    </div>
  )
}
