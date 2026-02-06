'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { fetchGames, fetchAvailableWeeks, fetchDefaultWeek } from '@/app/games/actions'
import type { GamesFilter, GameWithTeams, SeasonPhase } from '@/app/games/actions'
import { REGULAR_SEASON_MAX_WEEK, POSTSEASON_MIN_WEEK } from '@/lib/queries/constants'
import { teamNameToSlug, selectClassName, selectStyle } from '@/lib/utils'

interface GamesListProps {
  initialGames: GameWithTeams[]
  initialWeek: number
  initialSeason: number
  initialPhase: SeasonPhase
  availableWeeks: number[]
  conferences: string[]
  teams: string[]
  availableSeasons: number[]  // List of seasons with data (descending order)
}

export function GamesList({
  initialGames,
  initialWeek,
  initialSeason,
  initialPhase,
  availableWeeks: initialAvailableWeeks,
  conferences,
  teams,
  availableSeasons
}: GamesListProps) {
  const [games, setGames] = useState(initialGames)
  const [season, setSeason] = useState(initialSeason)
  const [phase, setPhase] = useState<SeasonPhase>(initialPhase)
  const [week, setWeek] = useState(initialWeek)
  const [availableWeeks, setAvailableWeeks] = useState(initialAvailableWeeks)
  const [conference, setConference] = useState<string>('')
  const [team, setTeam] = useState<string>('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const router = useRouter()

  const handleFilterChange = (newFilter: Partial<GamesFilter> & { season?: number; phase?: SeasonPhase }) => {
    const newSeason = newFilter.season ?? season
    const newPhase = newFilter.phase ?? phase
    const newWeek = newFilter.week !== undefined ? newFilter.week : week
    const newConference = newFilter.conference !== undefined ? newFilter.conference : conference
    const newTeam = newFilter.team !== undefined ? newFilter.team : team

    // Update local state
    if (newFilter.season !== undefined) setSeason(newFilter.season)
    if (newFilter.phase !== undefined) setPhase(newFilter.phase)
    if (newFilter.week !== undefined) setWeek(newFilter.week ?? 0)
    if (newFilter.conference !== undefined) setConference(newFilter.conference)
    if (newFilter.team !== undefined) setTeam(newFilter.team)

    // Track request to prevent stale responses from overwriting newer ones
    const currentRequestId = ++requestIdRef.current

    startTransition(async () => {
      setError(null)
      try {
        // If season changed, fetch new available weeks
        if (newFilter.season !== undefined && newFilter.season !== season) {
          const weeks = await fetchAvailableWeeks(newFilter.season)
          // Only update if this is still the latest request
          if (currentRequestId === requestIdRef.current) {
            setAvailableWeeks(weeks)
          }
        }

        const filter: GamesFilter = {
          season: newSeason,
          phase: newPhase,
          week: newWeek || undefined,
          conference: newConference || undefined,
          team: newTeam || undefined,
        }
        const newGames = await fetchGames(filter)
        // Only update if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          setGames(newGames)
        }
      } catch {
        if (currentRequestId === requestIdRef.current) {
          setError('Failed to load games. Please try again.')
        }
      }
    })
  }

  // Handle season change - reset to regular phase and fetch smart default week
  const handleSeasonChange = async (newSeason: number) => {
    // Fetch the smart default week for the new season
    const defaultWeek = await fetchDefaultWeek(newSeason)
    handleFilterChange({ season: newSeason, phase: 'regular', week: defaultWeek })
  }

  // Handle phase change - reset week selection
  const handlePhaseChange = (newPhase: SeasonPhase) => {
    handleFilterChange({ phase: newPhase, week: 0 })
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
    if (w <= REGULAR_SEASON_MAX_WEEK) return `Week ${w}`
    if (w === POSTSEASON_MIN_WEEK) return 'Champs'
    return 'Bowls'
  }

  // Shared week button styling
  const getWeekButtonClass = (isSelected: boolean) =>
    `px-3 py-1.5 border-[1.5px] rounded-sm text-sm whitespace-nowrap transition-all ${
      isSelected
        ? 'bg-[var(--bg-surface)] border-[var(--color-run)] text-[var(--text-primary)]'
        : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
    }`

  // Group weeks by phase for better organization
  const regularWeeks = availableWeeks.filter(w => w <= REGULAR_SEASON_MAX_WEEK)
  const postWeeks = availableWeeks.filter(w => w >= POSTSEASON_MIN_WEEK)

  // Get weeks to display based on phase selection
  const getDisplayedWeeks = () => {
    if (phase === 'regular') return regularWeeks
    if (phase === 'postseason') return postWeeks
    return availableWeeks // 'all' shows everything
  }

  const displayedWeeks = getDisplayedWeeks()

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col gap-4 mb-6">
        {/* Phase Toggle - Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-surface-alt)] rounded-md w-fit" role="tablist" aria-label="Season phase">
          {(['all', 'regular', 'postseason'] as const).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={phase === p}
              onClick={() => handlePhaseChange(p)}
              className={`px-4 py-1.5 text-sm font-medium rounded transition-all ${
                phase === p
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {p === 'all' ? 'All' : p === 'regular' ? 'Regular' : 'Post-Season'}
            </button>
          ))}
        </div>

        {/* Week Tabs - dynamic based on phase */}
        <nav className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by week">
          {/* All Weeks button */}
          <button
            role="tab"
            aria-selected={!week}
            onClick={() => handleFilterChange({ week: 0 })}
            className={getWeekButtonClass(!week)}
          >
            All
          </button>

          {/* Separator */}
          <div className="w-px bg-[var(--border)] mx-1" />

          {/* When phase is 'all', show regular weeks, separator, then post weeks */}
          {phase === 'all' ? (
            <>
              {/* Regular season weeks */}
              {regularWeeks.map(w => (
                <button
                  key={w}
                  role="tab"
                  aria-selected={week === w}
                  onClick={() => handleFilterChange({ week: w })}
                  className={getWeekButtonClass(week === w)}
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
                      className={getWeekButtonClass(week === w)}
                    >
                      {getWeekLabel(w)}
                    </button>
                  ))}
                </>
              )}
            </>
          ) : (
            /* Regular or Postseason phase - show filtered weeks */
            displayedWeeks.map(w => (
              <button
                key={w}
                role="tab"
                aria-selected={week === w}
                onClick={() => handleFilterChange({ week: w })}
                className={getWeekButtonClass(week === w)}
              >
                {getWeekLabel(w)}
              </button>
            ))
          )}
        </nav>

        {/* Dropdowns Row */}
        <div className="flex gap-4 flex-wrap">
          {/* Year Filter */}
          <select
            value={season}
            onChange={(e) => handleSeasonChange(Number(e.target.value))}
            className={`${selectClassName} min-w-[100px]`}
            style={selectStyle}
          >
            {availableSeasons.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Conference Filter */}
          <select
            value={conference}
            onChange={(e) => handleFilterChange({ conference: e.target.value })}
            className={`${selectClassName} min-w-[180px]`}
            style={selectStyle}
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
            className={`${selectClassName} min-w-[180px]`}
            style={selectStyle}
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

      {/* Error state */}
      {error && (
        <div className="text-red-600 text-sm mb-4 p-3 bg-red-50 border border-red-200 rounded">
          {error}
        </div>
      )}

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
                onClick={(e) => {
                  // Only navigate if the click wasn't on a link
                  if (!(e.target as HTMLElement).closest('a')) {
                    router.push(`/games/${game.id}`)
                  }
                }}
                className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 py-3 px-4 -mx-4 rounded hover:bg-[var(--bg-surface-alt)] transition-colors cursor-pointer"
              >
                {/* Away team */}
                <Link
                  href={`/teams/${teamNameToSlug(game.away_team)}`}
                  className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
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
                <div className="flex items-center justify-center gap-1.5 text-sm tabular-nums font-medium min-w-[70px]">
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
                  className="flex items-center gap-2 min-w-0 justify-end hover:opacity-80 transition-opacity"
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
                <div className="flex items-center gap-2 justify-end min-w-[100px]">
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
