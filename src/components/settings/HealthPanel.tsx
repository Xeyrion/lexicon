import type { ClockIssues } from '../../lib/health'

export function HealthPanel({ issues }: { issues: ClockIssues }) {
  if (issues.total === 0) return null

  const details = [
    { label: '到期时间在 10 年之后', count: issues.farFutureDue, unit: '张卡片' },
    { label: '学习记录时间晚于明天', count: issues.futureTimestamps, unit: '条记录' },
    { label: '统计日期晚于明天', count: issues.futureDays, unit: '天' },
  ].filter((item) => item.count > 0)

  return (
    <div className="mt-4 rounded-xl border border-accent/30 bg-accent-wash px-3 py-2.5">
      <p className="text-[11px] font-medium text-accent">时间记录异常</p>
      <p className="mt-1 text-[10px] leading-relaxed text-accent">
        检测到 {issues.total} 条记录的时间与当前系统时间不一致，可能是改过系统时间或跨时区。
      </p>
      <ul className="mt-2 space-y-1 text-[10px] leading-relaxed text-accent">
        {details.map((item) => (
          <li key={item.label} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">{item.label}</span>
            <span className="shrink-0 tabular-nums">
              {item.count} {item.unit}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-relaxed text-accent">
        建议先导出备份；确认系统时间正确后刷新页面。
      </p>
    </div>
  )
}
