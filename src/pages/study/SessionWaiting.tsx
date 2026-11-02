import { BarChart3, Clock, Home, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ProgressRing } from '../../components/ProgressRing'
import { formatWait } from './labels'

interface SessionWaitingProps {
  pendingCount: number
  waitMs: number
  progressPercent: number
  canAddMore: boolean
  onAddExtra: (count: number) => void
}

/** Shown while every remaining card is sitting in a learning step. */
export function SessionWaiting({
  pendingCount,
  waitMs,
  progressPercent,
  canAddMore,
  onAddExtra,
}: SessionWaitingProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="surface-card relative overflow-hidden p-7 text-center sm:p-12">
        <div className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full bg-forest/8 blur-2xl" />
        <p className="kicker">Learning steps</p>
        <h1 className="display relative mt-4 text-[2.1rem] leading-tight text-ink sm:text-[2.8rem]">
          学习步还在走。
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          还有 {pendingCount} 个词在记忆冷却，最快 {formatWait(waitMs)} 后回来。
        </p>

        <div className="relative mt-8 flex justify-center">
          <ProgressRing
            value={progressPercent}
            size={136}
            label={`${progressPercent}%`}
            hint="本组进度"
          />
        </div>

        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onAddExtra(10)}
            disabled={!canAddMore}
          >
            <Plus size={15} />
            加学 10 个
          </button>
          <Link to="/" className="btn btn-secondary">
            <Home size={15} />
            回首页
          </Link>
          <Link to="/stats" className="btn btn-ghost">
            <BarChart3 size={15} />
            查看统计
          </Link>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-faint">
          <Clock size={12} />
          {canAddMore ? '不想等的话，可以加学一组新词。' : '这本词书的词已经全部加入本组了。'}
        </p>
      </div>
      <p className="mt-5 text-center text-[10px] leading-relaxed text-faint">
        离开也没关系，到期的卡已经保存，下次会接着出现。
      </p>
    </div>
  )
}
