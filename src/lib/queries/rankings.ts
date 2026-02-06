import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { PollRanking, EnrichedPollRanking } from '@/lib/types/database'
import { getTeamLookup } from './shared'

const FBS_POLLS = ['AP Top 25', 'Coaches Poll', 'Playoff Committee Rankings'] as const

// Get all seasons that have ranking data
export const getAvailableRankingSeasons = cache(async (): Promise<number[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('core')
    .from('rankings')
    .select('season')
    .in('poll', FBS_POLLS as unknown as string[])

  if (error || !data) {
    console.error('[rankings] getAvailableRankingSeasons error:', error)
    return []
  }

  const seasons = [...new Set(data.map(r => r.season as number))].filter(Boolean)
  seasons.sort((a, b) => b - a)
  return seasons
})

// Get available polls for a given season
export const getAvailablePolls = cache(async (season: number): Promise<string[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('core')
    .from('rankings')
    .select('poll')
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
    .schema('core')
    .from('rankings')
    .select('week')
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
      .schema('core')
      .from('rankings')
      .select('rank, school, conference, first_place_votes, points, season, week, poll')
      .eq('season', season)
      .eq('week', week)
      .eq('poll', poll)
      .order('rank', { ascending: true }),
    supabase
      .schema('core')
      .from('rankings')
      .select('rank, school')
      .eq('season', season)
      .eq('week', week - 1)
      .eq('poll', poll),
    supabase
      .schema('core')
      .from('records')
      .select('team, total__wins, total__losses')
      .eq('year', season)
      .eq('classification', 'fbs'),
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
    recordsResult.data.forEach((r: { team: string; total__wins: number; total__losses: number }) => {
      recordsLookup.set(r.team, { wins: r.total__wins, losses: r.total__losses })
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
    .schema('core')
    .from('rankings')
    .select('rank, school, conference, first_place_votes, points, season, week, poll')
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
