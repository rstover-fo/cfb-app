'use client'

import { useState } from 'react'
import { Team } from '@/lib/types/database'
import { TeamCard } from './TeamCard'
import { TeamSearch } from './TeamSearch'

interface TeamListProps {
  teams: Team[]
}

export function TeamList({ teams }: TeamListProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTeams = teams.filter((team) =>
    team.school.toLowerCase().includes(searchQuery.toLowerCase()) ||
    team.conference?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div>
      <div className="mb-6">
        <TeamSearch value={searchQuery} onChange={setSearchQuery} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredTeams.map((team) => (
          <TeamCard key={team.id} team={team} />
        ))}
      </div>
      {filteredTeams.length === 0 && (
        <p className="text-center text-[var(--text-muted)] py-12">
          No teams found matching "{searchQuery}"
        </p>
      )}
    </div>
  )
}
