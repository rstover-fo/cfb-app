'use client'

import { useMemo, useState } from 'react'

interface RankedTeam {
  rank: number
  team: string
  logo: string | null
  color: string
  compositeScore: number
  offenseScore: number
  defenseScore: number
  conference: string | null
}

interface RankedTableProps {
  data: RankedTeam[]
  title?: string
  onTeamClick?: (team: string) => void
}

export function RankedTable({ data, title = 'Composite Rankings', onTeamClick }: RankedTableProps) {
  const [sortField, setSortField] = useState<keyof RankedTeam>('rank')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }, [data, sortField, sortDir])

  const handleSort = (field: keyof RankedTeam) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'rank' ? 'asc' : 'desc')
    }
  }

  const maxOff = Math.max(...data.map(d => d.offenseScore))
  const maxDef = Math.max(...data.map(d => d.defenseScore))

  return (
    <div className="w-full overflow-x-auto">
      <h3 className="font-headline text-xl mb-4 text-[var(--text-primary)]">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
            <th className="py-2 px-3 text-left cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSort('rank')}>
              Rank {sortField === 'rank' && (sortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th className="py-2 px-3 text-left">Team</th>
            <th className="py-2 px-3 text-left cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSort('compositeScore')}>
              Composite {sortField === 'compositeScore' && (sortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th className="py-2 px-3 text-left">Offense</th>
            <th className="py-2 px-3 text-left">Defense</th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((team) => (
            <tr
              key={team.team}
              className={`border-b border-[var(--border)] hover:bg-[var(--bg-hover)] ${onTeamClick ? 'cursor-pointer' : ''}`}
              onClick={() => onTeamClick?.(team.team)}
            >
              <td className="py-2 px-3 font-mono">{team.rank}</td>
              <td className="py-2 px-3">
                <div className="flex items-center gap-2">
                  {team.logo && (
                    <img src={team.logo} alt="" className="w-6 h-6 object-contain" />
                  )}
                  <span className="font-medium text-[var(--text-primary)]">{team.team}</span>
                  <span className="text-[var(--text-tertiary)] text-xs">{team.conference}</span>
                </div>
              </td>
              <td className="py-2 px-3 font-mono">{team.compositeScore.toFixed(2)}</td>
              <td className="py-2 px-3">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-[var(--bg-tertiary)] rounded overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-run)]"
                      style={{ width: `${(team.offenseScore / maxOff) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs">{team.offenseScore.toFixed(2)}</span>
                </div>
              </td>
              <td className="py-2 px-3">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-[var(--bg-tertiary)] rounded overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-pass)]"
                      style={{ width: `${(team.defenseScore / maxDef) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs">{team.defenseScore.toFixed(2)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
