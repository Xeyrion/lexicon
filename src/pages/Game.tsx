import { ArrowUpRight, Gamepad2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { GAMES } from '../game/registry'

export default function Game() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Games"
        title="游戏"
        description="一堆小游戏。"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {GAMES.map((game) => (
          <Link
            key={game.id}
            to={game.route}
            className="surface-card group flex min-h-[13rem] flex-col p-6 transition-colors hover:border-accent/35"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-wash text-accent">
                <Gamepad2 size={20} strokeWidth={1.8} />
              </span>
              <ArrowUpRight
                size={18}
                strokeWidth={1.8}
                className="text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent"
              />
            </div>

            <h2 className="display mt-6 text-[1.65rem] leading-tight text-ink">{game.title}</h2>
            <p className="mt-1 text-xs text-muted">{game.subtitle}</p>
            <p className="mt-4 max-w-sm text-[0.82rem] leading-relaxed text-muted">
              {game.description}
            </p>

            <div className="mt-auto flex flex-wrap gap-1.5 pt-6">
              {game.tags.map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-faint">
        更多游戏在计划中。每个游戏都用同一套查词和生词本。
      </p>
    </div>
  )
}
