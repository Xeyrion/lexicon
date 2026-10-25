import { useEffect, useState, useSyncExternalStore } from 'react'
import { useAppStore } from '../store/appStore'

export function useHydrated(): boolean {
  const hydrated = useSyncExternalStore(
    (onChange) => useAppStore.persist.onFinishHydration(onChange),
    () => useAppStore.persist.hasHydrated(),
    () => false,
  )
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (hydrated) return
    const timeout = window.setTimeout(() => setTimedOut(true), 2500)
    return () => window.clearTimeout(timeout)
  }, [hydrated])

  return hydrated || timedOut
}
