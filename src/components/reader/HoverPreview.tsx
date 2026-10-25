import type { WordEntry } from '../../types'
import type { ReaderRect } from './types'

interface HoverPreviewProps {
  word: string
  entry: WordEntry
  rect: ReaderRect
}

export function HoverPreview({ word, entry, rect }: HoverPreviewProps) {
  const width = 286
  const margin = 12
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
  const left = Math.min(
    Math.max(rect.left + rect.width / 2, margin + width / 2),
    viewportWidth - margin - width / 2,
  )
  const above = rect.top > 160
  const top = above ? rect.top - 8 : rect.bottom + 8
  const transform = above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'
  const phonetic = entry.phoneticUS || entry.phoneticUK || entry.phoneticAlt

  return (
    <div
      className="pointer-events-none fixed z-50 hidden w-[286px] rounded-2xl border border-line bg-raised p-4 shadow-[var(--shadow-float)] sm:block"
      style={{ left, top, transform }}
    >
      <p className="kicker">Word</p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <p className="display text-2xl leading-none text-ink">{word}</p>
        {phonetic && <p className="phonetic shrink-0 text-[11px] text-faint">{phonetic}</p>}
      </div>
      <div className="mt-3 space-y-1.5">
        {entry.trans.slice(0, 2).map((line) => (
          <p key={line} className="text-xs leading-relaxed text-muted">
            {line}
          </p>
        ))}
      </div>
      <p className="mt-3 border-t border-line pt-2 text-[10px] text-faint">点击查看完整词条</p>
    </div>
  )
}
