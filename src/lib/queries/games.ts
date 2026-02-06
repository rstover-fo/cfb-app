import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getTeamLookup } from './shared'
import { REGULAR_SEASON_MAX_WEEK, POSTSEASON_MIN_WEEK } from './constants'
import type { GameBoxScore, BoxScoreTeam, PlayerLeaders, TeamLeaders, LineScores, GameDrive, GamePlay } from '@/lib/types/database'

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

// Categories we display in the UI (maps data category name to UI category name)
const CATEGORY_MAP: Record<string, keyof TeamLeaders> = {
  'passing': 'passing',
  'rushing': 'rushing',
  'receiving': 'receiving',
  'defensive': 'defense',  // API uses "defensive", UI uses "defense"
}

// Primary stat for sorting each category (higher = better)
const SORT_STAT: Record<string, string> = {
  'passing': 'YDS',
  'rushing': 'YDS',
  'receiving': 'YDS',
  'defensive': 'TOT',
}

// Get player leaders for a game from core schema
// Returns null if no player stats exist for this game
export const getGamePlayerLeaders = cache(async (gameId: number): Promise<PlayerLeaders | null> => {
  const supabase = await createClient()

  // Step 1: Get the game's _dlt_id from game_player_stats
  const { data: gameData, error: gameError } = await supabase
    .schema('core')
    .from('game_player_stats')
    .select('_dlt_id')
    .eq('id', gameId)
    .single()

  if (gameError || !gameData) {
    return null
  }

  // Step 2: Get teams for this game
  const { data: teamsData, error: teamsError } = await supabase
    .schema('core')
    .from('game_player_stats__teams')
    .select('team, home_away, _dlt_id')
    .eq('_dlt_parent_id', gameData._dlt_id)

  if (teamsError || !teamsData || teamsData.length === 0) {
    return null
  }

  // Step 3: Get categories for all teams
  const teamDltIds = teamsData.map(t => t._dlt_id)
  const { data: categoriesData, error: categoriesError } = await supabase
    .schema('core')
    .from('game_player_stats__teams__categories')
    .select('name, _dlt_id, _dlt_parent_id')
    .in('_dlt_parent_id', teamDltIds)
    .in('name', Object.keys(CATEGORY_MAP))

  if (categoriesError || !categoriesData) {
    return null
  }

  // Step 4: Get stat types for all categories
  const categoryDltIds = categoriesData.map(c => c._dlt_id)
  const { data: typesData, error: typesError } = await supabase
    .schema('core')
    .from('game_player_stats__teams__categories__types')
    .select('name, _dlt_id, _dlt_parent_id')
    .in('_dlt_parent_id', categoryDltIds)

  if (typesError || !typesData) {
    return null
  }

  // Step 5: Get athletes for all stat types
  const typeDltIds = typesData.map(t => t._dlt_id)
  const { data: athletesData, error: athletesError } = await supabase
    .schema('core')
    .from('game_player_stats__teams__categories__types__athletes')
    .select('id, name, stat, _dlt_parent_id')
    .in('_dlt_parent_id', typeDltIds)

  if (athletesError || !athletesData) {
    return null
  }

  // Build lookup maps for efficient traversal
  const typesByCategory = new Map<string, typeof typesData>()
  for (const type of typesData) {
    const existing = typesByCategory.get(type._dlt_parent_id) ?? []
    existing.push(type)
    typesByCategory.set(type._dlt_parent_id, existing)
  }

  const athletesByType = new Map<string, typeof athletesData>()
  for (const athlete of athletesData) {
    const existing = athletesByType.get(athlete._dlt_parent_id) ?? []
    existing.push(athlete)
    athletesByType.set(athlete._dlt_parent_id, existing)
  }

  // Build category lookup
  const categoriesByTeam = new Map<string, typeof categoriesData>()
  for (const cat of categoriesData) {
    const existing = categoriesByTeam.get(cat._dlt_parent_id) ?? []
    existing.push(cat)
    categoriesByTeam.set(cat._dlt_parent_id, existing)
  }

  // Process each team
  const emptyTeamLeaders = (): TeamLeaders => ({
    passing: [],
    rushing: [],
    receiving: [],
    defense: [],
  })

  let home: TeamLeaders = emptyTeamLeaders()
  let away: TeamLeaders = emptyTeamLeaders()

  for (const team of teamsData) {
    const teamLeaders = emptyTeamLeaders()
    const categories = categoriesByTeam.get(team._dlt_id) ?? []

    for (const category of categories) {
      const uiCategory = CATEGORY_MAP[category.name]
      if (!uiCategory) continue

      const types = typesByCategory.get(category._dlt_id) ?? []

      // Collect all athletes and their stats for this category
      // Athletes appear once per stat type, so we need to merge by athlete ID
      const athleteStats = new Map<string, { id: string; name: string; stats: Record<string, string> }>()

      for (const type of types) {
        const athletes = athletesByType.get(type._dlt_id) ?? []
        for (const athlete of athletes) {
          if (!athleteStats.has(athlete.id)) {
            athleteStats.set(athlete.id, { id: athlete.id, name: athlete.name, stats: {} })
          }
          athleteStats.get(athlete.id)!.stats[type.name] = athlete.stat
        }
      }

      // Convert to array and sort by primary stat
      const sortStat = SORT_STAT[category.name]
      const players = Array.from(athleteStats.values())
        .sort((a, b) => {
          const aVal = parseFloat(a.stats[sortStat] ?? '0')
          const bVal = parseFloat(b.stats[sortStat] ?? '0')
          return bVal - aVal  // Descending
        })

      teamLeaders[uiCategory] = players
    }

    if (team.home_away === 'home') {
      home = teamLeaders
    } else {
      away = teamLeaders
    }
  }

  return { home, away }
})

// Get quarter-by-quarter line scores for a game
export const getGameLineScores = cache(async (gameId: number): Promise<LineScores | null> => {
  const supabase = await createClient()

  // Get the game's _dlt_id from core.games
  const { data: gameData, error: gameError } = await supabase
    .schema('core')
    .from('games')
    .select('_dlt_id')
    .eq('id', gameId)
    .single()

  if (gameError || !gameData) return null

  // Fetch both home and away line scores in parallel
  const [homeResult, awayResult] = await Promise.all([
    supabase.schema('core')
      .from('games__home_line_scores')
      .select('value, _dlt_list_idx')
      .eq('_dlt_parent_id', gameData._dlt_id)
      .order('_dlt_list_idx', { ascending: true }),
    supabase.schema('core')
      .from('games__away_line_scores')
      .select('value, _dlt_list_idx')
      .eq('_dlt_parent_id', gameData._dlt_id)
      .order('_dlt_list_idx', { ascending: true }),
  ])

  if (!homeResult.data?.length && !awayResult.data?.length) return null

  return {
    home: (homeResult.data ?? []).map(s => s.value),
    away: (awayResult.data ?? []).map(s => s.value),
  }
})

// Get all drives for a game from core schema
export const getGameDrives = cache(async (gameId: number): Promise<GameDrive[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('core')
    .from('drives')
    .select('drive_number, offense, defense, start_period, start_yards_to_goal, end_yards_to_goal, plays, yards, drive_result, scoring, start_offense_score, end_offense_score, start_defense_score, end_defense_score, start_time__minutes, start_time__seconds, elapsed__minutes, elapsed__seconds, is_home_offense')
    .eq('game_id', gameId)
    .order('drive_number', { ascending: true })

  if (error || !data) return []

  // Map database column names (double underscore) to interface names
  return data.map(d => ({
    drive_number: d.drive_number,
    offense: d.offense,
    defense: d.defense,
    start_period: d.start_period,
    start_yards_to_goal: d.start_yards_to_goal,
    end_yards_to_goal: d.end_yards_to_goal,
    plays: d.plays,
    yards: d.yards,
    drive_result: d.drive_result,
    scoring: d.scoring,
    start_offense_score: d.start_offense_score,
    end_offense_score: d.end_offense_score,
    start_defense_score: d.start_defense_score,
    end_defense_score: d.end_defense_score,
    start_time_minutes: d.start_time__minutes,
    start_time_seconds: d.start_time__seconds,
    elapsed_minutes: d.elapsed__minutes,
    elapsed_seconds: d.elapsed__seconds,
    is_home_offense: d.is_home_offense,
  }))
})

// Get all plays for a game from core schema (filtered to actual plays)
const EXCLUDED_PLAY_TYPES = ['Timeout', 'End Period', 'End of Game', 'Kickoff']

export const getGamePlays = cache(async (gameId: number): Promise<GamePlay[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('core')
    .from('plays')
    .select('game_id, drive_number, play_number, offense, defense, period, clock__minutes, clock__seconds, down, distance, yards_to_goal, yards_gained, play_type, play_text, ppa, scoring, offense_score, defense_score')
    .eq('game_id', gameId)
    .order('drive_number', { ascending: true })
    .order('play_number', { ascending: true })

  if (error || !data) return []

  // Filter out non-play types and map column names
  return data
    .filter(p => p.play_type && !EXCLUDED_PLAY_TYPES.includes(p.play_type))
    .map(p => ({
      game_id: p.game_id,
      drive_number: p.drive_number,
      play_number: p.play_number,
      offense: p.offense,
      defense: p.defense,
      period: p.period,
      clock_minutes: p.clock__minutes,
      clock_seconds: p.clock__seconds,
      down: p.down,
      distance: p.distance,
      yards_to_goal: p.yards_to_goal,
      yards_gained: p.yards_gained,
      play_type: p.play_type,
      play_text: p.play_text,
      ppa: p.ppa,
      scoring: p.scoring,
      offense_score: p.offense_score,
      defense_score: p.defense_score,
    }))
})

