import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLibraryStore } from '../store/libraryStore'
import { useStoryStore } from '../store/storyStore'
import { useReaderProgressStore } from '../store/readerProgressStore'
import { useReaderStore } from '../store/readerStore'
import { setHydrationWriteBlocked } from './storage'

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
    if (hydrated) {
      setHydrationWriteBlocked('reader', false)
      return
    }
    const timeout = window.setTimeout(() => {
      console.warn(
        '[Lexicon] 阅读数据加载超过 2.5 秒，已暂停保存以免覆盖未读取的文件。请重新加载页面。',
      )
      setHydrationWriteBlocked('reader', true)
      setTimedOut(true)
    }, 2500)
    return () => window.clearTimeout(timeout)
  }, [hydrated])

  return hydrated || timedOut
}

export function waitForStoriesHydration(timeoutMs = 4000): Promise<boolean> {
  return waitForStore(useStoryStore, timeoutMs)
}

export function waitForLibraryHydration(timeoutMs = 4000): Promise<boolean> {
  return waitForStore(useLibraryStore, timeoutMs)
}

export function waitForReaderHydration(timeoutMs = 4000): Promise<boolean> {
  return Promise.all([
    waitForStore(useReaderStore, timeoutMs),
    waitForStore(useReaderProgressStore, timeoutMs),
  ]).then(([reader, progress]) => reader && progress)
}
