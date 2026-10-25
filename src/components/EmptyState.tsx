import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="surface-flat flex flex-col items-center justify-center gap-4 border-dashed px-6 py-14 text-center">
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-muted">
          <Icon size={20} strokeWidth={1.6} />
        </span>
      )}
      <div>
        <p className="display text-xl text-ink">{title}</p>
        {description && <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
