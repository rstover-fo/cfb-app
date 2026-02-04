'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { fetchGames } from '@/app/games/actions'
import type { GamesFilter, GameWithTeams } from '@/lib/queries/games'
import { teamNameToSlug } from '@/lib/utils'

interface GamesListProps {
  initialGames: GameWithTeams[]
  initialWeek: number
  season: number
  availableWeeks: number[]
  conferences: string[]
  teams: string[]
}

export function GamesList({
  initialGames,
  initialWeek,
  season,
  availableWeeks,
  conferences,
  teams
}: GamesListProps) {
  const [games, setGames] = useState(initialGames)
  const [week, setWeek] = useState(initialWeek)
  const [conference, setConference] = useState<string>('')
  const [team, setTeam] = useState<string>('')
  const [isPending, startTransition] = useTransition()
  const requestIdRef = useRef(0)

  const handleFilterChange = (newFilter: Partial<GamesFilter>) => {
    const newWeek = newFilter.week ?? week
    const newConference = newFilter.conference !== undefined ? newFilter.conference : conference
    const newTeam = newFilter.team !== undefined ? newFilter.team : team

    // Update local state
    if (newFilter.week !== undefined) setWeek(newFilter.week)
    if (newFilter.conference !== undefined) setConference(newFilter.conference)
    if (newFilter.team !== undefined) setTeam(newFilter.team)

    // Track request to prevent stale responses from overwriting newer ones
    const currentRequestId = ++requestIdRef.current

    startTransition(async () => {
      const filter: GamesFilter = {
        season,
        week: newWeek || undefined,
        conference: newConference || undefined,
        team: newTeam || undefined,
      }
      const newGames = await fetchGames(filter)
      // Only update if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setGames(newGames)
      }
    })
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Determine winner
  const getWinner = (game: GameWithTeams): 'home' | 'away' => {
    return game.home_points > game.away_points ? 'home' : 'away'
  }

  // Get week label (regular season, conf champs, or bowls)
  const getWeekLabel = (w: number): string => {
    if (w <= 14) return `Week ${w}`
    if (w === 15) return 'Champs'
    return 'Bowls'
  }

  // Group weeks by phase for better organization
  const regularWeeks = availableWeeks.filter(w => w <= 14)
  const postWeeks = availableWeeks.filter(w => w >= 15)

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col gap-4 mb-6">
        {/* Week Tabs - organized by season phase */}
        <nav className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by week">
          {/* All Weeks button */}
          <button
            role="tab"
            aria-selected={!week}
            onClick={() => handleFilterChange({ week: 0 })}
            className={`px-3 py-1.5 border-[1.5px] rounded-sm text-sm whitespace-nowrap transition-all ${
              !week
                ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
            }`}
          >
            All
          </button>

          {/* Separator */}
          <div className="w-px bg-[var(--border)] mx-1" />

          {/* Regular season weeks */}
          {regularWeeks.map(w => (
            <button
              key={w}
              role="tab"
              aria-selected={week === w}
              onClick={() => handleFilterChange({ week: w })}
              className={`px-3 py-1.5 border-[1.5px] rounded-sm text-sm whitespace-nowrap transition-all ${
                week === w
                  ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
              }`}
            >
              {w}
            </button>
          ))}

          {/* Post-season separator if there are post weeks */}
          {postWeeks.length > 0 && (
            <>
              <div className="w-px bg-[var(--border)] mx-1" />
              {postWeeks.map(w => (
                <button
                  key={w}
                  role="tab"
                  aria-selected={week === w}
                  onClick={() => handleFilterChange({ week: w })}
                  className={`px-3 py-1.5 border-[1.5px] rounded-sm text-sm whitespace-nowrap transition-all ${
                    week === w
                      ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
                      : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
                  }`}
                >
                  {getWeekLabel(w)}
                </button>
              ))}
            </>
          )}
        </nav>

        {/* Dropdowns Row */}
        <div className="flex gap-4 flex-wrap">
          {/* Conference Filter */}
          <select
            value={conference}
            onChange={(e) => handleFilterChange({ conference: e.target.value })}
            className="px-3 py-2 text-sm border-[1.5px] border-[var(--border)] rounded-sm
              bg-[var(--bg-surface)] text-[var(--text-primary)]
              cursor-pointer hover:border-[var(--text-muted)] transition-colors
              appearance-none bg-no-repeat bg-right pr-8 min-w-[180px]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B635A' d='M3 4.5L6 8l3-3.5H3z'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 0.75rem center'
            }}
          >
            <option value="">All Conferences</option>
            {conferences.map(conf => (
              <option key={conf} value={conf}>{conf}</option>
            ))}
          </select>

          {/* Team Filter */}
          <select
            value={team}
            onChange={(e) => handleFilterChange({ team: e.target.value })}
            className="px-3 py-2 text-sm border-[1.5px] border-[var(--border)] rounded-sm
              bg-[var(--bg-surface)] text-[var(--text-primary)]
              cursor-pointer hover:border-[var(--text-muted)] transition-colors
              appearance-none bg-no-repeat bg-right pr-8 min-w-[180px]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B635A' d='M3 4.5L6 8l3-3.5H3z'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 0.75rem center'
            }}
          >
            <option value="">All Teams</option>
            {teams.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Clear Filters */}
          {(conference || team) && (
            <button
              onClick={() => handleFilterChange({ conference: '', team: '' })}
              className="px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Games Count */}
      <p className="text-sm text-[var(--text-muted)] mb-4">
        {isPending ? 'Loading...' : `${games.length} games`}
      </p>

      {/* Loading state */}
      {isPending && (
        <div className="text-center py-8 text-[var(--text-muted)]">
          Loading games...
        </div>
      )}

      {/* Games list or empty state */}
      {!isPending && games.length === 0 ? (
        <div className="text-center py-8 text-[var(--text-muted)]">
          No games found matching your filters
        </div>
      ) : !isPending && (
        <div className="space-y-2">
          {games.map(game => {
            const winner = getWinner(game)
            return (
              <div
                key={game.id}
                className="flex items-center gap-3 py-3 px-4 -mx-4 rounded hover:bg-[var(--bg-surface-alt)] transition-colors"
              >
                {/* Away team */}
                <Link
                  href={`/teams/${teamNameToSlug(game.away_team)}`}
                  className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
                >
                  {game.awayLogo ? (
                    <Image
                      src={game.awayLogo}
                      alt={game.away_team}
                      width={24}
                      height={24}
                      className="w-6 h-6 object-contain flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full flex-shrink-0"
                      style={{ backgroundColor: game.awayColor || 'var(--bg-surface-alt)' }}
                    />
                  )}
                  <span
                    className={`text-sm truncate ${
                      winner === 'away'
                        ? 'font-medium text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {game.away_team}
                  </span>
                </Link>

                {/* Score */}
                <div className="flex items-center gap-1.5 text-sm tabular-nums font-medium">
                  <span
                    className={
                      winner === 'away'
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)]'
                    }
                  >
                    {game.away_points}
                  </span>
                  <span className="text-[var(--text-muted)]">-</span>
                  <span
                    className={
                      winner === 'home'
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)]'
                    }
                  >
                    {game.home_points}
                  </span>
                </div>

                {/* Home team */}
                <Link
                  href={`/teams/${teamNameToSlug(game.home_team)}`}
                  className="flex items-center gap-2 flex-1 min-w-0 justify-end hover:opacity-80 transition-opacity"
                >
                  <span
                    className={`text-sm truncate ${
                      winner === 'home'
                        ? 'font-medium text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {game.home_team}
                  </span>
                  {game.homeLogo ? (
                    <Image
                      src={game.homeLogo}
                      alt={game.home_team}
                      width={24}
                      height={24}
                      className="w-6 h-6 object-contain flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full flex-shrink-0"
                      style={{ backgroundColor: game.homeColor || 'var(--bg-surface-alt)' }}
                    />
                  )}
                </Link>

                {/* Date and badges */}
                <div className="flex items-center gap-2 ml-4">
                  {game.conference_game && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface-alt)] text-[var(--text-muted)] uppercase tracking-wider">
                      Conf
                    </span>
                  )}
                  <span className="text-xs text-[var(--text-muted)] w-14 text-right">
                    {formatDate(game.start_date)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
