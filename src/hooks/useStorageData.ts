import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  buildLibraryPayload,
  buildStoriesPayload,
  buildReaderPayload,
  buildReaderProgressPayload,
  buildStudyPayload,
  parseSnapshot,
  type ParsedSnapshot,
} from '../lib/snapshotImport'
import {
  discardPersistedKind,
  flushPersistedStorage,
  replacePersistedKind,
} from '../lib/storage'
import {
  fetchBackupList,
  fetchStorageInfo,
  importStorageData,
  quarantineKind,
  restoreBackup,
  saveImportLimit,
  type StorageBackupEntry,
  type StorageBackupList,
  type StorageInfo,
  type StorageKind,
} from '../lib/storageInfo'
import {
  waitForLibraryHydration,
  waitForReaderHydration,
  waitForStoriesHydration,
} from '../lib/useReaderHydrated'
import { DEFAULT_SETTINGS, useAppStore } from '../store/appStore'
import { useLibraryStore } from '../store/libraryStore'
import { useStoryStore } from '../store/storyStore'
import {
  articlesWithProgress,
  useReaderProgressStore,
} from '../store/readerProgressStore'
import { DEFAULT_READER_SETTINGS, useReaderStore } from '../store/readerStore'
import type { Snapshot } from '../types'

export interface Message {
  type: 'ok' | 'error'
  text: string
}

/**
 * Everything the settings page needs to talk to the local storage service:
 * data directory info, automatic backups, export/import, quarantine and
 * restore. Kept in a hook so the page file stays presentational.
 */
export function useStorageData() {
  const snapshot = useAppStore((state) => state.snapshot)
  const readerReplaceAllProgress = useReaderProgressStore((state) => state.replaceAll)

  const [message, setMessage] = useState<Message | null>(null)
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [storageLoading, setStorageLoading] = useState(true)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [backupList, setBackupList] = useState<StorageBackupList | null>(null)
  // The page always loads the backup list on mount, so start in the loading
  // state and let the mount effect skip the (synchronous) loading toggle.
  const [backupLoading, setBackupLoading] = useState(true)
  const [backupError, setBackupError] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<StorageBackupEntry | null>(null)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [quarantineBusy, setQuarantineBusy] = useState<StorageKind | null>(null)
  const [pendingLimit, setPendingLimit] = useState<number | null>(null)
  const [limitBusy, setLimitBusy] = useState(false)
  const storageRequestId = useRef(0)
  const backupRequestId = useRef(0)

  const loadStorageInfo = useCallback(async () => {
    const requestId = storageRequestId.current + 1
    storageRequestId.current = requestId
    try {
      const info = await fetchStorageInfo()
      if (requestId !== storageRequestId.current) return
      setStorageInfo(info)
      setStorageError(null)
    } catch (error) {
      if (requestId !== storageRequestId.current) return
      setStorageInfo(null)
      setStorageError(error instanceof Error ? error.message : '读取本地数据信息失败。')
    } finally {
      if (requestId === storageRequestId.current) setStorageLoading(false)
    }
  }, [])

  const applyBackups = useCallback(async (requestId: number, showError: boolean) => {
    try {
      const list = await fetchBackupList()
      if (requestId !== backupRequestId.current) return
      setBackupList(list)
      setBackupError(null)
    } catch (error) {
      if (requestId !== backupRequestId.current) return
      if (showError) setBackupError(error instanceof Error ? error.message : '读取备份列表失败。')
    }
  }, [])

  const loadBackups = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const requestId = backupRequestId.current + 1
      backupRequestId.current = requestId
      if (!silent) setBackupLoading(true)
      await applyBackups(requestId, !silent)
      if (!silent && requestId === backupRequestId.current) setBackupLoading(false)
    },
    [applyBackups],
  )

  const refreshStorageInfo = useCallback(() => {
    setStorageLoading(true)
    setStorageError(null)
    void loadStorageInfo()
    void loadBackups({ silent: true })
  }, [loadBackups, loadStorageInfo])

  const refreshBackups = useCallback(() => {
    setBackupError(null)
    void loadBackups()
  }, [loadBackups])

  useEffect(() => {
    const requestId = storageRequestId.current + 1
    storageRequestId.current = requestId
    let cancelled = false
    void fetchStorageInfo().then(
      (info) => {
        if (cancelled || requestId !== storageRequestId.current) return
        setStorageInfo(info)
        setStorageError(null)
        setStorageLoading(false)
      },
      (error: unknown) => {
        if (cancelled || requestId !== storageRequestId.current) return
        setStorageInfo(null)
        setStorageError(error instanceof Error ? error.message : '读取本地数据信息失败。')
        setStorageLoading(false)
      },
    )
    // Load the backup list here instead of calling loadBackups() so the effect
    // does not flip the loading flag synchronously on mount.
    const backupId = backupRequestId.current + 1
    backupRequestId.current = backupId
    void applyBackups(backupId, true).finally(() => {
      if (backupId === backupRequestId.current) setBackupLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [applyBackups])

  const handleExport = async () => {
    if (!(await waitForReaderHydration())) {
      setMessage({ type: 'error', text: '阅读库还在加载，请稍后再试。' })
      return
    }
    if (!(await waitForLibraryHydration())) {
      setMessage({ type: 'error', text: '书架还在加载，请稍后再试。' })
      return
    }
    if (!(await waitForStoriesHydration())) {
      setMessage({ type: 'error', text: '故事还在加载，请稍后再试。' })
      return
    }
    const storyState = useStoryStore.getState()
    const reader = useReaderStore.getState()
    const data: Snapshot = {
      ...snapshot(),
      version: 4,
      reader: {
        articles: articlesWithProgress(reader.articles),
        settings: reader.settings,
      },
      library: { books: useLibraryStore.getState().books },
      stories: {
        stories: storyState.stories,
        saves: storyState.saves,
        meta: storyState.meta,
      },
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `lexicon-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage({ type: 'ok', text: '备份已导出，包含学习记录与阅读库。' })
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    // file.text() would pull the whole thing into memory before the server ever
    // sees it, so reject the obvious cases up front. The limit comes from the
    // server so the two can never drift apart.
    const maxImportBytes = storageInfo?.maxImportBytes
    if (typeof maxImportBytes === 'number' && file.size > maxImportBytes) {
      input.value = ''
      setMessage({
        type: 'error',
        text: `这个文件约 ${(file.size / 1024 / 1024).toFixed(1)} MB，超过本地服务的单次导入上限 ${Math.round(
          maxImportBytes / 1024 / 1024,
        )} MB。请确认选对了文件。`,
      })
      return
    }
    setMessage(null)
    setImportBusy(true)
    try {
      const text = await file.text()
      let raw: unknown
      try {
        raw = JSON.parse(text) as unknown
      } catch {
        setMessage({ type: 'error', text: '文件解析失败，请选择词间导出的 JSON 备份。' })
        return
      }

      const parsed = parseSnapshot(raw, {
        settings: DEFAULT_SETTINGS,
        currentBookId: useAppStore.getState().currentBookId,
        readerSettings: DEFAULT_READER_SETTINGS,
      })
      if (!parsed.ok) {
        setMessage({ type: 'error', text: parsed.error })
        return
      }

      const snapshot: ParsedSnapshot = parsed.value
      if (snapshot.reader && !(await waitForReaderHydration())) {
        setMessage({ type: 'error', text: '阅读库还在加载，请稍后再试。' })
        return
      }
      if (snapshot.library && !(await waitForLibraryHydration())) {
        setMessage({ type: 'error', text: '书架还在加载，请稍后再试。' })
        return
      }
      if (snapshot.stories && !(await waitForStoriesHydration())) {
        setMessage({ type: 'error', text: '故事还在加载，请稍后再试。' })
        return
      }

      // Ensure pending local writes are persisted before we read revisions.
      await flushPersistedStorage()
      const baseRevisions: Partial<Record<StorageKind, number>> = {}
      if (storageInfo?.files.study.exists && typeof storageInfo.files.study.revision === 'number') {
        baseRevisions.study = storageInfo.files.study.revision
      }
      if (storageInfo?.files.reader.exists && typeof storageInfo.files.reader.revision === 'number') {
        baseRevisions.reader = storageInfo.files.reader.revision
      }
      if (
        storageInfo?.files['reader-progress'].exists &&
        typeof storageInfo.files['reader-progress'].revision === 'number'
      ) {
        baseRevisions['reader-progress'] = storageInfo.files['reader-progress'].revision
      }
      if (storageInfo?.files.library.exists && typeof storageInfo.files.library.revision === 'number') {
        baseRevisions.library = storageInfo.files.library.revision
      }
      if (storageInfo?.files.stories.exists && typeof storageInfo.files.stories.revision === 'number') {
        baseRevisions.stories = storageInfo.files.stories.revision
      }

      const data: Partial<Record<StorageKind, unknown>> = {
        study: buildStudyPayload(snapshot.study),
      }
      if (snapshot.reader) {
        data.reader = buildReaderPayload(snapshot.reader)
        data['reader-progress'] = buildReaderProgressPayload(snapshot.reader)
      }
      if (snapshot.library) {
        data.library = buildLibraryPayload(snapshot.library)
      }
      if (snapshot.stories) {
        data.stories = buildStoriesPayload(snapshot.stories)
      }

      let result
      try {
        result = await importStorageData({ baseRevisions, data })
      } catch (error) {
        if (error instanceof Error && error.message.includes('另一个页面更新')) {
          await loadStorageInfo()
          setMessage({ type: 'error', text: '数据已被另一个页面更新，请刷新页面后重新导入。' })
          return
        }
        setMessage({ type: 'error', text: error instanceof Error ? error.message : '导入失败。' })
        return
      }

      // Apply to the in-memory stores first. replacePersistedKind() then cancels
      // the debounced writes those setState calls armed and points the browser
      // cache/revision at exactly what the server just committed.
      useAppStore.setState({
        settings: snapshot.study.settings,
        currentBookId: snapshot.study.currentBookId,
        progress: snapshot.study.progress,
        days: snapshot.study.days,
        personalWords: snapshot.study.personalWords,
      })
      await replacePersistedKind('study', data.study, result.revisions.study ?? 1)

      if (snapshot.reader) {
        useReaderStore.setState({
          articles: snapshot.reader.articles,
          settings: snapshot.reader.settings,
        })
        readerReplaceAllProgress(snapshot.reader.articles)
        await replacePersistedKind('reader', data.reader, result.revisions.reader ?? 1)
        await replacePersistedKind(
          'reader-progress',
          data['reader-progress'],
          result.revisions['reader-progress'] ?? 1,
        )
      }

      if (snapshot.library) {
        useLibraryStore.getState().replaceBooks(snapshot.library.books)
        await replacePersistedKind('library', data.library, result.revisions.library ?? 1)
      }

      if (snapshot.stories) {
        useStoryStore.setState({
          stories: snapshot.stories.stories,
          ...(snapshot.stories.saves ? { saves: snapshot.stories.saves } : {}),
          ...(snapshot.stories.meta ? { meta: snapshot.stories.meta } : {}),
        })
        await replacePersistedKind('stories', data.stories, result.revisions.stories ?? 1)
      }

      const parts = ['学习记录']
      if (snapshot.reader) parts.push('阅读库')
      if (snapshot.library) parts.push('书架')
      if (snapshot.stories) parts.push('故事')
      setMessage({
        type: 'ok',
        text: result.quarantined.length > 0
          ? `备份已导入，已自动隔离 ${result.quarantined.length} 个损坏文件，页面即将刷新。`
          : `备份已导入，${parts.join('、')}已更新，页面即将刷新。`,
      })
      window.setTimeout(() => window.location.reload(), 800)
    } catch {
      setMessage({ type: 'error', text: '导入过程中发生意外错误。' })
    } finally {
      input.value = ''
      setImportBusy(false)
    }
  }

  const handleQuarantine = useCallback(
    async (kind: StorageKind) => {
      setMessage(null)
      setQuarantineBusy(kind)
      try {
        await quarantineKind(kind)
        setMessage({ type: 'ok', text: `${kind}.json 已隔离，页面即将刷新。` })
        window.setTimeout(() => window.location.reload(), 600)
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : '隔离失败。' })
      } finally {
        setQuarantineBusy(null)
      }
    },
    [],
  )

  const restoreBackupEntry = useCallback(
    async (entry: StorageBackupEntry) => {
      setMessage(null)
      setRestoreBusy(true)
      try {
        await flushPersistedStorage()
        await discardPersistedKind(entry.kind)
        const result = await restoreBackup(entry.kind, entry.name)
        setRestoreTarget(null)
        setMessage({
          type: 'ok',
          text:
            result.safetyBackup
              ? `已从 ${entry.name} 恢复，当前文件已备份为 ${result.safetyBackup}，页面即将刷新。`
              : `已从 ${entry.name} 恢复，页面即将刷新。`,
        })
        await loadBackups({ silent: true })
        await loadStorageInfo()
        window.setTimeout(() => window.location.reload(), 800)
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : '恢复备份失败。' })
      } finally {
        setRestoreBusy(false)
      }
    },
    [loadBackups, loadStorageInfo],
  )

  const requestRestore = useCallback((entry: StorageBackupEntry) => {
    setRestoreTarget(entry)
  }, [])

  const cancelRestore = useCallback(() => {
    if (restoreBusy) return
    setRestoreTarget(null)
  }, [restoreBusy])

  const confirmRestore = useCallback(() => {
    if (!restoreTarget || restoreBusy) return
    void restoreBackupEntry(restoreTarget)
  }, [restoreBackupEntry, restoreBusy, restoreTarget])

  const requestLimitChange = useCallback(
    (bytes: number) => {
      if (bytes === storageInfo?.maxImportBytes) return
      setPendingLimit(bytes)
    },
    [storageInfo?.maxImportBytes],
  )

  const cancelLimitChange = useCallback(() => {
    if (limitBusy) return
    setPendingLimit(null)
  }, [limitBusy])

  const confirmLimitChange = useCallback(async () => {
    if (pendingLimit === null || limitBusy) return
    setLimitBusy(true)
    try {
      const saved = await saveImportLimit(pendingLimit)
      setStorageInfo((info) => (info ? { ...info, maxImportBytes: saved } : info))
      setMessage({
        type: 'ok',
        text: `单次导入上限已调整为 ${Math.round(saved / (1024 * 1024))} MB。`,
      })
      setPendingLimit(null)
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '保存导入上限失败。',
      })
    } finally {
      setLimitBusy(false)
    }
  }, [limitBusy, pendingLimit])

  return {
    message,
    setMessage,
    storageInfo,
    storageLoading,
    storageError,
    backupList,
    backupLoading,
    backupError,
    restoreTarget,
    restoreBusy,
    importBusy,
    quarantineBusy,
    refreshStorageInfo,
    refreshBackups,
    handleExport,
    handleImport,
    handleQuarantine,
    requestRestore,
    cancelRestore,
    confirmRestore,
    pendingLimit,
    limitBusy,
    requestLimitChange,
    cancelLimitChange,
    confirmLimitChange,
  }
}
