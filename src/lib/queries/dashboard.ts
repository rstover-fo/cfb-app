import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { TeamSeasonTrajectory, TeamSeasonEpa, DefensiveHavoc, TeamSpecialTeamsSos, Game } from '@/lib/types/database'
import { getTeamLookup } from './shared'

// Ranking weight constants
const RANKING_WEIGHTS = {
  offense: 0.4,
  defense: 0.4,
  specialTeams: 0.2,
} as const

// Types for dashboard data
export interface Mover {
  team: string
  logo: string | null
  color: string | null
  currentEpa: number
  epaDelta: number
  direction: 'up' | 'down'
}

export interface RecentGame {
  id: number
  homeTeam: string
  homeLogo: string | null
  homeColor: string | null
  homePoints: number
  awayTeam: string
  awayLogo: string | null
  awayColor: string | null
  awayPoints: number
  date: string
  conferenceGame: boolean
  winner: 'home' | 'away'
}

export interface Standing {
  rank: number
  team: string
  logo: string | null
  color: string | null
  wins: number
  losses: number
  compositeScore: number
}

export interface StatLeader {
  team: string
  logo: string | null
  color: string | null
  value: number
}

export interface StatLeadersData {
  epa: StatLeader[]
  havoc: StatLeader[]
  successRate: StatLeader[]
  explosiveness: StatLeader[]
}

// Get top movers (EPA delta vs prior season)
export const getTopMovers = cache(async (season: number): Promise<{ risers: Mover[], fallers: Mover[] }> => {
  const supabase = await createClient()
  const teamLookup = await getTeamLookup()

  // Get trajectory data with EPA delta
  const { data: trajectoryData, error: trajectoryError } = await supabase
    .from('team_season_trajectory')
    .select('team, epa_per_play, epa_delta')
    .eq('season', season)
    .not('epa_delta', 'is', null)
    .order('epa_delta', { ascending: false })

  if (trajectoryError) {
    console.error('Error fetching trajectory:', trajectoryError)
    return { risers: [], fallers: [] }
  }

  const trajectory = (trajectoryData as TeamSeasonTrajectory[]) || []

  // Filter to FBS teams only (skip nulls)
  const fbsTrajectory = trajectory.filter(t => t.team && teamLookup.has(t.team))

  // Top 3 risers (highest positive delta)
  const risers = fbsTrajectory
    .filter(t => (t.epa_delta ?? 0) > 0)
    .slice(0, 3)
    .map(t => ({
      team: t.team!,
      logo: teamLookup.get(t.team!)?.logo ?? null,
      color: teamLookup.get(t.team!)?.color ?? null,
      currentEpa: t.epa_per_play ?? 0,
      epaDelta: t.epa_delta ?? 0,
      direction: 'up' as const
    }))

  // Top 3 fallers (most negative delta)
  const fallers = fbsTrajectory
    .filter(t => (t.epa_delta ?? 0) < 0)
    .slice(-3)
    .reverse()
    .map(t => ({
      team: t.team!,
      logo: teamLookup.get(t.team!)?.logo ?? null,
      color: teamLookup.get(t.team!)?.color ?? null,
      currentEpa: t.epa_per_play ?? 0,
      epaDelta: t.epa_delta ?? 0,
      direction: 'down' as const
    }))

  return { risers, fallers }
})

// Get recent completed games
export const getRecentGames = cache(async (season: number, limit: number = 5): Promise<RecentGame[]> => {
  const supabase = await createClient()
  const teamLookup = await getTeamLookup()

  // Get recent completed games
  const { data: gamesData, error: gamesError } = await supabase
    .from('games')
    .select('id, home_team, away_team, home_points, away_points, start_date, conference_game')
    .eq('season', season)
    .eq('completed', true)
    .not('home_points', 'is', null)
    .not('away_points', 'is', null)
    .order('start_date', { ascending: false })
    .limit(limit * 3) // Fetch extra to filter for FBS

  if (gamesError) {
    console.error('Error fetching games:', gamesError)
    return []
  }

  const games = (gamesData as Game[]) || []

  // Filter to FBS-only games (both teams must be FBS, skip nulls)
  const fbsGames = games
    .filter(g => g.home_team && g.away_team && teamLookup.has(g.home_team) && teamLookup.has(g.away_team))
    .slice(0, limit)
    .map(g => ({
      id: g.id ?? 0,
      homeTeam: g.home_team!,
      homeLogo: teamLookup.get(g.home_team!)?.logo ?? null,
      homeColor: teamLookup.get(g.home_team!)?.color ?? null,
      homePoints: g.home_points ?? 0,
      awayTeam: g.away_team!,
      awayLogo: teamLookup.get(g.away_team!)?.logo ?? null,
      awayColor: teamLookup.get(g.away_team!)?.color ?? null,
      awayPoints: g.away_points ?? 0,
      date: g.start_date ?? '',
      conferenceGame: g.conference_game ?? false,
      winner: ((g.home_points ?? 0) > (g.away_points ?? 0) ? 'home' : 'away') as 'home' | 'away'
    }))

  return fbsGames
})

// Get standings (top teams by composite ranking)
export const getStandings = cache(async (season: number, limit: number = 10): Promise<Standing[]> => {
  const supabase = await createClient()
  const teamLookup = await getTeamLookup()

  // Fetch all required data in parallel
  const [metricsResult, specialTeamsResult, recordsResult] = await Promise.all([
    supabase.from('team_epa_season').select('team, off_epa_rank, def_epa_rank').eq('season', season),
    supabase.from('team_special_teams_sos').select('team, sp_st_rating').eq('season', season),
    supabase.from('records').select('team, total__wins, total__losses').eq('year', season).eq('classification', 'fbs')
  ])

  const metrics = (metricsResult.data as TeamSeasonEpa[]) || []
  const specialTeams = (specialTeamsResult.data as TeamSpecialTeamsSos[]) || []
  const records = (recordsResult.data || []) as { team: string, total__wins: number, total__losses: number }[]

  // Build lookup maps
  const metricsLookup = new Map<string, { offRank: number, defRank: number }>()
  metrics.forEach(m => { if (m.team) metricsLookup.set(m.team, { offRank: m.off_epa_rank ?? 999, defRank: m.def_epa_rank ?? 999 }) })

  const specialTeamsLookup = new Map<string, number>()
  specialTeams.forEach(s => { if (s.team) specialTeamsLookup.set(s.team, s.sp_st_rating ?? 0) })

  const recordsLookup = new Map<string, { wins: number, losses: number }>()
  records.forEach(r => recordsLookup.set(r.team, { wins: r.total__wins, losses: r.total__losses }))

  // Calculate composite scores for FBS teams
  const standings: Standing[] = []
  const fbsTeams = Array.from(teamLookup.keys())

  for (const teamName of fbsTeams) {
    const teamMetrics = metricsLookup.get(teamName)
    const teamST = specialTeamsLookup.get(teamName)
    const teamRecord = recordsLookup.get(teamName)

    if (!teamMetrics) continue

    // Normalize ranks to 0-100 scale (lower rank = better = higher score)
    // Assuming 130+ FBS teams, rank 1 = 100, rank 130 = 0
    const maxTeams = 134
    const offScore = Math.max(0, (maxTeams - teamMetrics.offRank) / maxTeams * 100)
    const defScore = Math.max(0, (maxTeams - teamMetrics.defRank) / maxTeams * 100)

    // Special teams: SP+ rating is typically -3 to +3, normalize to 0-100
    const stRating = teamST ?? 0
    const stScore = Math.min(100, Math.max(0, (stRating + 3) / 6 * 100))

    const compositeScore =
      offScore * RANKING_WEIGHTS.offense +
      defScore * RANKING_WEIGHTS.defense +
      stScore * RANKING_WEIGHTS.specialTeams

    standings.push({
      rank: 0, // Will be set after sorting
      team: teamName,
      logo: teamLookup.get(teamName)?.logo ?? null,
      color: teamLookup.get(teamName)?.color ?? null,
      wins: teamRecord?.wins ?? 0,
      losses: teamRecord?.losses ?? 0,
      compositeScore
    })
  }

  // Sort by composite score and assign ranks
  standings.sort((a, b) => b.compositeScore - a.compositeScore)
  standings.forEach((s, i) => s.rank = i + 1)

  return standings.slice(0, limit)
})

// Get stat leaders for all categories
export const getStatLeaders = cache(async (season: number): Promise<StatLeadersData> => {
  const supabase = await createClient()
  const teamLookup = await getTeamLookup()

  // Fetch all data in parallel
  const [metricsResult, havocResult] = await Promise.all([
    supabase.from('team_epa_season').select('team, epa_per_play, success_rate, explosiveness').eq('season', season),
    supabase.from('defensive_havoc').select('team, havoc_rate').eq('season', season)
  ])

  const metrics = (metricsResult.data as TeamSeasonEpa[]) || []
  const havoc = (havocResult.data as DefensiveHavoc[]) || []

  // Filter to FBS teams (skip nulls)
  const fbsMetrics = metrics.filter(m => m.team && teamLookup.has(m.team))
  const fbsHavoc = havoc.filter(h => h.team && teamLookup.has(h.team))

  const mapToLeader = (data: { team: string, value: number }[]): StatLeader[] =>
    data.slice(0, 5).map(d => ({
      team: d.team,
      logo: teamLookup.get(d.team)?.logo ?? null,
      color: teamLookup.get(d.team)?.color ?? null,
      value: d.value
    }))

  // EPA leaders (highest EPA per play)
  const epaLeaders = fbsMetrics
    .sort((a, b) => (b.epa_per_play ?? 0) - (a.epa_per_play ?? 0))
    .map(m => ({ team: m.team!, value: m.epa_per_play ?? 0 }))

  // Havoc leaders (highest havoc rate)
  const havocLeaders = fbsHavoc
    .sort((a, b) => (b.havoc_rate ?? 0) - (a.havoc_rate ?? 0))
    .map(h => ({ team: h.team!, value: h.havoc_rate ?? 0 }))

  // Success rate leaders
  const successRateLeaders = fbsMetrics
    .sort((a, b) => (b.success_rate ?? 0) - (a.success_rate ?? 0))
    .map(m => ({ team: m.team!, value: m.success_rate ?? 0 }))

  // Explosiveness leaders
  const explosivenessLeaders = fbsMetrics
    .sort((a, b) => (b.explosiveness ?? 0) - (a.explosiveness ?? 0))
    .map(m => ({ team: m.team!, value: m.explosiveness ?? 0 }))

  return {
    epa: mapToLeader(epaLeaders),
    havoc: mapToLeader(havocLeaders),
    successRate: mapToLeader(successRateLeaders),
    explosiveness: mapToLeader(explosivenessLeaders)
  }
})
