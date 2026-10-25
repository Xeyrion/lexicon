import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="kicker mb-3">{eyebrow}</p>}
        <h1 className="display text-[2.4rem] leading-[1.05] text-ink sm:text-[3.1rem]">{title}</h1>
        {description && (
          <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </header>
  )
}
