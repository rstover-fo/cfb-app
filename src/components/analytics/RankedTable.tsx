'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { CaretUp, CaretDown } from '@phosphor-icons/react'

interface RankedTeam {
  rank: number
  team: string
  logo: string | null
  color: string
  compositeScore: number
  offenseScore: number
  defenseScore: number
  specialTeamsScore?: number
  conference: string | null
  // FBS-only ranks (1 = best)
  offRank?: number
  defRank?: number
  stRank?: number
  sosRank?: number  // Strength of schedule rank (1 = hardest)
  compositeRank?: number
  // Win-loss record
  wins: number | null
  losses: number | null
  confWins: number | null
  confLosses: number | null
}

interface RankedTableProps {
  data: RankedTeam[]
  title?: string
  onTeamClick?: (team: string) => void
}

type SortableField = 'rank' | 'compositeScore' | 'offenseScore' | 'defenseScore' | 'specialTeamsScore' | 'offRank' | 'defRank' | 'stRank' | 'sosRank' | 'wins'

interface SortIndicatorProps {
  field: SortableField
  currentField: SortableField
  direction: 'asc' | 'desc'
}

function SortIndicator({ field, currentField, direction }: SortIndicatorProps) {
  const isActive = currentField === field
  const Icon = direction === 'asc' ? CaretUp : CaretDown

  return (
    <span className={`inline-flex ml-1 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`} aria-hidden="true">
      <Icon size={14} weight={isActive ? 'bold' : 'regular'} />
    </span>
  )
}

interface SortableHeaderProps {
  field: SortableField
  label: string
  sortField: SortableField
  sortDir: 'asc' | 'desc'
  onSort: (field: SortableField) => void
  align?: 'left' | 'center'
  title?: string
}

function SortableHeader({ field, label, sortField, sortDir, onSort, align = 'left', title }: SortableHeaderProps) {
  const isActive = sortField === field
  const ariaSort = isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`py-2 px-3 ${align === 'center' ? 'text-center' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        title={title}
        className={`inline-flex items-center select-none group transition-colors hover:text-[var(--text-primary)] ${isActive ? 'text-[var(--text-primary)]' : ''}`}
        aria-label={`Sort by ${label}${isActive ? `, currently sorted ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        {label}
        <SortIndicator field={field} currentField={sortField} direction={sortDir} />
      </button>
    </th>
  )
}

export function RankedTable({ data, title = 'Composite Rankings', onTeamClick }: RankedTableProps) {
  // Default sort: Composite DESC (best teams first)
  const [sortField, setSortField] = useState<SortableField>('compositeScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

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

  const handleSort = (field: SortableField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      // Rank fields sort ascending by default (1 first), scores sort descending (highest first)
      const isRankField = field === 'rank' || field === 'offRank' || field === 'defRank' || field === 'stRank' || field === 'sosRank'
      setSortDir(isRankField ? 'asc' : 'desc')
    }
  }

  const maxOff = Math.max(...data.map(d => d.offenseScore))
  const maxDef = Math.max(...data.map(d => d.defenseScore))
  const maxST = Math.max(...data.map(d => d.specialTeamsScore ?? 0))

  return (
    <div className="w-full overflow-x-auto">
      <h3 className="font-headline text-xl mb-4 text-[var(--text-primary)]">{title}</h3>
      <table className="w-full text-sm" aria-label={title}>
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
            <SortableHeader field="rank" label="Rank" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <th scope="col" className="py-2 px-3 text-left">Team</th>
            <SortableHeader field="wins" label="W-L" align="center" sortField={sortField} sortDir={sortDir} onSort={handleSort} title="Season record (Conference record on hover)" />
            <SortableHeader field="compositeScore" label="Composite" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader field="offenseScore" label="Off Score" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader field="offRank" label="Off Rank" align="center" sortField={sortField} sortDir={sortDir} onSort={handleSort} title="Offensive rank among 134 FBS teams" />
            <SortableHeader field="defenseScore" label="Def Score" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader field="defRank" label="Def Rank" align="center" sortField={sortField} sortDir={sortDir} onSort={handleSort} title="Defensive rank among 134 FBS teams" />
            <SortableHeader field="specialTeamsScore" label="ST Score" sortField={sortField} sortDir={sortDir} onSort={handleSort} title="Special teams score (20% of composite)" />
            <SortableHeader field="sosRank" label="SOS" align="center" sortField={sortField} sortDir={sortDir} onSort={handleSort} title="Strength of Schedule rank (1 = hardest)" />
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
                    <Image src={team.logo} alt="" width={24} height={24} className="w-6 h-6 object-contain" unoptimized />
                  )}
                  <span className="font-medium text-[var(--text-primary)]">{team.team}</span>
                  <span className="text-[var(--text-tertiary)] text-xs">{team.conference}</span>
                </div>
              </td>
              <td
                className="py-2 px-3 text-center"
                title={team.confWins !== null && team.confLosses !== null ? `Conference: ${team.confWins}-${team.confLosses}` : undefined}
              >
                {team.wins !== null && team.losses !== null ? (
                  <span className="font-mono text-sm">
                    {team.wins}-{team.losses}
                  </span>
                ) : (
                  <span className="text-[var(--text-tertiary)]">—</span>
                )}
              </td>
              <td className="py-2 px-3 font-mono">{team.compositeScore.toFixed(2)}</td>
              <td className="py-2 px-3">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-[var(--bg-tertiary)] rounded overflow-hidden" aria-hidden="true">
                    <div
                      className="h-full bg-[var(--color-run)]"
                      style={{ width: `${(team.offenseScore / maxOff) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs">{team.offenseScore.toFixed(2)}</span>
                </div>
              </td>
              <td
                className="py-2 px-3 text-center"
                title="Rank among 134 FBS teams"
              >
                {team.offRank !== undefined ? (
                  <span className="font-mono text-xs text-[var(--text-secondary)]">
                    #{team.offRank}
                  </span>
                ) : (
                  <span className="text-[var(--text-tertiary)]">—</span>
                )}
              </td>
              <td className="py-2 px-3">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-[var(--bg-tertiary)] rounded overflow-hidden" aria-hidden="true">
                    <div
                      className="h-full bg-[var(--color-pass)]"
                      style={{ width: `${(team.defenseScore / maxDef) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs">{team.defenseScore.toFixed(2)}</span>
                </div>
              </td>
              <td
                className="py-2 px-3 text-center"
                title="Rank among 134 FBS teams"
              >
                {team.defRank !== undefined ? (
                  <span className="font-mono text-xs text-[var(--text-secondary)]">
                    #{team.defRank}
                  </span>
                ) : (
                  <span className="text-[var(--text-tertiary)]">—</span>
                )}
              </td>
              <td className="py-2 px-3">
                {team.specialTeamsScore !== undefined ? (
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-2 bg-[var(--bg-tertiary)] rounded overflow-hidden" aria-hidden="true">
                      <div
                        className="h-full bg-[var(--color-accent)]"
                        style={{ width: `${(team.specialTeamsScore / maxST) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs">{team.specialTeamsScore.toFixed(1)}</span>
                  </div>
                ) : (
                  <span className="text-[var(--text-tertiary)]">—</span>
                )}
              </td>
              <td
                className="py-2 px-3 text-center"
                title="Strength of Schedule rank (1 = hardest schedule)"
              >
                {team.sosRank !== undefined && team.sosRank > 0 ? (
                  <span className="font-mono text-xs text-[var(--text-secondary)]">
                    #{team.sosRank}
                  </span>
                ) : (
                  <span className="text-[var(--text-tertiary)]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
