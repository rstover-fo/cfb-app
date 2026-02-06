'use client'

import Image from 'next/image'
import type { LineScores } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

interface QuarterScoresProps {
  lineScores: LineScores
  game: GameWithTeams
}

function getPeriodHeader(index: number): string {
  if (index < 4) return `${index + 1}Q`
  if (index === 4) return 'OT'
  return `${index - 3}OT`
}

export function QuarterScores({ lineScores, game }: QuarterScoresProps) {
  const numPeriods = Math.max(lineScores.home.length, lineScores.away.length)
  const periods = Array.from({ length: numPeriods }, (_, i) => i)

  const awayWon = game.away_points > game.home_points
  const homeWon = game.home_points > game.away_points

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left text-sm font-medium text-[var(--text-muted)] py-3 px-4 min-w-[140px]">
                Team
              </th>
              {periods.map(i => (
                <th
                  key={i}
                  className="text-center text-sm font-medium text-[var(--text-muted)] py-3 px-3 w-12"
                >
                  {getPeriodHeader(i)}
                </th>
              ))}
              <th className="text-center text-sm font-semibold text-[var(--text-primary)] py-3 px-4 w-16">
                Final
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Away team row */}
            <tr
              className="border-l-3 bg-[var(--bg-surface-alt)]"
              style={{ borderLeftColor: game.awayColor || 'transparent' }}
            >
              <td className="py-2.5 px-4">
                <div className="flex items-center gap-2">
                  {game.awayLogo ? (
                    <Image
                      src={game.awayLogo}
                      alt={game.away_team}
                      width={24}
                      height={24}
                      className="w-6 h-6 object-contain"
                      unoptimized
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: game.awayColor || 'var(--bg-surface-alt)' }}
                    />
                  )}
                  <span className={`text-sm ${awayWon ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                    {game.away_team}
                  </span>
                </div>
              </td>
              {periods.map(i => (
                <td
                  key={i}
                  className="text-sm text-center text-[var(--text-secondary)] py-2.5 px-3 tabular-nums"
                >
                  {lineScores.away[i] ?? '-'}
                </td>
              ))}
              <td className={`text-sm text-center py-2.5 px-4 tabular-nums ${awayWon ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                {game.away_points}
              </td>
            </tr>

            {/* Home team row */}
            <tr
              className="border-l-3"
              style={{ borderLeftColor: game.homeColor || 'transparent' }}
            >
              <td className="py-2.5 px-4">
                <div className="flex items-center gap-2">
                  {game.homeLogo ? (
                    <Image
                      src={game.homeLogo}
                      alt={game.home_team}
                      width={24}
                      height={24}
                      className="w-6 h-6 object-contain"
                      unoptimized
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: game.homeColor || 'var(--bg-surface-alt)' }}
                    />
                  )}
                  <span className={`text-sm ${homeWon ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                    {game.home_team}
                  </span>
                </div>
              </td>
              {periods.map(i => (
                <td
                  key={i}
                  className="text-sm text-center text-[var(--text-secondary)] py-2.5 px-3 tabular-nums"
                >
                  {lineScores.home[i] ?? '-'}
                </td>
              ))}
              <td className={`text-sm text-center py-2.5 px-4 tabular-nums ${homeWon ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                {game.home_points}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
