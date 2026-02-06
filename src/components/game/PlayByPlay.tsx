'use client'

import type { GameDrive, GamePlay } from '@/lib/types/database'
import type { GameWithTeams } from '@/lib/queries/games'
import { DriveSection } from './DriveSection'

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

  if (drives.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        No drive data available for this game.
      </div>
    )
  }

  return (
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
  )
}
