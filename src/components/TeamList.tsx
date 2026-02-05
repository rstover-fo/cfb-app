'use client'

import { useState, useMemo } from 'react'
import { Team } from '@/lib/types/database'
import { TeamCard } from './TeamCard'
import { TeamSearch } from './TeamSearch'
import { selectClassName, selectStyle } from '@/lib/utils'

type Division = 'fbs' | 'fcs' | 'all'

export interface TeamMetrics {
  epa: number
  rank: number
  wins: number
  losses: number
}

interface TeamListProps {
  teams: Team[]
  metricsMap: Record<string, TeamMetrics>
}

export function TeamList({ teams, metricsMap }: TeamListProps) {
  const [division, setDivision] = useState<Division>('fbs')
  const [conference, setConference] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Get teams filtered by division
  const divisionTeams = useMemo(() => {
    if (division === 'all') return teams
    return teams.filter(t => t.classification === division)
  }, [teams, division])

  // Get unique conferences for current division
  const conferences = useMemo(() => {
    const confs = [...new Set(
      divisionTeams
        .map(t => t.conference)
        .filter((c): c is string => c !== null)
    )].sort()
    return confs
  }, [divisionTeams])

  // Apply all filters
  const filteredTeams = useMemo(() => {
    let result = divisionTeams

    // Filter by conference
    if (conference !== 'all') {
      result = result.filter(t => t.conference === conference)
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(t =>
        (t.school ?? '').toLowerCase().includes(query) ||
        t.conference?.toLowerCase().includes(query)
      )
    }

    return result
  }, [divisionTeams, conference, searchQuery])

  // Reset conference when division changes
  const handleDivisionChange = (newDivision: Division) => {
    setDivision(newDivision)
    setConference('all')
  }

  // Build header text
  const headerText = conference === 'all'
    ? `${filteredTeams.length} ${division === 'all' ? '' : division.toUpperCase()} Programs`
    : `${filteredTeams.length} ${conference} Teams`

  return (
    <div>
      {/* Division Dropdown */}
      <div className="mb-4">
        <select
          value={division}
          onChange={(e) => handleDivisionChange(e.target.value as Division)}
          className={selectClassName}
          style={selectStyle}
        >
          <option value="fbs">FBS</option>
          <option value="fcs">FCS</option>
          <option value="all">All Divisions</option>
        </select>
      </div>

      {/* Conference Tabs */}
      <nav className="flex gap-2 mb-6 overflow-x-auto pb-2" role="tablist" aria-label="Filter by conference">
        <button
          role="tab"
          aria-selected={conference === 'all'}
          onClick={() => setConference('all')}
          className={`px-4 py-2 border-[1.5px] rounded-sm text-sm whitespace-nowrap transition-all ${
            conference === 'all'
              ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
              : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
          }`}
        >
          All
        </button>
        {conferences.map(conf => (
          <button
            key={conf}
            role="tab"
            aria-selected={conference === conf}
            onClick={() => setConference(conf)}
            className={`px-4 py-2 border-[1.5px] rounded-sm text-sm whitespace-nowrap transition-all ${
              conference === conf
                ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
            }`}
          >
            {conf}
          </button>
        ))}
      </nav>

      {/* Search */}
      <div className="mb-6">
        <TeamSearch value={searchQuery} onChange={setSearchQuery} />
      </div>

      {/* Count */}
      <p className="text-sm text-[var(--text-muted)] mb-4">{headerText}</p>

      {/* Team Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredTeams.map((team) => (
          <TeamCard key={team.id} team={team} metrics={team.school ? metricsMap[team.school] : undefined} />
        ))}
      </div>

      {filteredTeams.length === 0 && (
        <p className="text-center text-[var(--text-muted)] py-12">
          No teams found{searchQuery ? ` matching "${searchQuery}"` : ''}.
        </p>
      )}
    </div>
  )
}
