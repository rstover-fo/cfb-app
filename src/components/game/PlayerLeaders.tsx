import type { PlayerLeaders as PlayerLeadersType } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'
import { PlayerCategory } from './PlayerCategory'

interface PlayerLeadersProps {
  leaders: PlayerLeadersType
  game: GameWithTeams
}

const CATEGORIES = ['passing', 'rushing', 'receiving', 'defense'] as const

export function PlayerLeaders({ leaders, game }: PlayerLeadersProps) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide">
          Player Leaders
        </h3>
      </div>

      {/* Team columns - side by side on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border)]">
        {/* Away Team */}
        <div className="px-4 py-3">
          <div className="text-sm font-semibold text-[var(--text-secondary)] mb-3">
            {game.away_team}
          </div>
          {CATEGORIES.map((category) => (
            <PlayerCategory
              key={`away-${category}`}
              category={category}
              players={leaders.away[category]}
              teamName={game.away_team}
            />
          ))}
        </div>

        {/* Home Team */}
        <div className="px-4 py-3">
          <div className="text-sm font-semibold text-[var(--text-secondary)] mb-3">
            {game.home_team}
          </div>
          {CATEGORIES.map((category) => (
            <PlayerCategory
              key={`home-${category}`}
              category={category}
              players={leaders.home[category]}
              teamName={game.home_team}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
