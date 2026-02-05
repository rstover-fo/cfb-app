import type { GameBoxScore as GameBoxScoreType } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

interface GameBoxScoreProps {
  boxScore: GameBoxScoreType
  game: GameWithTeams
}

// Map database category names to display labels
const STAT_DISPLAY: Array<{ category: string; label: string }> = [
  { category: 'completionAttempts', label: 'Passing' },
  { category: 'netPassingYards', label: 'Pass Yards' },
  { category: 'rushingYards', label: 'Rush Yards' },
  { category: 'totalYards', label: 'Total Yards' },
  { category: 'turnovers', label: 'Turnovers' },
  { category: 'thirdDownEff', label: '3rd Down' },
  { category: 'totalPenaltiesYards', label: 'Penalties' },
  { category: 'possessionTime', label: 'Possession' },
]

export function GameBoxScore({ boxScore, game }: GameBoxScoreProps) {
  const { home, away } = boxScore

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-left text-sm font-medium text-[var(--text-muted)] py-3 px-4">
              {/* Empty header for stat label column */}
            </th>
            <th className="text-center text-sm font-medium text-[var(--text-secondary)] py-3 px-4 w-24">
              {game.away_team}
            </th>
            <th className="text-center text-sm font-medium text-[var(--text-secondary)] py-3 px-4 w-24">
              {game.home_team}
            </th>
          </tr>
        </thead>
        <tbody>
          {STAT_DISPLAY.map(({ category, label }, index) => {
            const awayStat = away.stats[category] ?? '-'
            const homeStat = home.stats[category] ?? '-'

            return (
              <tr
                key={category}
                className={index % 2 === 0 ? 'bg-[var(--bg-surface-alt)]' : ''}
              >
                <td className="text-sm text-[var(--text-secondary)] py-2.5 px-4">
                  {label}
                </td>
                <td className="text-sm text-[var(--text-primary)] text-center py-2.5 px-4 tabular-nums">
                  {awayStat}
                </td>
                <td className="text-sm text-[var(--text-primary)] text-center py-2.5 px-4 tabular-nums">
                  {homeStat}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
