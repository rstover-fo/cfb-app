import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getTeamLookup, CURRENT_SEASON } from './shared'

// Filter options for games query
export interface GamesFilter {
  season: number
  week?: number
  conference?: string  // At least one team from this conference
  team?: string        // Exact team name match
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
  home_conference: string | null
  away_conference: string | null
  conference_game: boolean
  completed: boolean
  homeLogo: string | null
  homeColor: string | null
  awayLogo: string | null
  awayColor: string | null
}

// Explicit columns - NOT select('*')
const GAME_COLUMNS = `
  id,
  season,
  week,
  start_date,
  home_team,
  away_team,
  home_points,
  away_points,
  home_conference,
  away_conference,
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

  // ALL filters at database level
  if (filter.week) {
    query = query.eq('week', filter.week)
  }

  if (filter.conference) {
    query = query.or(`home_conference.eq.${filter.conference},away_conference.eq.${filter.conference}`)
  }

  if (filter.team) {
    query = query.or(`home_team.eq.${filter.team},away_team.eq.${filter.team}`)
  }

  const { data, error } = await query

  if (error) {
    console.error('Games query failed:', error)
    throw new Error(`Failed to fetch games: ${error.message}`)
  }

  // Filter to FBS-only and enrich with team data
  return (data ?? [])
    .filter(g => teamLookup.has(g.home_team) && teamLookup.has(g.away_team))
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

// Get all available weeks for a season
export const getAvailableWeeks = cache(async (season: number): Promise<number[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('games')
    .select('week')
    .eq('season', season)
    .eq('completed', true)
    .order('week', { ascending: true })

  if (!data) return []

  // Get unique weeks
  const weeks = [...new Set(data.map(d => d.week))].sort((a, b) => a - b)
  return weeks
})

// Re-export for convenience
export { CURRENT_SEASON }
