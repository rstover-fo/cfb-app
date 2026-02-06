'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import {
  fetchRankingsForWeek,
  fetchRankingsAllWeeks,
  fetchAvailablePolls,
  fetchLatestRankingWeek,
} from '@/app/rankings/actions'
import type { EnrichedPollRanking, PollRanking } from '@/lib/types/database'
import { PollTable } from './PollTable'
import { BumpsChart } from './BumpsChart'
import { selectClassName, selectStyle, teamNameToSlug } from '@/lib/utils'

interface RankingsClientProps {
  initialRankings: EnrichedPollRanking[]
  initialAllWeeks: { week: number; rankings: (PollRanking & { color: string | null })[] }[]
  initialPoll: string
  initialSeason: number
  initialWeek: number
  availablePolls: string[]
  availableSeasons: number[]
}

export function RankingsClient({
  initialRankings,
  initialAllWeeks,
  initialPoll,
  initialSeason,
  initialWeek,
  availablePolls: initialPolls,
  availableSeasons,
}: RankingsClientProps) {
  const router = useRouter()
  const [rankings, setRankings] = useState(initialRankings)
  const [allWeeksData, setAllWeeksData] = useState(initialAllWeeks)
  const [poll, setPoll] = useState(initialPoll)
  const [season, setSeason] = useState(initialSeason)
  const [week, setWeek] = useState(initialWeek)
  const [availablePolls, setAvailablePolls] = useState(initialPolls)
  const [isPending, startTransition] = useTransition()
  const requestIdRef = useRef(0)

  // Derive available weeks from allWeeksData
  const availableWeeks = allWeeksData.map(w => w.week)
  const maxWeek = availableWeeks.length > 0 ? Math.max(...availableWeeks) : week
  const minWeek = availableWeeks.length > 0 ? Math.min(...availableWeeks) : 1

  const loadWeekData = useCallback((newSeason: number, newPoll: string, newWeek: number) => {
    const currentRequestId = ++requestIdRef.current

    startTransition(async () => {
      const newRankings = await fetchRankingsForWeek(newSeason, newWeek, newPoll)

      if (currentRequestId === requestIdRef.current) {
        setRankings(newRankings)
      }
    })
  }, [])

  const handlePollChange = (newPoll: string) => {
    setPoll(newPoll)
    // Re-fetch with new poll, reset to latest week
    const currentRequestId = ++requestIdRef.current
    startTransition(async () => {
      const latestWeek = await fetchLatestRankingWeek(season, newPoll)
      if (currentRequestId !== requestIdRef.current) return
      setWeek(latestWeek)

      const [newRankings, newAllWeeks] = await Promise.all([
        fetchRankingsForWeek(season, latestWeek, newPoll),
        fetchRankingsAllWeeks(season, newPoll),
      ])

      if (currentRequestId === requestIdRef.current) {
        setRankings(newRankings)
        setAllWeeksData(newAllWeeks)
      }
    })
  }

  const handleSeasonChange = (newSeason: number) => {
    setSeason(newSeason)
    const currentRequestId = ++requestIdRef.current
    startTransition(async () => {
      // Get available polls for new season
      const newPolls = await fetchAvailablePolls(newSeason)
      if (currentRequestId !== requestIdRef.current) return
      setAvailablePolls(newPolls)

      const selectedPoll = newPolls.includes(poll) ? poll : newPolls[0] ?? 'AP Top 25'
      setPoll(selectedPoll)

      const latestWeek = await fetchLatestRankingWeek(newSeason, selectedPoll)
      if (currentRequestId !== requestIdRef.current) return
      setWeek(latestWeek)

      const [newRankings, newAllWeeks] = await Promise.all([
        fetchRankingsForWeek(newSeason, latestWeek, selectedPoll),
        fetchRankingsAllWeeks(newSeason, selectedPoll),
      ])

      if (currentRequestId === requestIdRef.current) {
        setRankings(newRankings)
        setAllWeeksData(newAllWeeks)
      }
    })
  }

  const handleWeekChange = (newWeek: number) => {
    setWeek(newWeek)
    loadWeekData(season, poll, newWeek)
  }

  const handlePrevWeek = () => {
    const idx = availableWeeks.indexOf(week)
    if (idx > 0) {
      handleWeekChange(availableWeeks[idx - 1])
    }
  }

  const handleNextWeek = () => {
    const idx = availableWeeks.indexOf(week)
    if (idx < availableWeeks.length - 1) {
      handleWeekChange(availableWeeks[idx + 1])
    }
  }

  const handleTeamClick = (school: string) => {
    router.push(`/teams/${teamNameToSlug(school)}`)
  }

  return (
    <div>
      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Poll selector */}
        <select
          value={poll}
          onChange={(e) => handlePollChange(e.target.value)}
          className={selectClassName}
          style={selectStyle}
          disabled={isPending}
          aria-label="Select poll"
        >
          {availablePolls.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {/* Season selector */}
        <select
          value={season}
          onChange={(e) => handleSeasonChange(parseInt(e.target.value, 10))}
          className={selectClassName}
          style={selectStyle}
          disabled={isPending}
          aria-label="Select season"
        >
          {availableSeasons.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Week navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevWeek}
            disabled={isPending || week <= minWeek}
            className="p-2 rounded hover:bg-[var(--bg-surface-alt)] text-[var(--text-muted)] disabled:opacity-30 transition-colors"
            aria-label="Previous week"
          >
            <CaretLeft size={16} weight="bold" />
          </button>
          <select
            value={week}
            onChange={(e) => handleWeekChange(parseInt(e.target.value, 10))}
            className={selectClassName}
            style={selectStyle}
            disabled={isPending}
            aria-label="Select week"
          >
            {availableWeeks.map(w => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
          <button
            onClick={handleNextWeek}
            disabled={isPending || week >= maxWeek}
            className="p-2 rounded hover:bg-[var(--bg-surface-alt)] text-[var(--text-muted)] disabled:opacity-30 transition-colors"
            aria-label="Next week"
          >
            <CaretRight size={16} weight="bold" />
          </button>
        </div>

        {/* Loading indicator */}
        {isPending && (
          <span className="text-xs text-[var(--text-muted)]">Loading...</span>
        )}
      </div>

      {/* Poll Table */}
      <div className="card p-4 mb-8">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            {poll} — Week {week}
          </h2>
        </div>
        <PollTable rankings={rankings} poll={poll} />
      </div>

      {/* Bumps Chart */}
      {allWeeksData.length > 1 && (
        <div className="card p-4">
          <div className="mb-4 pb-3 border-b border-[var(--border)]">
            <h2 className="text-sm font-medium text-[var(--text-muted)]">
              Season Trajectory — {poll}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Hover to highlight a team. Click team name to view details.
            </p>
          </div>
          <BumpsChart
            data={allWeeksData}
            poll={poll}
            onTeamClick={handleTeamClick}
          />
        </div>
      )}
    </div>
  )
}
