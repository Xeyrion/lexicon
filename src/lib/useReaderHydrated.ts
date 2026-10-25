import { useEffect, useState, useSyncExternalStore } from 'react'
import { useReaderProgressStore } from '../store/readerProgressStore'
import { useReaderStore } from '../store/readerStore'

interface PersistLike {
  persist: {
    hasHydrated: () => boolean
    onFinishHydration: (listener: () => void) => () => void
  }
}

function waitForStore(store: PersistLike, timeoutMs: number): Promise<boolean> {
  if (store.persist.hasHydrated()) return Promise.resolve(true)
  return new Promise((resolve) => {
    let settled = false
    let unsubscribe = () => {}
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      unsubscribe()
      resolve(value)
    }
    const timer = window.setTimeout(() => finish(false), timeoutMs)
    unsubscribe = store.persist.onFinishHydration(() => finish(true))
    if (store.persist.hasHydrated()) finish(true)
  })
}

export function useReaderHydrated(): boolean {
  const readerHydrated = useSyncExternalStore(
    (onChange) => useReaderStore.persist.onFinishHydration(onChange),
    () => useReaderStore.persist.hasHydrated(),
    () => false,
  )
  const progressHydrated = useSyncExternalStore(
    (onChange) => useReaderProgressStore.persist.onFinishHydration(onChange),
    () => useReaderProgressStore.persist.hasHydrated(),
    () => false,
  )
  const [timedOut, setTimedOut] = useState(false)
  const hydrated = readerHydrated && progressHydrated

  useEffect(() => {
    if (hydrated) return
    const timeout = window.setTimeout(() => setTimedOut(true), 2500)
    return () => window.clearTimeout(timeout)
  }, [hydrated])

  return hydrated || timedOut
}

export function waitForReaderHydration(timeoutMs = 4000): Promise<boolean> {
  return Promise.all([
    waitForStore(useReaderStore, timeoutMs),
    waitForStore(useReaderProgressStore, timeoutMs),
  ]).then(([reader, progress]) => reader && progress)
}
