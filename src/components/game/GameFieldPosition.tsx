'use client'

import { useMemo } from 'react'
import type { GamePlay } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

interface GameFieldPositionProps {
  plays: GamePlay[]
  game: GameWithTeams
}

interface ZoneStats {
  zone: string
  playCount: number
  successRate: number
  avgPpa: number
  avgYardsGained: number
}

const ZONES: { label: string; min: number; max: number }[] = [
  { label: 'Own 1-20', min: 81, max: 100 },
  { label: 'Own 21-50', min: 50, max: 80 },
  { label: 'Opp 49-21', min: 21, max: 49 },
  { label: 'Red Zone', min: 1, max: 20 },
]

function computeFieldPosition(plays: GamePlay[], team: string): ZoneStats[] {
  const teamPlays = plays.filter(
    p => p.offense === team && p.yards_to_goal !== null && p.ppa !== null
  )

  return ZONES.map(zone => {
    const zonePlays = teamPlays.filter(
      p => p.yards_to_goal! >= zone.min && p.yards_to_goal! <= zone.max
    )

    const playCount = zonePlays.length
    if (playCount === 0) {
      return { zone: zone.label, playCount: 0, successRate: 0, avgPpa: 0, avgYardsGained: 0 }
    }

    const successes = zonePlays.filter(p => p.ppa! > 0).length
    const totalPpa = zonePlays.reduce((sum, p) => sum + (p.ppa ?? 0), 0)
    const totalYards = zonePlays.reduce((sum, p) => sum + (p.yards_gained ?? 0), 0)

    return {
      zone: zone.label,
      playCount,
      successRate: successes / playCount,
      avgPpa: totalPpa / playCount,
      avgYardsGained: totalYards / playCount,
    }
  })
}

function successRateBg(rate: number): string {
  if (rate >= 0.6) return 'bg-green-100/80 dark:bg-green-900/30'
  if (rate >= 0.4) return 'bg-yellow-100/80 dark:bg-yellow-900/30'
  return 'bg-red-100/80 dark:bg-red-900/30'
}

function TeamTable({ stats, team, color }: { stats: ZoneStats[]; team: string; color: string | null }) {
  return (
    <div className="flex-1 min-w-0">
      <div
        className="border-t-[3px] rounded-t-sm mb-0"
        style={{ borderColor: color ?? 'var(--text-muted)' }}
      />
      <div className="bg-[var(--bg-surface)] border border-t-0 border-[var(--border)] rounded-b-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--border)]">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">{team}</h4>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left text-xs font-medium text-[var(--text-muted)] py-2 px-3">Zone</th>
              <th className="text-center text-xs font-medium text-[var(--text-muted)] py-2 px-2">Plays</th>
              <th className="text-center text-xs font-medium text-[var(--text-muted)] py-2 px-2">Success%</th>
              <th className="text-center text-xs font-medium text-[var(--text-muted)] py-2 px-2">EPA/Play</th>
              <th className="text-center text-xs font-medium text-[var(--text-muted)] py-2 px-2">Yds/Play</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row, idx) => (
              <tr
                key={row.zone}
                className={idx % 2 === 0 ? 'bg-[var(--bg-surface-alt)]' : ''}
              >
                <td className="text-sm text-[var(--text-secondary)] py-2 px-3">{row.zone}</td>
                <td className="text-sm text-[var(--text-primary)] text-center py-2 px-2 tabular-nums">
                  {row.playCount || '\u2014'}
                </td>
                {row.playCount > 0 ? (
                  <>
                    <td className={`text-sm text-[var(--text-primary)] text-center py-2 px-2 tabular-nums ${successRateBg(row.successRate)}`}>
                      {Math.round(row.successRate * 100)}%
                    </td>
                    <td className={`text-sm text-center py-2 px-2 tabular-nums ${
                      row.avgPpa > 0 ? 'text-[var(--color-positive)]' : row.avgPpa < 0 ? 'text-[var(--color-negative)]' : 'text-[var(--text-primary)]'
                    }`}>
                      {row.avgPpa > 0 ? '+' : ''}{row.avgPpa.toFixed(2)}
                    </td>
                    <td className="text-sm text-[var(--text-primary)] text-center py-2 px-2 tabular-nums">
                      {row.avgYardsGained.toFixed(1)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="text-sm text-[var(--text-muted)] text-center py-2 px-2">&mdash;</td>
                    <td className="text-sm text-[var(--text-muted)] text-center py-2 px-2">&mdash;</td>
                    <td className="text-sm text-[var(--text-muted)] text-center py-2 px-2">&mdash;</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function GameFieldPosition({ plays, game }: GameFieldPositionProps) {
  const homeStats = useMemo(() => computeFieldPosition(plays, game.home_team), [plays, game.home_team])
  const awayStats = useMemo(() => computeFieldPosition(plays, game.away_team), [plays, game.away_team])

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <TeamTable stats={awayStats} team={game.away_team} color={game.awayColor} />
      <TeamTable stats={homeStats} team={game.home_team} color={game.homeColor} />
    </div>
  )
}
