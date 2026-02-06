'use client'

import { useMemo } from 'react'
import type { GameDrive } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

interface GameRedZoneProps {
  drives: GameDrive[]
  game: GameWithTeams
}

interface RedZoneStats {
  trips: number
  tds: number
  fgs: number
  turnovers: number
  tdRate: number
  scoringRate: number
  pointsPerTrip: number
}

/** Normalize drive result to a canonical category (case-insensitive, handles variations) */
function mapDriveResult(driveResult: string): string {
  const r = driveResult.toUpperCase()
  if (r === 'TD' || r.includes('TOUCHDOWN')) return 'touchdown'
  if (r === 'FG' || r.includes('FIELD GOAL')) return 'field_goal'
  if (r === 'PUNT') return 'punt'
  if (r === 'INT' || r === 'FUMBLE' || r.includes('INTERCEPT') || r.includes('FUMBLE')) return 'turnover'
  if (r === 'DOWNS' || r.includes('DOWNS')) return 'downs'
  if (r.includes('END OF HALF') || r.includes('END OF GAME') || r.includes('HALF')) return 'end_of_half'
  return 'uncategorized'
}

function computeRedZone(drives: GameDrive[], team: string): RedZoneStats {
  // Red zone = drives that start in or enter the red zone (within 20 yards of goal)
  const redZoneDrives = drives.filter(
    d => d.offense === team && (d.start_yards_to_goal <= 20 || d.end_yards_to_goal <= 20)
  )

  const trips = redZoneDrives.length
  if (trips === 0) {
    return { trips: 0, tds: 0, fgs: 0, turnovers: 0, tdRate: 0, scoringRate: 0, pointsPerTrip: 0 }
  }

  const tds = redZoneDrives.filter(d => mapDriveResult(d.drive_result) === 'touchdown').length
  const fgs = redZoneDrives.filter(d => mapDriveResult(d.drive_result) === 'field_goal').length
  const turnovers = redZoneDrives.filter(d => mapDriveResult(d.drive_result) === 'turnover').length

  return {
    trips,
    tds,
    fgs,
    turnovers,
    tdRate: tds / trips,
    scoringRate: (tds + fgs) / trips,
    pointsPerTrip: (tds * 7 + fgs * 3) / trips,
  }
}

interface StatRowProps {
  label: string
  awayValue: string
  homeValue: string
  awayRaw: number
  homeRaw: number
  awayColor: string | null
  homeColor: string | null
  higherIsBetter?: boolean
}

function StatRow({ label, awayValue, homeValue, awayRaw, homeRaw, awayColor, homeColor, higherIsBetter = true }: StatRowProps) {
  const maxVal = Math.max(awayRaw, homeRaw)
  const awayBetter = higherIsBetter ? awayRaw > homeRaw : awayRaw < homeRaw
  const homeBetter = higherIsBetter ? homeRaw > awayRaw : homeRaw < awayRaw

  const awayBarWidth = maxVal > 0 ? (awayRaw / maxVal) * 100 : 0
  const homeBarWidth = maxVal > 0 ? (homeRaw / maxVal) * 100 : 0

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2 border-b border-[var(--border)] last:border-b-0">
      {/* Away side */}
      <div className="flex items-center gap-2 justify-end">
        <span
          className={`text-sm tabular-nums ${
            awayBetter ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
          }`}
        >
          {awayValue}
        </span>
        <div className="w-20 h-2 rounded-full bg-[var(--bg-surface-alt)] overflow-hidden flex justify-end">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${awayBarWidth}%`,
              backgroundColor: awayColor ?? 'var(--text-muted)',
            }}
          />
        </div>
      </div>

      {/* Label */}
      <span className="text-xs text-[var(--text-muted)] text-center w-24 shrink-0">{label}</span>

      {/* Home side */}
      <div className="flex items-center gap-2">
        <div className="w-20 h-2 rounded-full bg-[var(--bg-surface-alt)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${homeBarWidth}%`,
              backgroundColor: homeColor ?? 'var(--text-muted)',
            }}
          />
        </div>
        <span
          className={`text-sm tabular-nums ${
            homeBetter ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
          }`}
        >
          {homeValue}
        </span>
      </div>
    </div>
  )
}

function formatPct(val: number): string {
  return `${Math.round(val * 100)}%`
}

function formatDecimal(val: number): string {
  return val.toFixed(1)
}

export function GameRedZone({ drives, game }: GameRedZoneProps) {
  const homeStats = useMemo(() => computeRedZone(drives, game.home_team), [drives, game.home_team])
  const awayStats = useMemo(() => computeRedZone(drives, game.away_team), [drives, game.away_team])

  const noData = homeStats.trips === 0 && awayStats.trips === 0

  if (noData) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-6 text-center">
        <p className="text-sm text-[var(--text-muted)]">No red zone drives in this game.</p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 justify-end">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{game.away_team}</span>
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: game.awayColor ?? 'var(--text-muted)' }}
          />
        </div>
        <span className="text-xs text-[var(--text-muted)] w-24 text-center">Red Zone</span>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: game.homeColor ?? 'var(--text-muted)' }}
          />
          <span className="text-sm font-semibold text-[var(--text-primary)]">{game.home_team}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 py-2">
        {awayStats.trips === 0 || homeStats.trips === 0 ? (
          <div className="py-3 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              {awayStats.trips === 0 ? game.away_team : game.home_team} had no red zone trips.
            </p>
          </div>
        ) : null}

        {awayStats.trips > 0 && homeStats.trips > 0 && (
          <>
            <StatRow
              label="TD Rate"
              awayValue={formatPct(awayStats.tdRate)}
              homeValue={formatPct(homeStats.tdRate)}
              awayRaw={awayStats.tdRate}
              homeRaw={homeStats.tdRate}
              awayColor={game.awayColor}
              homeColor={game.homeColor}
            />
            <StatRow
              label="Scoring Rate"
              awayValue={formatPct(awayStats.scoringRate)}
              homeValue={formatPct(homeStats.scoringRate)}
              awayRaw={awayStats.scoringRate}
              homeRaw={homeStats.scoringRate}
              awayColor={game.awayColor}
              homeColor={game.homeColor}
            />
            <StatRow
              label="Pts/Trip"
              awayValue={formatDecimal(awayStats.pointsPerTrip)}
              homeValue={formatDecimal(homeStats.pointsPerTrip)}
              awayRaw={awayStats.pointsPerTrip}
              homeRaw={homeStats.pointsPerTrip}
              awayColor={game.awayColor}
              homeColor={game.homeColor}
            />
            <StatRow
              label="Trips"
              awayValue={String(awayStats.trips)}
              homeValue={String(homeStats.trips)}
              awayRaw={awayStats.trips}
              homeRaw={homeStats.trips}
              awayColor={game.awayColor}
              homeColor={game.homeColor}
            />
            <StatRow
              label="Turnovers"
              awayValue={String(awayStats.turnovers)}
              homeValue={String(homeStats.turnovers)}
              awayRaw={awayStats.turnovers}
              homeRaw={homeStats.turnovers}
              awayColor={game.awayColor}
              homeColor={game.homeColor}
              higherIsBetter={false}
            />
          </>
        )}
      </div>
    </div>
  )
}
