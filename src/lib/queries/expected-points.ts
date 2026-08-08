import { createClient } from '@/lib/supabase/server'
import { fail, clamp, type McpResult } from './mcp'

// ---------------------------------------------------------------------------
// Query layer for the expected-points MCP tool (get_expected_points in
// src/lib/mcp/tools.ts), over one api-schema view:
//
//   api.expected_points -- the house expected-points model: the solved
//     play-by-play Markov chain ("Goldner-basis" drive EP) per game STATE and
//     ERA, not per team or per game. One row per (era, state), where state
//     encodes down x distance bucket x field-position decile
//     ('d1|standard|z8'), and the view parses the key into typed columns
//     (down, distance_bucket, field_zone, yards_to_goal_min/max). 483 rows
//     total across three eras -- a lookup table, not an event stream.
//
// Four things about this view are load-bearing and easy to get wrong:
//
//   1. It answers "what is this SITUATION worth", never "how good is this
//      team". There is no team column. Team-strength EPA lives in
//      api.team_wepa_season / api.team_week_features.
//   2. down=4 rows are GO-FOR-IT-CONDITIONAL: the value of fourth down given
//      the offense keeps the ball, not the unconditional value of facing
//      fourth down (which would be dominated by punts and kicks).
//   3. ep_drive and ep_net are different bases. ep_drive is what this
//      possession is worth (absorption probabilities x values
//      {TD 6.97, FG 3, SAFETY -2, TURNOVER_TD -6.97, else 0}), ignoring the
//      field position handed to the opponent afterward. ep_net is the net
//      next-score basis -- the one comparable to CFBD's PPA baseline -- and is
//      lower, going negative deep in own territory where the opponent is
//      likelier to score next.
//   4. Cells are unevenly observed: the modal 1st-and-10 cells hold 30k-77k
//      observations per era, but oddball states (1st-and-goal after a penalty
//      from the 35) can hold n_obs = 1. se_boot (bootstrap SE of ep_drive,
//      cluster-resampled by game_id) is the per-cell reliability signal --
//      report it, and treat tiny-n_obs cells as anecdotes.
//
// MCP-only module: keeps mcp.ts's McpResult error-passthrough contract
// (friendly "Error: ..." strings, never a throw) rather than the UI query
// modules' collapse-to-[] convention, and is deliberately NOT wrapped in
// React cache() -- see mcp.ts's module header for both rationales.
// ---------------------------------------------------------------------------

/**
 * The three model eras, oldest first. Era boundaries follow rule/style breaks
 * chosen by cfb-database's EP pipeline; '2021+' is open-ended and absorbs new
 * seasons until the pipeline cuts a new era.
 */
export const EXPECTED_POINTS_ERAS = ['2004-2013', '2014-2020', '2021+'] as const

export type ExpectedPointsEra = (typeof EXPECTED_POINTS_ERAS)[number]

/** First season the play-by-play behind the model covers. */
export const EXPECTED_POINTS_FIRST_SEASON = 2004

/**
 * Distance buckets as stored in the view. Exact yard boundaries are owned by
 * cfb-database's EP pipeline and are not exposed by the view; 'standard'
 * exists only on down 1 (the ordinary 1st-and-10 state), downs 2-4 use
 * short/med/long/xlong instead, and 'goal' means goal-to-go at any down.
 */
export const EXPECTED_POINTS_DISTANCE_BUCKETS = [
  'goal',
  'short',
  'med',
  'long',
  'xlong',
  'standard',
] as const

export type ExpectedPointsDistanceBucket = (typeof EXPECTED_POINTS_DISTANCE_BUCKETS)[number]

/**
 * One era spans at most ~165 rows and a fully-filtered state ask returns at
 * most six (one per bucket), so 50 comfortably covers "show me a down's whole
 * table" without hitting DEFAULT_ROW_CAP truncation on typical asks.
 */
export const EXPECTED_POINTS_DEFAULT_LIMIT = 50

/**
 * The era covering a season, or null for seasons before the model's coverage
 * (< 2004). Open-ended on the right: any future season maps to '2021+'.
 */
export function eraForSeason(season: number): ExpectedPointsEra | null {
  if (season >= 2021) return '2021+'
  if (season >= 2014) return '2014-2020'
  if (season >= EXPECTED_POINTS_FIRST_SEASON) return '2004-2013'
  return null
}

/**
 * The field-position decile for a yards-to-goal value: zone 1 = 1-10 yards
 * from scoring (red-zone edge), zone 10 = 91-99 (backed up). Mirrors the
 * view's own decoding (yards_to_goal_min/max) so callers can translate a spot
 * into the view's grain without knowing the encoding.
 */
export function fieldZoneForYardsToGoal(yardsToGoal: number): number {
  return Math.min(Math.max(Math.ceil(yardsToGoal / 10), 1), 10)
}

export interface ExpectedPointsRow {
  era: string
  /** The raw state key, e.g. 'd1|standard|z8'. Kept so answers can cite the cell. */
  state: string
  down: number
  distance_bucket: string
  /** 1 (yards_to_goal 1-10, nearly scoring) .. 10 (91-99, backed up). */
  field_zone: number
  yards_to_goal_min: number
  yards_to_goal_max: number
  /** Observed plays entering this state in this era. Can be 1 -- check it. */
  n_obs: number
  /**
   * Drive-scoring basis: what this possession is worth, ignoring the field
   * position handed over afterward. Absorption probs x values
   * {TD 6.97, FG 3, SAFETY -2, TURNOVER_TD -6.97, else 0}.
   */
  ep_drive: number
  /**
   * Net next-score basis (the CFBD-PPA-comparable number). Lower than
   * ep_drive; negative when the opponent is likelier to score next.
   */
  ep_net: number | null
  /** Probability this possession ends in an offensive TD. */
  p_td: number
  p_fg: number
  p_punt: number
  /** Turnovers of every kind (downs included), not just giveaways. */
  p_turnover: number
  /**
   * Bootstrap SE of ep_drive, cluster-resampled by game_id. NULL when the
   * compute ran without bootstrapping -- absent, not zero-uncertainty.
   */
  se_boot: number | null
  computed_at: string
}

// `state` is selected even though the view decodes it into typed columns:
// it is the join key back to the warehouse and the only unambiguous way for
// an answer to cite exactly which cell it read.
const EXPECTED_POINTS_COLUMNS = `
  era, state, down, distance_bucket, field_zone, yards_to_goal_min, yards_to_goal_max,
  n_obs, ep_drive, ep_net, p_td, p_fg, p_punt, p_turnover, se_boot, computed_at
` as const

export interface ExpectedPointsFilter {
  era: ExpectedPointsEra
  /** 1-4. Omit to span all downs. */
  down?: number
  /** From fieldZoneForYardsToGoal(). Omit to span the field. */
  fieldZone?: number
  /** Omit to return every bucket for the state -- usually what you want. */
  distanceBucket?: ExpectedPointsDistanceBucket
  limit?: number
}

/**
 * Expected-points cells for one era, narrowed by down, field zone and/or
 * distance bucket.
 *
 * Ordered by down, then field zone, then bucket name, so a multi-row answer
 * reads as a walk down the field and repeated calls are stable. `[]` with no
 * error is a real outcome (e.g. down=1 with distanceBucket='med' -- down 1
 * only has goal/short/standard/long), not a failure.
 */
export async function queryExpectedPoints(
  filter: ExpectedPointsFilter
): Promise<McpResult<ExpectedPointsRow>> {
  const supabase = await createClient()

  let query = supabase
    .schema('api')
    .from('expected_points')
    .select(EXPECTED_POINTS_COLUMNS)
    .eq('era', filter.era)

  if (filter.down != null) query = query.eq('down', filter.down)
  if (filter.fieldZone != null) query = query.eq('field_zone', filter.fieldZone)
  if (filter.distanceBucket) query = query.eq('distance_bucket', filter.distanceBucket)

  const { data, error } = await query
    .order('down', { ascending: true })
    .order('field_zone', { ascending: true })
    .order('distance_bucket', { ascending: true })
    .limit(clamp(filter.limit, EXPECTED_POINTS_DEFAULT_LIMIT))

  if (error) return { rows: [], error: fail('api.expected_points', error) }
  return { rows: (data ?? []) as unknown as ExpectedPointsRow[], error: null }
}
