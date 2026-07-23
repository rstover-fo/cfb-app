import { createClient } from '@/lib/supabase/server'
import { fail, clamp, type McpResult } from './mcp'

// ---------------------------------------------------------------------------
// Query layer for the penalty-analytics MCP tools (get_penalty_profile,
// get_penalty_log in src/lib/mcp/tools.ts), over two api-schema views:
//
//   api.team_penalties -- per team-game penalty summary (two rows per game,
//     one per team; each row already carries the opponent's totals).
//   api.penalty_log -- play-level penalties parsed from play text, with
//     infraction label, yardage, and declined/offsetting/no-play flags.
//     Coverage: 2004+ seasons. Parsing is BEST-EFFORT over free-text
//     play_text spanning four provider formats: infraction='Unknown' and
//     penalized_team IS NULL mean unclassified, not absent, so filtered
//     counts are floors. Validated floors (seasons >= 2022): >= 90%
//     infraction coverage, >= 50% team attribution. See cfb-database's
//     docs/handoffs/2026-07-23-penalty-views-for-bot.md and
//     src/schemas/api/validation_penalties.sql.
//
// MCP-only module: keeps mcp.ts's McpResult error-passthrough contract
// (friendly "Error: ..." strings, never a throw) rather than the UI query
// modules' collapse-to-[] convention, and is deliberately NOT wrapped in
// React cache() -- see mcp.ts's module header for both rationales.
// ---------------------------------------------------------------------------

// Row cap for the aggregation-input fetch behind get_penalty_profile's
// infraction breakdowns. PostgREST has no GROUP BY, so the tool layer fetches
// a team-season's raw penalty plays and groups them in JS; a team-season maxes
// out around ~150 penalized plays, so 500 is generous headroom. This is an
// internal input cap, not a tool-output cap -- the tool returns ~30 grouped
// rows, so it does not violate DEFAULT_ROW_CAP.
export const PENALTY_AGG_ROW_CAP = 500

// A season is at most ~16 team-games (15 regular weeks + postseason).
const TEAM_PENALTY_GAMES_CAP = 30

export interface TeamPenaltyGameRow {
  game_id: number
  season: number
  week: number
  season_type: string | null
  team: string
  opponent: string | null
  home_away: string | null
  penalties: number
  penalty_yards: number
  opponent_penalties: number
  opponent_penalty_yards: number
}

const TEAM_PENALTIES_COLUMNS = `
  game_id, season, week, season_type, team, opponent, home_away,
  penalties, penalty_yards, opponent_penalties, opponent_penalty_yards
` as const

// One row per game the team played in the season, in chronological order:
// season_type descending sorts 'regular' before 'postseason' alphabetically,
// and postseason week numbers restart at 1, so week alone would interleave.
export async function queryTeamPenaltyGames(team: string, season: number): Promise<McpResult<TeamPenaltyGameRow>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('api')
    .from('team_penalties')
    .select(TEAM_PENALTIES_COLUMNS)
    .eq('team', team)
    .eq('season', season)
    .order('season_type', { ascending: false })
    .order('week', { ascending: true })
    .limit(TEAM_PENALTY_GAMES_CAP)

  if (error) return { rows: [], error: fail('api.team_penalties', error) }
  return { rows: (data ?? []) as unknown as TeamPenaltyGameRow[], error: null }
}

export type PenaltySide = 'committed' | 'drawn'

// Narrower projection than PENALTY_LOG_COLUMNS: just what the profile tool's
// JS aggregation (infraction breakdown + most-costly list) consumes.
export interface PenaltyPlayAggRow {
  game_id: number
  week: number
  season_type: string | null
  period: number | null
  down: number | null
  distance: number | null
  penalized_team: string | null
  benefiting_team: string | null
  infraction: string | null
  penalty_yards: number | null
  declined: boolean | null
  offsetting: boolean | null
  no_play: boolean | null
  ppa: number | null
  play_text: string | null
}

const PENALTY_PLAY_AGG_COLUMNS = `
  game_id, week, season_type, period, down, distance, penalized_team, benefiting_team,
  infraction, penalty_yards, declined, offsetting, no_play, ppa, play_text
` as const

// Aggregation input for get_penalty_profile: every penalty play a team either
// committed (penalized_team = team) or drew from its opponents
// (benefiting_team = team) in a season. Grouping happens in the tool layer.
// Team attribution is parsed from free text and can be NULL (unclassified) --
// the eq() filter drops those rows, so these inputs (and the breakdowns built
// from them) are floors, not exact officiating counts; api.team_penalties is
// the official tally for totals.
export async function queryTeamSeasonPenaltyPlays(
  team: string,
  season: number,
  side: PenaltySide
): Promise<McpResult<PenaltyPlayAggRow>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('api')
    .from('penalty_log')
    .select(PENALTY_PLAY_AGG_COLUMNS)
    .eq(side === 'committed' ? 'penalized_team' : 'benefiting_team', team)
    .eq('season', season)
    .limit(PENALTY_AGG_ROW_CAP)

  if (error) return { rows: [], error: fail('api.penalty_log', error) }
  return { rows: (data ?? []) as unknown as PenaltyPlayAggRow[], error: null }
}

export interface PenaltyLogRow {
  play_id: string
  game_id: number
  season: number
  week: number
  season_type: string | null
  period: number | null
  down: number | null
  distance: number | null
  offense: string | null
  defense: string | null
  play_type: string | null
  is_penalty_play_type: boolean | null
  penalized_team: string | null
  benefiting_team: string | null
  infraction: string | null
  penalty_yards: number | null
  declined: boolean | null
  offsetting: boolean | null
  no_play: boolean | null
  multi_penalty: boolean | null
  yards_gained: number | null
  ppa: number | null
  play_text: string | null
  parse_ok: boolean | null
}

const PENALTY_LOG_COLUMNS = `
  play_id, game_id, season, week, season_type, period, down, distance, offense, defense,
  play_type, is_penalty_play_type, penalized_team, benefiting_team, infraction, penalty_yards,
  declined, offsetting, no_play, multi_penalty, yards_gained, ppa, play_text, parse_ok
` as const

export interface PenaltyLogFilter {
  /** Matches the PENALIZED team (who committed the penalty). */
  team?: string
  season?: number
  week?: number
  gameId?: number
  infraction?: string
  limit?: number
}

const PENALTY_LOG_DEFAULT_LIMIT = 50

// Backed by api.penalty_log. All filters combine with AND; ordered most
// recent first. The caller (get_penalty_log) requires at least one selective
// filter -- an unfiltered log is just the latest plays across all of FBS.
export async function queryPenaltyLog(filter: PenaltyLogFilter): Promise<McpResult<PenaltyLogRow>> {
  const supabase = await createClient()
  let query = supabase.schema('api').from('penalty_log').select(PENALTY_LOG_COLUMNS)

  if (filter.team) query = query.eq('penalized_team', filter.team)
  if (filter.season != null) query = query.eq('season', filter.season)
  if (filter.week != null) query = query.eq('week', filter.week)
  if (filter.gameId != null) query = query.eq('game_id', filter.gameId)
  if (filter.infraction) query = query.eq('infraction', filter.infraction)

  const { data, error } = await query
    .order('season', { ascending: false })
    // Postseason week numbers restart at 1, so week alone would bury bowl/
    // playoff penalties under the whole regular season. season_type ASC puts
    // 'postseason' before 'regular' within a season, keeping the newest games
    // first (mirror image of queryTeamPenaltyGames' chronological sort).
    .order('season_type', { ascending: true })
    .order('week', { ascending: false })
    .order('game_id', { ascending: true })
    .order('period', { ascending: true })
    .limit(clamp(filter.limit, PENALTY_LOG_DEFAULT_LIMIT))

  if (error) return { rows: [], error: fail('api.penalty_log', error) }
  return { rows: (data ?? []) as unknown as PenaltyLogRow[], error: null }
}
