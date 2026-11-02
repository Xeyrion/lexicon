import { ArrowLeft, RotateCcw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import PageFallback from '../../components/PageFallback'
import { PageHeader } from '../../components/PageHeader'
import { useGameStore } from '../../store/gameStore'
import { clampSpeed, type GameLocale } from '../model'
import { GAMES } from '../registry'
import { DEFAULT_RULES, normalizeRules, type GameRules } from '../rules'
import { useGameHydrated } from '../useGameHydrated'

export default function GameSettings() {
  const hydrated = useGameHydrated()
  if (!hydrated) return <PageFallback />
  return <GameSettingsView />
}

function GameSettingsView() {
  const { gameId = 'remake' } = useParams<{ gameId: string }>()
  const game = GAMES.find((entry) => entry.id === gameId)
  const rules = useGameStore((state) => state.settings.rules)
  const locale = useGameStore((state) => state.settings.locale)
  const speed = useGameStore((state) => state.settings.speed)
  const setRules = useGameStore((state) => state.setRules)
  const setLocale = useGameStore((state) => state.setLocale)
  const setSpeed = useGameStore((state) => state.setSpeed)

  const display = rules.preset === 'standard' ? DEFAULT_RULES : rules
  const capacity = display.allocLimit * 5

  const update = (patch: Partial<GameRules>) => {
    setRules(normalizeRules({ ...rules, ...patch }))
  }

  const changeLocale = (next: GameLocale) => {
    setLocale(next)
  }

  const changeSpeed = (value: number) => {
    setSpeed(clampSpeed(value))
  }

  const reset = () => {
    setRules(DEFAULT_RULES)
  }

  if (!game) {
    return (
      <div className="space-y-4">
        <Link to="/game" className="text-xs text-muted hover:text-ink">
          ← 游戏
        </Link>
        <p className="text-sm text-muted">没有找到这个游戏。</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={`/game/${gameId}`}
          className="inline-flex items-center gap-2 text-xs text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={1.8} />
          {game.title}
        </Link>
        <span className="text-[11px] text-faint">·</span>
        <p className="text-xs text-muted">设置</p>
      </div>

      <PageHeader
        eyebrow="Settings"
        title="设置"
        description={`${game.title} · 通用设置与开局规则。规则在开局时快照，不影响正在进行的这一局。`}
      />

      <section className="surface-card p-6 sm:p-8">
        <p className="kicker">General</p>
        <h2 className="display mt-2 text-xl text-ink">通用</h2>

        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-ink">语言</p>
              <p className="mt-1 text-[11px] text-faint">只影响游戏正文和成就名，不改变界面。</p>
            </div>
            <div className="inline-flex gap-1 rounded-full border border-line bg-surface p-1">
              <button
                type="button"
                onClick={() => changeLocale('en')}
                className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                  locale === 'en' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => changeLocale('zh')}
                className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                  locale === 'zh' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
                }`}
              >
                中
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-5">
            <div>
              <p className="text-sm text-ink">自动播放速度</p>
              <p className="mt-1 text-[11px] text-faint">0.5×–20×，游戏内也能随时改。</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="number"
                min={0.5}
                max={20}
                step={0.5}
                value={speed}
                onChange={(event) => changeSpeed(Number(event.currentTarget.value))}
                className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
              />
              ×
            </label>
          </div>
        </div>
      </section>

      <section className="surface-card p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="kicker">Rules</p>
            <h2 className="display mt-2 text-xl text-ink">开局规则</h2>
          </div>
          <div className="inline-flex gap-1 rounded-full border border-line bg-surface p-1">
            <button
              type="button"
              onClick={() => update({ preset: 'standard' })}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                rules.preset === 'standard' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
              }`}
            >
              标准
            </button>
            <button
              type="button"
              onClick={() => update({ preset: 'custom' })}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                rules.preset === 'custom' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
              }`}
            >
              自定义
            </button>
          </div>
        </div>

        {rules.preset === 'standard' ? (
          <div className="mt-6 space-y-3 text-sm text-muted">
            <p>标准局：抽 10 个天赋，选 3 个，20 点属性，单项上限 10，不能刷新，不能自选。</p>
            <p className="text-[11px] text-faint">
              标准局的成就是正儿八经的；自定义局也会点亮，但会标注「自定义」。
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs text-muted">抽几个天赋（6–20）</span>
                <input
                  type="number"
                  min={6}
                  max={20}
                  value={display.pullCount}
                  onChange={(event) => update({ pullCount: Number(event.currentTarget.value) })}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-muted">选几个（1–10）</span>
                <input
                  type="number"
                  min={1}
                  max={Math.min(10, display.pullCount)}
                  value={display.pickCount}
                  onChange={(event) => update({ pickCount: Number(event.currentTarget.value) })}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-muted">属性点（10–{capacity}）</span>
                <input
                  type="number"
                  min={10}
                  max={capacity}
                  value={display.points}
                  onChange={(event) => update({ points: Number(event.currentTarget.value) })}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-muted">单项上限（5–99）</span>
                <input
                  type="number"
                  min={5}
                  max={99}
                  value={display.allocLimit}
                  onChange={(event) => update({ allocLimit: Number(event.currentTarget.value) })}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-muted">刷新次数（0–20）</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={display.rerolls}
                  onChange={(event) => update({ rerolls: Number(event.currentTarget.value) })}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={display.selfSelect}
                  onChange={(event) => update({ selfSelect: event.currentTarget.checked })}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                允许自选天赋（跳过随机抽取）
              </label>
            </div>
            <p className="text-[11px] leading-relaxed text-faint">
              属性点上限 = 单项上限 × 5 = {capacity}。改小单项上限时，属性点会自动夹到上限。
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3 border-t border-line/60 pt-5">
          <button type="button" className="btn btn-secondary text-xs" onClick={reset}>
            <RotateCcw size={13} />
            恢复默认
          </button>
          <Link to={`/game/${gameId}`} className="btn btn-ghost text-xs">
            回到游戏
          </Link>
        </div>
      </section>
    </div>
  )
}
