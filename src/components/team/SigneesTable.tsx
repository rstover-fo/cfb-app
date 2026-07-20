'use client'

import { useState, useMemo } from 'react'
import { Star } from '@phosphor-icons/react'
import { Signee } from '@/lib/types/database'

interface SigneesTableProps {
  signees: Signee[] | null
  season: number
}

type SortKey = 'ranking' | 'name' | 'position' | 'stars' | 'rating'
type SortDir = 'asc' | 'desc'

interface SortableThProps {
  sortKeyName: SortKey
  label: string
  align?: 'left' | 'center' | 'right'
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
}

function SortableTh({ sortKeyName, label, align = 'left', sortKey, sortDir, onSort }: SortableThProps) {
  const isActive = sortKey === sortKeyName
  const ariaSort: 'ascending' | 'descending' | 'none' = !isActive ? 'none' : sortDir === 'asc' ? 'ascending' : 'descending'
  const sortIndicator = isActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`py-2 px-2 text-xs text-[var(--text-muted)] uppercase tracking-wide ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKeyName)}
        className="inline-flex items-center hover:text-[var(--text-secondary)] select-none"
        aria-label={`Sort by ${label}${isActive ? `, currently sorted ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        {label}{sortIndicator}
      </button>
    </th>
  )
}

export function SigneesTable({ signees, season }: SigneesTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('ranking')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const sorted = useMemo(() => {
    if (!signees) return []
    return [...signees].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'ranking':
          cmp = (a.ranking ?? 9999) - (b.ranking ?? 9999)
          break
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'position':
          cmp = a.position.localeCompare(b.position)
          break
        case 'stars':
          cmp = b.stars - a.stars
          break
        case 'rating':
          cmp = (b.rating ?? 0) - (a.rating ?? 0)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [signees, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'stars' || key === 'rating' ? 'desc' : 'asc')
    }
  }

  if (!signees || signees.length === 0) {
    return (
      <section>
        <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Signees</h2>
        <p className="text-[var(--text-muted)] text-sm">No signees found for {season}.</p>
      </section>
    )
  }

  return (
    <section>
      <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">
        {season} Signees ({signees.length})
      </h2>
      <div className="border border-[var(--border)] rounded-sm bg-[var(--bg-surface)] overflow-x-auto">
        <table className="w-full text-sm" aria-label={`${season} signing class`}>
          <thead>
            <tr className="border-b border-[var(--border)]">
              <SortableTh sortKeyName="ranking" label="#" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh sortKeyName="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh sortKeyName="position" label="Pos" align="center" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh sortKeyName="stars" label="Stars" align="center" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableTh sortKeyName="rating" label="Rating" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th scope="col" className="py-2 px-2 text-left text-xs text-[var(--text-muted)] uppercase tracking-wide hidden md:table-cell">Hometown</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr
                key={`${s.name}-${i}`}
                className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-surface-alt)] transition-colors"
              >
                <td className="py-2.5 px-2 text-[var(--text-muted)]">
                  {s.ranking ?? '--'}
                </td>
                <th scope="row" className="py-2.5 px-2 text-left font-medium text-[var(--text-primary)]">
                  {s.name}
                </th>
                <td className="py-2.5 px-2 text-center">
                  <span className="px-2 py-0.5 text-xs rounded bg-[var(--bg-surface-alt)] text-[var(--text-secondary)]">
                    {s.position}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-center">
                  <span className="inline-flex gap-0.5" aria-label={`${s.stars} star${s.stars === 1 ? '' : 's'}`}>
                    {Array.from({ length: 5 }, (_, j) => (
                      <Star
                        key={j}
                        size={14}
                        weight={j < s.stars ? 'fill' : 'regular'}
                        className={j < s.stars ? 'text-[var(--color-run)]' : 'text-[var(--border)]'}
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right text-[var(--text-secondary)] tabular-nums">
                  {s.rating !== null ? Number(s.rating).toFixed(4) : '--'}
                </td>
                <td className="py-2.5 px-2 text-[var(--text-muted)] hidden md:table-cell">
                  {[s.city, s.state_province].filter(Boolean).join(', ') || '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
