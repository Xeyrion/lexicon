import { RefreshCw } from 'lucide-react'
import type { StorageInfo, StorageKind } from '../../lib/storageInfo'
import { formatBytes } from './format'
import { STORAGE_FILES } from './constants'


const LIMIT_PRESETS_MB = [16, 32, 64, 128, 256, 512]
const MB = 1024 * 1024

export function LocalDataPanel({
  info,
  loading,
  error,
  onRefresh,
  onQuarantine,
  quarantineBusy,
  onChangeLimit,
  limitBusy,
}: {
  info: StorageInfo | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onQuarantine: (kind: StorageKind) => void
  quarantineBusy: StorageKind | null
  onChangeLimit: (bytes: number) => void
  limitBusy: boolean
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
              {STORAGE_FILES.map(({ kind, label }) => `${label} ${info.backups.byKind[kind].count} 份`).join(
                ' · ',
              )}
            </p>
          </div>

          <p className="text-[10px] leading-relaxed text-faint">
            清空全部数据不会删除 backups/ 目录；备份默认每类保留 {info.keepBackups} 份，如果觉得占用空间较大，可以直接到备份目录手动删除旧文件。
          </p>

          {typeof info.maxImportBytes === 'number' && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-3">
              <div className="min-w-0">
                <p className="text-[11px] text-ink-soft">单次导入上限</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-faint">
                  超过这个体积的备份会被拒绝。调大后导入会占用更多内存。
                </p>
              </div>
              <select
                className="input w-auto shrink-0 py-1.5 text-[11px]"
                value={info.maxImportBytes}
                disabled={limitBusy}
                aria-label="单次导入上限"
                onChange={(event) => onChangeLimit(Number(event.currentTarget.value))}
              >
                {limitOptions(info.maxImportBytes).map((mb) => (
                  <option key={mb} value={mb * MB}>
                    {mb} MB
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Presets plus whatever the server actually reports (env var, saved value). */
function limitOptions(current: number): number[] {
  const currentMb = Math.round(current / MB)
  const options = new Set(LIMIT_PRESETS_MB)
  options.add(currentMb)
  return [...options].sort((a, b) => a - b)
}
