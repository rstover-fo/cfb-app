import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getTeamLookup } from './shared'
import { REGULAR_SEASON_MAX_WEEK, POSTSEASON_MIN_WEEK } from './constants'
import type { GameBoxScore, BoxScoreTeam, PlayerLeaders } from '@/lib/types/database'

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

// Get all available weeks for a season using RPC for efficiency
export const getAvailableWeeks = cache(async (season: number): Promise<number[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_available_weeks', { p_season: season })

  if (error || !data) return []
  return data as number[]
})

// Get all available seasons with completed games using RPC for efficiency
export const getAvailableSeasons = cache(async (): Promise<number[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_available_seasons')

  if (error || !data) return []
  return data as number[]
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
// The core tables use _dlt_id/_dlt_parent_id for relationships (dlt = data loading tool)
// so we query each table separately and join client-side
export const getGameBoxScore = cache(async (gameId: number): Promise<GameBoxScore | null> => {
  const supabase = await createClient()

  // Step 1: Get the game's _dlt_id from game_team_stats
  const { data: gameData, error: gameError } = await supabase
    .schema('core')
    .from('game_team_stats')
    .select('_dlt_id')
    .eq('id', gameId)
    .single()

  if (gameError || !gameData) {
    return null
  }

  // Step 2: Get teams for this game via _dlt_parent_id
  const { data: teamsData, error: teamsError } = await supabase
    .schema('core')
    .from('game_team_stats__teams')
    .select('team, home_away, _dlt_id')
    .eq('_dlt_parent_id', gameData._dlt_id)

  if (teamsError || !teamsData || teamsData.length === 0) {
    return null
  }

  // Step 3: Get stats for all teams in one query
  const teamDltIds = teamsData.map(t => t._dlt_id)
  const { data: statsData, error: statsError } = await supabase
    .schema('core')
    .from('game_team_stats__teams__stats')
    .select('category, stat, _dlt_parent_id')
    .in('_dlt_parent_id', teamDltIds)

  if (statsError) {
    return null
  }

  // Build lookup of stats by team _dlt_id
  const statsByTeam = new Map<string, Record<string, string>>()
  for (const stat of statsData ?? []) {
    if (!statsByTeam.has(stat._dlt_parent_id)) {
      statsByTeam.set(stat._dlt_parent_id, {})
    }
    statsByTeam.get(stat._dlt_parent_id)![stat.category] = stat.stat
  }

  // Build BoxScore result
  let home: BoxScoreTeam | null = null
  let away: BoxScoreTeam | null = null

  for (const teamData of teamsData) {
    const boxScoreTeam: BoxScoreTeam = {
      team: teamData.team,
      homeAway: teamData.home_away as 'home' | 'away',
      stats: statsByTeam.get(teamData._dlt_id) ?? {},
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

// Mock data for player leaders until game_player_stats tables are populated
const MOCK_LEADERS: PlayerLeaders = {
  away: {
    passing: [
      { id: '1', name: 'B. Carter', stats: { 'C/ATT': '18/27', 'YDS': '285', 'TD': '2', 'INT': '1' } },
      { id: '2', name: 'R. Jones', stats: { 'C/ATT': '2/3', 'YDS': '15', 'TD': '0', 'INT': '0' } },
    ],
    rushing: [
      { id: '3', name: 'M. Johnson', stats: { 'CAR': '22', 'YDS': '145', 'TD': '1' } },
      { id: '4', name: 'K. Thomas', stats: { 'CAR': '8', 'YDS': '42', 'TD': '0' } },
      { id: '5', name: 'B. Carter', stats: { 'CAR': '5', 'YDS': '23', 'TD': '1' } },
    ],
    receiving: [
      { id: '6', name: 'D. Wilson', stats: { 'REC': '6', 'YDS': '87', 'TD': '1' } },
      { id: '7', name: 'T. Adams', stats: { 'REC': '5', 'YDS': '78', 'TD': '1' } },
      { id: '8', name: 'J. Harris', stats: { 'REC': '4', 'YDS': '65', 'TD': '0' } },
    ],
    defense: [
      { id: '9', name: 'R. Davis', stats: { 'TCKL': '8', 'TFL': '2', 'SACK': '1' } },
      { id: '10', name: 'C. Green', stats: { 'TCKL': '6', 'TFL': '1', 'SACK': '0' } },
      { id: '11', name: 'M. White', stats: { 'TCKL': '5', 'INT': '1', 'PD': '2' } },
    ],
  },
  home: {
    passing: [
      { id: '12', name: 'J. Smith', stats: { 'C/ATT': '12/22', 'YDS': '156', 'TD': '1', 'INT': '0' } },
      { id: '13', name: 'D. Lee', stats: { 'C/ATT': '1/1', 'YDS': '8', 'TD': '0', 'INT': '0' } },
    ],
    rushing: [
      { id: '14', name: 'T. Williams', stats: { 'CAR': '18', 'YDS': '98', 'TD': '0' } },
      { id: '15', name: 'A. Brown', stats: { 'CAR': '12', 'YDS': '67', 'TD': '1' } },
      { id: '16', name: 'J. Smith', stats: { 'CAR': '6', 'YDS': '31', 'TD': '0' } },
    ],
    receiving: [
      { id: '17', name: 'K. Brown', stats: { 'REC': '4', 'YDS': '62', 'TD': '0' } },
      { id: '18', name: 'S. Miller', stats: { 'REC': '3', 'YDS': '48', 'TD': '1' } },
      { id: '19', name: 'R. Jackson', stats: { 'REC': '3', 'YDS': '32', 'TD': '0' } },
    ],
    defense: [
      { id: '20', name: 'L. Martinez', stats: { 'TCKL': '10', 'INT': '1', 'PD': '1' } },
      { id: '21', name: 'J. Robinson', stats: { 'TCKL': '7', 'TFL': '2', 'SACK': '1' } },
      { id: '22', name: 'D. Thompson', stats: { 'TCKL': '6', 'TFL': '1', 'SACK': '0' } },
    ],
  },
}

// Get player leaders for a game
// Currently returns mock data; will query game_player_stats when populated
export const getGamePlayerLeaders = cache(async (_gameId: number): Promise<PlayerLeaders> => {
  // TODO: When game_player_stats tables are populated, query the dlt hierarchy:
  // core.game_player_stats (game_id)
  //   → __teams (_dlt_parent_id, team, home_away)
  //     → __categories (_dlt_parent_id, name)
  //       → __types (_dlt_parent_id, name)
  //         → __athletes (_dlt_parent_id, id, name, stat)
  return MOCK_LEADERS
})

