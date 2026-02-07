'use client'

import { useState, useTransition, useRef } from 'react'
import {
  fetchPlayerSeasonLeaders,
} from '@/app/players/actions'
import type { PlayerLeaderRow, LeaderCategory } from '@/app/players/actions'
import { selectClassName, selectStyle } from '@/lib/utils'
import { LeaderboardTable } from './LeaderboardTable'
import { PlayerSearchBar } from './PlayerSearchBar'

const CATEGORIES: { key: LeaderCategory; label: string }[] = [
  { key: 'passing', label: 'Passing' },
  { key: 'rushing', label: 'Rushing' },
  { key: 'receiving', label: 'Receiving' },
  { key: 'defense', label: 'Defense' },
]

interface PlayersClientProps {
  initialLeaders: PlayerLeaderRow[]
  initialSeason: number
  initialCategory: LeaderCategory
  availableSeasons: number[]
  conferences: string[]
}

export function PlayersClient({
  initialLeaders,
  initialSeason,
  initialCategory,
  availableSeasons,
  conferences,
}: PlayersClientProps) {
  const [leaders, setLeaders] = useState(initialLeaders)
  const [season, setSeason] = useState(initialSeason)
  const [category, setCategory] = useState<LeaderCategory>(initialCategory)
  const [conference, setConference] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const requestIdRef = useRef(0)

  const loadLeaders = (
    newSeason: number,
    newCategory: LeaderCategory,
    newConference: string | null
  ) => {
    const currentRequestId = ++requestIdRef.current

    startTransition(async () => {
      const data = await fetchPlayerSeasonLeaders(
        newSeason,
        newCategory,
        newConference
      )

      if (currentRequestId === requestIdRef.current) {
        setLeaders(data)
      }
    })
  }

  const handleCategoryChange = (newCategory: LeaderCategory) => {
    setCategory(newCategory)
    loadLeaders(season, newCategory, conference)
  }

  const handleSeasonChange = (newSeason: number) => {
    setSeason(newSeason)
    loadLeaders(newSeason, category, conference)
  }

  const handleConferenceChange = (newConference: string | null) => {
    setConference(newConference)
    loadLeaders(season, category, newConference)
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-6">
        <PlayerSearchBar />
      </div>

      {/* Category tabs */}
      <div className="flex items-end gap-0 mb-0">
        {CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleCategoryChange(key)}
            disabled={isPending}
            className={`px-4 py-2 text-sm rounded-t border-b-2 transition-colors ${
              category === key
                ? 'border-[var(--color-run)] text-[var(--text-primary)] bg-[var(--bg-surface)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4 pb-3 border-b border-[var(--border)]">
          <select
            value={season}
            onChange={(e) => handleSeasonChange(parseInt(e.target.value, 10))}
            className={selectClassName}
            style={selectStyle}
            disabled={isPending}
            aria-label="Select season"
          >
            {availableSeasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={conference ?? ''}
            onChange={(e) =>
              handleConferenceChange(e.target.value || null)
            }
            className={selectClassName}
            style={selectStyle}
            disabled={isPending}
            aria-label="Filter by conference"
          >
            <option value="">All Conferences</option>
            {conferences.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {isPending && (
            <span className="text-xs text-[var(--text-muted)]">Loading...</span>
          )}
        </div>

        <LeaderboardTable
          leaders={leaders}
          category={category}
          isPending={isPending}
        />
      </div>
    </div>
  )
}
