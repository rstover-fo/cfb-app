import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Query layer for the MCP (Model Context Protocol) tool server
// (src/lib/mcp/tools.ts, mounted at src/app/api/[transport]/route.ts).
//
// Unlike the rest of src/lib/queries/*, these functions intentionally return
// close-to-raw view/RPC rows (not reshaped/camelCased for UI consumption):
// the MCP tools must mirror the shapes produced by the reference Python
// server (../../../cfb-database/mcp/src/cfb_mcp/server.py) so a calling LLM
// sees materially the same JSON regardless of which server it talks to.
//
// Every read still goes through the `api` schema's views or documented
// public RPCs -- direct access to the internal `core` schema is banned
// (enforced by src/lib/queries/__tests__/contract-guard.test.ts).
//
// These functions are deliberately NOT wrapped in React's `cache()`: cache()
// only de-duplicates within a single React Server Component render pass.
// MCP tool calls run inside a plain Route Handler, not a React render, so
// wrapping them here would risk an unscoped cache shared across unrelated
// requests instead of the per-request dedup `cache()` provides elsewhere in
// this codebase.
// ---------------------------------------------------------------------------

// Hard row cap mirroring cfb_mcp/postgrest.py's DEFAULT_ROW_CAP. Callers may
// request fewer rows; they can never request more.
export const DEFAULT_ROW_CAP = 100

export interface McpResult<T> {
  rows: T[]
  /** Friendly, "Error: ..." prefixed message. Non-null only when rows is []. */
  error: string | null
}

function fail(context: string, error: { message: string } | null | undefined): string {
  const detail = error?.message ?? 'unknown error'
  console.error(`[mcp] ${context} failed:`, detail)
  return `Error: ${context} request failed: ${detail}`
}

function clamp(limit: number | undefined, fallback: number): number {
  return Math.min(limit ?? fallback, DEFAULT_ROW_CAP)
}

// Double-quote a team/school name for use inside a PostgREST `or=(...)`
// filter string. Parentheses/commas are structural in that syntax, so a name
// like "Miami (OH)" would otherwise corrupt the filter. Mirrors
// cfb_mcp/server.py's query_games and src/lib/queries/matchups.ts.
function quoteFilterValue(value: string): string {
  return value.replace(/"/g, '""')
}

// ---------------------------------------------------------------------------
// 1. query_team -- api.team_detail
// (api.team_history is served by the existing getTeamHistory in compare.ts;
// see src/lib/mcp/tools.ts for how the two are combined.)
// ---------------------------------------------------------------------------

export interface TeamDetailRow {
  school: string
  mascot: string | null
  abbreviation: string | null
  color: string | null
  alternate_color: string | null
  logo_url: string | null
  conference: string | null
  classification: string | null
  current_season: number | null
  games: number | null
  wins: number | null
  losses: number | null
  conf_wins: number | null
  conf_losses: number | null
  ppg: number | null
  opp_ppg: number | null
  avg_margin: number | null
  sp_rating: number | null
  sp_rank: number | null
  sp_offense: number | null
  sp_defense: number | null
  elo: number | null
  fpi: number | null
  epa_per_play: number | null
  epa_tier: string | null
  success_rate: number | null
  explosiveness: number | null
  recruiting_rank: number | null
  recruiting_points: number | null
}

const TEAM_DETAIL_COLUMNS = `
  school, mascot, abbreviation, color, alternate_color, logo_url, conference, classification,
  current_season, games, wins, losses, conf_wins, conf_losses, ppg, opp_ppg, avg_margin,
  sp_rating, sp_rank, sp_offense, sp_defense, elo, fpi,
  epa_per_play, epa_tier, success_rate, explosiveness,
  recruiting_rank, recruiting_points
` as const

export async function queryTeamDetail(team: string): Promise<McpResult<TeamDetailRow>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('api')
    .from('team_detail')
    .select(TEAM_DETAIL_COLUMNS)
    .eq('school', team)
    .limit(1)

  if (error) return { rows: [], error: fail('api.team_detail', error) }
  return { rows: (data ?? []) as unknown as TeamDetailRow[], error: null }
}

// ---------------------------------------------------------------------------
// 2. query_games -- api.game_detail
// ---------------------------------------------------------------------------

export interface GameDetailRow {
  game_id: number
  season: number
  week: number
  season_type: string | null
  start_date: string
  start_time_tbd: boolean | null
  completed: boolean
  neutral_site: boolean | null
  conference_game: boolean | null
  home_team: string
  home_conference: string | null
  home_points: number | null
  home_pregame_elo: number | null
  home_epa: number | null
  home_success_rate: number | null
  away_team: string
  away_conference: string | null
  away_points: number | null
  away_pregame_elo: number | null
  away_epa: number | null
  away_success_rate: number | null
  winner: string | null
  point_diff: number | null
  home_spread: number | null
  over_under: number | null
  line_provider: string | null
  spread_result: string | null
  ou_result: string | null
  pregame_home_win_prob: number | null
  venue: string | null
  venue_id: number | null
  attendance: number | null
  excitement_index: number | null
}

const GAME_DETAIL_COLUMNS = `
  game_id, season, week, season_type, start_date, start_time_tbd, completed, neutral_site, conference_game,
  home_team, home_conference, home_points, home_pregame_elo, home_epa, home_success_rate,
  away_team, away_conference, away_points, away_pregame_elo, away_epa, away_success_rate,
  winner, point_diff, home_spread, over_under, line_provider, spread_result, ou_result,
  pregame_home_win_prob, venue, venue_id, attendance, excitement_index
` as const

export interface GameDetailFilter {
  season?: number
  week?: number
  team?: string
  minExcitement?: number
  limit?: number
}

// Backed by api.game_detail. All filters combine with AND; `team` matches
// home OR away (use query_matchup for head-to-head). Ordered by start_date
// descending (most recent first), matching cfb_mcp/server.py's query_games.
export async function queryGameDetail(filter: GameDetailFilter): Promise<McpResult<GameDetailRow>> {
  const supabase = await createClient()
  let query = supabase.schema('api').from('game_detail').select(GAME_DETAIL_COLUMNS)

  if (filter.season != null) query = query.eq('season', filter.season)
  if (filter.week != null) query = query.eq('week', filter.week)
  if (filter.team) {
    const quoted = quoteFilterValue(filter.team)
    query = query.or(`home_team.eq."${quoted}",away_team.eq."${quoted}"`)
  }
  if (filter.minExcitement != null) query = query.gte('excitement_index', filter.minExcitement)

  const { data, error } = await query
    .order('start_date', { ascending: false })
    .limit(clamp(filter.limit, DEFAULT_ROW_CAP))

  if (error) return { rows: [], error: fail('api.game_detail', error) }
  return { rows: (data ?? []) as unknown as GameDetailRow[], error: null }
}

// ---------------------------------------------------------------------------
// 4. get_rankings -- api.poll_rankings
// ---------------------------------------------------------------------------

export type PollSeasonType = 'regular' | 'postseason'

export interface PollRankingRow {
  season: number
  season_type: string
  week: number
  poll: string
  rank: number
  school: string
  conference: string | null
  first_place_votes: number | null
  points: number | null
}

const POLL_RANKINGS_COLUMNS = `
  season, season_type, week, poll, rank, school, conference, first_place_votes, points
` as const

export interface PollRankingsFilter {
  season: number
  week?: number
  poll?: string
  seasonType: PollSeasonType
  limit?: number
}

// Backed by api.poll_rankings. season_type defaults to 'regular' by the
// caller (src/lib/mcp/tools.ts); CFBD reports the final postseason poll as
// week=1, colliding with the regular-season week-1 poll's week number --
// season_type is the only disambiguator (see api/027_poll_rankings.sql).
// Tied teams share a rank value and the next rank is skipped.
export async function queryPollRankings(filter: PollRankingsFilter): Promise<McpResult<PollRankingRow>> {
  const supabase = await createClient()
  let query = supabase
    .schema('api')
    .from('poll_rankings')
    .select(POLL_RANKINGS_COLUMNS)
    .eq('season', filter.season)
    .eq('season_type', filter.seasonType)

  if (filter.week != null) query = query.eq('week', filter.week)
  if (filter.poll) query = query.eq('poll', filter.poll)

  const { data, error } = await query
    .order('week', { ascending: true })
    .order('poll', { ascending: true })
    .order('rank', { ascending: true })
    .limit(clamp(filter.limit, DEFAULT_ROW_CAP))

  if (error) return { rows: [], error: fail('api.poll_rankings', error) }
  return { rows: (data ?? []) as unknown as PollRankingRow[], error: null }
}

// ---------------------------------------------------------------------------
// 5. get_leaderboard -- api.leaderboard_teams / api.team_wepa_season
// ---------------------------------------------------------------------------

export type LeaderboardMetric = 'wins' | 'ppg' | 'scoring_defense' | 'epa' | 'sp_rating' | 'wepa'
export type NonWepaLeaderboardMetric = Exclude<LeaderboardMetric, 'wepa'>

// Column to order by within api.leaderboard_teams for each non-wepa metric,
// mirroring cfb_mcp/server.py's _LEADERBOARD_ORDER.
const LEADERBOARD_ORDER_COLUMN: Record<NonWepaLeaderboardMetric, string> = {
  wins: 'wins_rank',
  ppg: 'ppg_rank',
  scoring_defense: 'defense_ppg_rank',
  epa: 'epa_rank',
  sp_rating: 'sp_rank',
}

export interface LeaderboardTeamRow {
  team: string
  conference: string | null
  season: number
  games: number | null
  wins: number | null
  losses: number | null
  win_pct: number | null
  conf_wins: number | null
  conf_losses: number | null
  ppg: number | null
  opp_ppg: number | null
  avg_margin: number | null
  sp_rating: number | null
  sp_rank: number | null
  sp_offense: number | null
  sp_defense: number | null
  elo: number | null
  fpi: number | null
  epa_per_play: number | null
  epa_tier: string | null
  success_rate: number | null
  explosiveness: number | null
  total_plays: number | null
  recruiting_rank: number | null
  recruiting_points: number | null
  wins_rank: number | null
  ppg_rank: number | null
  defense_ppg_rank: number | null
  epa_rank: number | null
}

const LEADERBOARD_TEAMS_COLUMNS = `
  team, conference, season, games, wins, losses, win_pct, conf_wins, conf_losses,
  ppg, opp_ppg, avg_margin, sp_rating, sp_rank, sp_offense, sp_defense, elo, fpi,
  epa_per_play, epa_tier, success_rate, explosiveness, total_plays,
  recruiting_rank, recruiting_points, wins_rank, ppg_rank, defense_ppg_rank, epa_rank
` as const

export async function queryLeaderboardTeams(
  season: number,
  metric: NonWepaLeaderboardMetric,
  limit?: number
): Promise<McpResult<LeaderboardTeamRow>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('api')
    .from('leaderboard_teams')
    .select(LEADERBOARD_TEAMS_COLUMNS)
    .eq('season', season)
    // `classification` landed on api.leaderboard_teams 2026-07-22 alongside
    // the warehouse change that scopes rank columns (wins_rank, ppg_rank,
    // defense_ppg_rank, epa_rank) to PARTITION BY season, classification
    // instead of season alone (see cfb-database's SCHEMA_CONTRACT.md
    // 2026-07-22 changelog entry). Filtering here keeps get_leaderboard
    // results FBS-only, same as the rest of the app -- see FBS_CONFERENCES
    // in src/lib/queries/shared.ts for the broader FCS-leak context.
    .eq('classification', 'fbs')
    .order(LEADERBOARD_ORDER_COLUMN[metric], { ascending: true })
    .limit(clamp(limit, DEFAULT_ROW_CAP))

  if (error) return { rows: [], error: fail('api.leaderboard_teams', error) }
  return { rows: (data ?? []) as unknown as LeaderboardTeamRow[], error: null }
}

export interface TeamWepaSeasonRow {
  season: number
  team_id: number | null
  team: string
  conference: string | null
  epa_total: number | null
  epa_passing: number | null
  epa_rushing: number | null
  epa_allowed_total: number | null
  epa_allowed_passing: number | null
  epa_allowed_rushing: number | null
  success_rate_total: number | null
  success_rate_standard_downs: number | null
  success_rate_passing_downs: number | null
  success_rate_allowed_total: number | null
  success_rate_allowed_standard_downs: number | null
  success_rate_allowed_passing_downs: number | null
  rushing_line_yards: number | null
  rushing_second_level_yards: number | null
  rushing_open_field_yards: number | null
  rushing_highlight_yards: number | null
  rushing_allowed_line_yards: number | null
  rushing_allowed_second_level_yards: number | null
  rushing_allowed_open_field_yards: number | null
  rushing_allowed_highlight_yards: number | null
  explosiveness: number | null
  explosiveness_allowed: number | null
  epa_rank: number | null
  defense_rank: number | null
}

const TEAM_WEPA_SEASON_COLUMNS = `
  season, team_id, team, conference,
  epa_total, epa_passing, epa_rushing, epa_allowed_total, epa_allowed_passing, epa_allowed_rushing,
  success_rate_total, success_rate_standard_downs, success_rate_passing_downs,
  success_rate_allowed_total, success_rate_allowed_standard_downs, success_rate_allowed_passing_downs,
  rushing_line_yards, rushing_second_level_yards, rushing_open_field_yards, rushing_highlight_yards,
  rushing_allowed_line_yards, rushing_allowed_second_level_yards, rushing_allowed_open_field_yards, rushing_allowed_highlight_yards,
  explosiveness, explosiveness_allowed, epa_rank, defense_rank
` as const

// wepa is served from the separate api.team_wepa_season view (opponent-
// adjusted EPA), which has its own epa_rank column -- not part of
// api.leaderboard_teams.
export async function queryTeamWepaSeason(season: number, limit?: number): Promise<McpResult<TeamWepaSeasonRow>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('api')
    .from('team_wepa_season')
    .select(TEAM_WEPA_SEASON_COLUMNS)
    .eq('season', season)
    .order('epa_rank', { ascending: true })
    .limit(clamp(limit, DEFAULT_ROW_CAP))

  if (error) return { rows: [], error: fail('api.team_wepa_season', error) }
  return { rows: (data ?? []) as unknown as TeamWepaSeasonRow[], error: null }
}

// ---------------------------------------------------------------------------
// 6. situational_splits -- public RPCs
// ---------------------------------------------------------------------------

export type SplitType = 'home_away' | 'conference' | 'red_zone' | 'down_distance' | 'field_position'

// Mirrors cfb_mcp/server.py's _SPLIT_RPCS.
export const SPLIT_RPC_NAMES: Record<SplitType, string> = {
  home_away: 'get_home_away_splits',
  conference: 'get_conference_splits',
  red_zone: 'get_red_zone_splits',
  down_distance: 'get_down_distance_splits',
  field_position: 'get_field_position_splits',
}

// Fans out to one of five public RPCs (p_team, p_season), each excluding
// garbage-time plays. Not row-capped -- these return inherently small
// breakdown tables.
export async function callSituationalSplitRpc(
  splitType: SplitType,
  team: string,
  season: number
): Promise<McpResult<Record<string, unknown>>> {
  const supabase = await createClient()
  const fn = SPLIT_RPC_NAMES[splitType]

  const { data, error } = await supabase.rpc(fn, { p_team: team, p_season: season })
  if (error) return { rows: [], error: fail(`public.${fn}`, error) }
  return { rows: (data ?? []) as Record<string, unknown>[], error: null }
}

// ---------------------------------------------------------------------------
// 7. search_players -- public.get_player_search, public.get_player_detail
// ---------------------------------------------------------------------------

export interface PlayerSearchRow {
  player_id: string
  name: string
  team: string
  position: string | null
  season: number
  height: number | null
  weight: number | null
  jersey: number | null
  stars: number | null
  recruit_rating: number | null
  similarity_score: number
}

export interface PlayerSearchFilter {
  query: string
  team?: string
  season?: number
  limit?: number
}

// Fuzzy name search via pg_trgm, ranked by similarity_score descending.
// p_position is intentionally never sent -- cfb_mcp/server.py's
// search_players tool has no position filter, only query/team/season/limit.
export async function callPlayerSearch(filter: PlayerSearchFilter): Promise<McpResult<PlayerSearchRow>> {
  const supabase = await createClient()
  const args: Record<string, unknown> = {
    p_query: filter.query,
    p_limit: clamp(filter.limit, 25),
  }
  if (filter.team) args.p_team = filter.team
  if (filter.season != null) args.p_season = filter.season

  const { data, error } = await supabase.rpc('get_player_search', args)
  if (error) return { rows: [], error: fail('public.get_player_search', error) }
  return { rows: (data ?? []) as PlayerSearchRow[], error: null }
}

export interface PlayerDetailRow {
  player_id: string
  name: string
  team: string
  position: string | null
  jersey: number | null
  height: number | null
  weight: number | null
  year: number | null
  home_city: string | null
  home_state: string | null
  season: number
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
  solo: number | null
  sacks: number | null
  tfl: number | null
  pass_def: number | null
  def_int: number | null
  fg_made: number | null
  fg_att: number | null
  xp_made: number | null
  xp_att: number | null
  punt_yds: number | null
  wepa_passing: number | null
  wepa_rushing: number | null
  paar: number | null
}

// If season is omitted, returns the player's most recent season on record.
export async function callPlayerDetail(playerId: string, season?: number): Promise<McpResult<PlayerDetailRow>> {
  const supabase = await createClient()
  const args: Record<string, unknown> = { p_player_id: playerId }
  if (season != null) args.p_season = season

  const { data, error } = await supabase.rpc('get_player_detail', args)
  if (error) return { rows: [], error: fail('public.get_player_detail', error) }
  return { rows: (data ?? []) as PlayerDetailRow[], error: null }
}

// ---------------------------------------------------------------------------
// 8. get_data_freshness -- public.get_data_freshness
// ---------------------------------------------------------------------------

export interface DataFreshnessRow {
  schema_name: string
  table_name: string
  row_count: number
  expected_refresh_frequency: string
  days_since_activity: number | null
  is_stale: boolean
}

// Not row-capped -- ~23 tracked tables, ordered stale-first.
export async function callDataFreshness(): Promise<McpResult<DataFreshnessRow>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_data_freshness')
  if (error) return { rows: [], error: fail('public.get_data_freshness', error) }
  return { rows: (data ?? []) as DataFreshnessRow[], error: null }
}
