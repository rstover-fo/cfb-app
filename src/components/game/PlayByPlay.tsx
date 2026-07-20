'use client'

import { useCallback } from 'react'
import type { GameDrive, GamePlay } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'
import { DriveSection } from './DriveSection'
import { ExportButton } from '@/components/ExportButton'
import { exportToCsv } from '@/lib/export-csv'

interface PlayByPlayProps {
  drives: GameDrive[]
  plays: GamePlay[]
  game: GameWithTeams
}

const TURNOVER_KEYWORDS = ['INT', 'FUMBLE']

function shouldDefaultExpand(drive: GameDrive): boolean {
  if (drive.scoring) return true
  const result = drive.drive_result.toUpperCase()
  return TURNOVER_KEYWORDS.some(kw => result.includes(kw))
}

export function PlayByPlay({ drives, plays, game }: PlayByPlayProps) {
  // Group plays by drive number
  const playsByDrive = new Map<number, GamePlay[]>()
  for (const play of plays) {
    const existing = playsByDrive.get(play.drive_number) ?? []
    existing.push(play)
    playsByDrive.set(play.drive_number, existing)
  }

  const handleExportAllDrives = useCallback(() => {
    const csvData = drives.map(drive => {
      const startPos = formatFieldPos(drive.start_yards_to_goal)
      const endPos = formatFieldPos(drive.end_yards_to_goal)
      const elapsed = `${drive.elapsed_minutes}:${String(drive.elapsed_seconds).padStart(2, '0')}`
      return {
        'Drive #': drive.drive_number,
        'Team': drive.offense,
        'Quarter': drive.quarter,
        'Start Position': startPos,
        'End Position': endPos,
        'Plays': drive.plays,
        'Yards': drive.yards,
        'Time': elapsed,
        'Result': drive.drive_result,
        'Scoring': drive.scoring ? 'Yes' : 'No',
      }
    })

    exportToCsv('drives', csvData)
  }, [drives])

  if (drives.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        No drive data available for this game.
      </div>
    )
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <ExportButton onClick={handleExportAllDrives} label="Export All Drives" />
      </div>
      <div className="space-y-0">
        {drives.map(drive => (
          <DriveSection
            key={drive.drive_number}
            drive={drive}
            plays={playsByDrive.get(drive.drive_number) ?? []}
            game={game}
            defaultExpanded={shouldDefaultExpand(drive)}
          />
        ))}
      </div>
    </>
  )
}

function formatFieldPos(yardsToGoal: number): string {
  if (yardsToGoal >= 100) return 'End Zone'
  if (yardsToGoal <= 0) return 'End Zone'
  if (yardsToGoal === 50) return 'Midfield'
  if (yardsToGoal > 50) return `Own ${100 - yardsToGoal}`
  return `Opp ${yardsToGoal}`
}
