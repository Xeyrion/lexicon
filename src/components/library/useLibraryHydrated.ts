import { useSyncExternalStore } from 'react'
import { useLibraryStore } from '../../store/libraryStore'

/** 书架数据来自本地文件，异步载入；未就绪前不要渲染「空」或「不存在」。 */
export function useLibraryHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useLibraryStore.persist.onFinishHydration(onChange),
    () => useLibraryStore.persist.hasHydrated(),
    () => false,
  )
}
