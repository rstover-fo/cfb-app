'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PlayerStat } from '@/lib/types/database'

interface PlayerCategoryProps {
  category: string
  players: PlayerStat[]
  teamName: string
}

// Format stat line based on category
function formatStatLine(category: string, stats: Record<string, string>): string {
  switch (category.toLowerCase()) {
    case 'passing':
      return [
        stats['C/ATT'],
        stats['YDS'] ? `${stats['YDS']} YDS` : null,
        stats['TD'] && stats['TD'] !== '0' ? `${stats['TD']} TD` : null,
        stats['INT'] && stats['INT'] !== '0' ? `${stats['INT']} INT` : null,
      ].filter(Boolean).join(', ')
    case 'rushing':
      return [
        stats['CAR'] ? `${stats['CAR']} CAR` : null,
        stats['YDS'] ? `${stats['YDS']} YDS` : null,
        stats['TD'] && stats['TD'] !== '0' ? `${stats['TD']} TD` : null,
      ].filter(Boolean).join(', ')
    case 'receiving':
      return [
        stats['REC'] ? `${stats['REC']} REC` : null,
        stats['YDS'] ? `${stats['YDS']} YDS` : null,
        stats['TD'] && stats['TD'] !== '0' ? `${stats['TD']} TD` : null,
      ].filter(Boolean).join(', ')
    case 'defense':
      return [
        stats['TCKL'] ? `${stats['TCKL']} TCKL` : null,
        stats['TFL'] && stats['TFL'] !== '0' ? `${stats['TFL']} TFL` : null,
        stats['SACK'] && stats['SACK'] !== '0' ? `${stats['SACK']} SACK` : null,
        stats['INT'] && stats['INT'] !== '0' ? `${stats['INT']} INT` : null,
        stats['PD'] && stats['PD'] !== '0' ? `${stats['PD']} PD` : null,
      ].filter(Boolean).join(', ')
    default:
      return Object.entries(stats).map(([k, v]) => `${v} ${k}`).join(', ')
  }
}

export function PlayerCategory({ category, players, teamName }: PlayerCategoryProps) {
  const [expanded, setExpanded] = useState(false)

  if (players.length === 0) {
    return null
  }

  const visiblePlayers = expanded ? players : players.slice(0, 1)
  const hasMore = players.length > 1

  return (
    <div className="py-3">
      <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
        {category}
      </div>
      <div className="space-y-2">
        {visiblePlayers.map((player) => (
          <div key={player.id}>
            <Link
              href={`/players/${player.id}`}
              className="text-sm font-medium text-[var(--text-primary)] hover:underline"
            >
              {player.name}
            </Link>
            <div className="text-xs text-[var(--text-muted)] tabular-nums">
              {formatStatLine(category, player.stats)}
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors flex items-center gap-1"
          aria-label={expanded ? `Show fewer ${category.toLowerCase()} stats for ${teamName}` : `Show more ${category.toLowerCase()} stats for ${teamName}`}
        >
          <span className="inline-block transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>
            ▼
          </span>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
