import type { ReactNode } from 'react'

interface ProgressRingProps {
  value: number
  size?: number
  stroke?: number
  label?: ReactNode
  hint?: ReactNode
}

export function ProgressRing({ value, size = 132, stroke = 7, label, hint }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`完成 ${Math.round(clamped)}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.2, 0.7, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="display text-[1.7rem] leading-none text-ink">{label ?? `${Math.round(clamped)}%`}</span>
        {hint && <span className="mt-1.5 text-[10px] tracking-wide text-faint">{hint}</span>}
      </div>
    </div>
  )
}
