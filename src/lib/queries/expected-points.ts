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
//   5. Era-scope every lookup and NEVER average eras: the same state moves
//      materially between eras (1st-and-10 at own 25 is ~1.58 ep_drive in
//      2004-2013 vs ~1.80 in 2021+ -- a ~15-SE gap per the producer's
//      handoff). Join a game to its own era via eraForSeason().
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
 * Distance buckets as stored in the view. Boundaries are DOWN-AWARE, per the
 * producer's 2026-08-08 handoff: down 1 uses standard (=10) / short (<10) /
 * long (>10) / goal; downs 2-4 use short (<=3) / med (4-6) / long (7-10) /
 * xlong (>10) / goal. 'goal' means goal-to-go at any down (no first-down
 * line before the goal line).
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
 * The bucket a (down, distance-to-go) pair falls in, using the handoff's
 * down-aware boundaries. Pass yardsToGoal too when known: goal-to-go
 * (distance >= yardsToGoal) overrides the yardage buckets at every down --
 * without it a 1st-and-goal from the 8 would misread as 'short'.
 */
export function distanceBucketFor(
  down: number,
  distance: number,
  yardsToGoal?: number
): ExpectedPointsDistanceBucket {
  if (yardsToGoal != null && distance >= yardsToGoal) return 'goal'
  if (down === 1) {
    if (distance === 10) return 'standard'
    return distance < 10 ? 'short' : 'long'
  }
  if (distance <= 3) return 'short'
  if (distance <= 6) return 'med'
  if (distance <= 10) return 'long'
  return 'xlong'
}

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

/**
 * The full empirical outcome distribution of a punt, per era and punting
 * field-zone, from api.game_drives. Powers the tool's fourth-down go-vs-punt
 * comparison as E[EP(outcome)] -- a distribution-weighted average, NOT
 * EP(E[field position]): ep_net is nonlinear across zones, so evaluating it
 * at the mean starting spot biases the punt value (Jensen), and the ~1% of
 * punts that do not transfer possession cleanly carry outsized values that a
 * clean-transfer-only join would silently drop.
 *
 * Per (era, punting zone): `oppZoneCounts[z-1]` counts punts whose NEXT drive
 * belonged to the receiving team starting in opponent zone z (this includes
 * touchbacks, returns, muffs the receivers kept, and non-TD blocked punts
 * recovered by the defense); `nReturnTd` counts punts scored against the
 * punting team (drive_result in PUNT RETURN TD / PUNT TD / BLOCKED PUNT TD
 * and their doubled-label variants); `nKickKeep` counts punts after which the
 * KICKING team possessed next (muff/block recoveries), with
 * `kickKeepAvgYtg` the average spot it kept the ball at.
 *
 * These are stable historical facts per era, not a re-runnable model output,
 * so they are embedded like MODEL_BACKTEST_PREFERRED_WINDOW rather than
 * fetched per request. Computed live 2026-08-08; refresh with:
 *
 *   WITH punts AS (
 *     SELECT CASE WHEN d.season <= 2013 THEN '2004-2013'
 *                 WHEN d.season <= 2020 THEN '2014-2020'
 *                 ELSE '2021+' END AS era,
 *            LEAST(GREATEST(CEIL(d.end_yards_to_goal / 10.0), 1), 10)::int AS punt_zone,
 *            CASE
 *              WHEN d.drive_result IN ('PUNT RETURN TD','PUNT RETURN TD TD','PUNT TD',
 *                                      'BLOCKED PUNT TD','BLOCKED PUNT TD TD') THEN 'return_td'
 *              WHEN nxt.offense = d.defense THEN 'opp'
 *              WHEN nxt.offense = d.offense THEN 'kick_keep'
 *              ELSE 'unknown' END AS outcome,
 *            CASE WHEN nxt.start_yards_to_goal BETWEEN 1 AND 99
 *                 THEN LEAST(GREATEST(CEIL(nxt.start_yards_to_goal / 10.0), 1), 10)::int
 *            END AS next_zone,
 *            nxt.start_yards_to_goal AS next_ytg
 *     FROM api.game_drives d
 *     LEFT JOIN api.game_drives nxt
 *       ON nxt.game_id = d.game_id AND nxt.drive_number = d.drive_number + 1
 *     WHERE d.drive_result IN ('PUNT','PUNT RETURN TD','PUNT RETURN TD TD','PUNT TD',
 *                              'BLOCKED PUNT','BLOCKED PUNT TD','BLOCKED PUNT TD TD')
 *       AND d.end_yards_to_goal BETWEEN 1 AND 99
 *   )
 *   SELECT era, punt_zone, COUNT(*) FILTER (WHERE outcome = 'return_td') AS n_return_td,
 *          COUNT(*) FILTER (WHERE outcome = 'kick_keep') AS n_kick_keep,
 *          ROUND(AVG(next_ytg) FILTER (WHERE outcome = 'kick_keep')::numeric, 0) AS kick_keep_avg_ytg,
 *          COUNT(*) FILTER (WHERE outcome = 'opp' AND next_zone = 1) AS oz1  -- ... oz2..oz10
 *   FROM punts GROUP BY 1, 2 ORDER BY 1, 2;
 *
 * Punting from opponent territory (zones 1-3) is nearly extinct in the modern
 * era (2021+ totals: 13/35/94) -- the tool caveats those as anecdotes. The
 * same zones in 2004-2013 hold thousands: teams really did punt from the
 * opponent 35 in the 2000s.
 */
export interface PuntOutcomeDistribution {
  /** Punts whose next drive went to the receiving team, counted by the opponent's starting zone (index 0 = zone 1). */
  oppZoneCounts: readonly [
    number, number, number, number, number, number, number, number, number, number,
  ]
  /** Punts scored against the punting team (returns/blocks taken to the house). */
  nReturnTd: number
  /** Punts after which the kicking team possessed next (muff/block recoveries). */
  nKickKeep: number
  /** Average yards-to-goal at which the kicking team kept the ball. */
  kickKeepAvgYtg: number
}

export const PUNT_OUTCOMES_BY_ERA_ZONE: Record<
  ExpectedPointsEra,
  Record<number, PuntOutcomeDistribution>
> = {
  '2004-2013': {
    1: { oppZoneCounts: [1, 2, 2, 6, 35, 704, 51, 564, 676, 531], nReturnTd: 17, nKickKeep: 20, kickKeepAvgYtg: 53 },
    2: { oppZoneCounts: [1, 0, 2, 22, 5, 19, 1016, 185, 137, 214], nReturnTd: 12, nKickKeep: 17, kickKeepAvgYtg: 51 },
    3: { oppZoneCounts: [0, 2, 11, 1, 4, 9, 36, 1703, 52, 36], nReturnTd: 10, nKickKeep: 31, kickKeepAvgYtg: 46 },
    4: { oppZoneCounts: [5, 4, 4, 4, 7, 17, 65, 1332, 1925, 1246], nReturnTd: 6, nKickKeep: 47, kickKeepAvgYtg: 32 },
    5: { oppZoneCounts: [16, 15, 20, 28, 45, 63, 263, 3110, 3044, 2907], nReturnTd: 20, nKickKeep: 133, kickKeepAvgYtg: 38 },
    6: { oppZoneCounts: [42, 32, 67, 91, 429, 347, 1203, 5120, 4962, 2139], nReturnTd: 37, nKickKeep: 259, kickKeepAvgYtg: 32 },
    7: { oppZoneCounts: [75, 62, 113, 289, 460, 1310, 4056, 6119, 3010, 853], nReturnTd: 63, nKickKeep: 320, kickKeepAvgYtg: 37 },
    8: { oppZoneCounts: [155, 110, 259, 473, 1473, 4275, 5707, 3240, 928, 222], nReturnTd: 85, nKickKeep: 346, kickKeepAvgYtg: 43 },
    9: { oppZoneCounts: [115, 132, 239, 747, 1960, 2885, 1696, 511, 128, 40], nReturnTd: 61, nKickKeep: 180, kickKeepAvgYtg: 52 },
    10: { oppZoneCounts: [76, 86, 241, 649, 915, 548, 198, 44, 18, 3], nReturnTd: 20, nKickKeep: 59, kickKeepAvgYtg: 59 },
  },
  '2014-2020': {
    1: { oppZoneCounts: [0, 0, 1, 2, 3, 3, 0, 1, 44, 160], nReturnTd: 1, nKickKeep: 6, kickKeepAvgYtg: 44 },
    2: { oppZoneCounts: [0, 0, 3, 3, 5, 6, 11, 144, 257, 0], nReturnTd: 0, nKickKeep: 7, kickKeepAvgYtg: 50 },
    3: { oppZoneCounts: [0, 2, 3, 7, 7, 6, 52, 282, 14, 11], nReturnTd: 1, nKickKeep: 8, kickKeepAvgYtg: 47 },
    4: { oppZoneCounts: [8, 4, 4, 2, 5, 33, 255, 694, 605, 1102], nReturnTd: 4, nKickKeep: 20, kickKeepAvgYtg: 40 },
    5: { oppZoneCounts: [8, 17, 14, 9, 23, 196, 110, 2066, 3035, 2415], nReturnTd: 13, nKickKeep: 53, kickKeepAvgYtg: 24 },
    6: { oppZoneCounts: [13, 21, 25, 32, 108, 188, 628, 3367, 4197, 1830], nReturnTd: 44, nKickKeep: 98, kickKeepAvgYtg: 26 },
    7: { oppZoneCounts: [26, 43, 54, 142, 248, 787, 2863, 5218, 2812, 788], nReturnTd: 113, nKickKeep: 175, kickKeepAvgYtg: 31 },
    8: { oppZoneCounts: [57, 83, 106, 241, 827, 2665, 4527, 3074, 871, 205], nReturnTd: 145, nKickKeep: 151, kickKeepAvgYtg: 36 },
    9: { oppZoneCounts: [31, 65, 147, 396, 1211, 2317, 1409, 413, 98, 16], nReturnTd: 92, nKickKeep: 84, kickKeepAvgYtg: 46 },
    10: { oppZoneCounts: [30, 51, 145, 403, 684, 413, 138, 31, 7, 1], nReturnTd: 46, nKickKeep: 18, kickKeepAvgYtg: 51 },
  },
  '2021+': {
    1: { oppZoneCounts: [0, 0, 0, 0, 1, 4, 4, 1, 1, 0], nReturnTd: 1, nKickKeep: 1, kickKeepAvgYtg: 45 },
    2: { oppZoneCounts: [0, 2, 0, 7, 12, 6, 4, 1, 0, 1], nReturnTd: 0, nKickKeep: 2, kickKeepAvgYtg: 76 },
    3: { oppZoneCounts: [0, 4, 20, 18, 8, 5, 7, 14, 5, 5], nReturnTd: 0, nKickKeep: 8, kickKeepAvgYtg: 52 },
    4: { oppZoneCounts: [2, 10, 16, 5, 5, 6, 23, 610, 436, 922], nReturnTd: 2, nKickKeep: 65, kickKeepAvgYtg: 53 },
    5: { oppZoneCounts: [13, 25, 13, 14, 17, 40, 134, 2041, 2649, 2523], nReturnTd: 16, nKickKeep: 223, kickKeepAvgYtg: 54 },
    6: { oppZoneCounts: [18, 29, 35, 46, 62, 198, 656, 3535, 4526, 1941], nReturnTd: 47, nKickKeep: 362, kickKeepAvgYtg: 52 },
    7: { oppZoneCounts: [30, 48, 67, 127, 309, 994, 3298, 5848, 3016, 803], nReturnTd: 93, nKickKeep: 437, kickKeepAvgYtg: 53 },
    8: { oppZoneCounts: [56, 74, 118, 310, 889, 2733, 5160, 3435, 901, 224], nReturnTd: 129, nKickKeep: 457, kickKeepAvgYtg: 56 },
    9: { oppZoneCounts: [28, 58, 122, 417, 1295, 2291, 1509, 493, 93, 22], nReturnTd: 80, nKickKeep: 206, kickKeepAvgYtg: 60 },
    10: { oppZoneCounts: [16, 55, 157, 390, 691, 506, 143, 45, 11, 3], nReturnTd: 44, nKickKeep: 69, kickKeepAvgYtg: 68 },
  },
}

/**
 * The value of a punt return TD to the PUNTING team, on the same scoring
 * basis as ep_drive/ep_net's TD value (6.97 = TD + expected PAT).
 */
export const PUNT_RETURN_TD_EP = -6.97

export interface PuntEpResult {
  /** Distribution-weighted EP of punting, from the punting team's view. */
  epPunt: number
  /** Usable punts behind the distribution. */
  nPunts: number
  pReturnTd: number
  pKickKeep: number
  /** Weighted mean opponent starting yards-to-goal over clean transfers -- narration only, not used in the EP math. */
  expectedOppStartYtg: number
}

/**
 * Distribution-weighted punt EP for a punt from this spot:
 * E[EP(outcome)] over the era's empirical punt outcomes -- clean transfers
 * weighted by the opponent's actual starting zone (valued at -ep_net of the
 * opponent's 1st-and-10 there), return TDs at PUNT_RETURN_TD_EP, and
 * kicking-team recoveries at +ep_net of the kicking team's average retained
 * spot (a single-point approximation on a ~1-3% weight term).
 *
 * `epNetByZone` maps opponent starting zone -> the era's down-1 ep_net there
 * (bucket 'standard', or 'goal' for zone 1 where 1st-and-10 cannot exist).
 * Returns null when the era/zone has no punt data or any zone with weight
 * lacks a computed ep_net -- callers must render that as not-computable, not
 * as zero.
 */
export function computePuntEp(
  era: ExpectedPointsEra,
  yardsToGoal: number,
  epNetByZone: ReadonlyMap<number, number>
): PuntEpResult | null {
  const dist = PUNT_OUTCOMES_BY_ERA_ZONE[era]?.[fieldZoneForYardsToGoal(yardsToGoal)]
  if (!dist) return null

  const nOpp = dist.oppZoneCounts.reduce((a, b) => a + b, 0)
  const nTotal = nOpp + dist.nReturnTd + dist.nKickKeep
  if (nTotal === 0) return null

  let weightedEp = dist.nReturnTd * PUNT_RETURN_TD_EP
  let oppStartSum = 0
  for (let zone = 1; zone <= 10; zone++) {
    const count = dist.oppZoneCounts[zone - 1]
    if (count === 0) continue
    const epNet = epNetByZone.get(zone)
    if (epNet == null) return null
    weightedEp += count * -epNet
    // Zone midpoint stands in for the within-zone spot; narration only.
    oppStartSum += count * (zone * 10 - 4.5)
  }
  if (dist.nKickKeep > 0) {
    const keepZoneEp = epNetByZone.get(fieldZoneForYardsToGoal(dist.kickKeepAvgYtg))
    if (keepZoneEp == null) return null
    weightedEp += dist.nKickKeep * keepZoneEp
  }

  return {
    epPunt: weightedEp / nTotal,
    nPunts: nTotal,
    pReturnTd: dist.nReturnTd / nTotal,
    pKickKeep: dist.nKickKeep / nTotal,
    expectedOppStartYtg: nOpp > 0 ? Math.round(oppStartSum / nOpp) : 0,
  }
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
   * ep_drive; negative when the opponent is likelier to score next. NULL
   * after a partial recompute -- render "not computed", never 0, and never
   * clamp or abs() it.
   */
  ep_net: number | null
  /** Probability this possession ends in an offensive TD. */
  p_td: number
  p_fg: number
  p_punt: number
  /** Drive-outcome absorption probability; includes defensive-TD turnovers. */
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
