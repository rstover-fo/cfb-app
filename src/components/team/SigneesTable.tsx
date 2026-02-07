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

  const headerClass = 'py-2 px-2 text-left text-xs text-[var(--text-muted)] uppercase tracking-wide cursor-pointer hover:text-[var(--text-secondary)] select-none'
  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <section>
      <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">
        {season} Signees ({signees.length})
      </h2>
      <div className="border border-[var(--border)] rounded-sm bg-[var(--bg-surface)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className={headerClass} onClick={() => handleSort('ranking')}>
                #{sortIndicator('ranking')}
              </th>
              <th className={headerClass} onClick={() => handleSort('name')}>
                Name{sortIndicator('name')}
              </th>
              <th className={`${headerClass} text-center`} onClick={() => handleSort('position')}>
                Pos{sortIndicator('position')}
              </th>
              <th className={`${headerClass} text-center`} onClick={() => handleSort('stars')}>
                Stars{sortIndicator('stars')}
              </th>
              <th className={`${headerClass} text-right`} onClick={() => handleSort('rating')}>
                Rating{sortIndicator('rating')}
              </th>
              <th className={`${headerClass} hidden md:table-cell`}>Hometown</th>
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
                <td className="py-2.5 px-2 text-[var(--text-primary)] font-medium">
                  {s.name}
                </td>
                <td className="py-2.5 px-2 text-center">
                  <span className="px-2 py-0.5 text-xs rounded bg-[var(--bg-surface-alt)] text-[var(--text-secondary)]">
                    {s.position}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-center">
                  <span className="inline-flex gap-0.5">
                    {Array.from({ length: 5 }, (_, j) => (
                      <Star
                        key={j}
                        size={14}
                        weight={j < s.stars ? 'fill' : 'regular'}
                        className={j < s.stars ? 'text-[var(--color-run)]' : 'text-[var(--border)]'}
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
