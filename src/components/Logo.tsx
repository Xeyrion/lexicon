import { Link } from 'react-router-dom'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-3" aria-label="词间首页">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-ink text-paper shadow-sm transition-transform duration-300 group-hover:-rotate-3">
        <span className="display text-[1.15rem] leading-none">词</span>
      </span>
      {!compact && (
        <span className="flex flex-col">
          <span className="display text-[1.35rem] leading-none tracking-tight text-ink">词间</span>
          <span className="kicker mt-1.5">Lexicon</span>
        </span>
      )}
    </Link>
  )
}
