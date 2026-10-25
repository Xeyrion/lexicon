import { addDays, dateKey, dayTotal, startOfToday, startOfWeek } from '../lib/date'
import type { DayStat } from '../types'

interface HeatmapProps {
  days: Record<string, DayStat>
  weeks?: number
}

function levelFor(total: number): number {
  if (total <= 0) return 0
  if (total < 5) return 1
  if (total < 12) return 2
  if (total < 25) return 3
  return 4
}

export function Heatmap({ days, weeks = 26 }: HeatmapProps) {
  const now = startOfToday()
  const end = startOfWeek(now)
  const start = addDays(end, -(weeks - 1) * 7)
  const cells: { key: string; total: number; future: boolean }[] = []

  for (let index = 0; index < weeks * 7; index += 1) {
    const date = addDays(start, index)
    const key = dateKey(date)
    cells.push({
      key,
      total: dayTotal(days[key]),
      future: date.getTime() > now.getTime(),
    })
  }

  const weekLabels = ['一', '', '三', '', '五', '', '日']

  return (
    <div>
      <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
        <div className="grid grid-rows-7 gap-1 pt-[1px] text-[9px] leading-[12px] text-faint">
          {weekLabels.map((label, index) => (
            <span key={index} className="h-3 w-3 text-center">
              {label}
            </span>
          ))}
        </div>
        <div className="grid min-w-max grid-flow-col grid-rows-7 gap-1">
          {cells.map((cell) => (
            <div
              key={cell.key}
              title={cell.future ? '' : `${cell.key} · ${cell.total} 个词`}
              className={`h-3 w-3 rounded-[3px] transition-colors ${
                cell.future ? 'bg-transparent' : `heat-${levelFor(cell.total)}`
              }`}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-faint">
        <span>少</span>
        <span className="h-3 w-3 rounded-[3px] heat-1" />
        <span className="h-3 w-3 rounded-[3px] heat-2" />
        <span className="h-3 w-3 rounded-[3px] heat-3" />
        <span className="h-3 w-3 rounded-[3px] heat-4" />
        <span>多</span>
      </div>
    </div>
  )
}
