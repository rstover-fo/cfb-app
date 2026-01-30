'use client'

import { useState, useMemo } from 'react'
import { TeamCard } from './TeamCard'
import { TeamSearch } from './TeamSearch'
import { Team } from '@/lib/types/database'

interface TeamListProps {
  teams: Team[]
}

export function TeamList({ teams }: TeamListProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) return teams
    const query = searchQuery.toLowerCase()
    return teams.filter(team =>
      team.school.toLowerCase().includes(query) ||
      team.conference?.toLowerCase().includes(query) ||
      team.mascot?.toLowerCase().includes(query)
    )
  }, [teams, searchQuery])

  const byConference = filteredTeams.reduce((acc, team) => {
    const conf = team.conference || 'Independent'
    if (!acc[conf]) acc[conf] = []
    acc[conf].push(team)
    return acc
  }, {} as Record<string, Team[]>)

  return (
    <>
      <TeamSearch onSearch={setSearchQuery} />

      {Object.keys(byConference).length === 0 ? (
        <p className="text-gray-500">No teams found matching &ldquo;{searchQuery}&rdquo;</p>
      ) : (
        Object.entries(byConference).sort().map(([conference, confTeams]) => (
          <section key={conference} className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">{conference}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {confTeams.map(team => (
                <TeamCard key={team.id} team={team} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  )
}
