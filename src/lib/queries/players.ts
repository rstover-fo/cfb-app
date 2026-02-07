import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getTeamLookup } from './shared'
import type {
  PlayerLeaderRow,
  LeaderCategory,
  PlayerProfile,
  PlayerGameLogEntry,
  PlayerPercentiles,
  PlayerSearchResult,
} from '@/lib/types/database'

// ---------------------------------------------------------------------------
// Leaderboard queries
// ---------------------------------------------------------------------------

export const getPlayerSeasonLeaders = cache(async (
  season: number,
  category: LeaderCategory = 'passing',
  conference: string | null = null,
  limit: number = 50
): Promise<PlayerLeaderRow[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_player_season_leaders', {
    p_season: season,
    p_category: category,
    p_conference: conference,
    p_limit: limit,
  })

  if (error || !data) {
    // Fallback: won't work without RPC, return empty
    console.error('get_player_season_leaders error:', error?.message)
    return []
  }

  return data as PlayerLeaderRow[]
})

// ---------------------------------------------------------------------------
// Player detail
// ---------------------------------------------------------------------------

export const getPlayerDetail = cache(async (
  playerId: string,
  season?: number
): Promise<PlayerProfile | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_player_detail', {
    p_player_id: playerId,
    p_season: season ?? null,
  })

  if (error || !data || (data as unknown[]).length === 0) {
    // Fallback: direct roster query
    const rosterQuery = supabase
      .from('roster')
      .select('*')
      .eq('id', playerId)

    if (season) rosterQuery.eq('year', season)

    const { data: rosterData } = await rosterQuery.order('year', { ascending: false }).limit(1)

    if (!rosterData || rosterData.length === 0) return null

    const r = rosterData[0]
    const teamLookup = await getTeamLookup()
    const teamData = teamLookup.get(r.team ?? '')

    return {
      player_id: r.id ?? playerId,
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      team: r.team ?? '',
      position: r.position,
      jersey: r.jersey,
      height: r.height,
      weight: r.weight,
      year: r.year,
      home_city: r.home_city,
      home_state: r.home_state,
      season: r.year ?? season ?? 2024,
      stars: null, recruit_rating: null, national_ranking: null, recruit_class: null,
      pass_att: null, pass_cmp: null, pass_yds: null, pass_td: null, pass_int: null, pass_pct: null,
      rush_car: null, rush_yds: null, rush_td: null, rush_ypc: null,
      rec: null, rec_yds: null, rec_td: null, rec_ypr: null,
      tackles: null, solo: null, sacks: null, tfl: null, pass_def: null, def_int: null,
      fg_made: null, fg_att: null, xp_made: null, xp_att: null, punt_yds: null,
      logo: teamData?.logo ?? null,
      color: teamData?.color ?? null,
    }
  }

  const row = (data as unknown[])[0] as Record<string, unknown>
  const teamLookup = await getTeamLookup()
  const teamData = teamLookup.get(row.team as string ?? '')

  return {
    player_id: row.player_id as string,
    name: row.name as string,
    team: row.team as string,
    position: row.position as string | null,
    jersey: row.jersey as number | null,
    height: row.height as number | null,
    weight: row.weight as number | null,
    year: row.year as number | null,
    home_city: row.home_city as string | null,
    home_state: row.home_state as string | null,
    season: (row.season as number) ?? season ?? 2024,
    stars: row.stars as number | null,
    recruit_rating: row.recruit_rating as number | null,
    national_ranking: row.national_ranking as number | null,
    recruit_class: row.recruit_class as number | null,
    pass_att: row.pass_att as number | null,
    pass_cmp: row.pass_cmp as number | null,
    pass_yds: row.pass_yds as number | null,
    pass_td: row.pass_td as number | null,
    pass_int: row.pass_int as number | null,
    pass_pct: row.pass_pct as number | null,
    rush_car: row.rush_car as number | null,
    rush_yds: row.rush_yds as number | null,
    rush_td: row.rush_td as number | null,
    rush_ypc: row.rush_ypc as number | null,
    rec: row.rec as number | null,
    rec_yds: row.rec_yds as number | null,
    rec_td: row.rec_td as number | null,
    rec_ypr: row.rec_ypr as number | null,
    tackles: row.tackles as number | null,
    solo: row.solo as number | null,
    sacks: row.sacks as number | null,
    tfl: row.tfl as number | null,
    pass_def: row.pass_def as number | null,
    def_int: row.def_int as number | null,
    fg_made: row.fg_made as number | null,
    fg_att: row.fg_att as number | null,
    xp_made: row.xp_made as number | null,
    xp_att: row.xp_att as number | null,
    punt_yds: row.punt_yds as number | null,
    logo: teamData?.logo ?? null,
    color: teamData?.color ?? null,
  }
})

// ---------------------------------------------------------------------------
// Player game log (EPA per game from materialized view)
// ---------------------------------------------------------------------------

export const getPlayerGameLog = cache(async (
  playerId: string,
  season: number
): Promise<PlayerGameLogEntry[]> => {
  const supabase = await createClient()

  // First get player name + team from roster
  const { data: rosterData } = await supabase
    .from('roster')
    .select('first_name, last_name, team')
    .eq('id', playerId)
    .eq('year', season)
    .limit(1)

  if (!rosterData || rosterData.length === 0) return []

  const playerName = `${rosterData[0].first_name} ${rosterData[0].last_name}`
  const team = rosterData[0].team

  // Query marts.player_game_epa via name + team join
  const { data: epaData, error } = await supabase
    .schema('marts' as 'public')
    .from('player_game_epa')
    .select('*')
    .eq('player_name', playerName)
    .eq('team', team)
    .eq('season', season)
    .order('game_id')

  if (error || !epaData) {
    console.error('player_game_epa error:', error?.message)
    return []
  }

  // Enrich with game info
  const gameIds = epaData.map(e => (e as Record<string, unknown>).game_id as number)
  if (gameIds.length === 0) return []

  const { data: gamesData } = await supabase
    .from('games')
    .select('id, week, home_team, away_team, home_points, away_points')
    .in('id', gameIds)

  const gamesMap = new Map(
    (gamesData ?? []).map(g => [g.id, g])
  )

  return epaData.map(row => {
    const r = row as Record<string, unknown>
    const gameId = r.game_id as number
    const game = gamesMap.get(gameId)
    const isHome = game?.home_team === team
    const opponent = isHome ? game?.away_team : game?.home_team
    const teamScore = isHome ? game?.home_points : game?.away_points
    const oppScore = isHome ? game?.away_points : game?.home_points

    return {
      game_id: gameId,
      season: r.season as number,
      team: r.team as string,
      player_name: r.player_name as string,
      play_category: r.play_category as string,
      plays: r.plays as number,
      total_epa: Number(r.total_epa),
      epa_per_play: Number(r.epa_per_play),
      success_rate: Number(r.success_rate),
      explosive_plays: r.explosive_plays as number,
      total_yards: Number(r.total_yards),
      week: game?.week ?? undefined,
      opponent: opponent ?? undefined,
      home_away: isHome ? 'home' : 'away',
      result: teamScore != null && oppScore != null
        ? (teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'T')
        : undefined,
    }
  })
})

// ---------------------------------------------------------------------------
// Player percentiles (from materialized view)
// ---------------------------------------------------------------------------

export const getPlayerPercentiles = cache(async (
  playerId: string,
  season: number
): Promise<PlayerPercentiles | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('marts' as 'public')
    .from('player_comparison')
    .select('*')
    .eq('player_id', playerId)
    .eq('season', season)
    .limit(1)

  if (error || !data || data.length === 0) return null

  const row = data[0] as Record<string, unknown>

  return {
    player_id: row.player_id as string,
    name: row.name as string,
    team: row.team as string,
    position: row.position as string | null,
    position_group: row.position_group as string | null,
    season: row.season as number,
    pass_yds: row.pass_yds ? Number(row.pass_yds) : null,
    pass_td: row.pass_td ? Number(row.pass_td) : null,
    pass_pct: row.pass_pct ? Number(row.pass_pct) : null,
    rush_yds: row.rush_yds ? Number(row.rush_yds) : null,
    rush_td: row.rush_td ? Number(row.rush_td) : null,
    rush_ypc: row.rush_ypc ? Number(row.rush_ypc) : null,
    rec_yds: row.rec_yds ? Number(row.rec_yds) : null,
    rec_td: row.rec_td ? Number(row.rec_td) : null,
    tackles: row.tackles ? Number(row.tackles) : null,
    sacks: row.sacks ? Number(row.sacks) : null,
    tfl: row.tfl ? Number(row.tfl) : null,
    ppa_avg: row.ppa_avg ? Number(row.ppa_avg) : null,
    pass_yds_pctl: row.pass_yds_pctl as number | null,
    pass_td_pctl: row.pass_td_pctl as number | null,
    pass_pct_pctl: row.pass_pct_pctl as number | null,
    rush_yds_pctl: row.rush_yds_pctl as number | null,
    rush_td_pctl: row.rush_td_pctl as number | null,
    rush_ypc_pctl: row.rush_ypc_pctl as number | null,
    rec_yds_pctl: row.rec_yds_pctl as number | null,
    rec_td_pctl: row.rec_td_pctl as number | null,
    tackles_pctl: row.tackles_pctl as number | null,
    sacks_pctl: row.sacks_pctl as number | null,
    tfl_pctl: row.tfl_pctl as number | null,
    ppa_avg_pctl: row.ppa_avg_pctl as number | null,
  }
})

// ---------------------------------------------------------------------------
// Player search (fuzzy, wraps existing RPC)
// ---------------------------------------------------------------------------

export const searchPlayers = cache(async (
  query: string,
  position?: string,
  team?: string,
  season?: number,
  limit: number = 25
): Promise<PlayerSearchResult[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_player_search', {
    p_query: query,
    p_position: position ?? null,
    p_team: team ?? null,
    p_season: season ?? null,
    p_limit: limit,
  })

  if (error || !data) return []

  return (data as unknown[]).map(row => {
    const r = row as Record<string, unknown>
    return {
      player_id: r.player_id as string,
      name: r.name as string,
      team: r.team as string,
      position: r.position as string | null,
      season: r.season as number,
      height: r.height as number | null,
      weight: r.weight as number | null,
      jersey: r.jersey as number | null,
      stars: r.stars as number | null,
      recruit_rating: r.recruit_rating as number | null,
      similarity_score: r.similarity_score as number,
    }
  })
})

// ---------------------------------------------------------------------------
// Available seasons for a player
// ---------------------------------------------------------------------------

export const getPlayerSeasons = cache(async (
  playerId: string
): Promise<number[]> => {
  const supabase = await createClient()

  const { data } = await supabase
    .from('roster')
    .select('year')
    .eq('id', playerId)
    .order('year', { ascending: false })

  if (!data) return []
  return data.map(r => r.year).filter((y): y is number => y != null)
})

// ---------------------------------------------------------------------------
// Available seasons for leaderboard (from stats table)
// ---------------------------------------------------------------------------

export const getLeaderboardSeasons = cache(async (): Promise<number[]> => {
  const supabase = await createClient()

  const { data } = await supabase.rpc('get_available_seasons')
  if (!data) return [2024]
  return (data as number[]).sort((a, b) => b - a)
})

