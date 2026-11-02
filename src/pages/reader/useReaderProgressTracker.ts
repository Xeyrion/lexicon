import { useEffect, type RefObject } from 'react'
import type { ReaderProgressStore } from '../../components/reader/ReaderProgress'
import type { ReaderAnchor } from '../../types'
import { readAnchor } from './anchor'

/**
 * 在 rAF 中测量文章滚动进度，只写入独立 store（百分比变化时才通知进度条），
 * 避免每帧重渲染整个阅读页。
 */
export function useReaderProgressTracker(
  store: ReaderProgressStore,
  articleRef: RefObject<HTMLElement | null>,
  initialProgress: number,
  onProgress: (progress: number, anchor: ReaderAnchor | null) => void,
) {
  useEffect(() => {
    let frame = 0

    const measure = () => {
      const element = articleRef.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      // 不足一屏的短文直接视为读完，避免永远停在 0%。
      const progress = total <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / total))
      onProgress(progress, readAnchor(element))
      store.setPercent(Math.round(progress * 100))
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }

    // 有保存进度时先让恢复滚动触发测量，避免挂载瞬间把进度闪成 0%。
    if (initialProgress <= 0) measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [articleRef, initialProgress, onProgress, store])
}
