'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import {
  fetchPlayerDetail,
  fetchPlayerGameLog,
  fetchPlayerPercentiles,
} from '@/app/players/[id]/actions'
import type {
  PlayerProfile,
  PlayerPercentiles,
  PlayerGameLogEntry,
} from '@/app/players/[id]/actions'
import { selectClassName, selectStyle } from '@/lib/utils'
import { PlayerBioHeader } from './PlayerBioHeader'
import { PlayerStatsTable } from './PlayerStatsTable'
import { PercentileRadar } from './PercentileRadar'
import { GameTrendChart } from './GameTrendChart'
import { PlayerGameLog } from './PlayerGameLog'

interface PlayerDetailClientProps {
  player: PlayerProfile
  percentiles: PlayerPercentiles | null
  gameLog: PlayerGameLogEntry[]
  playerSeasons: number[]
}

export function PlayerDetailClient({
  player: initialPlayer,
  percentiles: initialPercentiles,
  gameLog: initialGameLog,
  playerSeasons,
}: PlayerDetailClientProps) {
  const [player, setPlayer] = useState(initialPlayer)
  const [percentiles, setPercentiles] = useState(initialPercentiles)
  const [gameLog, setGameLog] = useState(initialGameLog)
  const [season, setSeason] = useState(initialPlayer.season)
  const [isPending, startTransition] = useTransition()
  const requestIdRef = useRef(0)

  const handleSeasonChange = (newSeason: number) => {
    setSeason(newSeason)
    const currentRequestId = ++requestIdRef.current

    startTransition(async () => {
      const [newPlayer, newPercentiles, newGameLog] = await Promise.all([
        fetchPlayerDetail(player.player_id, newSeason),
        fetchPlayerPercentiles(player.player_id, newSeason),
        fetchPlayerGameLog(player.player_id, newSeason),
      ])

      if (currentRequestId === requestIdRef.current) {
        if (newPlayer) setPlayer(newPlayer)
        setPercentiles(newPercentiles)
        setGameLog(newGameLog)
      }
    })
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      {/* Back link */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/players"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          &larr; Back to Players
        </Link>

        {playerSeasons.length > 1 && (
          <select
            value={season}
            onChange={(e) => handleSeasonChange(parseInt(e.target.value, 10))}
            className={selectClassName}
            style={selectStyle}
            disabled={isPending}
            aria-label="Select season"
          >
            {playerSeasons.map((s) => (
              <option key={s} value={s}>
                {s} Season
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Loading overlay */}
      <div className={`transition-opacity duration-200 ${isPending ? 'opacity-50' : ''}`}>
        {/* Bio header */}
        <PlayerBioHeader player={player} />

        {/* Two-column grid: stats + percentile radar */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <PlayerStatsTable player={player} />

          {percentiles && (
            <div className="card p-6">
              <h2 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-3">
                Percentile Rankings
              </h2>
              <p className="text-[11px] text-[var(--text-muted)] mb-3">
                vs. {percentiles.position_group ?? 'position group'} &middot; {percentiles.season}
              </p>
              <PercentileRadar percentiles={percentiles} />
            </div>
          )}
        </div>

        {/* Game trend chart */}
        {gameLog.length > 0 && (
          <div className="card p-6 mt-6">
            <h2 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-4">
              Season Trend
            </h2>
            <GameTrendChart gameLog={gameLog} />
          </div>
        )}

        {/* Game log table */}
        {gameLog.length > 0 && (
          <div className="mt-6">
            <PlayerGameLog gameLog={gameLog} />
          </div>
        )}
      </div>
    </div>
  )
}
