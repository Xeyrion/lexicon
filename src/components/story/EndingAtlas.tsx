import { Check, ChevronDown, Lock } from 'lucide-react'
import type { Story } from '../../types'
import { countUnlocked } from './endings'

interface EndingAtlasProps {
  story: Story
  unlocked: string[]
}

/**
 * One `<details>` per story: the summary carries the count, so a collapsed
 * block still says something. Hidden endings never get a row — they only exist
 * as the difference between the count and the number of visible rows.
 */
export function EndingAtlas({ story, unlocked }: EndingAtlasProps) {
  const unlockedIds = new Set(unlocked)
  const visible = story.endings.filter((ending) => !ending.hidden)
  const total = story.endings.length
  const hidden = total - visible.length

  return (
    <details className="group surface-flat overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-sunken/40 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block truncate text-sm text-ink">结局图鉴 · {story.title}</span>
          <span className="mt-1 block text-[11px] text-faint">
            已解锁 {countUnlocked(story, unlocked)} / {total}
          </span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.8}
          className="shrink-0 text-faint transition-transform duration-200 group-open:rotate-180"
        />
      </summary>

      <div className="border-t border-line/70 px-5 py-4">
        {visible.length === 0 ? (
          <p className="text-xs leading-relaxed text-faint">这部故事的结局都藏在雾里，继续走。</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {visible.map((ending) => {
              const isUnlocked = unlockedIds.has(ending.id)
              return (
                <li
                  key={ending.id}
                  className={`rounded-xl border px-3.5 py-3 ${
                    isUnlocked ? 'border-accent-soft bg-accent-wash' : 'border-line/70'
                  }`}
                >
                  <p className="flex items-center gap-1.5">
                    {isUnlocked ? (
                      <Check size={13} strokeWidth={2.2} className="shrink-0 text-accent" />
                    ) : (
                      <Lock size={12} strokeWidth={1.8} className="shrink-0 text-faint" />
                    )}
                    <span
                      className={`truncate text-sm ${isUnlocked ? 'text-ink' : 'text-faint'}`}
                    >
                      {isUnlocked ? ending.name : '???'}
                    </span>
                  </p>
                  {!isUnlocked && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                      {ending.hint ?? '继续探索'}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {hidden > 0 && (
          <p className="mt-3 text-[10px] leading-relaxed text-faint">
            另有 {hidden} 个隐藏结局，只计入进度，不显示名字。
          </p>
        )}
      </div>
    </details>
  )
}
