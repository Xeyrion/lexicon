import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import PageFallback from '../../components/PageFallback'
import { PageHeader } from '../../components/PageHeader'
import { useGameStore } from '../../store/gameStore'
import { achievements } from '@remake/data'
import type { Achievement } from '@remake/data'
import { enAchievements } from '../i18n/en'
import { EMPTY_PROFILE, type GameLocale } from '../model'
import { GAMES } from '../registry'
import { useGameHydrated } from '../useGameHydrated'

const GRADE_LABEL = ['普通', '稀有', '史诗', '传说']
type Filter = 'all' | 'unlocked' | 'locked'

export default function Achievements() {
  const hydrated = useGameHydrated()
  if (!hydrated) return <PageFallback />
  return <AchievementsView />
}

function AchievementsView() {
  const { gameId = 'remake' } = useParams<{ gameId: string }>()
  const game = GAMES.find((entry) => entry.id === gameId)
  const [filter, setFilter] = useState<Filter>('all')
  const locale = useGameStore((state) => state.settings.locale)
  const setLocale = useGameStore((state) => state.setLocale)
  const profile = useGameStore((state) => state.profiles[gameId]) ?? EMPTY_PROFILE
  const table = useMemo(
    () => (gameId === 'remake' ? achievements : new Map<number, Achievement>()),
    [gameId],
  )
  const unlocked = useMemo(() => new Set(profile.achievements), [profile])
  const meta = profile.achievementMeta ?? {}

  const changeLocale = (next: GameLocale) => {
    setLocale(next)
  }

  const list = useMemo(() => {
    return [...table.values()]
      .sort((a, b) => b.grade - a.grade || a.id - b.id)
      .filter((achievement) => {
        if (filter === 'unlocked') return unlocked.has(achievement.id)
        if (filter === 'locked') return !unlocked.has(achievement.id)
        return true
      })
  }, [filter, table, unlocked])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={`/game/${gameId}`}
          className="inline-flex items-center gap-2 text-xs text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={1.8} />
          {game?.title ?? '游戏'}
        </Link>
        <span className="text-[11px] text-faint">·</span>
        <p className="text-xs text-muted">成就</p>
      </div>

      <PageHeader
        eyebrow="Achievements"
        title="成就"
        description={`${game?.title ?? gameId} · 已解锁 ${unlocked.size} / ${table.size}。`}
        actions={
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
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['all', '全部'],
            ['unlocked', '已解锁'],
            ['locked', '未解锁'],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
              filter === key ? 'bg-ink text-paper' : 'text-muted hover:bg-sunken hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((achievement) => {
          const open = unlocked.has(achievement.id)
          const hidden = achievement.hide && !open
          const en = enAchievements.get(achievement.id)
          const name = hidden
            ? '???'
            : locale === 'en'
              ? (en?.name ?? achievement.name)
              : achievement.name
          const description = hidden
            ? '隐藏成就，解锁后才显示'
            : locale === 'en'
              ? (en?.description ?? achievement.description)
              : achievement.description

          return (
            <div
              key={achievement.id}
              className={`rounded-2xl border p-4 transition-colors ${
                open
                  ? 'border-accent/35 bg-accent-wash/40'
                  : 'border-line bg-surface opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`text-sm ${open ? 'text-ink' : 'text-muted'}`}>{name}</span>
                <div className="flex shrink-0 items-center gap-1">
                  {open && meta[achievement.id] ? (
                    <span className="chip">
                      {meta[achievement.id].mode === 'standard' ? '标准' : '自定义'}
                    </span>
                  ) : null}
                  <span className="chip">{GRADE_LABEL[achievement.grade] ?? '普通'}</span>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">{description}</p>
            </div>
          )
        })}
      </div>

      {list.length === 0 && (
        <p className="py-10 text-center text-xs text-faint">这一栏还是空的。</p>
      )}
    </div>
  )
}
