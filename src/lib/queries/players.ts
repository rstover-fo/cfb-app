import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getTeamLookup } from './shared'
import { PBP_MIN_SEASON } from './constants'
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

// Row shape for api.game_detail's O/U columns (hand-typed -- see matchups.ts's
// GameDetailRow for why: generated Supabase types don't cover the `api`
// schema).
interface GameDetailOURow {
  game_id: number
  over_under: number | null
  ou_result: string | null
}

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

  const entries = (data as unknown[]).map(row => {
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
      over_under: null as number | null,
      ou_result: null as string | null,
    }
  })

  // Batch-fetch Over/Under lines for the games in this log. Best-effort:
  // any failure here should never fail the whole game log, just leave O/U
  // null for every entry (matches the RPC's own error handling above).
  const gameIds = Array.from(new Set(entries.map(e => e.game_id)))
  if (gameIds.length === 0) return entries

  const { data: ouData, error: ouError } = await supabase
    .schema('api')
    .from('game_detail')
    .select('game_id, over_under, ou_result')
    .in('game_id', gameIds)

  if (ouError || !ouData) {
    console.error('game_detail O/U lookup error:', ouError?.message)
    return entries
  }

  const ouByGameId = new Map<number, GameDetailOURow>()
  for (const row of ouData as GameDetailOURow[]) {
    ouByGameId.set(row.game_id, row)
  }

  return entries.map(entry => {
    const ou = ouByGameId.get(entry.game_id)
    return {
      ...entry,
      over_under: ou?.over_under ?? null,
      ou_result: ou?.ou_result ?? null,
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
// api.player_wepa_leaders -- one row per (season, athlete_id, category):
// weighted EPA (wepa) and points-above-average-replacement (paar) leaders,
// pre-ranked league-wide per category via season_rank. See
// src/lib/types/api.generated.ts's `player_wepa_leaders` Row for the full
// generated shape (every column nullable there) -- kept hand-typed here
// narrowing the grain/identity columns (season, athlete_id, athlete_name,
// team, category, season_rank) non-null, since a row can't exist without
// them; position/conference/wepa/paar/metric/plays stay nullable to match
// the generated shape. Player-level EPA attribution (like getPlayerGameLog
// above) only exists from PBP_MIN_SEASON onward -- callers are expected to
// only request seasons at or above that floor (see getLeaderboardSeasons
// below, which is the season list this app's UI actually offers).
// ---------------------------------------------------------------------------

export type WepaCategory = 'passing' | 'rushing' | 'kicking'

export interface WepaLeader {
  season: number
  athlete_id: string
  athlete_name: string
  position: string | null
  team: string
  conference: string | null
  category: string
  wepa: number | null
  paar: number | null
  metric: number | null
  plays: number | null
  season_rank: number
}

export const getWepaLeaders = cache(async (
  season: number,
  category?: WepaCategory,
  limit: number = 25
): Promise<WepaLeader[]> => {
  const supabase = await createClient()

  let query = supabase
    .schema('api')
    .from('player_wepa_leaders')
    .select('season, athlete_id, athlete_name, position, team, conference, category, wepa, paar, metric, plays, season_rank')
    .eq('season', season)

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query
    .order('season_rank', { ascending: true })
    .limit(limit)

  if (error || !data) {
    console.error('getWepaLeaders error:', error?.message)
    return []
  }

  return data as WepaLeader[]
})

// ---------------------------------------------------------------------------
// api.player_usage_leaders -- one row per (season, athlete_id): overall
// snap-share usage plus pass/rush/down-type situational splits. See
// src/lib/types/api.generated.ts's `player_usage_leaders` Row for the full
// generated shape (every column nullable there) -- kept hand-typed here
// narrowing grain/identity columns (season, athlete_id, player_name, team)
// non-null; every usage_* split stays nullable (a player can qualify for
// overall usage with a null situational split, e.g. no passing-downs snaps
// charted). Same PBP_MIN_SEASON floor as WepaLeader above -- this view is
// also derived from play-by-play.
// ---------------------------------------------------------------------------

export interface UsageLeader {
  season: number
  athlete_id: string
  player_name: string
  position: string | null
  team: string
  conference: string | null
  usage_overall: number | null
  usage_pass: number | null
  usage_rush: number | null
  usage_first_down: number | null
  usage_second_down: number | null
  usage_third_down: number | null
  usage_standard_downs: number | null
  usage_passing_downs: number | null
}

export const getUsageLeaders = cache(async (
  season: number,
  limit: number = 25
): Promise<UsageLeader[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('player_usage_leaders')
    .select('season, athlete_id, player_name, position, team, conference, usage_overall, usage_pass, usage_rush, usage_first_down, usage_second_down, usage_third_down, usage_standard_downs, usage_passing_downs')
    .eq('season', season)
    .order('usage_overall', { ascending: false })
    .limit(limit)

  if (error || !data) {
    console.error('getUsageLeaders error:', error?.message)
    return []
  }

  return data as UsageLeader[]
})

// ---------------------------------------------------------------------------
// api.player_comparison -- one row per (player_id, season): the full
// player_detail column set plus position_group and position-group-relative
// percentiles (*_pctl, 0-1 fractions) for the 12 comparable stats. See
// src/lib/types/api.generated.ts's `player_comparison` Row for the full
// generated shape (every column nullable there) -- kept hand-typed here
// narrowing the grain/identity columns (player_id, name, team, season)
// non-null, since a row can't exist without them; everything else stays
// nullable to match the generated shape (a QB has null receiving stats, a
// linebacker null passing percentiles, etc.).
//
// Season IS part of the grain -- a multi-year player has one row per season
// -- so getPlayerComparison always orders season-descending and takes one
// row: with an explicit season that's a no-op on the single matching row,
// without one it resolves "latest available season" from the view's own
// data rather than assuming CURRENT_SEASON has rows yet.
// ---------------------------------------------------------------------------

export interface PlayerComparisonRow {
  player_id: string
  name: string
  team: string
  position: string | null
  position_group: string | null
  season: number
  height: number | null
  weight: number | null
  jersey: number | null
  home_city: string | null
  home_state: string | null
  stars: number | null
  recruit_rating: number | null
  national_ranking: number | null
  recruit_class: number | null
  pass_att: number | null
  pass_cmp: number | null
  pass_yds: number | null
  pass_td: number | null
  pass_int: number | null
  pass_pct: number | null
  rush_car: number | null
  rush_yds: number | null
  rush_td: number | null
  rush_ypc: number | null
  rec: number | null
  rec_yds: number | null
  rec_td: number | null
  rec_ypr: number | null
  tackles: number | null
  sacks: number | null
  tfl: number | null
  pass_def: number | null
  ppa_avg: number | null
  ppa_total: number | null
  // percentiles (0-1), relative to the player's position group in-season
  pass_yds_pctl: number | null
  pass_td_pctl: number | null
  pass_pct_pctl: number | null
  rush_yds_pctl: number | null
  rush_td_pctl: number | null
  rush_ypc_pctl: number | null
  rec_yds_pctl: number | null
  rec_td_pctl: number | null
  tackles_pctl: number | null
  sacks_pctl: number | null
  tfl_pctl: number | null
  ppa_avg_pctl: number | null
}

// Numeric columns of PlayerComparisonRow, converted via toNum because
// PostgREST serializes NUMERIC columns as strings (see toNum above).
const PLAYER_COMPARISON_NUMERIC_KEYS = [
  'height', 'weight', 'jersey',
  'stars', 'recruit_rating', 'national_ranking', 'recruit_class',
  'pass_att', 'pass_cmp', 'pass_yds', 'pass_td', 'pass_int', 'pass_pct',
  'rush_car', 'rush_yds', 'rush_td', 'rush_ypc',
  'rec', 'rec_yds', 'rec_td', 'rec_ypr',
  'tackles', 'sacks', 'tfl', 'pass_def',
  'ppa_avg', 'ppa_total',
  'pass_yds_pctl', 'pass_td_pctl', 'pass_pct_pctl',
  'rush_yds_pctl', 'rush_td_pctl', 'rush_ypc_pctl',
  'rec_yds_pctl', 'rec_td_pctl',
  'tackles_pctl', 'sacks_pctl', 'tfl_pctl', 'ppa_avg_pctl',
] as const

export const getPlayerComparison = cache(async (
  playerId: string,
  season?: number
): Promise<PlayerComparisonRow | null> => {
  const supabase = await createClient()

  let query = supabase
    .schema('api')
    .from('player_comparison')
    .select('*')
    .eq('player_id', playerId)

  if (season != null) {
    query = query.eq('season', season)
  }

  const { data, error } = await query
    .order('season', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('getPlayerComparison error:', error.message)
    return null
  }

  const r = data as Record<string, unknown>
  // Grain columns are non-null in practice; a row missing them is unusable.
  if (r.player_id == null || r.season == null) return null

  const numeric = {} as Record<(typeof PLAYER_COMPARISON_NUMERIC_KEYS)[number], number | null>
  for (const key of PLAYER_COMPARISON_NUMERIC_KEYS) {
    numeric[key] = toNum(r[key])
  }

  return {
    player_id: String(r.player_id),
    name: (r.name as string | null) ?? '',
    team: (r.team as string | null) ?? '',
    position: (r.position as string | null) ?? null,
    position_group: (r.position_group as string | null) ?? null,
    season: Number(r.season),
    home_city: (r.home_city as string | null) ?? null,
    home_state: (r.home_state as string | null) ?? null,
    ...numeric,
  }
})

// ---------------------------------------------------------------------------
// Available seasons for leaderboard (from stats table)
// ---------------------------------------------------------------------------

// Player-level EPA attribution only exists from PBP_MIN_SEASON on -- filter
// out any earlier seasons the RPC happens to return so the leaderboard never
// offers a season with no player EPA data behind it.
const FALLBACK_LEADERBOARD_SEASONS = [2024].filter(s => s >= PBP_MIN_SEASON)

export const getLeaderboardSeasons = cache(async (): Promise<number[]> => {
  const supabase = await createClient()

  const { data } = await supabase.rpc('get_available_seasons')
  if (!data) return FALLBACK_LEADERBOARD_SEASONS
  return (data as number[])
    .filter(s => s >= PBP_MIN_SEASON)
    .sort((a, b) => b - a)
})

