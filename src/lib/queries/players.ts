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

// PostgREST serializes numeric columns as strings — convert safely
function toNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

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
    stars: toNum(row.stars),
    recruit_rating: toNum(row.recruit_rating),
    national_ranking: toNum(row.national_ranking),
    recruit_class: toNum(row.recruit_class),
    pass_att: toNum(row.pass_att),
    pass_cmp: toNum(row.pass_cmp),
    pass_yds: toNum(row.pass_yds),
    pass_td: toNum(row.pass_td),
    pass_int: toNum(row.pass_int),
    pass_pct: toNum(row.pass_pct),
    rush_car: toNum(row.rush_car),
    rush_yds: toNum(row.rush_yds),
    rush_td: toNum(row.rush_td),
    rush_ypc: toNum(row.rush_ypc),
    rec: toNum(row.rec),
    rec_yds: toNum(row.rec_yds),
    rec_td: toNum(row.rec_td),
    rec_ypr: toNum(row.rec_ypr),
    tackles: toNum(row.tackles),
    solo: toNum(row.solo),
    sacks: toNum(row.sacks),
    tfl: toNum(row.tfl),
    pass_def: toNum(row.pass_def),
    def_int: toNum(row.def_int),
    fg_made: toNum(row.fg_made),
    fg_att: toNum(row.fg_att),
    xp_made: toNum(row.xp_made),
    xp_att: toNum(row.xp_att),
    punt_yds: toNum(row.punt_yds),
    logo: teamData?.logo ?? null,
    color: teamData?.color ?? null,
  }
})

// ---------------------------------------------------------------------------
// Player game log (EPA per game via RPC)
// ---------------------------------------------------------------------------

export const getPlayerGameLog = cache(async (
  playerId: string,
  season: number
): Promise<PlayerGameLogEntry[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_player_game_log', {
    p_player_id: playerId,
    p_season: season,
  })

  if (error || !data) {
    console.error('get_player_game_log error:', error?.message)
    return []
  }

  return (data as unknown[]).map(row => {
    const r = row as Record<string, unknown>
    return {
      game_id: r.game_id as number,
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
      week: r.week as number | undefined,
      opponent: r.opponent as string | undefined,
      home_away: r.home_away as string,
      result: r.result as string | undefined,
    }
  })
})

// ---------------------------------------------------------------------------
// Player percentiles (via RPC)
// ---------------------------------------------------------------------------

export const getPlayerPercentiles = cache(async (
  playerId: string,
  season: number
): Promise<PlayerPercentiles | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_player_percentiles', {
    p_player_id: playerId,
    p_season: season,
  })

  if (error || !data || (data as unknown[]).length === 0) return null

  const row = (data as unknown[])[0] as Record<string, unknown>

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
    pass_yds_pctl: toNum(row.pass_yds_pctl),
    pass_td_pctl: toNum(row.pass_td_pctl),
    pass_pct_pctl: toNum(row.pass_pct_pctl),
    rush_yds_pctl: toNum(row.rush_yds_pctl),
    rush_td_pctl: toNum(row.rush_td_pctl),
    rush_ypc_pctl: toNum(row.rush_ypc_pctl),
    rec_yds_pctl: toNum(row.rec_yds_pctl),
    rec_td_pctl: toNum(row.rec_td_pctl),
    tackles_pctl: toNum(row.tackles_pctl),
    sacks_pctl: toNum(row.sacks_pctl),
    tfl_pctl: toNum(row.tfl_pctl),
    ppa_avg_pctl: toNum(row.ppa_avg_pctl),
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

