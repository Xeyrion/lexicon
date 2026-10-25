import { useSyncExternalStore } from 'react'

export interface ReaderProgressStore {
  getPercent: () => number
  setPercent: (percent: number) => void
  subscribe: (listener: () => void) => () => void
}

interface ReaderProgressProps {
  store: ReaderProgressStore
  variant: 'inline' | 'bar'
}

export function ReaderProgress({ store, variant }: ReaderProgressProps) {
  const percent = useSyncExternalStore(store.subscribe, store.getPercent, store.getPercent)

  if (variant === 'inline') {
    return (
      <div className="hidden items-center gap-2 sm:flex">
        <span className="text-[10px] tabular-nums text-faint">{percent}%</span>
        <div className="h-1 w-16 overflow-hidden rounded-full bg-sunken">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-px bg-line/70">
      <div
        className="h-full bg-accent transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
