import type { LucideIcon } from 'lucide-react'

interface StatTileProps {
  label: string
  value: string | number
  hint?: string
  icon?: LucideIcon
  tone?: 'accent' | 'forest' | 'amber' | 'blue'
}

const tones = {
  accent: 'bg-accent-wash text-accent',
  forest: 'bg-forest-soft text-forest',
  amber: 'bg-amber-soft text-amber',
  blue: 'bg-slate-blue-soft text-slate-blue',
}

export function StatTile({ label, value, hint, icon: Icon, tone = 'accent' }: StatTileProps) {
  return (
    <div className="surface-flat flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="kicker">{label}</span>
        {Icon && (
          <span className={`flex h-7 w-7 items-center justify-center rounded-full ${tones[tone]}`}>
            <Icon size={14} strokeWidth={1.8} />
          </span>
        )}
      </div>
      <div>
        <p className="display text-[1.75rem] leading-none text-ink">{value}</p>
        {hint && <p className="mt-2 text-xs text-faint">{hint}</p>}
      </div>
    </div>
  )
}
