'use client'

import { useMemo } from 'react'
import type { GamePlay } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

interface GameDownDistanceProps {
  plays: GamePlay[]
  game: GameWithTeams
}

interface BucketStats {
  playCount: number
  successes: number
  totalPpa: number
  successRate: number
  avgPpa: number
}

type DistanceBucket = '1-3' | '4-6' | '7-10' | '11+'

const DISTANCE_BUCKETS: { key: DistanceBucket; label: string }[] = [
  { key: '1-3', label: 'Short' },
  { key: '4-6', label: 'Med' },
  { key: '7-10', label: 'Long' },
  { key: '11+', label: 'XLong' },
]

const DOWNS = [1, 2, 3, 4] as const

function getDistanceBucket(distance: number): DistanceBucket {
  if (distance <= 3) return '1-3'
  if (distance <= 6) return '4-6'
  if (distance <= 10) return '7-10'
  return '11+'
}

function computeTeamGrid(plays: GamePlay[], team: string): Map<string, BucketStats> {
  const grid = new Map<string, BucketStats>()

  const teamPlays = plays.filter(
    p => p.offense === team && p.down !== null && p.ppa !== null && p.distance !== null
  )

  for (const play of teamPlays) {
    const bucket = getDistanceBucket(play.distance!)
    const key = `${play.down}-${bucket}`

    const existing = grid.get(key) ?? { playCount: 0, successes: 0, totalPpa: 0, successRate: 0, avgPpa: 0 }
    existing.playCount += 1
    existing.totalPpa += play.ppa ?? 0
    if (play.ppa! > 0) existing.successes += 1
    grid.set(key, existing)
  }

  // Compute rates from accumulated totals (avoids O(n*m) re-filtering)
  for (const [, stats] of grid) {
    stats.successRate = stats.playCount > 0 ? stats.successes / stats.playCount : 0
    stats.avgPpa = stats.playCount > 0 ? stats.totalPpa / stats.playCount : 0
  }

  return grid
}

function successRateBg(rate: number): string {
  if (rate >= 0.6) return 'bg-green-100/80 dark:bg-green-900/30'
  if (rate >= 0.4) return 'bg-yellow-100/80 dark:bg-yellow-900/30'
  return 'bg-red-100/80 dark:bg-red-900/30'
}

function TeamGrid({ grid, team, color }: { grid: Map<string, BucketStats>; team: string; color: string | null }) {
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

        {/* Header row */}
        <div className="grid grid-cols-5 gap-px bg-[var(--border)]">
          <div className="bg-[var(--bg-surface)] px-2 py-1.5 text-xs font-medium text-[var(--text-muted)]">
            Down
          </div>
          {DISTANCE_BUCKETS.map(b => (
            <div
              key={b.key}
              className="bg-[var(--bg-surface)] px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] text-center"
            >
              <div>{b.key}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{b.label}</div>
            </div>
          ))}
        </div>

        {/* Data rows */}
        {DOWNS.map(down => (
          <div key={down} className="grid grid-cols-5 gap-px bg-[var(--border)]">
            <div className="bg-[var(--bg-surface)] px-2 py-2 text-sm font-medium text-[var(--text-secondary)] flex items-center">
              {down}{down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th'}
            </div>
            {DISTANCE_BUCKETS.map(b => {
              const key = `${down}-${b.key}`
              const stats = grid.get(key)

              if (!stats || stats.playCount === 0) {
                return (
                  <div
                    key={b.key}
                    className="bg-[var(--bg-surface-alt)] px-2 py-2 text-center flex items-center justify-center"
                  >
                    <span className="text-xs text-[var(--text-muted)]">&mdash;</span>
                  </div>
                )
              }

              const smallSample = stats.playCount < 3

              return (
                <div
                  key={b.key}
                  className={`px-2 py-2 text-center ${successRateBg(stats.successRate)} ${
                    smallSample ? 'border border-dashed border-[var(--text-muted)]' : ''
                  }`}
                >
                  <div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                    {Math.round(stats.successRate * 100)}%
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] tabular-nums">
                    {stats.playCount} play{stats.playCount !== 1 ? 's' : ''}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function GameDownDistance({ plays, game }: GameDownDistanceProps) {
  const homeGrid = useMemo(() => computeTeamGrid(plays, game.home_team), [plays, game.home_team])
  const awayGrid = useMemo(() => computeTeamGrid(plays, game.away_team), [plays, game.away_team])

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <TeamGrid grid={awayGrid} team={game.away_team} color={game.awayColor} />
      <TeamGrid grid={homeGrid} team={game.home_team} color={game.homeColor} />
    </div>
  )
}
