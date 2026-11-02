import type { ReaderProgressStore } from '../../components/reader/ReaderProgress'

/** Reading progress lives outside React state so scrolling never re-renders the page. */
export function createReaderProgressStore(initialProgress: number): ReaderProgressStore {
  let percent = Math.round(Math.min(1, Math.max(0, initialProgress)) * 100)
  const listeners = new Set<() => void>()

  return {
    getPercent: () => percent,
    setPercent: (next) => {
      const clamped = Math.min(100, Math.max(0, next))
      if (clamped === percent) return
      percent = clamped
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
