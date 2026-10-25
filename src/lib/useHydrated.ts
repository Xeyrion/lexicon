import { useEffect, useState, useSyncExternalStore } from 'react'
import { useAppStore } from '../store/appStore'
import { setHydrationWriteBlocked } from './storage'

export type HydrationState = 'loading' | 'ready' | 'slow'

/**
 * `slow` means: keep showing the app (don't trap the user on the splash) but
 * stop writing. Writes stay blocked until a reload actually finishes loading,
 * because the in-memory state may still be empty.
 */
export function useHydrated(): HydrationState {
  const hydrated = useSyncExternalStore(
    (onChange) => useAppStore.persist.onFinishHydration(onChange),
    () => useAppStore.persist.hasHydrated(),
    () => false,
  )
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (hydrated) {
      setHydrationWriteBlocked('study', false)
      return
    }
    const timeout = window.setTimeout(() => {
      console.warn(
        '[Lexicon] 学习数据加载超过 2.5 秒，已暂停保存以免覆盖未读取的文件。请重新加载页面。',
      )
      setHydrationWriteBlocked('study', true)
      setTimedOut(true)
    }, 2500)
    return () => window.clearTimeout(timeout)
  }, [hydrated])

  if (hydrated) return 'ready'
  return timedOut ? 'slow' : 'loading'
}
