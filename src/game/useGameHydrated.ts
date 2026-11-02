import { useEffect, useState, useSyncExternalStore } from 'react'
import { setHydrationWriteBlocked } from '../lib/storage'
import { useGameStore } from '../store/gameStore'

/**
 * Game pages must not render (or write) before game.json is read: an empty
 * in-memory profile written back would erase every unlock. Mirrors
 * `useHydrated` for the study store.
 */
export function useGameHydrated(): boolean {
  const hydrated = useSyncExternalStore(
    (onChange) => useGameStore.persist.onFinishHydration(onChange),
    () => useGameStore.persist.hasHydrated(),
    () => false,
  )
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (hydrated) {
      setHydrationWriteBlocked('game', false)
      return
    }
    const timeout = window.setTimeout(() => {
      console.warn(
        '[Lexicon] 游戏数据加载超过 2.5 秒，已暂停保存以免覆盖未读取的文件。请重新加载页面。',
      )
      setHydrationWriteBlocked('game', true)
      setTimedOut(true)
    }, 2500)
    return () => window.clearTimeout(timeout)
  }, [hydrated])

  return hydrated || timedOut
}

export function waitForGameHydration(timeoutMs = 4000): Promise<boolean> {
  if (useGameStore.persist.hasHydrated()) return Promise.resolve(true)
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
    unsubscribe = useGameStore.persist.onFinishHydration(() => finish(true))
    if (useGameStore.persist.hasHydrated()) finish(true)
  })
}
