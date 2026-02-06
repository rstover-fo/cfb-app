'use client'

import { useState } from 'react'
import type { GameDrive, GamePlay } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'
import { PlayRow } from './PlayRow'

interface DriveSectionProps {
  drive: GameDrive
  plays: GamePlay[]
  game: GameWithTeams
  defaultExpanded: boolean
}

function formatFieldPos(yardsToGoal: number): string {
  if (yardsToGoal >= 100) return 'End Zone'
  if (yardsToGoal <= 0) return 'End Zone'
  if (yardsToGoal === 50) return 'Midfield'
  if (yardsToGoal > 50) return `Own ${100 - yardsToGoal}`
  return `Opp ${yardsToGoal}`
}

const RESULT_COLORS: Record<string, string> = {
  'TD': 'var(--color-positive)',
  'FG': 'var(--color-field-goal)',
  'PUNT': 'var(--color-neutral)',
  'INT': 'var(--color-negative)',
  'FUMBLE': 'var(--color-negative)',
  'DOWNS': 'var(--color-run)',
  'END OF HALF': 'var(--color-pass)',
}

function getResultColor(result: string): string {
  for (const [key, color] of Object.entries(RESULT_COLORS)) {
    if (result.toUpperCase().includes(key)) return color
  }
  return 'var(--text-muted)'
}

export function DriveSection({ drive, plays, game, defaultExpanded }: DriveSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const isHome = drive.is_home_offense
  const teamColor = isHome ? game.homeColor : game.awayColor
  const teamName = drive.offense
  const elapsed = `${drive.elapsed_minutes}:${String(drive.elapsed_seconds).padStart(2, '0')}`
  const resultColor = getResultColor(drive.drive_result)
  const startPos = formatFieldPos(drive.start_yards_to_goal)
  const endPos = formatFieldPos(drive.end_yards_to_goal)

  return (
    <div
      className="border border-[var(--border)] rounded-lg overflow-hidden mb-2"
      style={{ borderLeftWidth: '3px', borderLeftColor: teamColor ?? 'var(--border)' }}
    >
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-4 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-alt)] transition-colors cursor-pointer"
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {teamName}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              Drive #{drive.drive_number}
            </span>
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            {startPos} → {endPos}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded"
            style={{
              color: resultColor,
              backgroundColor: `color-mix(in srgb, ${resultColor} 15%, transparent)`,
            }}
          >
            {drive.drive_result}
          </span>
          <span className="text-xs text-[var(--text-muted)] tabular-nums whitespace-nowrap">
            {drive.plays} plays · {drive.yards} yds · {elapsed}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {expanded ? '▼' : '▶'}
          </span>
        </div>
      </button>

      <div
        className="grid transition-all duration-300"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {plays.map(play => (
            <PlayRow key={play.play_number} play={play} />
          ))}
          {plays.length === 0 && (
            <div className="py-3 px-4 text-sm text-[var(--text-muted)] italic">
              No play data available
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
