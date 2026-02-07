'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { PlayerGameLogEntry } from '@/app/players/[id]/actions'

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

type SortKey = 'week' | 'opponent' | 'plays' | 'total_yards' | 'total_epa' | 'epa_per_play' | 'success_rate' | 'explosive_plays'
type SortDirection = 'asc' | 'desc'

interface ColumnDef {
  key: SortKey
  label: string
  align: 'left' | 'right'
}

const COLUMNS: ColumnDef[] = [
  { key: 'week', label: 'Wk', align: 'right' },
  { key: 'opponent', label: 'Opponent', align: 'left' },
  { key: 'plays', label: 'Plays', align: 'right' },
  { key: 'total_yards', label: 'Yards', align: 'right' },
  { key: 'total_epa', label: 'EPA', align: 'right' },
  { key: 'epa_per_play', label: 'EPA/Play', align: 'right' },
  { key: 'success_rate', label: 'Success%', align: 'right' },
  { key: 'explosive_plays', label: 'Explosive', align: 'right' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PlayerGameLogProps {
  gameLog: PlayerGameLogEntry[]
}

export function PlayerGameLog({ gameLog }: PlayerGameLogProps) {
  const [sortKey, setSortKey] = useState<SortKey>('week')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')

  // Group by play_category if the player has multiple (e.g., passing + rushing)
  const categories = useMemo(() => {
    const cats = new Set(gameLog.map((e) => e.play_category))
    return Array.from(cats).sort()
  }, [gameLog])

  const [activeCategory, setActiveCategory] = useState<string | null>(
    categories.length > 1 ? categories[0] : null
  )

  const filteredLog = useMemo(() => {
    if (!activeCategory) return gameLog
    return gameLog.filter((e) => e.play_category === activeCategory)
  }, [gameLog, activeCategory])

  const sortedLog = useMemo(() => {
    return [...filteredLog].sort((a, b) => {
      const aVal = a[sortKey as keyof PlayerGameLogEntry]
      const bVal = b[sortKey as keyof PlayerGameLogEntry]

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      const aNum = typeof aVal === 'number' ? aVal : 0
      const bNum = typeof bVal === 'number' ? bVal : 0
      return sortDir === 'asc' ? aNum - bNum : bNum - aNum
    })
  }, [filteredLog, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'week' ? 'asc' : 'desc')
    }
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null
    return sortDir === 'desc' ? ' \u25BC' : ' \u25B2'
  }

  const getEpaColor = (value: number): string => {
    if (value > 0) return 'var(--color-positive)'
    if (value < 0) return 'var(--color-negative)'
    return 'var(--text-primary)'
  }

  if (gameLog.length === 0) {
    return null
  }

  return (
    <div className="card p-6">
      <h2 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-4">
        Game Log
      </h2>

      {/* Category tabs if multiple */}
      {categories.length > 1 && (
        <div className="flex items-center gap-0 mb-4">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 text-xs rounded-t border-b-2 transition-colors capitalize ${
                activeCategory === cat
                  ? 'border-[var(--color-run)] text-[var(--text-primary)] bg-[var(--bg-surface)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={sortKey === col.key ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                  onClick={() => handleSort(col.key)}
                  className={`text-[10px] uppercase tracking-wider text-[var(--text-muted)] py-2 px-2 cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.label}
                  {sortIndicator(col.key)}
                </th>
              ))}
              <th scope="col" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] py-2 px-2 text-left">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedLog.map((entry, idx) => (
              <tr
                key={`${entry.game_id}-${entry.play_category}-${idx}`}
                className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-surface-alt)]"
              >
                {/* Week */}
                <td className="py-2 px-2 tabular-nums text-right text-[var(--text-muted)]">
                  {entry.week ?? '-'}
                </td>

                {/* Opponent */}
                <td className="py-2 px-2">
                  {entry.opponent ? (
                    <Link
                      href={`/games/${entry.game_id}`}
                      className="text-[var(--text-primary)] hover:underline whitespace-nowrap"
                    >
                      {entry.home_away === 'away' ? '@' : 'vs'}{' '}
                      {entry.opponent}
                    </Link>
                  ) : (
                    <span className="text-[var(--text-muted)]">-</span>
                  )}
                </td>

                {/* Plays */}
                <td className="py-2 px-2 tabular-nums text-right">
                  {entry.plays}
                </td>

                {/* Yards */}
                <td className="py-2 px-2 tabular-nums text-right">
                  {Math.round(entry.total_yards)}
                </td>

                {/* EPA */}
                <td
                  className="py-2 px-2 tabular-nums text-right"
                  style={{ color: getEpaColor(entry.total_epa) }}
                >
                  {entry.total_epa.toFixed(2)}
                </td>

                {/* EPA/Play */}
                <td
                  className="py-2 px-2 tabular-nums text-right"
                  style={{ color: getEpaColor(entry.epa_per_play) }}
                >
                  {entry.epa_per_play.toFixed(3)}
                </td>

                {/* Success% */}
                <td className="py-2 px-2 tabular-nums text-right">
                  {(entry.success_rate * 100).toFixed(0)}%
                </td>

                {/* Explosive */}
                <td className="py-2 px-2 tabular-nums text-right">
                  {entry.explosive_plays}
                </td>

                {/* Result */}
                <td className="py-2 px-2 text-left">
                  {entry.result ? (
                    <span
                      className="text-xs font-medium"
                      style={{
                        color: entry.result === 'W'
                          ? 'var(--color-positive)'
                          : entry.result === 'L'
                            ? 'var(--color-negative)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {entry.result}
                    </span>
                  ) : (
                    <span className="text-[var(--text-muted)]">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals row */}
      {sortedLog.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center gap-6 text-xs text-[var(--text-muted)]">
          <span className="tabular-nums">
            {sortedLog.length} games
          </span>
          <span className="tabular-nums">
            Avg EPA/Play:{' '}
            <span
              style={{
                color: getEpaColor(
                  sortedLog.reduce((s, e) => s + e.epa_per_play, 0) / sortedLog.length
                ),
              }}
            >
              {(sortedLog.reduce((s, e) => s + e.epa_per_play, 0) / sortedLog.length).toFixed(3)}
            </span>
          </span>
          <span className="tabular-nums">
            Total Yards: {Math.round(sortedLog.reduce((s, e) => s + e.total_yards, 0))}
          </span>
        </div>
      )}
    </div>
  )
}
