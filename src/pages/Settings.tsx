import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Check,
  Database,
  Download,
  Info,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Sun,
  Target,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import {
  buildReaderPayload,
  buildReaderProgressPayload,
  buildStudyPayload,
  parseSnapshot,
  type ParsedSnapshot,
} from '../lib/snapshotImport'
import { speakWord } from '../lib/speech'
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
  type StorageBackupEntry,
  type StorageBackupList,
  type StorageInfo,
  type StorageKind,
} from '../lib/storageInfo'
import { waitForReaderHydration } from '../lib/useReaderHydrated'
import { DEFAULT_SETTINGS, useAppStore } from '../store/appStore'
import {
  articlesWithProgress,
  useReaderProgressStore,
} from '../store/readerProgressStore'
import { DEFAULT_READER_SETTINGS, useReaderStore } from '../store/readerStore'
import type { Accent, Snapshot, ThemeMode } from '../types'

interface Message {
  type: 'ok' | 'error'
  text: string
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="surface-card p-6 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
          <Icon size={16} strokeWidth={1.8} />
        </span>
        <div>
          <h2 className="display text-xl text-ink">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description: string
}) {
  return (
    <div className="flex items-center justify-between gap-5 py-3">
      <div>
        <p className="text-sm text-ink">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-faint">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-line-strong'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; icon?: LucideIcon }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1">
      {options.map((option) => {
        const Icon = option.icon
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${
              active ? 'bg-ink text-paper' : 'text-muted hover:bg-sunken hover:text-ink'
            }`}
          >
            {Icon && <Icon size={13} strokeWidth={1.8} />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
]

const ACCENT_OPTIONS: { value: Accent; label: string }[] = [
  { value: 'us', label: '美式' },
  { value: 'uk', label: '英式' },
]

const STORAGE_FILES: { kind: StorageKind; label: string }[] = [
  { kind: 'study', label: '学习记录' },
  { kind: 'reader', label: '阅读库' },
  { kind: 'reader-progress', label: '阅读进度' },
]

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'] as const
  let value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

function LocalDataInfo({
  info,
  loading,
  error,
  onRefresh,
  onQuarantine,
  quarantineBusy,
}: {
  info: StorageInfo | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onQuarantine: (kind: StorageKind) => void
  quarantineBusy: StorageKind | null
}) {
  const corrupted = info
    ? STORAGE_FILES.filter(({ kind }) => info.files[kind].corrupted)
    : []

  return (
    <div className="mt-6 rounded-2xl border border-line bg-paper-deep/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink">本地数据</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-faint">
            数据文件与每日备份都保存在本机。浏览器缓存只是副本，容量上限约 5 MB；写入失败时页面顶部会提示，请及时导出备份。
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost text-xs disabled:opacity-50"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
          {loading ? '读取中' : '刷新'}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-accent/25 bg-accent-wash px-3 py-2 text-[11px] leading-relaxed text-accent">
          {error}
        </p>
      )}

      {loading && !info && (
        <p className="mt-3 text-[11px] text-faint" aria-live="polite">
          正在读取本地数据信息…
        </p>
      )}

      {info && (
        <div className="mt-4 space-y-4">
          <div className="space-y-3">
            <div className="min-w-0">
              <p className="kicker">数据目录</p>
              <p className="mt-1 break-all text-[11px] leading-relaxed text-ink-soft">
                {info.directory}
              </p>
            </div>
            <div className="min-w-0">
              <p className="kicker">备份目录</p>
              <p className="mt-1 break-all text-[11px] leading-relaxed text-ink-soft">
                {info.backupDirectory}
              </p>
            </div>
          </div>

          {corrupted.length > 0 && (
            <div className="rounded-xl border border-accent/30 bg-accent-wash px-3 py-2.5">
              <p className="text-[11px] font-medium text-accent">检测到损坏的数据文件</p>
              <p className="mt-1 text-[10px] leading-relaxed text-accent">
                隔离会把文件重命名为 {corrupted[0]?.kind}.corrupt-*.json 保留下来，不会删除。
                隔离后页面会重新加载，并尝试从浏览器缓存恢复；也可以先到下方备份列表中恢复。
              </p>
              <ul className="mt-2 space-y-1.5">
                {corrupted.map(({ kind, label }) => (
                  <li key={kind} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 break-all text-[11px] text-ink-soft">
                      {kind}.json · {label}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost shrink-0 text-[11px] text-accent disabled:opacity-50"
                      onClick={() => onQuarantine(kind)}
                      disabled={quarantineBusy !== null}
                    >
                      {quarantineBusy === kind ? '隔离中…' : '隔离损坏文件'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="kicker">数据文件</p>
            {STORAGE_FILES.some(({ kind }) => info.files[kind].exists) ? (
              <ul className="mt-2 space-y-1.5">
                {STORAGE_FILES.filter(({ kind }) => info.files[kind].exists).map(
                  ({ kind, label }) => (
                    <li
                      key={kind}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11px]"
                    >
                      <span className="min-w-0 break-all text-ink-soft">
                        {kind}.json
                        <span className="text-faint"> · {label}</span>
                        {info.files[kind].corrupted && (
                          <span className="ml-1.5 rounded-full bg-accent-wash px-1.5 py-0.5 text-[9px] text-accent">
                            损坏
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-ink">
                        {formatBytes(info.files[kind].bytes ?? 0)}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] text-faint">还没有生成本地数据文件。</p>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface/70 px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
              <span className="text-muted">备份</span>
              <span className="tabular-nums text-ink">
                {info.backups.total} 份 · {formatBytes(info.backups.bytes)}
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-faint">
              默认每类最多保留 {info.keepBackups} 份，三类数据合计最多约{' '}
              {info.keepBackups * STORAGE_FILES.length} 份。
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-faint">
              学习 {info.backups.byKind.study.count} 份 · 阅读库{' '}
              {info.backups.byKind.reader.count} 份 · 阅读进度{' '}
              {info.backups.byKind['reader-progress'].count} 份
            </p>
          </div>

          <p className="text-[10px] leading-relaxed text-faint">
            清空全部数据不会删除 backups/ 目录；备份默认每类保留 {info.keepBackups} 份，如果觉得占用空间较大，可以直接到备份目录手动删除旧文件。
          </p>
        </div>
      )}
    </div>
  )
}

function BackupManager({
  list,
  loading,
  error,
  onRefresh,
  onRestore,
}: {
  list: StorageBackupList | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onRestore: (entry: StorageBackupEntry) => void
}) {
  const groups = STORAGE_FILES.map(({ kind, label }) => ({
    kind,
    label,
    entries: list?.backups.filter((entry) => entry.kind === kind) ?? [],
  }))

  return (
    <div className="mt-4 rounded-2xl border border-line bg-paper-deep/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink">自动备份</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-faint">
            恢复会用备份覆盖当前这一类数据；恢复前会自动把当前文件另存为一份安全备份。
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost text-xs disabled:opacity-50"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
          {loading ? '读取中' : '刷新'}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-accent/25 bg-accent-wash px-3 py-2 text-[11px] leading-relaxed text-accent">
          {error}
        </p>
      )}

      {loading && !list && (
        <p className="mt-3 text-[11px] text-faint" aria-live="polite">
          正在读取备份列表…
        </p>
      )}

      {list && list.backups.length === 0 && (
        <p className="mt-3 text-[11px] text-faint">还没有自动备份。</p>
      )}

      {list && list.backups.length > 0 && (
        <div className="mt-4 max-h-80 space-y-4 overflow-y-auto pr-1">
          {groups.map((group) => (
            <div key={group.kind}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="kicker">
                  {group.label} · {group.kind}.json
                </p>
                <span className="text-[10px] tabular-nums text-faint">
                  {group.entries.length} 份
                </span>
              </div>
              {group.entries.length === 0 ? (
                <p className="mt-1 text-[10px] text-faint">暂无</p>
              ) : (
                <ul className="mt-1 divide-y divide-line/70">
                  {group.entries.map((entry) => (
                    <li
                      key={entry.name}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <p className="break-all text-[11px] leading-relaxed text-ink-soft">
                          {entry.name}
                        </p>
                        <p className="text-[10px] text-faint">
                          {formatBackupTime(entry.modifiedAt)} · {formatBytes(entry.bytes)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost shrink-0 text-[11px]"
                        onClick={() => onRestore(entry)}
                      >
                        <RotateCcw size={12} />
                        恢复
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RestoreBackupDialog({
  entry,
  busy,
  onCancel,
  onConfirm,
}: {
  entry: StorageBackupEntry
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [busy, onCancel])

  const label =
    STORAGE_FILES.find(({ kind }) => kind === entry.kind)?.label ?? entry.kind

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-backup-title"
        aria-describedby="restore-backup-description"
        className="w-full max-w-md rounded-[1.75rem] border border-line bg-surface p-6 shadow-[var(--shadow-float)] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
            <RotateCcw size={16} strokeWidth={1.8} />
          </span>
          <div>
            <h2 id="restore-backup-title" className="display text-xl text-ink">
              恢复这份备份？
            </h2>
            <p id="restore-backup-description" className="mt-1 text-xs leading-relaxed text-muted">
              将用这份备份覆盖当前的「{label}」数据。恢复前会自动保存当前文件，恢复完成后页面会重新加载。
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-paper-deep/30 px-4 py-3">
          <p className="break-all text-[11px] leading-relaxed text-ink-soft">{entry.name}</p>
          <p className="mt-1 text-[10px] text-faint">
            {formatBackupTime(entry.modifiedAt)} · {formatBytes(entry.bytes)}
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={busy}
            autoFocus
          >
            取消
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            <RotateCcw size={14} />
            {busy ? '恢复中…' : '确认恢复'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ResetAllDialog({
  info,
  onCancel,
  onConfirm,
}: {
  info: StorageInfo | null
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onCancel])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-all-title"
        aria-describedby="reset-all-description"
        className="w-full max-w-md rounded-[1.75rem] border border-line bg-surface p-6 shadow-[var(--shadow-float)] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-wash text-accent">
            <Trash2 size={16} strokeWidth={1.8} />
          </span>
          <div>
            <h2 id="reset-all-title" className="display text-xl text-ink">
              清除全部数据？
            </h2>
            <p id="reset-all-description" className="mt-1 text-xs leading-relaxed text-muted">
              设置、学习进度、个人词库和阅读文章都会删除，且无法撤销。
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-paper-deep/30 px-4 py-3">
          <p className="kicker">不会删除的备份</p>
          {info ? (
            <>
              <p className="mt-1.5 break-all text-[11px] leading-relaxed text-ink-soft">
                {info.backupDirectory}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                当前 {info.backups.total} 份，共 {formatBytes(info.backups.bytes)}。
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              暂时无法读取备份信息。备份默认保存在数据目录下的 backups 文件夹，每类最多保留 30 份。
            </p>
          )}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          清空全部数据不会删除 backups/ 目录；如果觉得备份占用空间较大，可以直接到备份目录手动删除旧文件。
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={onCancel} autoFocus>
            取消
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            <Trash2 size={14} />
            确认清除
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function formatBackupTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function Settings() {
  const settings = useAppStore((state) => state.settings)
  const setSetting = useAppStore((state) => state.setSetting)
  const snapshot = useAppStore((state) => state.snapshot)
  const resetProgress = useAppStore((state) => state.resetProgress)
  const resetAll = useAppStore((state) => state.resetAll)
  const readerReplaceAllProgress = useReaderProgressStore((state) => state.replaceAll)

  const importRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [confirm, setConfirm] = useState<'none' | 'progress'>('none')
  const [resetAllOpen, setResetAllOpen] = useState(false)
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [storageLoading, setStorageLoading] = useState(true)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [backupList, setBackupList] = useState<StorageBackupList | null>(null)
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<StorageBackupEntry | null>(null)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [quarantineBusy, setQuarantineBusy] = useState<StorageKind | null>(null)
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

  const loadBackups = useCallback(async (silent = false) => {
    const requestId = backupRequestId.current + 1
    backupRequestId.current = requestId
    if (!silent) setBackupLoading(true)
    try {
      const list = await fetchBackupList()
      if (requestId !== backupRequestId.current) return
      setBackupList(list)
      setBackupError(null)
    } catch (error) {
      if (requestId !== backupRequestId.current) return
      if (!silent) setBackupError(error instanceof Error ? error.message : '读取备份列表失败。')
    } finally {
      if (!silent && requestId === backupRequestId.current) setBackupLoading(false)
    }
  }, [])

  const refreshStorageInfo = useCallback(() => {
    setStorageLoading(true)
    setStorageError(null)
    void loadStorageInfo()
    void loadBackups(true)
  }, [loadBackups, loadStorageInfo])

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
    void loadBackups()
    return () => {
      cancelled = true
    }
  }, [loadBackups])

  const closeResetAll = useCallback(() => setResetAllOpen(false), [])

  const handleExport = async () => {
    if (!(await waitForReaderHydration())) {
      setMessage({ type: 'error', text: '阅读库还在加载，请稍后再试。' })
      return
    }
    const reader = useReaderStore.getState()
    const data: Snapshot = {
      ...snapshot(),
      version: 2,
      reader: {
        articles: articlesWithProgress(reader.articles),
        settings: reader.settings,
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

      const data: Partial<Record<StorageKind, unknown>> = {
        study: buildStudyPayload(snapshot.study),
      }
      if (snapshot.reader) {
        data.reader = buildReaderPayload(snapshot.reader)
        data['reader-progress'] = buildReaderProgressPayload(snapshot.reader)
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

      setMessage({
        type: 'ok',
        text: result.quarantined.length > 0
          ? `备份已导入，已自动隔离 ${result.quarantined.length} 个损坏文件，页面即将刷新。`
          : snapshot.reader
            ? '备份已导入，学习记录和阅读库已更新，页面即将刷新。'
            : '备份已导入，学习记录已更新，页面即将刷新。',
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

  const handleRestoreBackup = useCallback(
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
        await loadBackups(true)
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

  const handleResetProgress = () => {
    if (confirm !== 'progress') {
      setConfirm('progress')
      return
    }
    resetProgress()
    setConfirm('none')
    setMessage({ type: 'ok', text: '学习进度已清空，个人词库保留。' })
  }

  const handleResetAll = async () => {
    setResetAllOpen(false)
    await resetAll()
    window.location.reload()
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Preferences"
        title="设置"
        description="调成你习惯的节奏。所有设置与学习记录都保存在本机本地文件中。"
      />

      {message && (
        <p
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs ${
            message.type === 'ok'
              ? 'border-forest/25 bg-forest-soft text-forest'
              : 'border-accent/25 bg-accent-wash text-accent'
          }`}
        >
          <Check size={14} />
          {message.text}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          icon={Target}
          title="学习计划"
          description="每日新词与复习上限，决定今天会排给你多少张卡片。复习上限是软上限，超出的词会留在待复习队列。"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">每日新词</span>
            <span className="display text-xl text-ink">{settings.dailyNew}</span>
          </div>
          <input
            type="range"
            className="range mt-3"
            min={5}
            max={60}
            step={5}
            value={settings.dailyNew}
            onChange={(event) => setSetting('dailyNew', Number(event.target.value))}
            aria-label="每日新词数量"
          />
          <div className="mt-1 flex justify-between text-[10px] text-faint">
            <span>5</span>
            <span>建议 10–30</span>
            <span>60</span>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <span className="text-sm text-ink">每日复习上限</span>
            <span className="display text-xl text-ink">
              {settings.dailyReview === 0 ? '不限' : settings.dailyReview}
            </span>
          </div>
          <input
            type="range"
            className="range mt-3 disabled:opacity-40"
            min={20}
            max={200}
            step={10}
            value={settings.dailyReview === 0 ? 60 : settings.dailyReview}
            disabled={settings.dailyReview === 0}
            onChange={(event) => setSetting('dailyReview', Number(event.target.value))}
            aria-label="每日复习上限"
          />
          <div className="mt-1 flex justify-between text-[10px] text-faint">
            <span>20</span>
            <span>建议 60–120</span>
            <span>200</span>
          </div>

          <div className="mt-4 divide-y divide-line border-t border-line">
            <Toggle
              checked={settings.dailyReview === 0}
              onChange={(value) => setSetting('dailyReview', value ? 0 : 60)}
              label="不限复习上限"
              description="超出的到期词会留在待复习队列，随时可以继续。"
            />
            <Toggle
              checked={settings.showDefinition}
              onChange={(value) => setSetting('showDefinition', value)}
              label="显示英文释义"
              description="在释义下方折叠展示 ECDICT 的英文解释。"
            />
          </div>
        </Section>

        <Section
          icon={Volume2}
          title="发音"
          description="使用浏览器系统语音（Web Speech API），音色与可用口音取决于你的设备。"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-ink">默认口音</span>
            <Segmented
              value={settings.accent}
              options={ACCENT_OPTIONS}
              onChange={(value) => setSetting('accent', value)}
            />
          </div>

          <div className="mt-6 flex items-center justify-between">
            <span className="text-sm text-ink">语速</span>
            <span className="display text-xl text-ink">{settings.rate.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            className="range mt-3"
            min={0.7}
            max={1.3}
            step={0.05}
            value={settings.rate}
            onChange={(event) => setSetting('rate', Number(event.target.value))}
            aria-label="语音速度"
          />
          <div className="mt-1 flex justify-between text-[10px] text-faint">
            <span>慢</span>
            <span>正常</span>
            <span>快</span>
          </div>

          <div className="mt-4 divide-y divide-line border-t border-line">
            <Toggle
              checked={settings.autoSpeak}
              onChange={(value) => setSetting('autoSpeak', value)}
              label="自动发音"
              description="切换到新卡片时自动朗读单词。"
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void speakWord('serendipity', settings.accent, settings.rate)}
            >
              <Volume2 size={15} />
              试听
            </button>
            <span className="text-[10px] text-faint">试听词：serendipity</span>
          </div>
        </Section>

        <Section
          icon={Sun}
          title="外观"
          description="浅色是暖纸与墨色，深色是夜读模式。"
        >
          <Segmented
            value={settings.theme}
            options={THEME_OPTIONS}
            onChange={(value) => setSetting('theme', value)}
          />
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line bg-paper p-3">
              <span className="kicker">Paper</span>
              <p className="display mt-2 text-lg text-ink">Aa</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <span className="kicker">Surface</span>
              <p className="display mt-2 text-lg text-ink">Aa</p>
            </div>
            <div className="rounded-xl border border-line bg-sunken p-3">
              <span className="kicker">Accent</span>
              <p className="display mt-2 text-lg text-accent">Aa</p>
            </div>
          </div>
        </Section>

        <Section
          icon={Database}
          title="数据"
          description="数据保存在本地文件中，可导出包含学习记录、个人词库和阅读文章的 JSON 备份。"
        >
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={handleExport}>
              <Download size={15} />
              导出备份
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => importRef.current?.click()}
              disabled={importBusy}
            >
              <Upload size={15} />
              {importBusy ? '导入中…' : '导入备份'}
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImport}
            />
          </div>

          <LocalDataInfo
            info={storageInfo}
            loading={storageLoading}
            error={storageError}
            onRefresh={refreshStorageInfo}
            onQuarantine={handleQuarantine}
            quarantineBusy={quarantineBusy}
          />
          <BackupManager
            list={backupList}
            loading={backupLoading}
            error={backupError}
            onRefresh={() => {
              setBackupError(null)
              void loadBackups()
            }}
            onRestore={(entry) => setRestoreTarget(entry)}
          />

          <div className="mt-6 space-y-3 border-t border-line pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-ink">清空学习进度</p>
                <p className="mt-0.5 text-[11px] text-faint">保留个人词库与设置。</p>
              </div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleResetProgress}
                onBlur={() => setConfirm('none')}
              >
                <RotateCcw size={14} />
                {confirm === 'progress' ? '确认清空？' : '清空进度'}
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-ink">清除全部数据</p>
                <p className="mt-0.5 text-[11px] text-faint">
                  设置、进度、个人词库和阅读文章都会删除，备份目录会保留。
                </p>
              </div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setResetAllOpen(true)}
              >
                <Trash2 size={14} />
                全部清除
              </button>
            </div>
          </div>
        </Section>
      </div>

      {resetAllOpen && (
        <ResetAllDialog
          info={storageInfo}
          onCancel={closeResetAll}
          onConfirm={handleResetAll}
        />
      )}
      {restoreTarget && (
        <RestoreBackupDialog
          entry={restoreTarget}
          busy={restoreBusy}
          onCancel={() => {
            if (!restoreBusy) setRestoreTarget(null)
          }}
          onConfirm={() => void handleRestoreBackup(restoreTarget)}
        />
      )}

      <section className="surface-card p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
            <Info size={16} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 className="display text-xl text-ink">关于词间</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              一个安静、克制的英语背单词工具。本地优先，无账号，无广告。
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 text-[11px] leading-relaxed text-muted sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-paper-deep/25 p-4">
            <p className="kicker">数据来源</p>
            <p className="mt-2">
              中文释义与词频来自{' '}
              <a className="text-accent hover:underline" href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noreferrer">
                ECDICT
              </a>
              （MIT）；英美音标来自{' '}
              <a className="text-accent hover:underline" href="https://github.com/open-dict-data/ipa-dict" target="_blank" rel="noreferrer">
                ipa-dict
              </a>
              （MIT）。
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-paper-deep/25 p-4">
            <p className="kicker">技术</p>
            <p className="mt-2">
              记忆算法使用{' '}
              <a className="text-accent hover:underline" href="https://github.com/open-spaced-repetition/ts-fsrs" target="_blank" rel="noreferrer">
                ts-fsrs
              </a>
              ；界面基于 React、Tailwind CSS；发音由 Web Speech API 提供。
            </p>
          </div>
        </div>
        <p className="mt-5 text-[10px] text-faint">
          词间 Lexicon · v{__APP_VERSION__} · 数据只属于你
        </p>
      </section>
    </div>
  )
}
