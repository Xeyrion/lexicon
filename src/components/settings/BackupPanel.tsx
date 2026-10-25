import { RefreshCw, RotateCcw } from 'lucide-react'
import type { StorageBackupEntry, StorageBackupList } from '../../lib/storageInfo'
import { formatBackupTime, formatBytes } from './format'
import { STORAGE_FILES } from './constants'

export function BackupPanel({
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

