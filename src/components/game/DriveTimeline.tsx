'use client'

import type { GameDrive } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTCOME_COLORS: Record<string, string> = {
  touchdown: 'var(--color-positive)',
  field_goal: 'var(--color-field-goal)',
  punt: 'var(--color-neutral)',
  turnover: 'var(--color-negative)',
  downs: 'var(--color-run)',
  end_of_half: 'var(--color-pass)',
}

const RESULT_LABELS: Record<string, string> = {
  touchdown: 'TD',
  field_goal: 'FG',
  punt: 'PUNT',
  turnover: 'TO',
  downs: 'DOWNS',
  end_of_half: 'END',
}

const QUARTER_LABELS: Record<number, string> = {
  1: 'Q1',
  2: 'Q2',
  3: 'Q3',
  4: 'Q4',
  5: 'OT',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function getOutcomeColor(outcome: string): string {
  return OUTCOME_COLORS[outcome] ?? 'var(--text-muted)'
}

function abbreviateTeam(name: string): string {
  const words = name.split(/\s+/)
  if (words.length === 1) return name.slice(0, 3).toUpperCase()
  return words.slice(0, 4).map(w => w[0]).join('').toUpperCase()
}

function formatFieldPosition(yardsToGoal: number): string {
  if (yardsToGoal <= 50) return `Opp ${yardsToGoal}`
  return `Own ${100 - yardsToGoal}`
}

function formatElapsedTime(minutes: number, seconds: number): string {
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Group drives by their start_period, preserving order within each group. */
function groupDrivesByPeriod(drives: GameDrive[]): Map<number, GameDrive[]> {
  const groups = new Map<number, GameDrive[]>()
  for (const drive of drives) {
    const period = drive.start_period
    if (!groups.has(period)) {
      groups.set(period, [])
    }
    groups.get(period)!.push(drive)
  }
  return groups
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function QuarterBadge({ period }: { period: number }) {
  const label = QUARTER_LABELS[period] ?? `OT${period - 4}`
  return (
    <div className="flex items-center gap-2 py-3">
      <span className="font-headline text-sm font-semibold text-[var(--text-primary)] bg-[var(--bg-surface-alt)] px-3 py-1 rounded-full border border-[var(--border)]">
        {label}
      </span>
      <div className="flex-1 h-px bg-[var(--border)]" />
    </div>
  )
}

function DriveCard({
  drive,
  teamColor,
}: {
  drive: GameDrive
  teamColor: string | null
}) {
  const outcome = mapDriveResult(drive.drive_result)
  const resultLabel = RESULT_LABELS[outcome] ?? drive.drive_result
  const colorVar = getOutcomeColor(outcome)
  const isScoring = drive.scoring
  const isTurnover = outcome === 'turnover'

  const startPos = formatFieldPosition(drive.start_yards_to_goal)
  const endPos = formatFieldPosition(drive.end_yards_to_goal)
  const elapsed = formatElapsedTime(drive.elapsed_minutes, drive.elapsed_seconds)
  const teamAbbrev = abbreviateTeam(drive.offense)

  // Determine left border color for scoring/turnover emphasis
  let borderStyle = 'border-l-2 border-l-transparent'
  if (isScoring) borderStyle = 'border-l-2 border-l-[var(--color-positive)]'
  if (isTurnover) borderStyle = 'border-l-2 border-l-[var(--color-negative)]'

  return (
    <div
      className={`bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2.5 ${borderStyle}`}
    >
      {/* Top row: team dot + name | field position | result badge */}
      <div className="flex items-center gap-2">
        {/* Team indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: teamColor ?? 'var(--text-muted)' }}
          />
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {teamAbbrev}
          </span>
        </div>

        {/* Field position: start -> end with yards */}
        <div className="flex-1 text-xs text-[var(--text-primary)] min-w-0">
          <span>{startPos}</span>
          <span className="text-[var(--text-muted)] mx-1">&rarr;</span>
          <span>{endPos}</span>
          {drive.yards !== 0 && (
            <span className="text-[var(--text-muted)] ml-1.5">
              ({drive.yards > 0 ? '+' : ''}{drive.yards} yds)
            </span>
          )}
        </div>

        {/* Result badge */}
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm shrink-0"
          style={{
            backgroundColor: `color-mix(in srgb, ${colorVar} 15%, transparent)`,
            color: colorVar,
          }}
        >
          {resultLabel}
        </span>
      </div>

      {/* Bottom row: stat line */}
      <div className="text-[var(--text-muted)] text-xs mt-1">
        {drive.plays} {drive.plays === 1 ? 'play' : 'plays'} &middot; {drive.yards} yds &middot; {elapsed}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface DriveTimelineProps {
  drives: GameDrive[]
  game: GameWithTeams
}

export function DriveTimeline({ drives, game }: DriveTimelineProps) {
  if (drives.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)] italic py-8 text-center">
        No drive data available
      </p>
    )
  }

  const periodGroups = groupDrivesByPeriod(drives)
  const periods = Array.from(periodGroups.keys()).sort((a, b) => a - b)

  return (
    <div className="py-4">
      {periods.map((period, periodIdx) => {
        const periodDrives = periodGroups.get(period)!
        return (
          <div key={period}>
            {/* Quarter separator */}
            <QuarterBadge period={period} />

            {/* Drives within this period */}
            <div className="relative pl-6">
              {/* Vertical connecting line */}
              <div
                className="absolute left-[9px] top-0 bottom-0 w-0.5 bg-[var(--border)]"
                aria-hidden="true"
              />

              {periodDrives.map((drive, driveIdx) => {
                const isHome = drive.is_home_offense
                const teamColor = isHome ? game.homeColor : game.awayColor
                const isLastDriveInPeriod = driveIdx === periodDrives.length - 1
                const isLastPeriod = periodIdx === periods.length - 1

                return (
                  <div
                    key={drive.drive_number}
                    className={`relative ${isLastDriveInPeriod && isLastPeriod ? '' : 'pb-3'}`}
                  >
                    {/* Timeline node dot */}
                    <div
                      className="absolute -left-6 top-3 w-[11px] h-[11px] rounded-full border-2 border-[var(--border)] bg-[var(--bg-primary)]"
                      style={{
                        borderColor: teamColor ?? 'var(--border)',
                      }}
                      aria-hidden="true"
                    />

                    {/* Drive card */}
                    <DriveCard drive={drive} teamColor={teamColor} />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
