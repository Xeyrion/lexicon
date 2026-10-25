import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw, Trash2 } from 'lucide-react'
import type { StorageBackupEntry, StorageInfo } from '../../lib/storageInfo'
import { formatBackupTime, formatBytes } from './format'
import { STORAGE_FILES } from './constants'

export function RestoreBackupDialog({
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

export function ResetAllDialog({
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

export function ResetProgressDialog({
  onCancel,
  onConfirm,
}: {
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
        aria-labelledby="reset-progress-title"
        aria-describedby="reset-progress-description"
        className="w-full max-w-md rounded-[1.75rem] border border-line bg-surface p-6 shadow-[var(--shadow-float)] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-wash text-accent">
            <RotateCcw size={16} strokeWidth={1.8} />
          </span>
          <div>
            <h2 id="reset-progress-title" className="display text-xl text-ink">
              清空学习进度？
            </h2>
            <p id="reset-progress-description" className="mt-1 text-xs leading-relaxed text-muted">
              卡片进度、复习记录和每日统计都会清空，且无法撤销。
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-line bg-paper-deep/30 px-4 py-3">
          <p className="kicker">会保留的内容</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
            个人词库、词书选择、学习计划与外观设置都保留。
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            自动备份不会删除，清空后仍可在上方备份列表里恢复。
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={onCancel} autoFocus>
            取消
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            <RotateCcw size={14} />
            确认清空
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
