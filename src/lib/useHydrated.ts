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
    const timeout = window.setTimeout(() => {
      console.warn(
        '[Lexicon] 学习数据加载超过 2.5 秒，暂时以当前内容继续。请刷新页面确认数据已完整加载。',
      )
      setTimedOut(true)
    }, 2500)
    return () => window.clearTimeout(timeout)
  }, [hydrated])

  return hydrated || timedOut
}
