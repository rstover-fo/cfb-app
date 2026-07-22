import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { PollRanking, EnrichedPollRanking } from '@/lib/types/database'
import { getTeamLookup } from './shared'
import { CURRENT_SEASON } from './constants'

const FBS_POLLS = ['AP Top 25', 'Coaches Poll', 'Playoff Committee Rankings'] as const

// Per the warehouse contract (2026-07-20): api.poll_rankings now exposes season_type,
// and the postseason final poll is stored as season_type='postseason', week 1. Weekly
// poll queries must filter season_type='regular' or the final poll pollutes week 1.
// Tied teams share a rank (next rank skipped) — the dedupe/sort logic tolerates this.
const REGULAR_SEASON = 'regular'

// Get all seasons that have ranking data.
//
// Deliberately NOT "select season from every ranking row, dedupe
// client-side": api.poll_rankings has ~17K rows and PostgREST silently caps
// unbounded responses at 1,000 rows, so that approach only ever saw
// 2003-2014 in prod and the dropdown never offered the current season.
// Poll data exists every season (no gaps), so two bounded (limit=1)
// max/min-season queries plus a generated contiguous range are correct and
// avoid ever pulling a row set that could be truncated.
export const getAvailableRankingSeasons = cache(async (): Promise<number[]> => {
  const supabase = await createClient()

  const [maxResult, minResult] = await Promise.all([
    supabase
      .schema('api')
      .from('poll_rankings')
      .select('season')
      .eq('season_type', REGULAR_SEASON)
      .in('poll', FBS_POLLS as unknown as string[])
      .order('season', { ascending: false })
      .limit(1),
    supabase
      .schema('api')
      .from('poll_rankings')
      .select('season')
      .eq('season_type', REGULAR_SEASON)
      .in('poll', FBS_POLLS as unknown as string[])
      .order('season', { ascending: true })
      .limit(1),
  ])

  const maxSeason = maxResult.data?.[0]?.season as number | undefined
  const minSeason = minResult.data?.[0]?.season as number | undefined

  if (maxResult.error || minResult.error || maxSeason == null || minSeason == null) {
    console.error('[rankings] getAvailableRankingSeasons error:', maxResult.error ?? minResult.error)
    // Always include the season the page actually renders, rather than an
    // empty dropdown.
    return [CURRENT_SEASON]
  }

  const seasons: number[] = []
  for (let season = maxSeason; season >= minSeason; season--) {
    seasons.push(season)
  }
  return seasons
})

// Get available polls for a given season
export const getAvailablePolls = cache(async (season: number): Promise<string[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('poll_rankings')
    .select('poll')
    .eq('season_type', REGULAR_SEASON)
    .eq('season', season)
    .in('poll', FBS_POLLS as unknown as string[])

  if (error || !data) {
    console.error('[rankings] getAvailablePolls error:', error)
    return []
  }

  const polls = [...new Set(data.map(r => r.poll as string))].filter(Boolean)
  return polls
})

// Get the latest week with rankings for a season/poll
export const getLatestRankingWeek = cache(async (season: number, poll: string): Promise<number> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('poll_rankings')
    .select('week')
    .eq('season_type', REGULAR_SEASON)
    .eq('season', season)
    .eq('poll', poll)
    .order('week', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) {
    console.error('[rankings] getLatestRankingWeek error:', error)
    return 1
  }

  return (data[0].week as number) ?? 1
})

// Fetch enriched rankings for a specific week/poll
export const getRankingsForWeek = cache(async (
  season: number,
  week: number,
  poll: string
): Promise<EnrichedPollRanking[]> => {
  const supabase = await createClient()
  const teamLookup = await getTeamLookup()

  // Fetch current week rankings + previous week in parallel
  const [currentResult, prevResult, recordsResult] = await Promise.all([
    supabase
      .schema('api')
      .from('poll_rankings')
      .select('rank, school, conference, first_place_votes, points, season, week, poll')
      .eq('season_type', REGULAR_SEASON)
      .eq('season', season)
      .eq('week', week)
      .eq('poll', poll)
      .order('rank', { ascending: true }),
    supabase
      .schema('api')
      .from('poll_rankings')
      .select('rank, school')
      .eq('season_type', REGULAR_SEASON)
      .eq('season', season)
      .eq('week', week - 1)
      .eq('poll', poll),
    supabase
      .schema('api')
      .from('team_history')
      .select('team, wins, losses')
      .eq('season', season),
  ])

  if (currentResult.error || !currentResult.data) {
    console.error('[rankings] getRankingsForWeek error:', currentResult.error)
    return []
  }

  // Build previous week rank lookup (keep best rank per school)
  const prevRankLookup = new Map<string, number>()
  if (!prevResult.error && prevResult.data) {
    prevResult.data.forEach(r => {
      if (!r.school) return
      const school = r.school as string
      const rank = r.rank as number
      const existing = prevRankLookup.get(school)
      if (!existing || rank < existing) {
        prevRankLookup.set(school, rank)
      }
    })
  }

  // Build records lookup
  const recordsLookup = new Map<string, { wins: number; losses: number }>()
  if (!recordsResult.error && recordsResult.data) {
    (recordsResult.data as { team: string; wins: number; losses: number }[]).forEach(r => {
      recordsLookup.set(r.team, { wins: r.wins, losses: r.losses })
    })
  }

  // Deduplicate schools (keep best rank)
  const deduped = new Map<string, PollRanking>()
  for (const r of currentResult.data as PollRanking[]) {
    const existing = deduped.get(r.school)
    if (!existing || r.rank < existing.rank) {
      deduped.set(r.school, r)
    }
  }
  const rankings = Array.from(deduped.values()).sort((a, b) => a.rank - b.rank)

  return rankings.map(r => {
    const teamInfo = teamLookup.get(r.school)
    const record = recordsLookup.get(r.school)
    const prevRank = prevRankLookup.get(r.school) ?? null

    return {
      ...r,
      logo: teamInfo?.logo ?? null,
      color: teamInfo?.color ?? null,
      wins: record?.wins ?? 0,
      losses: record?.losses ?? 0,
      prev_rank: prevRank,
      movement: prevRank !== null ? prevRank - r.rank : null,
    }
  })
})

// Fetch all rankings for a season/poll (for bumps chart)
export const getRankingsAllWeeks = cache(async (
  season: number,
  poll: string
): Promise<{ week: number; rankings: (PollRanking & { color: string | null })[] }[]> => {
  const supabase = await createClient()
  const teamLookup = await getTeamLookup()

  const { data, error } = await supabase
    .schema('api')
    .from('poll_rankings')
    .select('rank, school, conference, first_place_votes, points, season, week, poll')
    .eq('season_type', REGULAR_SEASON)
    .eq('season', season)
    .eq('poll', poll)
    .order('week', { ascending: true })
    .order('rank', { ascending: true })

  if (error || !data) return []

  const rankings = data as PollRanking[]

  // Group by week, deduplicating schools (keep lowest/best rank)
  const weekMap = new Map<number, Map<string, PollRanking & { color: string | null }>>()

  for (const r of rankings) {
    const teamInfo = teamLookup.get(r.school)
    const enriched = { ...r, color: teamInfo?.color ?? null }

    let weekSchools = weekMap.get(r.week)
    if (!weekSchools) {
      weekSchools = new Map()
      weekMap.set(r.week, weekSchools)
    }

    const existing = weekSchools.get(r.school)
    if (!existing || r.rank < existing.rank) {
      weekSchools.set(r.school, enriched)
    }
  }

  // Convert to sorted array
  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([week, schoolMap]) => ({ week, rankings: Array.from(schoolMap.values()) }))
})
