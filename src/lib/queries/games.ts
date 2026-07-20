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

// Row shape for api.game_box_score (EAV: one row per stat category per team)
// TODO(A0.6): regenerate supabase types to include `api` schema views/tables
interface GameBoxScoreRow {
  team: string
  home_away: 'home' | 'away'
  category: string
  stat_value: string
}

// Get box score stats for a game from the contracted api.game_box_score view
export const getGameBoxScore = cache(async (gameId: number): Promise<GameBoxScore | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('game_box_score')
    .select('team, home_away, category, stat_value')
    .eq('game_id', gameId)

  if (error || !data || data.length === 0) {
    return null
  }

  const rows = data as GameBoxScoreRow[]

  // Pivot EAV rows into one BoxScoreTeam per home_away side
  const byHomeAway = new Map<'home' | 'away', BoxScoreTeam>()
  for (const row of rows) {
    if (!byHomeAway.has(row.home_away)) {
      byHomeAway.set(row.home_away, { team: row.team, homeAway: row.home_away, stats: {} })
    }
    byHomeAway.get(row.home_away)!.stats[row.category] = row.stat_value
  }

  const home = byHomeAway.get('home')
  const away = byHomeAway.get('away')

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

// Row shape for api.game_player_leaders (one row per player per stat_type per category)
// TODO(A0.6): regenerate supabase types to include `api` schema views/tables
interface GamePlayerLeaderRow {
  team: string
  home_away: 'home' | 'away'
  category: string
  stat_type: string
  player_id: string
  player_name: string
  stat: string
}

// Get player leaders for a game from the contracted api.game_player_leaders view
// Returns null if no player stats exist for this game
export const getGamePlayerLeaders = cache(async (gameId: number): Promise<PlayerLeaders | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('game_player_leaders')
    .select('team, home_away, category, stat_type, player_id, player_name, stat')
    .eq('game_id', gameId)
    .in('category', Object.keys(CATEGORY_MAP))

  if (error || !data || data.length === 0) {
    return null
  }

  const rows = data as GamePlayerLeaderRow[]

  const emptyTeamLeaders = (): TeamLeaders => ({
    passing: [],
    rushing: [],
    receiving: [],
    defense: [],
  })

  // Group rows by home_away + category, merging stat_type rows per player_id
  // (each player appears once per stat_type, e.g. separate rows for YDS and TD)
  const playersByTeamCategory = new Map<string, Map<string, { id: string; name: string; stats: Record<string, string> }>>()

  for (const row of rows) {
    const key = `${row.home_away}:${row.category}`
    const players = playersByTeamCategory.get(key) ?? new Map()
    playersByTeamCategory.set(key, players)

    const player = players.get(row.player_id) ?? { id: row.player_id, name: row.player_name, stats: {} }
    player.stats[row.stat_type] = row.stat
    players.set(row.player_id, player)
  }

  const home: TeamLeaders = emptyTeamLeaders()
  const away: TeamLeaders = emptyTeamLeaders()

  for (const [key, players] of playersByTeamCategory) {
    const [homeAway, category] = key.split(':')
    const uiCategory = CATEGORY_MAP[category]
    if (!uiCategory) continue

    // Sort by primary stat, descending
    const sortStat = SORT_STAT[category]
    const sorted = Array.from(players.values()).sort((a, b) => {
      const aVal = parseFloat(a.stats[sortStat] ?? '0')
      const bVal = parseFloat(b.stats[sortStat] ?? '0')
      return bVal - aVal
    })

    const teamLeaders = homeAway === 'home' ? home : away
    teamLeaders[uiCategory] = sorted
  }

  return { home, away }
})

// Row shape for api.game_line_scores (pivoted: one row per game, home_/away_ q1-q4 + ot columns)
// Note: the view SUMS all overtime periods into a single *_ot column, so a
// multi-OT game collapses to one combined OT score below (matches
// QuarterScores.tsx, which renders a single "OT" column for index 4).
// TODO(A0.6): regenerate supabase types to include `api` schema views/tables
interface GameLineScoresRow {
  home_q1: number | null
  home_q2: number | null
  home_q3: number | null
  home_q4: number | null
  home_ot: number | null
  away_q1: number | null
  away_q2: number | null
  away_q3: number | null
  away_q4: number | null
  away_ot: number | null
}

// Get quarter-by-quarter line scores for a game from the contracted api.game_line_scores view
export const getGameLineScores = cache(async (gameId: number): Promise<LineScores | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('game_line_scores')
    .select('home_q1, home_q2, home_q3, home_q4, home_ot, away_q1, away_q2, away_q3, away_q4, away_ot')
    .eq('game_id', gameId)
    .single()

  if (error || !data) return null

  const row = data as GameLineScoresRow

  const home = [row.home_q1, row.home_q2, row.home_q3, row.home_q4].map(v => v ?? 0)
  const away = [row.away_q1, row.away_q2, row.away_q3, row.away_q4].map(v => v ?? 0)

  // Only append an OT column when there was overtime (summed across all OT periods)
  if (row.home_ot != null && row.home_ot > 0) home.push(row.home_ot)
  if (row.away_ot != null && row.away_ot > 0) away.push(row.away_ot)

  if (home.every(v => v === 0) && away.every(v => v === 0)) return null

  return { home, away }
})

// Row shape for api.game_drives (flattened; no double-underscore columns)
// TODO: regenerate supabase types after migration deploy
interface GameDriveRow {
  drive_number: number
  offense: string
  defense: string
  start_period: number
  start_yards_to_goal: number
  end_yards_to_goal: number
  plays: number
  yards: number
  drive_result: string
  scoring: boolean
  start_offense_score: number
  end_offense_score: number
  start_defense_score: number
  end_defense_score: number
  start_time_minutes: number
  start_time_seconds: number
  elapsed_minutes: number
  elapsed_seconds: number
  is_home_offense: boolean
}

// Get all drives for a game from the contracted api.game_drives view
export const getGameDrives = cache(async (gameId: number): Promise<GameDrive[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('game_drives')
    .select('drive_number, offense, defense, start_period, start_yards_to_goal, end_yards_to_goal, plays, yards, drive_result, scoring, start_offense_score, end_offense_score, start_defense_score, end_defense_score, start_time_minutes, start_time_seconds, elapsed_minutes, elapsed_seconds, is_home_offense')
    .eq('game_id', gameId)
    .order('drive_number', { ascending: true })

  if (error || !data) return []

  return data as GameDriveRow[]
})

// Row shape for api.game_plays (flattened; no double-underscore columns)
// TODO: regenerate supabase types after migration deploy
interface GamePlayRow {
  game_id: number
  drive_number: number
  play_number: number
  offense: string
  defense: string
  period: number
  clock_minutes: number | null
  clock_seconds: number | null
  down: number | null
  distance: number | null
  yards_to_goal: number | null
  yards_gained: number | null
  play_type: string | null
  play_text: string | null
  ppa: number | null
  scoring: boolean
  offense_score: number
  defense_score: number
}

// Get all plays for a game from the contracted api.game_plays view
// (view is unfiltered by play type; filter out non-play types client-side)
const EXCLUDED_PLAY_TYPES = ['Timeout', 'End Period', 'End of Game', 'Kickoff']

export const getGamePlays = cache(async (gameId: number): Promise<GamePlay[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('game_plays')
    .select('game_id, drive_number, play_number, offense, defense, period, clock_minutes, clock_seconds, down, distance, yards_to_goal, yards_gained, play_type, play_text, ppa, scoring, offense_score, defense_score')
    .eq('game_id', gameId)
    .order('drive_number', { ascending: true })
    .order('play_number', { ascending: true })

  if (error || !data) return []

  const rows = data as GamePlayRow[]

  // Filter out non-play types
  return rows.filter(p => p.play_type && !EXCLUDED_PLAY_TYPES.includes(p.play_type))
})

