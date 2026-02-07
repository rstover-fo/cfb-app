'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { PlayerLeaderRow, LeaderCategory } from '@/app/players/actions'
import { teamNameToSlug } from '@/lib/utils'

interface ColumnDef {
  key: string
  label: string
  align: 'left' | 'right'
  sortKey: keyof PlayerLeaderRow
  format?: (value: number | null) => string
}

const PASSING_COLUMNS: ColumnDef[] = [
  { key: 'yards', label: 'Yards', align: 'right', sortKey: 'yards' },
  { key: 'touchdowns', label: 'TD', align: 'right', sortKey: 'touchdowns' },
  { key: 'interceptions', label: 'INT', align: 'right', sortKey: 'interceptions' },
  { key: 'pct', label: 'Comp%', align: 'right', sortKey: 'pct', format: (v) => v != null ? `${(v * 100).toFixed(1)}%` : '-' },
  { key: 'attempts', label: 'Att', align: 'right', sortKey: 'attempts' },
]

const RUSHING_COLUMNS: ColumnDef[] = [
  { key: 'yards', label: 'Yards', align: 'right', sortKey: 'yards' },
  { key: 'touchdowns', label: 'TD', align: 'right', sortKey: 'touchdowns' },
  { key: 'carries', label: 'Carries', align: 'right', sortKey: 'carries' },
  { key: 'yards_per_carry', label: 'YPC', align: 'right', sortKey: 'yards_per_carry', format: (v) => v != null ? v.toFixed(1) : '-' },
]

const RECEIVING_COLUMNS: ColumnDef[] = [
  { key: 'yards', label: 'Yards', align: 'right', sortKey: 'yards' },
  { key: 'touchdowns', label: 'TD', align: 'right', sortKey: 'touchdowns' },
  { key: 'receptions', label: 'Rec', align: 'right', sortKey: 'receptions' },
  { key: 'yards_per_reception', label: 'YPR', align: 'right', sortKey: 'yards_per_reception', format: (v) => v != null ? v.toFixed(1) : '-' },
]

const DEFENSE_COLUMNS: ColumnDef[] = [
  { key: 'total_tackles', label: 'Tackles', align: 'right', sortKey: 'total_tackles' },
  { key: 'solo_tackles', label: 'Solo', align: 'right', sortKey: 'solo_tackles' },
  { key: 'sacks', label: 'Sacks', align: 'right', sortKey: 'sacks', format: (v) => v != null ? v.toFixed(1) : '-' },
  { key: 'tackles_for_loss', label: 'TFL', align: 'right', sortKey: 'tackles_for_loss', format: (v) => v != null ? v.toFixed(1) : '-' },
  { key: 'interceptions', label: 'INT', align: 'right', sortKey: 'interceptions' },
  { key: 'passes_defended', label: 'PD', align: 'right', sortKey: 'passes_defended' },
]

const COLUMNS_BY_CATEGORY: Record<LeaderCategory, ColumnDef[]> = {
  passing: PASSING_COLUMNS,
  rushing: RUSHING_COLUMNS,
  receiving: RECEIVING_COLUMNS,
  defense: DEFENSE_COLUMNS,
}

type SortDirection = 'asc' | 'desc'

interface LeaderboardTableProps {
  leaders: PlayerLeaderRow[]
  category: LeaderCategory
  isPending: boolean
}

export function LeaderboardTable({ leaders, category, isPending }: LeaderboardTableProps) {
  const columns = COLUMNS_BY_CATEGORY[category]
  const [sortColumn, setSortColumn] = useState<keyof PlayerLeaderRow>('yards')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Reset sort when category changes
  const [prevCategory, setPrevCategory] = useState(category)
  if (prevCategory !== category) {
    setPrevCategory(category)
    const defaultSort = category === 'defense' ? 'total_tackles' : 'yards'
    setSortColumn(defaultSort as keyof PlayerLeaderRow)
    setSortDirection('desc')
  }

  const sortedLeaders = useMemo(() => {
    const sorted = [...leaders].sort((a, b) => {
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      const aNum = typeof aVal === 'number' ? aVal : 0
      const bNum = typeof bVal === 'number' ? bVal : 0

      return sortDirection === 'desc' ? bNum - aNum : aNum - bNum
    })
    return sorted
  }, [leaders, sortColumn, sortDirection])

  const handleSort = (col: keyof PlayerLeaderRow) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortColumn(col)
      setSortDirection('desc')
    }
  }

  const sortIndicator = (col: keyof PlayerLeaderRow) => {
    if (sortColumn !== col) return null
    return sortDirection === 'desc' ? ' \u25BC' : ' \u25B2'
  }

  const formatValue = (col: ColumnDef, row: PlayerLeaderRow) => {
    const value = row[col.sortKey as keyof PlayerLeaderRow] as number | null
    if (col.format) return col.format(value)
    return value != null ? String(value) : '-'
  }

  if (leaders.length === 0 && !isPending) {
    return (
      <p className="text-sm text-[var(--text-muted)] py-8 text-center">
        No player data available for this selection.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th scope="col" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-left py-2 px-2 w-10">
              #
            </th>
            <th scope="col" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-left py-2 px-2">
              Player
            </th>
            <th scope="col" className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-left py-2 px-2">
              Team
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={sortColumn === col.sortKey ? (sortDirection === 'desc' ? 'descending' : 'ascending') : 'none'}
                onClick={() => handleSort(col.sortKey)}
                className={`text-[10px] uppercase tracking-wider text-[var(--text-muted)] py-2 px-2 cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {col.label}
                {sortIndicator(col.sortKey)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={`transition-opacity duration-200 ${isPending ? 'opacity-50' : ''}`}>
          {sortedLeaders.map((row, idx) => (
            <tr
              key={`${row.player_id}-${idx}`}
              className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-surface-alt)]"
            >
              <td className="py-2 px-2 tabular-nums text-[var(--text-muted)]">
                {idx + 1}
              </td>
              <td className="py-2 px-2">
                <Link
                  href={`/players/${row.player_id}`}
                  className="text-[var(--text-primary)] hover:underline"
                >
                  {row.player_name}
                </Link>
                {row.position && (
                  <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">
                    {row.position}
                  </span>
                )}
              </td>
              <td className="py-2 px-2">
                <Link
                  href={`/teams/${teamNameToSlug(row.team)}`}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline"
                >
                  {row.team}
                </Link>
              </td>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`py-2 px-2 tabular-nums ${
                    col.align === 'right' ? 'text-right' : ''
                  }`}
                >
                  {formatValue(col, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
