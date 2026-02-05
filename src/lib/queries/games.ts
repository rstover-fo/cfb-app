import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getTeamLookup } from './shared'
import { REGULAR_SEASON_MAX_WEEK, POSTSEASON_MIN_WEEK } from './constants'
import type { GameBoxScore, BoxScoreTeam } from '@/lib/types/database'

// Season phase type
export type SeasonPhase = 'all' | 'regular' | 'postseason'

// Filter options for games query
export interface GamesFilter {
  season: number
  phase?: SeasonPhase   // Season phase filter (all, regular, postseason)
  week?: number | null  // null or 0 = "All" within phase
  conference?: string   // At least one team from this conference
  team?: string         // Exact team name match
}

// Game data enriched with team logos/colors
export interface GameWithTeams {
  id: number
  season: number
  week: number
  start_date: string
  home_team: string
  away_team: string
  home_points: number
  away_points: number
  conference_game: boolean
  completed: boolean
  homeLogo: string | null
  homeColor: string | null
  awayLogo: string | null
  awayColor: string | null
}

// Explicit columns - NOT select('*')
// Note: games table does not have home_conference/away_conference columns
const GAME_COLUMNS = `
  id,
  season,
  week,
  start_date,
  home_team,
  away_team,
  home_points,
  away_points,
  conference_game,
  completed
` as const

// Get games with optional filters
export const getGames = cache(async (filter: GamesFilter): Promise<GameWithTeams[]> => {
  const supabase = await createClient()
  const teamLookup = await getTeamLookup()

  let query = supabase
    .from('games')
    .select(GAME_COLUMNS)
    .eq('season', filter.season)
    .eq('completed', true)
    .not('home_points', 'is', null)
    .not('away_points', 'is', null)
    .order('start_date', { ascending: false })

  // Database-level filters
  // Phase filter: regular = weeks 1-REGULAR_SEASON_MAX_WEEK, postseason = weeks POSTSEASON_MIN_WEEK+, all = no constraint
  if (filter.phase === 'regular') {
    query = query.lte('week', REGULAR_SEASON_MAX_WEEK)
  } else if (filter.phase === 'postseason') {
    query = query.gte('week', POSTSEASON_MIN_WEEK)
  }

  // Specific week filter (when week is a positive number)
  if (filter.week && filter.week > 0) {
    query = query.eq('week', filter.week)
  }

  // Team filter at database level
  if (filter.team) {
    query = query.or(`home_team.eq.${filter.team},away_team.eq.${filter.team}`)
  }

  const { data, error } = await query

  if (error) {
    console.error('Games query failed:', error)
    throw new Error(`Failed to fetch games: ${error.message}`)
  }

  // Filter to FBS-only and enrich with team data
  // Conference filter is applied here since games table lacks conference columns
  return (data ?? [])
    .filter(g => teamLookup.has(g.home_team) && teamLookup.has(g.away_team))
    .filter(g => {
      if (!filter.conference) return true
      const homeConf = teamLookup.get(g.home_team)?.conference
      const awayConf = teamLookup.get(g.away_team)?.conference
      return homeConf === filter.conference || awayConf === filter.conference
    })
    .map(g => ({
      ...g,
      home_points: g.home_points ?? 0,
      away_points: g.away_points ?? 0,
      homeLogo: teamLookup.get(g.home_team)?.logo ?? null,
      homeColor: teamLookup.get(g.home_team)?.color ?? null,
      awayLogo: teamLookup.get(g.away_team)?.logo ?? null,
      awayColor: teamLookup.get(g.away_team)?.color ?? null,
    }))
})

// Get the current week (most recent completed games)
export const getCurrentWeek = cache(async (season: number): Promise<number> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('games')
    .select('week')
    .eq('season', season)
    .eq('completed', true)
    .order('week', { ascending: false })
    .limit(1)
    .single()

  return data?.week ?? 1
})

// Get smart default week for regular season view
// Returns latest completed week within regular season (weeks 1-REGULAR_SEASON_MAX_WEEK)
// If season has moved to postseason (week POSTSEASON_MIN_WEEK+), defaults to REGULAR_SEASON_MAX_WEEK
export const getDefaultWeek = cache(async (season: number): Promise<number> => {
  const maxWeek = await getCurrentWeek(season)
  // If we're in postseason, default to last regular season week
  if (maxWeek >= POSTSEASON_MIN_WEEK) return REGULAR_SEASON_MAX_WEEK
  return maxWeek
})

// Get all available weeks for a season
export const getAvailableWeeks = cache(async (season: number): Promise<number[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('games')
    .select('week')
    .eq('season', season)
    .eq('completed', true)
    .order('week', { ascending: true })
    .limit(1000) // Bound response size until we have proper DISTINCT RPC

  if (!data) return []

  // Get unique weeks
  const weeks = [...new Set(data.map(d => d.week))].sort((a, b) => a - b)
  return weeks
})

// Get all available seasons with completed games (descending order)
export const getAvailableSeasons = cache(async (): Promise<number[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('games')
    .select('season')
    .eq('completed', true)
    .order('season', { ascending: false })
    .limit(1000) // Bound response size until we have proper DISTINCT RPC

  if (!data) return []

  // Get unique seasons
  return [...new Set(data.map(d => d.season))].sort((a, b) => b - a)
})

// Get a single game by ID with team enrichment
export const getGameById = cache(async (gameId: number): Promise<GameWithTeams | null> => {
  const supabase = await createClient()
  const teamLookup = await getTeamLookup()

  const { data, error } = await supabase
    .from('games')
    .select(GAME_COLUMNS)
    .eq('id', gameId)
    .single()

  if (error || !data) {
    return null
  }

  // Enrich with team data
  return {
    ...data,
    home_points: data.home_points ?? 0,
    away_points: data.away_points ?? 0,
    homeLogo: teamLookup.get(data.home_team)?.logo ?? null,
    homeColor: teamLookup.get(data.home_team)?.color ?? null,
    awayLogo: teamLookup.get(data.away_team)?.logo ?? null,
    awayColor: teamLookup.get(data.away_team)?.color ?? null,
  }
})

// Get box score stats for a game from core schema
export const getGameBoxScore = cache(async (gameId: number): Promise<GameBoxScore | null> => {
  const supabase = await createClient()

  // Query the nested core tables using Supabase's syntax
  // The tables are: core.game_team_stats -> core.game_team_stats__teams -> core.game_team_stats__teams__stats
  const { data, error } = await supabase
    .schema('core')
    .from('game_team_stats')
    .select(`
      game_id,
      game_team_stats__teams (
        team,
        home_away,
        game_team_stats__teams__stats (
          category,
          stat
        )
      )
    `)
    .eq('game_id', gameId)
    .single()

  if (error || !data) {
    return null
  }

  // Transform nested data into BoxScore format
  const teams = data.game_team_stats__teams as Array<{
    team: string
    home_away: 'home' | 'away'
    game_team_stats__teams__stats: Array<{ category: string; stat: string }>
  }>

  if (!teams || teams.length === 0) {
    return null
  }

  let home: BoxScoreTeam | null = null
  let away: BoxScoreTeam | null = null

  for (const teamData of teams) {
    const stats: Record<string, string> = {}
    for (const stat of teamData.game_team_stats__teams__stats || []) {
      stats[stat.category] = stat.stat
    }

    const boxScoreTeam: BoxScoreTeam = {
      team: teamData.team,
      homeAway: teamData.home_away,
      stats,
    }

    if (teamData.home_away === 'home') {
      home = boxScoreTeam
    } else {
      away = boxScoreTeam
    }
  }

  if (!home || !away) {
    return null
  }

  return { home, away }
})

