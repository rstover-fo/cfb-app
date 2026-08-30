import { z } from 'zod'
import { withToolTelemetry } from './telemetry'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getTeamHistory } from '@/lib/queries/compare'
import { getMatchup, getMatchupGames } from '@/lib/queries/matchups'
import {
  DEFAULT_ROW_CAP,
  queryTeamDetail,
  queryCoreSnapshot,
  queryGameDetail,
  queryPollRankings,
  queryLeaderboardTeams,
  queryTeamWepaSeason,
  callSituationalSplitRpc,
  callPlayerSearch,
  callPlayerDetail,
  callAnalystQuery,
  callDataFreshness,
  SPLIT_RPC_NAMES,
  type SplitType,
  type LeaderboardMetric,
  type PollSeasonType,
} from '@/lib/queries/mcp'
import {
  getGamePrediction,
  getTeamElo,
  getTeamEloHistory,
  getScoredMatchupEdges,
  getPredictionAccuracy,
} from '@/lib/queries/predictions'
import { getPlaycallingProfile, getTeamWeekFeatures } from '@/lib/queries/playcalling'
import { getLiveScoreboard } from '@/lib/queries/live'
// Type-only: erased by the compiler (isolatedModules), so this contributes
// nothing to this module's runtime bundle -- svg.ts's real (value) exports
// pull in react-dom/server.edge and roughjs, and its sibling ./index further
// pulls in @resvg/resvg-js's native binary. render_chart mints URLs only, so
// the sole real import from the charts-server tree stays `./signing` below.
import type { ChartId } from '@/lib/charts/server/svg'
import { signChartUrl } from '@/lib/charts/server/signing'
// trendMetrics.ts is a pure registry (no React, no roughjs, no Supabase), so
// this one IS a value import: the tool needs the enum and the labels to build
// its input schema and its alt text.
import { METRICS, METRIC_IDS, type MetricId } from '@/lib/charts/metrics'
import { getWepaLeaders, getUsageLeaders, getPlayerComparison, type WepaCategory } from '@/lib/queries/players'
import { getConferenceComparison } from '@/lib/queries/conferences'
import { getCoachingHistory } from '@/lib/queries/coaches'
import {
  queryTeamPenaltyGames,
  queryTeamSeasonPenaltyPlays,
  queryPenaltyLog,
  type TeamPenaltyGameRow,
  type PenaltyPlayAggRow,
} from '@/lib/queries/penalties'
import {
  queryLatestOutlookSeason,
  querySeasonOutlook,
  resolveModelBacktest,
  backtestRowsDisagree,
  MODEL_BACKTEST_SCOPE_FBS,
  SEASON_OUTLOOK_DEFAULT_LIMIT,
  SEASON_OUTLOOK_MODEL,
  type SeasonOutlookRow,
  type ModelBacktestRow,
} from '@/lib/queries/season-outlook'
import {
  queryExpectedPoints,
  eraForSeason,
  fieldZoneForYardsToGoal,
  distanceBucketFor,
  computePuntEp,
  EXPECTED_POINTS_ERAS,
  EXPECTED_POINTS_DISTANCE_BUCKETS,
  EXPECTED_POINTS_DEFAULT_LIMIT,
  EXPECTED_POINTS_FIRST_SEASON,
  type ExpectedPointsEra,
  type ExpectedPointsDistanceBucket,
  type ExpectedPointsRow,
} from '@/lib/queries/expected-points'
import { CURRENT_SEASON, PREDICTION_MODEL_VERSIONS, DEFAULT_PREDICTION_MODEL } from '@/lib/queries/constants'

// ---------------------------------------------------------------------------
// MCP v2: twenty-five read-only tools over the cfb-database warehouse, mounted
// at src/app/api/[transport]/route.ts via mcp-handler's createMcpHandler.
//
// Tools 1-8 are a TypeScript port of the reference Python server
// (../../../cfb-database/mcp/src/cfb_mcp/server.py) -- same eight tools,
// same argument semantics, same `_source`/count/rows JSON envelope, same
// row caps, same friendly-string-never-throw error contract. Tools 9-11
// (get_game_prediction, get_team_elo, get_matchup_edges) are app-native
// additions over the predictions surface (src/lib/queries/predictions.ts)
// with no Python-server counterpart, following the same envelope and
// never-throw conventions -- note that predictions.ts's query fns collapse
// "no row" and "query error" into the same null/[] result (see their own
// doc comments), so these three tools have no separate error-string branch
// to pass through; a null/empty result always renders as either an empty
// envelope or a friendly "not found" string, never a thrown exception.
// Tools 12-15 (get_playcalling_profile, get_adjusted_epa, get_live_scoreboard,
// get_model_accuracy) are further app-native additions over the playcalling
// (src/lib/queries/playcalling.ts), live (src/lib/queries/live.ts), and
// predictions surfaces -- same envelope/never-throw conventions; their query
// fns also collapse "no row"/"query error" into null/[] (see each fn's doc
// comment), and get_live_scoreboard/get_model_accuracy follow get_matchup_edges'
// precedent of returning the envelope even when empty (an empty scoreboard or
// not-yet-populated accuracy table is a normal state, not an error).
// Tools 16-19 (get_player_leaders, compare_players, get_conference_comparison,
// get_coaching_history) are phase-3 app-native additions over the player
// leaderboards/comparison surface (src/lib/queries/players.ts), the
// conferences surface (src/lib/queries/conferences.ts), and the coaches
// surface (src/lib/queries/coaches.ts). getWepaLeaders/getUsageLeaders/
// getCoachingHistory follow the players.ts/coaches.ts convention of
// collapsing "no row"/"query error" into []; getPlayerComparison collapses
// both into null (see each fn's own doc comment) -- so, same as tools 9-15,
// there's no separate error-string branch to pass through here. get_
// conference_comparison additionally mirrors src/app/conferences/page.tsx's
// offseason fallback: if the requested season has no computed aggregates
// yet, it retries season-1 once before giving up, and reports back which
// season the returned rows actually belong to.
// Tools 21-22 (get_penalty_profile, get_penalty_log) are penalty-analytics
// additions over src/lib/queries/penalties.ts (api.team_penalties +
// api.penalty_log). Unlike tools 9-19, penalties.ts keeps the McpResult
// error-passthrough contract of tools 1-8, so these two do have real
// error-string branches; get_penalty_profile additionally aggregates the raw
// rows in JS (PostgREST has no GROUP BY) and follows search_players'
// partial-result precedent when only a secondary fetch fails.
// Tool 23 (render_chart, phase 2.3) is unlike every tool before it: it never
// touches Supabase at all. It mints a signed chart-image URL via
// src/lib/charts/server/signing.ts's signChartUrl -- the producer half of the
// HMAC scheme the chart image route (src/app/api/chart/[chart]/route.ts)
// verifies -- so a bogus team/season still returns a URL (the route renders
// an empty-state PNG for it) rather than a tool-level error. This is what
// makes charts *model-selected*: the model calls render_chart alongside a
// data tool whenever a picture would help, at ~1ms added latency instead of
// a second database round trip.
// Tool 24 (get_season_outlook) is the season-projection surface over
// api.season_outlook (src/lib/queries/season-outlook.ts, which keeps the
// McpResult error-passthrough contract of tools 1-8/21-22). It is the first
// tool whose payload carries honesty metadata structurally rather than only in
// its description: a hardcoded `accuracy` block (the preseason backtest is not
// exposed through any api.* view) and a `caveats` array computed from the rows
// actually returned. That split is deliberate -- a static description cannot
// say "this season is already played" or "6 of these 16 teams have half a
// schedule loaded", and those are precisely the facts that decide whether the
// numbers may be presented as a forecast at all.
// Tool 25 (get_expected_points) is the house expected-points surface over
// api.expected_points (src/lib/queries/expected-points.ts, McpResult
// contract). Unlike every team/game tool before it, its unit of answer is a
// game STATE (era x down x distance bucket x field-position decile), so its
// description spends most of its length on what the tool does NOT answer
// (team strength) and its payload carries the scoring basis structurally,
// same honesty-metadata pattern as tool 24.
// Tool implementations are exported as plain async (args) => string
// functions (below) so they're unit-testable without spinning up the MCP
// transport; registerMcpTools() is the only place that touches the SDK's
// McpServer.
//
// TOOL CONTRACT (both the MCP server and the eve agent consume these):
// - Total functions: failures come back as friendly strings (query-layer
//   'Error: ...' messages, 'No rows...' data misses, configuration notes),
//   NEVER as throws. A data miss is a result, not an error.
// - Bounded: the Supabase client aborts every request at QUERY_TIMEOUT_MS
//   (src/lib/supabase/server.ts) and withToolTelemetry adds a hard per-call
//   deadline that returns 'Error: <tool> timed out...' -- also a string.
// - Observable: each exported binding is wrapped with withToolTelemetry
//   (./telemetry), emitting one {evt:'tool', tool, ms, ok, args} JSON log
//   line per call. Tools that carry user-derived content must pass
//   {redactArgs: true}.
// - Versioned by NAME, not machinery: a breaking change to a tool's schema
//   or envelope ships as a new tool (e.g. get_rankings_v2) registered
//   alongside the old one here, and consumers migrate at their own pace.
// ---------------------------------------------------------------------------

// All twenty-five tools are read-only, non-destructive, idempotent, and talk to
// an external service (Supabase/PostgREST) -- same annotation set for every
// one, mirroring cfb_mcp/server.py's READ_ONLY_ANNOTATIONS.
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const

function dump(payload: unknown): string {
  return JSON.stringify(payload, null, 2)
}

// Attach a _source tag and row count to a result set, mirroring
// cfb_mcp/server.py's _wrap().
function wrap(source: string, rows: unknown[]): { _source: string; count: number; rows: unknown[] } {
  return { _source: source, count: rows.length, rows }
}

const SPLIT_TYPES = ['home_away', 'conference', 'red_zone', 'down_distance', 'field_position'] as const
const LEADERBOARD_METRICS = ['wins', 'ppg', 'scoring_defense', 'epa', 'sp_rating', 'wepa'] as const
const POLL_SEASON_TYPES = ['regular', 'postseason'] as const

// ---------------------------------------------------------------------------
// 1. query_team
// ---------------------------------------------------------------------------

export interface QueryTeamArgs {
  team: string
}

async function queryTeamToolImpl(args: QueryTeamArgs): Promise<string> {
  const { team } = args

  const [detail, historyDesc, coreSnapshot] = await Promise.all([
    queryTeamDetail(team),
    // getTeamHistory (src/lib/queries/compare.ts) already wraps api.team_history
    // for this exact team; it sorts ascending for chart display, so undo that
    // here -- the MCP contract mirrors the Python server's `order=season.desc`
    // (most recent season first), capped at the standard 100-row limit rather
    // than compare.ts's UI-oriented default of 8 seasons.
    getTeamHistory(team, DEFAULT_ROW_CAP).then(rows => [...rows].reverse()),
    // The as-of markers behind the embedded core_* values. A failed lookup
    // degrades to null rather than sinking the whole answer (partial-result
    // precedent from search_players).
    queryCoreSnapshot(team),
  ])

  if (detail.error) return detail.error

  if (detail.rows.length === 0 && historyDesc.length === 0) {
    return (
      `No team found matching '${team}'. Team names are case-sensitive exact matches ` +
      "(e.g. 'Oklahoma', not 'oklahoma' or 'OU')."
    )
  }

  return dump({
    team_detail: wrap('api.team_detail', detail.rows),
    team_history: wrap('api.team_history', historyDesc),
    // Three distinct shapes, because they mean three distinct things: the
    // row (rated, with as-of markers), null (no CORE row -- unrated, the
    // model starts 2016), or {unavailable: true} (the lookup FAILED -- the
    // embedded core_* values may still be present and their finality is
    // UNKNOWN, which must not be collapsed into "unrated").
    core_snapshot: coreSnapshot.error
      ? { unavailable: true }
      : (coreSnapshot.rows[0] ?? null),
  })
}

export const queryTeamDescription =
  "Get a team's current-season snapshot plus its full multi-season history. Use for any " +
  'question about a single team -- "how good is Oklahoma this year", "show Oklahoma\'s ' +
  'history since 2014", ratings/EPA trends over time. Combines api.team_detail (current-season ' +
  'snapshot: record, SP+/Elo/FPI/CORE ratings (core_defense is lower-better; NULL CORE = not ' +
  'rated, never 0), EPA/success rate/explosiveness, recruiting rank -- at ' +
  'most one row) and api.team_history (one row per season, ordered season DESC, up to 100 rows). ' +
  "Team names must match CFBD's convention exactly (case-sensitive) -- 'oklahoma' or 'OU' will " +
  'not match \'Oklahoma\'. api.team_detail only includes FBS-classification teams. The ' +
  '"core_snapshot" key carries the as-of markers behind the embedded CORE values ' +
  '(through_week/through_season_type, model_version, and the within-season ranks): an ' +
  'in-season CORE value is a SNAPSHOT of current form advanced in place by the daily load, ' +
  'not a final rating -- check through_week/through_season_type before presenting it as ' +
  "final, and say \"through week N\" when it is mid-season. core_snapshot is null ONLY when " +
  'the team has no CORE row (the model starts in 2016); if the as-of lookup itself failed ' +
  'it is {"unavailable": true} instead -- embedded core_* values may still be present then, ' +
  'and their finality is UNKNOWN: do not present them as final and do not call the team ' +
  'unrated. Returns JSON ' +
  'with "team_detail", "team_history" (each {"_source", "count", "rows"}) and ' +
  '"core_snapshot" (markers object, null, or {"unavailable": true}) keys, or a plain ' +
  '"No team found..." string if nothing matches.'

export const queryTeamInputShape = {
  team: z
    .string()
    .describe(
      "Exact school name as used by CFBD, e.g. 'Oklahoma', 'Ohio State', 'Texas A&M'. This is " +
        'an exact, case-sensitive match, not a fuzzy search -- if unsure of the exact spelling, ' +
        'try get_leaderboard or query_games first to confirm it.'
    ),
} as const

// ---------------------------------------------------------------------------
// 2. query_games
// ---------------------------------------------------------------------------

export interface QueryGamesArgs {
  season?: number
  week?: number
  team?: string
  min_excitement?: number
  limit?: number
}

async function queryGamesToolImpl(args: QueryGamesArgs): Promise<string> {
  const result = await queryGameDetail({
    season: args.season,
    week: args.week,
    team: args.team,
    minExcitement: args.min_excitement,
    limit: args.limit,
  })

  if (result.error) return result.error
  if (result.rows.length === 0) return 'No games found matching the given filters.'
  return dump(wrap('api.game_detail', result.rows))
}

export const queryGamesDescription =
  'Search games by season, week, team, and/or minimum excitement. Use for "what happened in ' +
  'Oklahoma\'s week 5 game", "show close games in the 2023 season", "list Oklahoma\'s 2024 ' +
  'schedule". Backed by api.game_detail: teams, scores, winner, betting lines (spread/over-under ' +
  'and whether they hit), EPA, pregame win probability, venue, attendance, excitement_index. ' +
  'Ordered by start_date descending (most recent first). All filters combine with AND ' +
  '(min_excitement is a floor, not a range). Calling with no filters returns the 100 most recent ' +
  'games across all of CFBD history -- always pass at least `season` or `team`. `team` matches ' +
  'home OR away (use query_matchup for head-to-head). Results are capped at 100 rows; a full ' +
  'season across all FBS teams is ~800 games, so pair `season` with `team` or `week` to stay ' +
  'under the cap. Uncompleted/future games have NULL scores, winner, and EPA. Returns JSON ' +
  '{"_source": "api.game_detail", "count", "rows"}, or "No games found..." if nothing matches.'

export const queryGamesInputShape = {
  season: z.number().int().optional().describe('Season year, e.g. 2024. Strongly recommended.'),
  week: z
    .number()
    .int()
    .optional()
    .describe(
      'Week number within the season (regular season roughly 1-15; bowls/playoff weeks follow ' +
        "CFBD's season_type/week scheme)."
    ),
  team: z
    .string()
    .optional()
    .describe('Exact school name. Matches games where this team played either home or away.'),
  min_excitement: z
    .number()
    .optional()
    .describe(
      "Minimum excitement_index (CFBD's game-excitement score, roughly 0-10; >6 is generally a " +
        'thrilling finish). Use to find close or dramatic games.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(DEFAULT_ROW_CAP)
    .optional()
    .describe(`Max rows to return. Hard-capped at ${DEFAULT_ROW_CAP} server-side regardless of this value.`),
} as const

// ---------------------------------------------------------------------------
// 3. query_matchup
// ---------------------------------------------------------------------------

export interface QueryMatchupArgs {
  team_a: string
  team_b: string
}

async function queryMatchupToolImpl(args: QueryMatchupArgs): Promise<string> {
  const { team_a: teamA, team_b: teamB } = args

  // Reuses the existing, well-tested getMatchup/getMatchupGames (src/lib/queries/matchups.ts),
  // which already normalize the pair alphabetically against api.matchup and
  // re-orient results to the caller's teamA perspective. This tool combines
  // both into one response (summary + full game log) rather than the Python
  // server's single api.matchup row, since the app already has the richer
  // game-by-game query available.
  const matchup = await getMatchup(teamA, teamB)

  if (!matchup) {
    return (
      `No matchup history found between '${teamA}' and '${teamB}'. These teams may ` +
      'have never played each other (FBS-era games only), or a team name may be misspelled.'
    )
  }

  // Cap at the tool boundary: getMatchupGames is shared with the /rivals
  // page, which intentionally shows the full rivalry history.
  const games = (await getMatchupGames(teamA, teamB)).slice(0, DEFAULT_ROW_CAP)

  return dump({
    matchup: wrap('api.matchup', [matchup]),
    games: wrap('api.game_detail', games),
  })
}

export const queryMatchupDescription =
  'Get head-to-head history and current-season comparison between two teams. Use for "Oklahoma ' +
  'vs Texas all-time record", "how do these two teams compare this season" (rivalry games, bowl ' +
  'previews). Backed by api.matchup (one row per unordered team pair; order of team_a/team_b ' +
  "doesn't matter) plus the full api.game_detail game log between the pair. Returns all-time " +
  'record (total games, wins for each side, ties, first/last meeting), recent results, and each ' +
  "team's current-season record/SP+ rank/EPA for context. Returns JSON with \"matchup\" and " +
  '"games" keys, each {"_source", "count", "rows"}, or "No matchup history found..." if the teams ' +
  'have never played or a name is misspelled.'

export const queryMatchupInputShape = {
  team_a: z.string().describe("First team's exact school name."),
  team_b: z
    .string()
    .describe(
      "Second team's exact school name. Order relative to team_a doesn't matter -- results are " +
        'identical either way.'
    ),
} as const

// ---------------------------------------------------------------------------
// 4. get_rankings
// ---------------------------------------------------------------------------

export interface GetRankingsArgs {
  season: number
  week?: number
  poll?: string
  season_type?: PollSeasonType
  limit?: number
}

async function getRankingsToolImpl(args: GetRankingsArgs): Promise<string> {
  const seasonType: PollSeasonType = args.season_type ?? 'regular'

  const result = await queryPollRankings({
    season: args.season,
    week: args.week,
    poll: args.poll,
    seasonType,
    limit: args.limit,
  })

  if (result.error) return result.error
  if (result.rows.length === 0) {
    return `No rankings found for season=${args.season}, season_type=${seasonType} with the given filters.`
  }
  return dump(wrap('api.poll_rankings', result.rows))
}

export const getRankingsDescription =
  'Get weekly or final poll rankings (AP Top 25, Coaches Poll, CFP committee, etc). Use for "who ' +
  'was #1 in the AP poll in week 8 of 2024", "show the final CFP rankings for 2023", "was ' +
  'Oklahoma ranked in week 3". Backed by api.poll_rankings, ordered week/poll/rank ascending. ' +
  'IMPORTANT: tied teams share the same rank value and the next rank is skipped (e.g. two teams ' +
  'at #11 means no #12 that week) -- do not assume rank values are contiguous or one row per ' +
  'rank. To get the END-OF-SEASON final poll, set season_type=\'postseason\' (week is reported ' +
  "as 1, identical to the regular-season week-1 poll's week number -- season_type is the only " +
  'disambiguator). Omitting both `week` and `poll` for a full season can return a lot of rows ' +
  '(many weeks x several polls x ~25 teams); the 100-row cap may truncate results, so prefer ' +
  'narrowing with `poll` and/or `week`. Returns JSON {"_source": "api.poll_rankings", "count", ' +
  '"rows"}, or "No rankings found..." if nothing matches.'

export const getRankingsInputShape = {
  season: z.number().int().describe('Season year, e.g. 2024.'),
  week: z
    .number()
    .int()
    .optional()
    .describe('Week number. Omit to get every week of the season (subject to the 100-row cap).'),
  poll: z
    .string()
    .optional()
    .describe(
      "Exact poll name, e.g. 'AP Top 25', 'Coaches Poll', 'Playoff Committee Rankings'. Omit to " +
        'get all polls for the given week(s).'
    ),
  season_type: z
    .enum(POLL_SEASON_TYPES)
    .optional()
    .describe(
      "'regular' (default) for weekly in-season polls, or 'postseason' for the final poll of the " +
        'season. CFBD reports the final poll as week=1, the same week number as the ' +
        'regular-season week-1 poll -- season_type is what tells them apart.'
    ),
  limit: z.number().int().min(1).max(DEFAULT_ROW_CAP).optional().describe('Max rows to return.'),
} as const

// ---------------------------------------------------------------------------
// 5. get_leaderboard
// ---------------------------------------------------------------------------

export interface GetLeaderboardArgs {
  season: number
  metric: LeaderboardMetric
  limit?: number
}

async function getLeaderboardToolImpl(args: GetLeaderboardArgs): Promise<string> {
  const { metric } = args
  const result =
    metric === 'wepa'
      ? await queryTeamWepaSeason(args.season, args.limit)
      : await queryLeaderboardTeams(args.season, metric, args.limit)
  const source = metric === 'wepa' ? 'api.team_wepa_season' : 'api.leaderboard_teams'

  if (result.error) return result.error
  if (result.rows.length === 0) return `No leaderboard data found for season=${args.season}.`
  return dump(wrap(source, result.rows))
}

export const getLeaderboardDescription =
  'Get a ranked leaderboard of teams for a season by a chosen metric. Use for "top 10 teams by ' +
  'EPA in 2024", "best scoring defense last season", "who led the country in wins". Ranks are ' +
  'FBS-scoped (FCS teams are excluded and do not count toward rank position). All metrics ' +
  'except \'wepa\' are served from api.leaderboard_teams, which pre-computes rank columns ' +
  "(wins_rank, ppg_rank, defense_ppg_rank, epa_rank) via SQL window functions -- ties are " +
  "possible. 'wepa' (opponent-adjusted EPA) is served from the separate api.team_wepa_season " +
  'view. Returns JSON {"_source", "count", "rows"} ordered best-to-worst, or "No leaderboard data ' +
  'found..." if the season has no data.'

export const getLeaderboardInputShape = {
  season: z.number().int().describe('Season year, e.g. 2024.'),
  metric: z
    .enum(LEADERBOARD_METRICS)
    .describe(
      "Ranking metric: 'wins' (most wins), 'ppg' (points per game), 'scoring_defense' (fewest " +
        "points allowed per game), 'epa' (EPA/play), 'sp_rating' (best SP+ rank), or 'wepa' " +
        '(opponent-adjusted EPA -- pulled from api.team_wepa_season).'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(DEFAULT_ROW_CAP)
    .optional()
    .describe(
      'Max rows. Capped at 100; there are ~130 FBS teams so a full-season list may be truncated ' +
        '-- lower this or treat results as top-N, not exhaustive.'
    ),
} as const

// ---------------------------------------------------------------------------
// 6. situational_splits
// ---------------------------------------------------------------------------

export interface SituationalSplitsArgs {
  team: string
  season: number
  split_type: SplitType
}

async function situationalSplitsToolImpl(args: SituationalSplitsArgs): Promise<string> {
  const result = await callSituationalSplitRpc(args.split_type, args.team, args.season)

  if (result.error) return result.error
  if (result.rows.length === 0) {
    return (
      `No ${args.split_type} splits found for '${args.team}' in ${args.season}. Check the team ` +
      'name and that the season has play-by-play data (2014+).'
    )
  }
  return dump(wrap(`public.${SPLIT_RPC_NAMES[args.split_type]}`, result.rows))
}

export const situationalSplitsDescription =
  'Get a team\'s situational performance splits for a season. Use for "how does Oklahoma perform ' +
  'on 3rd down", "home vs away splits for Oklahoma in 2023", "red zone efficiency", "conference ' +
  'vs non-conference performance". Fans out to one of five public RPCs based on split_type: ' +
  'get_home_away_splits, get_conference_splits, get_red_zone_splits, get_down_distance_splits, ' +
  'get_field_position_splits -- each called as (p_team=team, p_season=season). All five exclude ' +
  'garbage-time plays. Play-by-play data is available from the 2014 season on; earlier seasons ' +
  'will return empty or partial results. Returns JSON {"_source": "public.<rpc_name>", "count", ' +
  '"rows"}, or "No <split_type> splits found..." if the team/season has no matching plays.'

export const situationalSplitsInputShape = {
  team: z.string().describe('Exact school name.'),
  season: z.number().int().describe('Season year, e.g. 2024.'),
  split_type: z
    .enum(SPLIT_TYPES)
    .describe(
      "Which breakdown to compute: 'home_away' (home vs away performance), 'conference' " +
        "(conference vs non-conference opponents), 'red_zone' (trips inside the opponent 20: " +
        "TD/FG/turnover rates), 'down_distance' (success rate/EPA by down and distance bucket), " +
        "or 'field_position' (EPA/success rate by field-position zone)."
    ),
} as const

// ---------------------------------------------------------------------------
// 7. search_players
// ---------------------------------------------------------------------------

export interface SearchPlayersArgs {
  query: string
  team?: string
  season?: number
  limit?: number
}

async function searchPlayersToolImpl(args: SearchPlayersArgs): Promise<string> {
  const searchResult = await callPlayerSearch({
    query: args.query,
    team: args.team,
    season: args.season,
    limit: args.limit,
  })

  if (searchResult.error) return searchResult.error
  if (searchResult.rows.length === 0) return `No players found matching '${args.query}'.`

  const top = searchResult.rows[0]
  const detailResult = await callPlayerDetail(top.player_id, args.season)

  if (detailResult.error) {
    return dump({
      search: wrap('public.get_player_search', searchResult.rows),
      top_hit_detail_error: detailResult.error,
    })
  }

  return dump({
    search: wrap('public.get_player_search', searchResult.rows),
    top_hit_detail: wrap('public.get_player_detail', detailResult.rows),
  })
}

export const searchPlayersDescription =
  'Search for a player by name, then fetch full detail for the best match. Use anytime the ' +
  'caller has a name but not an exact player_id -- "find Caleb Williams\' stats", "search for a ' +
  'player named Bijan on Texas". Two-step workflow: (1) get_player_search(p_query, p_team, ' +
  'p_season, p_limit) -- fuzzy name match via pg_trgm, ranked by similarity_score descending; (2) ' +
  'get_player_detail(p_player_id, p_season) is then called automatically for the single ' +
  'top-ranked hit, returning full bio/recruiting/season stats/PPA/WEPA/PAAR. If multiple players ' +
  'share a similar name, only the top hit gets full detail -- inspect the "search" rows for other ' +
  'candidates and call again with a more specific query/team/season if the top hit is wrong. If ' +
  '`season` is omitted, get_player_detail returns that player\'s most recent season on record, ' +
  'which may not be the season implied by the query. Returns JSON with "search" and ' +
  '"top_hit_detail" keys (or "top_hit_detail_error" if the detail lookup itself fails -- search ' +
  'results are never discarded), or "No players found..." if the search itself is empty.'

export const searchPlayersInputShape = {
  query: z
    .string()
    .describe(
      "Player name to search, full or partial, typo-tolerant (trigram similarity match). E.g. " +
        "'Caleb Williams', 'Bijan', or a misspelling like 'Calib Williams'."
    ),
  team: z.string().optional().describe('Restrict search to an exact school name.'),
  season: z.number().int().optional().describe('Restrict search to a season year.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(DEFAULT_ROW_CAP)
    .optional()
    .describe('Max search results (default 25, hard-capped at 100).'),
} as const

// ---------------------------------------------------------------------------
// 8. get_data_freshness
// ---------------------------------------------------------------------------

async function getDataFreshnessToolImpl(): Promise<string> {
  const result = await callDataFreshness()
  if (result.error) return result.error
  return dump(wrap('public.get_data_freshness', result.rows))
}

export const getDataFreshnessDescription =
  'Get freshness/staleness status for all tracked warehouse tables. Use before answering ' +
  'questions about very recent games/stats, to qualify how current the data is -- e.g. "as of ' +
  'the last refresh (X days ago), ...". Also useful if a query returns unexpectedly few/no rows ' +
  'for the current week, to check whether the pipeline has run yet. Takes no arguments. Backed by ' +
  'the public.get_data_freshness() RPC, which reports row_count, expected_refresh_frequency, ' +
  'days_since_activity, and is_stale for each of ~23 tracked tables, ordered stale-first. Returns ' +
  'JSON {"_source": "public.get_data_freshness", "count", "rows"}.'

export const getDataFreshnessInputShape = {} as const

// ---------------------------------------------------------------------------
// 9. get_game_prediction
// ---------------------------------------------------------------------------

export interface GetGamePredictionArgs {
  game_id: number
  model_version?: string
}

async function getGamePredictionToolImpl(args: GetGamePredictionArgs): Promise<string> {
  const modelVersion = args.model_version ?? DEFAULT_PREDICTION_MODEL
  const prediction = await getGamePrediction(args.game_id, modelVersion)

  // getGamePrediction (src/lib/queries/predictions.ts) returns null for both
  // "no row" and "query error" -- there is no separate error string to pass
  // through here, so a null result always renders as this friendly string.
  if (!prediction) {
    // The house model only goes back to 2018; the two Elo versions reach 2015.
    // Without this pointer a pre-2018 game reads as "no prediction exists",
    // when in fact one does under a different model_version.
    const olderSeasonHint =
      modelVersion === DEFAULT_PREDICTION_MODEL
        ? ` '${DEFAULT_PREDICTION_MODEL}' covers seasons from 2018 onward -- for an older game, retry ` +
          "with model_version='elo_epa_blend_v1' or 'elo_v1', which cover 2015 onward."
        : ''
    return (
      `No prediction found for game_id=${args.game_id} with model_version='${modelVersion}'. This is normal ` +
      "if the model hasn't run for this game yet, the game_id doesn't exist, or that model_version wasn't " +
      `written for this game.${olderSeasonHint}`
    )
  }

  return dump(wrap('api.game_predictions', [prediction]))
}

export const getGamePredictionDescription =
  'Get the house model\'s prediction for a single game, plus how it stacks up against the market ' +
  'line. Use for "what does the model predict for the Oklahoma vs Texas game", "is there value on ' +
  'this line", "how confident is the model in this matchup". Backed by api.game_predictions, which ' +
  'is already latest-snapshot per (game_id, model_version) -- at most one row. Three model versions ' +
  "are written per game: 'fitted_v1' (default -- the current house model, a fitted 20-feature ridge), " +
  "'elo_v1' (Elo rating differential only), and 'elo_epa_blend_v1' (blends Elo with recent EPA form). " +
  'The two Elo versions share one Elo-derived home_win_prob and differ only in expected_home_margin; ' +
  "'fitted_v1' carries its OWN Platt-scaled win probability, so BOTH expected_home_margin and " +
  'home_win_prob change when you switch to or from it -- never quote a win probability without saying ' +
  "which version produced it. 'fitted_v1' also leaves elo_margin and epa_margin NULL (the fitted " +
  'ridge does not decompose its margin into those components) and covers 2018+ only, while the two ' +
  'Elo versions cover 2015+ -- those nulls are the normal shape of a fitted_v1 row, not missing data. ' +
  '`edge` = expected_home_margin + market_spread: a ' +
  'positive edge means the model favors the home team more than the market does (vs. the number); a ' +
  'negative edge means the model favors the away team relative to the market. market_provider, ' +
  'market_spread, market_home_margin, market_captured_at, edge, and edge_pick are all null when no ' +
  'betting line has been posted for this game -- that is a normal state (e.g. very early in the week, ' +
  'or a game with no market coverage), not an error. Returns JSON {"_source": "api.game_predictions", ' +
  '"count", "rows"} with at most one row, or a friendly "No prediction found..." string if the model ' +
  "hasn't run for this game_id/model_version combination or the game_id doesn't exist."

export const getGamePredictionInputShape = {
  game_id: z
    .number()
    .int()
    .describe('The game_id to fetch a prediction for (same id as api.game_detail/api.game_predictions).'),
  model_version: z
    .enum(PREDICTION_MODEL_VERSIONS)
    .optional()
    .describe(
      `Which model version to fetch. Defaults to '${DEFAULT_PREDICTION_MODEL}', the current house ` +
        "model (fitted 20-feature ridge with its own win-probability fit). 'elo_v1' is Elo-only and " +
        "'elo_epa_blend_v1' is the Elo + recent-EPA blend; those two share a win probability and " +
        'differ only in expected_home_margin, but switching between an Elo version and the fitted ' +
        'model moves home_win_prob as well as expected_home_margin (and therefore edge).'
    ),
} as const

// ---------------------------------------------------------------------------
// 10. get_team_elo
// ---------------------------------------------------------------------------

export interface GetTeamEloArgs {
  team: string
  season?: number
}

async function getTeamEloToolImpl(args: GetTeamEloArgs): Promise<string> {
  const season = args.season ?? CURRENT_SEASON

  // Fetched in parallel: season-end summary (api.team_elo, at most one row)
  // and the full game-by-game trajectory (api.game_elo_history). Both fns
  // collapse "no row"/"query error" to null/[] -- see predictions.ts.
  const [elo, history] = await Promise.all([
    getTeamElo(args.team, season),
    getTeamEloHistory(args.team, season),
  ])

  if (!elo && history.length === 0) {
    return `No Elo data found for '${args.team}' in ${season}. Check the team name (exact, case-sensitive) and season.`
  }

  return dump({
    elo: wrap('api.team_elo', elo ? [elo] : []),
    history: wrap('api.game_elo_history', history),
  })
}

export const getTeamEloDescription =
  'Get a team\'s season-end Elo rating/rank plus its full game-by-game Elo trajectory for a season. ' +
  'Use for "how strong is Oklahoma by Elo this year", "show Oklahoma\'s Elo trend through the ' +
  'season", "was this team\'s rating built on a small sample". Combines api.team_elo (season-end ' +
  'summary: season_end_elo, elo_rank, games_played, a low_confidence flag, and cfbd_elo as a ' +
  'cross-check against CFBD\'s own published Elo -- at most one row) and api.game_elo_history (one ' +
  "row per game the team played that season: pregame -> postgame Elo, opponent, home/away, and the " +
  "team's own win probability for that game, ordered by start_date ascending). low_confidence=true " +
  'means the season-end rating rests on too few games to be reliable (e.g. an incomplete or just-' +
  "started season) -- treat it as a caveat, not a data error. Team names must match CFBD's exact, " +
  'case-sensitive convention. `season` defaults to the current season if omitted. Returns JSON with ' +
  '"elo" and "history" keys, each {"_source", "count", "rows"} ("elo".rows has 0 or 1 entries), or a ' +
  'friendly "No Elo data found..." string if the team/season combination has no coverage at all.'

export const getTeamEloInputShape = {
  team: z.string().describe("Exact school name as used by CFBD, e.g. 'Oklahoma'. Case-sensitive."),
  season: z
    .number()
    .int()
    .optional()
    .describe(`Season year, e.g. 2024. Defaults to the current season (${CURRENT_SEASON}) if omitted.`),
} as const

// ---------------------------------------------------------------------------
// 11. get_matchup_edges
// ---------------------------------------------------------------------------

const MATCHUP_EDGES_DEFAULT_LIMIT = 25
const MATCHUP_EDGES_MAX_LIMIT = 100

export interface GetMatchupEdgesArgs {
  season?: number
  week?: number
  model_version?: string
  limit?: number
}

async function getMatchupEdgesToolImpl(args: GetMatchupEdgesArgs): Promise<string> {
  const season = args.season ?? CURRENT_SEASON
  const modelVersion = args.model_version ?? DEFAULT_PREDICTION_MODEL
  const limit = Math.min(Math.max(args.limit ?? MATCHUP_EDGES_DEFAULT_LIMIT, 1), MATCHUP_EDGES_MAX_LIMIT)

  const edges = await getScoredMatchupEdges(season, args.week, modelVersion)

  // getScoredMatchupEdges is deliberately not empty-guarded (see
  // predictions.ts) -- an empty slate is a normal off-season/post-lock-in
  // state, not an error, so this always returns the envelope (possibly with
  // count: 0) rather than a "No ... found" string.
  return dump(wrap('api.scored_matchup_edges', edges.slice(0, limit)))
}

export const getMatchupEdgesDescription =
  'Get the scored slate of upcoming games where the house model\'s prediction diverges most from the ' +
  'market line, ranked by conviction. Use for "which games have the biggest edge this week", "where ' +
  'does the model disagree with Vegas", "best value on the board". Backed by ' +
  'api.scored_matchup_edges (upcoming/scheduled games only -- a game drops off this view once it ' +
  "completes), ordered by abs_edge descending (biggest model-vs-market disagreement first; rows with " +
  'no posted market line have a null edge and sort last, but are still included, not filtered out). ' +
  '`edge` = expected_home_margin + market_spread: positive favors the home team vs. the market, ' +
  'negative favors the away team. Three model versions are written per game; pass `model_version` ' +
  `explicitly to pin one, otherwise the current house model ('${DEFAULT_PREDICTION_MODEL}') is used. ` +
  'IMPORTANT: this view only ever contains games that have not yet been played, so during the ' +
  'off-season, or after a season\'s full slate has already locked in and completed, an EMPTY result ' +
  '({"count": 0, "rows": []}) is the expected, correct response -- not an error and not a sign the ' +
  'query is broken. Returns JSON {"_source": "api.scored_matchup_edges", "count", "rows"}, sliced to ' +
  'at most `limit` rows (default 25, hard-capped at 100) after sorting by conviction.'

export const getMatchupEdgesInputShape = {
  season: z
    .number()
    .int()
    .optional()
    .describe(`Season year, e.g. 2024. Defaults to the current season (${CURRENT_SEASON}) if omitted.`),
  week: z
    .number()
    .int()
    .optional()
    .describe('Restrict to a single week. Omit to get the full season slate (subject to `limit`).'),
  model_version: z
    .enum(PREDICTION_MODEL_VERSIONS)
    .optional()
    .describe(`Which model version to score edges against. Defaults to '${DEFAULT_PREDICTION_MODEL}'.`),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MATCHUP_EDGES_MAX_LIMIT)
    .optional()
    .describe(
      `Max rows to return, taken from the top of the abs_edge-sorted slate. Default ` +
        `${MATCHUP_EDGES_DEFAULT_LIMIT}, hard-capped at ${MATCHUP_EDGES_MAX_LIMIT}.`
    ),
} as const

// ---------------------------------------------------------------------------
// 12. get_playcalling_profile
// ---------------------------------------------------------------------------

export interface GetPlaycallingProfileArgs {
  team: string
  season?: number
}

async function getPlaycallingProfileToolImpl(args: GetPlaycallingProfileArgs): Promise<string> {
  const season = args.season ?? CURRENT_SEASON
  const profile = await getPlaycallingProfile(args.team, season)

  // getPlaycallingProfile (src/lib/queries/playcalling.ts) returns null for
  // both "no row" and "query error" -- there is no separate error string to
  // pass through here, so a null result always renders as this friendly string.
  if (!profile) {
    return (
      `No playcalling profile found for '${args.team}' in ${season}. This is normal for a team/season ` +
      "without enough qualifying plays for the view to emit a row -- also check the team name (exact, " +
      'case-sensitive).'
    )
  }

  return dump(wrap('api.team_playcalling_profile', [profile]))
}

export const getPlaycallingProfileDescription =
  "Get a team's situational run/pass identity for a season, with percentile ranks against the " +
  'rest of FBS. Use for "how run-heavy is Oklahoma on early downs", "does this team pass more on ' +
  '3rd down than average", "red zone tendencies", "pace of play". Backed by ' +
  'api.team_playcalling_profile (one row per team/season): overall/early-down/3rd-down/red-zone ' +
  'run and pass rates, success rates, avg EPA, run-rate deltas when leading vs trailing, ' +
  'plays-per-game pace, plus a matching set of *_pctl columns giving each rate\'s percentile rank ' +
  '(0-100) against the rest of FBS that same season -- a higher percentile means more extreme ' +
  "relative to the league, not necessarily 'better' (e.g. a very high third_down_pass_rate_pctl " +
  'just means this team passes on 3rd down far more than most FBS teams). `season` defaults to ' +
  `the current season (${CURRENT_SEASON}) if omitted. Returns JSON {"_source": ` +
  '"api.team_playcalling_profile", "count", "rows"} with at most one row, or a friendly "No ' +
  'playcalling profile found..." string if the team/season combination has too few qualifying ' +
  'plays for the view to emit a row.'

export const getPlaycallingProfileInputShape = {
  team: z.string().describe("Exact school name as used by CFBD, e.g. 'Oklahoma'. Case-sensitive."),
  season: z
    .number()
    .int()
    .optional()
    .describe(`Season year, e.g. 2024. Defaults to the current season (${CURRENT_SEASON}) if omitted.`),
} as const

// ---------------------------------------------------------------------------
// 13. get_adjusted_epa
// ---------------------------------------------------------------------------

export interface GetAdjustedEpaArgs {
  team: string
  season?: number
}

async function getAdjustedEpaToolImpl(args: GetAdjustedEpaArgs): Promise<string> {
  const season = args.season ?? CURRENT_SEASON

  // getTeamWeekFeatures carries both the walk-forward opponent-adjusted EPA
  // columns (adj_epa_off/def/net) and the matching raw, unadjusted per-play
  // EPA columns for the same team/week in one row -- a single envelope covers
  // both without a second query.
  const weeks = await getTeamWeekFeatures(args.team, season)

  if (weeks.length === 0) {
    return (
      `No adjusted-EPA data found for '${args.team}' in ${season}. This is normal before the feature ` +
      'build has run for this team/season -- also check the team name (exact, case-sensitive).'
    )
  }

  return dump(wrap('api.team_week_features', weeks))
}

export const getAdjustedEpaDescription =
  "Get a team's week-by-week walk-forward opponent-adjusted EPA alongside the matching raw " +
  '(unadjusted) EPA and success-rate columns for the same weeks. Use for "how has Oklahoma\'s ' +
  'adjusted offense trended this season", "is this team\'s raw EPA inflated by weak opponents", ' +
  '"walk-forward EPA trajectory". Backed by api.team_week_features, one row per (team, season, ' +
  'week_index) -- week_index is a dense 1..N index within the season (some weeks/teams are ' +
  'skipped by the model), not the raw `week` column, though `week` is also included for ' +
  'reference. adj_epa_off/adj_epa_def/adj_epa_net are WALK-FORWARD opponent-adjusted EPA (each ' +
  "week's coefficients are fit only on data available up to that point in the season, so these " +
  'are not hindsight-adjusted using the full season) computed via ridge regression against ' +
  'opponent strength; off_epa_per_play and def_epa_per_play_allowed are the corresponding RAW, ' +
  "unadjusted per-play EPA for the same team/week -- compare adj vs raw to see how much of a " +
  "team's raw EPA is opponent-strength noise versus real performance. Also includes elo_pregame, " +
  'games_played_to_date, off_success_rate, and both havoc-rate columns (havoc_rate_defense, ' +
  'havoc_rate_offense_allowed). `season` defaults to the current season ' +
  `(${CURRENT_SEASON}) if omitted. Returns JSON {"_source": "api.team_week_features", "count", ` +
  '"rows"} ordered week_index ascending, or a friendly "No adjusted-EPA data found..." string if ' +
  "the feature build hasn't run yet for this team/season."

export const getAdjustedEpaInputShape = {
  team: z.string().describe("Exact school name as used by CFBD, e.g. 'Oklahoma'. Case-sensitive."),
  season: z
    .number()
    .int()
    .optional()
    .describe(`Season year, e.g. 2024. Defaults to the current season (${CURRENT_SEASON}) if omitted.`),
} as const

// ---------------------------------------------------------------------------
// 14. get_live_scoreboard
// ---------------------------------------------------------------------------

async function getLiveScoreboardToolImpl(): Promise<string> {
  const games = await getLiveScoreboard()

  // api.live_scoreboard is only populated during Saturday polling windows in
  // season (see live.ts's module header) -- an empty slate is the normal
  // state most of the time (weekdays, off-season, outside an active polling
  // window), not an error, so this always returns the envelope (possibly
  // count: 0) rather than a "No ... found" string, mirroring get_matchup_edges.
  return dump(wrap('api.live_scoreboard', games))
}

export const getLiveScoreboardDescription =
  'Get the current live scoreboard slate: in-progress/pregame/final game state for the day\'s ' +
  'tracked games (score, period/clock, possession, live win probability vs market). Use for ' +
  '"what\'s the score of the Oklahoma game right now", "who has the ball", "live win probability ' +
  'for this game". Backed by api.live_scoreboard, ordered by game_id (the view has no start-time ' +
  'column to order by). IMPORTANT: this view is only populated during Saturday polling windows ' +
  "during the season -- cfb-database's live poller writes/refreshes rows only while games are " +
  'scheduled or in progress that day, and the table is otherwise empty. An EMPTY result ' +
  '({"count": 0, "rows": []}) is the normal state most of the time -- any weekday, the ' +
  'off-season, or any moment outside an active polling window -- not an error and not a sign the ' +
  'query is broken. Takes no arguments. Returns JSON {"_source": "api.live_scoreboard", "count", ' +
  '"rows"}.'

export const getLiveScoreboardInputShape = {} as const

// ---------------------------------------------------------------------------
// 15. get_model_accuracy
// ---------------------------------------------------------------------------

async function getModelAccuracyToolImpl(): Promise<string> {
  const rows = await getPredictionAccuracy()

  // api.prediction_accuracy is a small (~90-row), system-level backtest
  // table with no caller-supplied filters -- always returns the envelope,
  // never a "No ... found" string (an empty table before the backtest job
  // has ever run is the only empty case, and is still not an error).
  return dump(wrap('api.prediction_accuracy', rows))
}

export const getModelAccuracyDescription =
  'Get backtested accuracy/calibration metrics for the house prediction model(s), broken out by ' +
  'model_version x season x edge_threshold. Use for "how accurate is the prediction model", ' +
  '"which model version performs best", "is the model well-calibrated", "how does the model ' +
  'compare to CFBD\'s own model". Backed by api.prediction_accuracy (~90 rows total covering ' +
  'every model_version/season/edge_threshold combination -- the caller filters/groups ' +
  'client-side, e.g. by model_version or a minimum edge_threshold). margin_mae/margin_rmse ' +
  'measure how far the predicted home margin is from the actual margin (lower is better); ' +
  'ats_wins/ats_losses/ats_pushes/ats_hit_rate measure against-the-spread performance when ' +
  "picking with the model's edge; brier is the Brier score for home_win_prob calibration (lower " +
  'is better -- 0 is perfect, 0.25 is coin-flip-equivalent); cfbd_brier is the same Brier score ' +
  "computed for CFBD's own published win probability over the same games, included as an " +
  'external benchmark -- a lower brier than cfbd_brier means the house model out-calibrated ' +
  'CFBD\'s. n_games/n_with_market/n_scored_win_prob are the sample sizes behind each row (small ' +
  "samples, e.g. early in a new model_version's life, should be read with more caution). " +
  'IMPORTANT -- no single version wins on every metric, so do not call one "the best model" ' +
  `flatly. '${DEFAULT_PREDICTION_MODEL}' is the current house default because it has the lowest ` +
  'margin_mae/margin_rmse, but on 2025 at edge_threshold=0 it posted a WORSE ats_hit_rate than ' +
  'both Elo versions and a level brier. Beating the market against the spread and predicting a ' +
  'margin accurately are different tests: report the metric you actually measured. Takes ' +
  'no arguments. Returns JSON {"_source": "api.prediction_accuracy", "count", "rows"}, ordered ' +
  'season descending, then model_version, then edge_threshold ascending.'

export const getModelAccuracyInputShape = {} as const

// ---------------------------------------------------------------------------
// 16. get_player_leaders
// ---------------------------------------------------------------------------

const WEPA_CATEGORIES = ['passing', 'rushing', 'kicking'] as const
const PLAYER_LEADERS_DEFAULT_LIMIT = 25
const PLAYER_LEADERS_MAX_LIMIT = 100

export interface GetPlayerLeadersArgs {
  season?: number
  type: 'wepa' | 'usage'
  category?: WepaCategory
  limit?: number
}

async function getPlayerLeadersToolImpl(args: GetPlayerLeadersArgs): Promise<string> {
  const season = args.season ?? CURRENT_SEASON
  const limit = Math.min(Math.max(args.limit ?? PLAYER_LEADERS_DEFAULT_LIMIT, 1), PLAYER_LEADERS_MAX_LIMIT)

  // getWepaLeaders/getUsageLeaders (src/lib/queries/players.ts) both collapse
  // "no row"/"query error" to [] -- there is no separate error string to pass
  // through here, so an empty result always renders as a friendly string.
  if (args.type === 'wepa') {
    const rows = await getWepaLeaders(season, args.category, limit)
    if (rows.length === 0) {
      return (
        `No wepa leaders found for season=${season}` +
        `${args.category ? `, category=${args.category}` : ''}. This is normal before enough ` +
        'play-by-play data has been processed for that season.'
      )
    }
    return dump(wrap('api.player_wepa_leaders', rows))
  }

  // `category` only applies to wepa leaders (api.player_wepa_leaders has a
  // category column; api.player_usage_leaders does not) -- silently ignored
  // for type='usage' rather than erroring.
  const rows = await getUsageLeaders(season, limit)
  if (rows.length === 0) {
    return (
      `No usage leaders found for season=${season}. This is normal before enough play-by-play ` +
      'data has been processed for that season.'
    )
  }
  return dump(wrap('api.player_usage_leaders', rows))
}

export const getPlayerLeadersDescription =
  "Get a season leaderboard of individual players by opponent-adjusted EPA/PAAR ('wepa') or " +
  "snap-share usage ('usage'). Use for \"top wepa passers in 2024\", \"who leads the country in " +
  'rushing wepa", "highest-usage receivers this season". \'wepa\' is served from ' +
  'api.player_wepa_leaders (wepa, paar, metric, plays, pre-ranked league-wide per category via ' +
  "season_rank ascending) and can optionally be narrowed to one category ('passing', 'rushing', " +
  "'kicking') -- omitting category returns all three mixed together, sorted by season_rank within " +
  "each. 'usage' is served from api.player_usage_leaders (usage_overall plus pass/rush/down-type " +
  'situational usage splits, sorted usage_overall descending) and has no category breakdown -- ' +
  '`category` is ignored if passed with type=\'usage\'. Both views are derived from play-by-play ' +
  'data, so only seasons from 2014 on have coverage. `season` defaults to the current season ' +
  `(${CURRENT_SEASON}) if omitted. Returns JSON {"_source", "count", "rows"}, or a friendly "No ` +
  '... leaders found..." string if the season/category combination has no data yet.'

export const getPlayerLeadersInputShape = {
  season: z
    .number()
    .int()
    .optional()
    .describe(`Season year, e.g. 2024. Defaults to the current season (${CURRENT_SEASON}) if omitted.`),
  type: z
    .enum(['wepa', 'usage'])
    .describe(
      "'wepa' for opponent-adjusted EPA/PAAR leaders (api.player_wepa_leaders), or 'usage' for " +
        'snap-share usage leaders (api.player_usage_leaders).'
    ),
  category: z
    .enum(WEPA_CATEGORIES)
    .optional()
    .describe(
      "Restrict wepa leaders to one category: 'passing', 'rushing', or 'kicking'. Only applies " +
        "when type='wepa' -- ignored for type='usage', which has no per-category breakdown."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(PLAYER_LEADERS_MAX_LIMIT)
    .optional()
    .describe(
      `Max rows to return. Default ${PLAYER_LEADERS_DEFAULT_LIMIT}, hard-capped at ` +
        `${PLAYER_LEADERS_MAX_LIMIT}.`
    ),
} as const

// ---------------------------------------------------------------------------
// 17. compare_players
// ---------------------------------------------------------------------------

export interface ComparePlayersArgs {
  player_id_1: number
  player_id_2: number
  season?: number
}

async function comparePlayersToolImpl(args: ComparePlayersArgs): Promise<string> {
  // getPlayerComparison (src/lib/queries/players.ts) collapses "no row"/
  // "query error" to null -- there is no separate error string to pass
  // through here. Fetched in parallel since the two lookups are independent.
  const [player1, player2] = await Promise.all([
    getPlayerComparison(String(args.player_id_1), args.season),
    getPlayerComparison(String(args.player_id_2), args.season),
  ])

  const missingIds: number[] = []
  if (!player1) missingIds.push(args.player_id_1)
  if (!player2) missingIds.push(args.player_id_2)

  if (missingIds.length > 0) {
    const seasonNote = args.season != null ? ` in season=${args.season}` : ''
    return (
      `No comparison data found for player_id ${missingIds.join(' and ')}${seasonNote}. Check the ` +
      "player_id(s) (numeric CFBD athlete id, not a name) and season -- getPlayerComparison " +
      'defaults to each player\'s most recent season on record when season is omitted.'
    )
  }

  return dump({ player1, player2 })
}

export const comparePlayersDescription =
  'Compare two players side by side: full player_detail stat set plus position-group-relative ' +
  'percentiles for each. Use for "compare Caleb Williams and Drake Maye", "who has better rushing ' +
  'stats, player A or player B". Backed by api.player_comparison (one row per player_id x season): ' +
  'raw counting stats (passing/rushing/receiving/defense) alongside *_pctl columns (0-1 fractions) ' +
  "giving each stat's percentile rank against the player's position group that same season -- a " +
  'QB naturally has null receiving/defense stats and vice versa. `season` is part of the grain, so ' +
  "each player_id has one row per season; if `season` is omitted, each player's LATEST available " +
  'season is resolved independently -- the two players in the response may end up on different ' +
  'seasons if their careers don\'t overlap. Use search_players first to resolve a player_id from a ' +
  'name. Returns JSON {"player1", "player2"} (each the raw api.player_comparison row, or null if ' +
  'that id had no data), or a friendly "No comparison data found..." string naming which ' +
  'player_id(s) came back empty if either lookup fails.'

export const comparePlayersInputShape = {
  player_id_1: z
    .number()
    .int()
    .describe('First player_id (numeric CFBD athlete id, not a name -- resolve via search_players first).'),
  player_id_2: z
    .number()
    .int()
    .describe('Second player_id (numeric CFBD athlete id, not a name -- resolve via search_players first).'),
  season: z
    .number()
    .int()
    .optional()
    .describe(
      "Season year. Omit to use each player's latest available season independently (they may " +
        'differ between the two players).'
    ),
} as const

// ---------------------------------------------------------------------------
// 18. get_conference_comparison
// ---------------------------------------------------------------------------

export interface GetConferenceComparisonArgs {
  season?: number
}

async function getConferenceComparisonToolImpl(args: GetConferenceComparisonArgs): Promise<string> {
  // Mirrors src/app/conferences/page.tsx's offseason fallback: a season with
  // no computed aggregates yet (early in the year, before enough games have
  // been played) is a valid, non-error state -- retry one season back before
  // giving up.
  let season = args.season ?? CURRENT_SEASON
  let rows = await getConferenceComparison(season)

  if (rows.length === 0) {
    season -= 1
    rows = await getConferenceComparison(season)
  }

  if (rows.length === 0) {
    return (
      `No conference comparison data found for season=${args.season ?? CURRENT_SEASON} or the prior ` +
      'season.'
    )
  }

  // `season` is included alongside the envelope since it may differ from the
  // requested/default season after the fallback -- callers need to know
  // which season the returned rows actually belong to.
  return dump({ season, ...wrap('api.conference_comparison', rows) })
}

export const getConferenceComparisonDescription =
  'Get conference-level aggregate metrics for a season: average wins, SP+ rating, EPA/play, ' +
  'recruiting rank, and non-conference win%, each with a percentile rank against the rest of FBS. ' +
  'Use for "which conference is strongest by SP+ this year", "how does the Big Ten compare to the ' +
  'SEC in recruiting", "best non-conference performance by league". Backed by ' +
  'api.conference_comparison (one row per conference/season, member_count always >= 4), sorted ' +
  'strongest-first by avg_sp_rating (nulls last). `season` defaults to the current season ' +
  `(${CURRENT_SEASON}) if omitted. IMPORTANT: early in a season, before enough games have been ` +
  'played, the requested season may have no computed aggregates yet -- this tool automatically ' +
  'retries season-1 once in that case (mirroring the /conferences page\'s own offseason fallback) ' +
  'rather than returning an empty result. Returns JSON {"season", "_source": ' +
  '"api.conference_comparison", "count", "rows"} where `season` reports which season the returned ' +
  'rows actually belong to (it may differ from the requested/default season after the fallback), ' +
  'or a friendly "No conference comparison data found..." string if both the requested season and ' +
  'season-1 come back empty.'

export const getConferenceComparisonInputShape = {
  season: z
    .number()
    .int()
    .optional()
    .describe(
      `Season year, e.g. 2024. Defaults to the current season (${CURRENT_SEASON}) if omitted; ` +
        'falls back to season-1 automatically if the season has no computed aggregates yet.'
    ),
} as const

// ---------------------------------------------------------------------------
// 19. get_coaching_history
// ---------------------------------------------------------------------------

export interface GetCoachingHistoryArgs {
  first_name: string
  last_name: string
}

async function getCoachingHistoryToolImpl(args: GetCoachingHistoryArgs): Promise<string> {
  const rows = await getCoachingHistory(args.first_name, args.last_name)

  if (rows.length === 0) {
    return (
      `No coaching history found for '${args.first_name} ${args.last_name}'. Check the spelling -- ` +
      'first_name/last_name must exactly match api.coaching_history (case-sensitive).'
    )
  }

  return dump(wrap('api.coaching_history', rows))
}

export const getCoachingHistoryDescription =
  'Get a coach\'s full per-tenure coaching history: one row per school stint, with win/loss ' +
  'record, conference record, bowl record, and recruiting-talent trajectory (inherited vs ' +
  'year-3 talent rank) for each. Use for "Nick Saban\'s coaching history", "how did this coach do ' +
  'at his previous school", "did this coach improve the roster talent level". Backed by ' +
  'api.coaching_history, ordered chronologically by tenure_start. A coach who left and later ' +
  'returned to the same school gets two separate rows (distinct tenures), not one merged row -- ' +
  'unlike api.coach_records\' single career-at-school aggregate. inherited_talent_rank/' +
  'year3_talent_rank/talent_improvement are null for pre-recruiting-rankings-era tenures -- that ' +
  'is a normal data gap, not an error. first_name/last_name must match exactly (case-sensitive); ' +
  'this view has no coach-id or fuzzy-search entry point, so get an exact spelling first (e.g. via ' +
  'general web knowledge) if unsure. Returns JSON {"_source": "api.coaching_history", "count", ' +
  '"rows"}, or a friendly "No coaching history found..." string if the name doesn\'t match any ' +
  'coach on record.'

export const getCoachingHistoryInputShape = {
  first_name: z.string().describe("Coach's first name, exact match, e.g. 'Nick'."),
  last_name: z.string().describe("Coach's last name, exact match, e.g. 'Saban'."),
} as const

// ---------------------------------------------------------------------------
// 20. run_sql -- public.run_analyst_query (read-only SQL sandbox)
// ---------------------------------------------------------------------------

export interface RunSqlArgs {
  sql: string
}

const SQL_MAX_LENGTH = 4000

// Defense-in-depth only: the real boundary is the database role (SELECT-only
// grants on api, read-only transaction, statement timeout, row cap -- see
// docs/RUN_SQL_HANDOFF.md). This check just fails obviously-wrong statements
// fast and cheap, before a network round-trip.
const SQL_FORBIDDEN =
  /\b(insert|update|delete|merge|drop|alter|truncate|grant|revoke|vacuum|copy|call|execute|listen|notify|refresh|lock|comment|security)\b|\bcreate\s|\bdo\s*\$|\bpg_\w+\s*\(/i

export function validateAnalystSql(sql: string): string | null {
  const trimmed = sql.trim()
  if (trimmed.length === 0) return 'Error: empty SQL statement.'
  if (trimmed.length > SQL_MAX_LENGTH) return `Error: statement exceeds ${SQL_MAX_LENGTH} characters.`
  if (!/^(select|with)\b/i.test(trimmed)) return 'Error: only SELECT/WITH statements are allowed.'
  // One statement only: a trailing semicolon is fine, an interior one is not.
  if (trimmed.replace(/;\s*$/, '').includes(';')) return 'Error: multiple statements are not allowed.'
  if (SQL_FORBIDDEN.test(trimmed)) return 'Error: statement contains a disallowed keyword (read-only SELECTs only).'
  return null
}

async function runSqlToolImpl(args: RunSqlArgs): Promise<string> {
  const validationError = validateAnalystSql(args.sql)
  if (validationError) return validationError

  const result = await callAnalystQuery(args.sql.trim())
  if (result.error) return result.error
  if (result.rows.length === 0) return 'No rows returned. The query ran but matched nothing -- check filters/joins.'
  return dump(wrap('public.run_analyst_query', result.rows))
}

export const runSqlDescription =
  'Escape hatch for analytical questions the curated tools cannot answer -- cross-domain ' +
  'joins, custom aggregations, "highest/most/only team that..." questions. Runs ONE ' +
  'read-only SELECT/WITH statement against the api schema (SELECT-only role, ~8s timeout, ' +
  '~200-row cap, single statement). Prefer the curated tools when one fits; always include ' +
  'an explicit LIMIT and ORDER BY.\n\n' +
  'SCHEMA CARD -- always prefix views with api. All snake_case. Team names are exact and ' +
  "case-sensitive ('Ohio State', 'Miami (OH)', 'Texas A&M'). season is the fall year; " +
  "season_type is 'regular' or 'postseason'.\n" +
  'Core views (key columns):\n' +
  '- api.team_detail: school, conference, wins, losses, ppg, opp_ppg, sp_rating, sp_rank, elo, fpi, core_overall/core_offense/core_defense (CFBD CORE, NULL = not rated), epa_per_play, recruiting_rank (current season, FBS only)\n' +
  '- api.team_history: school (column: team), season, wins, losses, ppg, opp_ppg, avg_margin,\n' +
  '  sp_rating, sp_rank, sp_offense, sp_defense (lower sp_defense is better), elo, fpi,\n' +
  '  core_overall/core_offense/core_defense (2016+, NULL before = not rated never 0),\n' +
  '  epa_per_play, success_rate, explosiveness, recruiting_rank -- one row per team-season\n' +
  "- api.core_ratings: CFBD CORE team ratings (opponent- and situation-adjusted), 2016+ -- one\n" +
  '  row per (team, season): overall, offense, defense (per-100-qualifying-plays point margins\n' +
  '  vs average; overall = offense - defense), offense_plays, defense_plays, through_week,\n' +
  '  through_season_type, model_version, overall_rank/offense_rank/defense_rank (within-season).\n' +
  "  defense is LOWER-BETTER: best defense = ORDER BY defense_rank ASC or defense ASC, NEVER\n" +
  '  defense DESC. In-season rows are snapshots advanced in place (through_week says how much\n' +
  '  the rating has seen) -- label mid-season values as current form, not final\n' +
  '- api.game_detail: game_id, season, week, season_type, start_date, completed, neutral_site, conference_game, home_team, away_team, home_points, away_points, winner, point_diff, home_spread, over_under, spread_result, ou_result, pregame_home_win_prob, venue, attendance, excitement_index\n' +
  '- api.team_elo: team, season, season_end_elo, elo_rank, games_played, low_confidence, cfbd_elo -- one row per team-season\n' +
  '- api.game_elo_history: per-game pregame/postgame elo for both teams, win_prob, margin errors.\n' +
  '  Use for POINT-IN-TIME Elo: a team\'s elo entering/leaving any week (e.g. end-of-regular-season\n' +
  '  = postgame elo of its last regular-season game). NOTE: conference championship games are\n' +
  "  season_type='regular' (usually the final regular week) -- exclude that week for pre-CCG cuts\n" +
  '- api.game_plays: RAW PLAY-BY-PLAY, 2004+ (~3.6M rows): game_id, season, drive_number,\n' +
  '  play_number, offense, defense, period, clock_minutes, clock_seconds, down, distance,\n' +
  '  yards_to_goal, yards_gained, play_type, play_text, ppa, scoring, offense_score,\n' +
  '  defense_score. Use it to literally count plays (e.g. explosive plays = scrimmage plays\n' +
  '  with yards_gained >= 20) instead of reaching for a proxy metric. ALWAYS filter season --\n' +
  '  unfiltered scans hit the timeout. No week/season_type column: JOIN api.game_detail USING\n' +
  '  (game_id) for week, date, or postseason cuts. EVERY event is a row (penalties, kickoffs,\n' +
  "  timeouts, period ends), so filter play_type for scrimmage plays: rushes are IN ('Rush',\n" +
  "  'Rushing Touchdown'); completed passes are IN ('Pass Reception', 'Pass Completion',\n" +
  "  'Passing Touchdown'); pass attempts also include 'Pass Incompletion', 'Sack',\n" +
  "  'Interception', 'Pass Interception Return', 'Interception Return Touchdown'\n" +
  '- api.game_drives: drive-level grain, same era: game_id, season, drive_number, offense,\n' +
  '  defense, start_period, start_yards_to_goal, end_yards_to_goal, plays, yards, drive_result,\n' +
  '  scoring, start/end offense_score + defense_score, elapsed_minutes, elapsed_seconds,\n' +
  '  is_home_offense -- same caveat: no week column, JOIN api.game_detail for week filters\n' +
  '- api.game_box_score: per-game team stats in LONG format -- one row per (game_id, team,\n' +
  '  category, stat_value); filter or pivot on category. api.game_player_leaders: same idea at\n' +
  '  player grain (category, stat_type, player_name, stat)\n' +
  '- api.game_line_scores: quarter-by-quarter scores (home_q1..away_ot). api.game_win_probability:\n' +
  '  play-level win-prob curve. api.game_recaps: generated headline + recap text per game (2025+)\n' +
  '- api.matchup: head-to-head history, ONE row per pair ordered team1 < team2 ALPHABETICALLY --\n' +
  "  match a school with (team1 = 'X' OR team2 = 'X'), never team1 alone: total_games,\n" +
  '  team1_wins, team2_wins, ties, first_meeting, last_meeting, recent_results + both teams\'\n' +
  '  current-season form\n' +
  '- api.line_movement: betting-line SNAPSHOTS over time (captured_at, provider, spread,\n' +
  '  formatted_spread, over_under, home/away_moneyline), several rows per game, current season\n' +
  '  only -- latest line = greatest captured_at per (game_id, provider)\n' +
  '- api.live_scoreboard: in-progress games only, empty outside live windows -- prefer the\n' +
  '  get_live_scoreboard tool\n' +
  '- api.coaching_history: coach_name, team, tenure_start, tenure_end (null = active), seasons_count, total_wins, total_losses, win_pct, avg_sp_rating, peak_sp_rating -- one row per coach-tenure\n' +
  '- api.coach_records: coach career-at-school grain with ATS splits (ats_wins, ats_losses)\n' +
  '- api.poll_rankings: season, season_type, week, poll, rank, school, conference, first_place_votes, points\n' +
  '- api.leaderboard_teams: team, conference, season, wins, losses, ppg, opp_ppg, sp_rating,\n' +
  '  sp_rank, sp_offense, sp_defense (offense/defense SP+ components -- available for ALL seasons,\n' +
  '  lower sp_defense is better), elo, fpi, epa_per_play, success_rate, explosiveness,\n' +
  '  recruiting_rank + *_rank columns. Works for any past season, not just the current one\n' +
  '- api.team_wepa_season: team, season, epa_total, epa_passing, epa_rushing, epa_allowed_*, success_rate_*, explosiveness\n' +
  '- api.team_ats: team, season, ats record vs the spread\n' +
  '- api.scored_matchup_edges / api.game_predictions / api.prediction_accuracy: model predictions vs\n' +
  `  market. THREE model_versions per game: elo_v1, elo_epa_blend_v1, ${DEFAULT_PREDICTION_MODEL}\n` +
  '  (the current house model). ALWAYS filter model_version or every game appears three times\n' +
  '- api.matchup_forecast: ONE row per game, 2000+ -- blended pregame forecast + result:\n' +
  '  home/away_win_probability, projected_winner, projected_margin, confidence_tier, component\n' +
  '  probs (cfbd/market/elo/sp_home_win_prob), market_spread, market_over_under, actual result\n' +
  '  (home/away_points, actual_winner, brier_loss), and season context (home/away_expected_wins,\n' +
  '  home/away_bowl_eligibility_prob, home/away_ten_plus_win_prob)\n' +
  '- api.season_outlook: season, team, conference, classification, is_projection, model_version,\n' +
  '  projected_wins, projected_losses, median_wins, wins_p10/p25/p75/p90, p_win_dist (jsonb\n' +
  '  {"0":p,...}), p_bowl_eligible, p_ten_plus, sos_rating, sos_rank, conf_title_prob,\n' +
  '  games_scheduled/simulated/unscored/completed, actual_wins, schedule_complete, n_sims --\n' +
  '  latest Monte Carlo snapshot per (season, team, model_version); pin model_version or teams\n' +
  '  appear once per version. Prefer get_season_outlook, which attaches the backtest error and\n' +
  '  the per-result caveats. NOT FBS-only -- ALWAYS add classification = \'fbs\' before ranking, or\n' +
  '  you compare teams playing different-length seasons (2026: 138 fbs / 128 fcs / 38 ii / 33 iii\n' +
  '  / 13 NULL, and NULL means unplaceable, not FBS). is_projection = false means the season is\n' +
  '  already played and the row is a final record, not a forecast -- check it before calling\n' +
  '  anything a projection. playoff_prob is NULL everywhere by design; p_bowl_eligible is NULL\n' +
  '  outside FBS by design. Projected quantities are over games_simulated, NOT games_scheduled\n' +
  '- api.model_backtest: model_version, scope, run_date, season_start/end, n, win_mae, rmse, bias,\n' +
  '  coverage, resid_p05..p95, baseline_prior_mae, baseline_flat_mae, ten_plus_brier, bowl_brier --\n' +
  '  how wrong the season projections usually are. FILTER scope = \'fbs\'; \'all_divisions\' is a\n' +
  '  different measurement, not a superset, and the grain is one row per (model, scope, window),\n' +
  '  so an unpinned scope returns several. `n` counts TEAM-SEASONS, not games. For an interval use\n' +
  '  resid_p10/resid_p90 (asymmetric) -- never +/- win_mae, which spans only ~58% of outcomes.\n' +
  '  No row means never backtested: report unmeasured, never zero error\n' +
  '- api.player_season_leaders (LONG: one row per player-category, e.g. passing/rushing),\n' +
  '  api.player_wepa_leaders, api.player_usage_leaders: player-season leaderboards\n' +
  '- api.player_detail: grain is (player_id, season, TEAM), 2004+ (~340k rows): bio, recruit\n' +
  '  pedigree (stars, recruit_rating, national_ranking), raw counting stats (pass_*, rush_*,\n' +
  '  rec_*, tackles, sacks, tfl), ppa_avg/ppa_total. player_id + season alone is NOT unique --\n' +
  '  two independent things multiply rows. (1) TEAM: a player on two teams in one season gets\n' +
  '  a row per team, each holding only that stint\'s stats -- summing them is the only way to\n' +
  '  get his season total, and picking one row silently reports a partial season. (2) A\n' +
  '  recruiting FAN-OUT bug on top of that: players in two recruiting classes\n' +
  '  (reclassifications) get duplicate rows within a single team, stat columns copied verbatim\n' +
  '  -- e.g. Jeremiah Smith 2025 appears twice, once as recruit_class 2024 (5-star,\n' +
  '  national_ranking 1) and once as recruit_class 2023 (4-star, 243), both carrying rec_yds\n' +
  '  1243. Affected players are few (<1% per season) but skew blue-chip, i.e. exactly who gets\n' +
  '  asked about. So: never SUM or AVG a stat column off this view without first deduping the\n' +
  '  fan-out -- DISTINCT ON (player_id, season, team) ORDER BY player_id, season, team,\n' +
  '  recruit_class DESC; the DISTINCT ON keys MUST lead the ORDER BY (Postgres requires it,\n' +
  '  and without the trailing recruit_class DESC it keeps an arbitrary class). That keeps the\n' +
  '  legitimate per-team rows, so aggregate ACROSS them afterwards for a season total. Never\n' +
  '  quote recruit pedigree without pinning recruit_class. For percentile work prefer\n' +
  '  api.player_comparison (plus *_pctl columns) -- verified clean, one row per player-season\n' +
  '- api.roster_lookup: roster rows per team-season 2004+ (first/last_name, team, position,\n' +
  '  height, weight, year = season, jersey, home_city, home_state, home_country)\n' +
  '- api.recruit_lookup: individual recruits 2000+ (name, year, stars, rating, ranking,\n' +
  '  position, school = HIGH SCHOOL, committed_to = college)\n' +
  '- api.recruiting_roi, api.transfer_portal_impact, api.team_returning_production, api.conference_comparison\n' +
  '- api.team_week_features: one row per (team, season, week_index), 2015+ -- POINT-IN-TIME weekly\n' +
  '  features: week, games_played_to_date, elo_pregame, adj_epa_off/def/net (walk-forward\n' +
  '  opponent-adjusted, fit only on data through that week), off/def EPA + success +\n' +
  '  explosiveness rates, havoc_rate_defense, havoc_rate_offense_allowed, returning production,\n' +
  '  preseason SP+. The go-to join for "as of week N" strength cuts; week_index is a dense 1..N\n' +
  '  within-season index, not the raw week. Prefer get_adjusted_epa for one team\'s trend\n' +
  '- api.adjusted_epa_week: ridge-fit model internals behind those adjustments (team, season,\n' +
  '  week_index, off_coef, def_coef, hfa_coef, mu, plays), 2004+ -- prefer team_week_features\n' +
  '- api.team_playcalling_profile: one row per team-season, 2004+: overall/early-down/red-zone\n' +
  '  run rates, third_down_pass_rate, leading/trailing run rates + run_rate_delta,\n' +
  '  pace_plays_per_game, success/EPA splits, *_pctl percentile columns\n' +
  '- api.expected_points: the house EP model -- one row per (era, state), NO team column:\n' +
  "  era ('2004-2013'|'2014-2020'|'2021+' -- NEVER average eras), state ('d1|standard|z8'),\n" +
  '  down, distance_bucket (down-aware: d1 = standard(=10)/short(<10)/long(>10)/goal; d2-4 =\n' +
  '  short(<=3)/med(4-6)/long(7-10)/xlong(>10)/goal), field_zone (1 = 1-10 yards FROM THE\n' +
  '  GOAL, 10 = backed up), yards_to_goal_min/max, n_obs, ep_drive (drive-scoring basis),\n' +
  '  ep_net (net next-score basis, CFBD-ppa-comparable, can be NEGATIVE, NULL = not computed\n' +
  '  never 0), p_td, p_fg, p_punt, p_turnover, se_boot (NULLABLE -- no interval, not +/-0).\n' +
  '  down=4 rows are GO-FOR-IT-CONDITIONAL (can price above d3), and sparse cells (n_obs can\n' +
  '  be 1) are anecdotes -- check n_obs. Prefer get_expected_points, which attaches the basis\n' +
  '  definitions and per-result caveats\n' +
  '- api.team_penalties: game_id, season, week, season_type, team, opponent, home_away, penalties,\n' +
  '  penalty_yards, opponent_penalties, opponent_penalty_yards -- two rows per game (one per team);\n' +
  "  the scorer's OFFICIAL box-score tally -- prefer it for totals and GROUP BY team for season\n" +
  '  discipline leaderboards. Per-game averages: use ALL of a team\'s games as the denominator\n' +
  '  (COUNT(DISTINCT game_id) from this view), never just the games where a call happened\n' +
  '- api.penalty_log: play-level penalties (2004+) parsed BEST-EFFORT from free-text play_text:\n' +
  '  game_id, season, week, offense, defense, penalized_team, benefiting_team, infraction (~30\n' +
  "  labels incl 'Unknown'), penalty_yards, declined, offsetting, no_play, down, distance, period,\n" +
  "  ppa, parse_ok. 'Unknown'/NULL team = UNCLASSIFIED not absent, so filtered counts are floors\n" +
  '  (attribution validated >= 50% only for seasons >= 2022) -- say so when reporting. For\n' +
  '  cross-metric combos (e.g. havoc rate vs holding penalties drawn), join api.team_week_features\n' +
  '  (havoc_rate_defense) with penalty_log GROUPed BY benefiting_team. NOTE: ORDER BY ... DESC\n' +
  '  sorts NULLs first -- filter them out\n\n' +
  'Worked example -- "which coach can claim the highest Elo at two different schools":\n' +
  'WITH tenure_elo AS (\n' +
  '  SELECT ch.coach_name, ch.team, MAX(te.season_end_elo) AS peak_elo\n' +
  '  FROM api.coaching_history ch\n' +
  '  JOIN api.team_elo te ON te.team = ch.team\n' +
  '    AND te.season BETWEEN ch.tenure_start AND COALESCE(ch.tenure_end, 2100)\n' +
  '  GROUP BY ch.coach_name, ch.team\n' +
  ')\n' +
  'SELECT coach_name, COUNT(*) AS schools, MIN(peak_elo) AS weaker_school_peak\n' +
  'FROM tenure_elo GROUP BY coach_name HAVING COUNT(*) >= 2\n' +
  'ORDER BY weaker_school_peak DESC LIMIT 10;\n\n' +
  'Returns {"_source", "count", "rows"} JSON, a "No rows returned" note, or an "Error: ..." ' +
  'string (never throws).'

export const runSqlInputShape = {
  sql: z
    .string()
    .describe(
      'One read-only SELECT or WITH statement over the api.* views. No DDL/DML, no multiple ' +
        'statements. Include ORDER BY and LIMIT (server caps rows regardless).'
    ),
} as const

// ---------------------------------------------------------------------------
// 21. get_penalty_profile
// ---------------------------------------------------------------------------

const MOST_COSTLY_LIMIT = 5

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

// A penalty counts toward yardage only if it was actually enforced: declined
// and offsetting penalties carry no (or cancelled) yardage. The three buckets
// are disjoint (declined wins over offsetting on the rare play flagged as
// both), so accepted + declined + offsetting always equals total.
function isAccepted(play: PenaltyPlayAggRow): boolean {
  return play.declined !== true && play.offsetting !== true
}

interface InfractionBreakdownRow {
  infraction: string
  total: number
  accepted: number
  declined: number
  offsetting: number
  accepted_yards: number
}

function groupInfractions(plays: PenaltyPlayAggRow[]): InfractionBreakdownRow[] {
  const byLabel = new Map<string, InfractionBreakdownRow>()
  for (const play of plays) {
    const label = play.infraction ?? 'Unknown'
    let row = byLabel.get(label)
    if (!row) {
      row = { infraction: label, total: 0, accepted: 0, declined: 0, offsetting: 0, accepted_yards: 0 }
      byLabel.set(label, row)
    }
    row.total += 1
    if (play.declined === true) row.declined += 1
    else if (play.offsetting === true) row.offsetting += 1
    else {
      row.accepted += 1
      row.accepted_yards += play.penalty_yards ?? 0
    }
  }
  return [...byLabel.values()].sort((a, b) => b.total - a.total || a.infraction.localeCompare(b.infraction))
}

function mostCostlyPenalties(plays: PenaltyPlayAggRow[]): PenaltyPlayAggRow[] {
  return plays
    .filter(play => isAccepted(play) && play.penalty_yards != null)
    .sort((a, b) => b.penalty_yards! - a.penalty_yards! || (b.ppa ?? 0) - (a.ppa ?? 0))
    .slice(0, MOST_COSTLY_LIMIT)
}

// Season totals and per-game rates from the team's api.team_penalties rows.
// Margins are opponent minus own, so positive = more disciplined than the
// opposition. Rates are null when there are no games to divide by.
function aggregatePenaltySummary(games: TeamPenaltyGameRow[]) {
  const totals = games.reduce(
    (acc, game) => ({
      penalties: acc.penalties + game.penalties,
      penaltyYards: acc.penaltyYards + game.penalty_yards,
      oppPenalties: acc.oppPenalties + game.opponent_penalties,
      oppPenaltyYards: acc.oppPenaltyYards + game.opponent_penalty_yards,
    }),
    { penalties: 0, penaltyYards: 0, oppPenalties: 0, oppPenaltyYards: 0 }
  )
  const n = games.length
  const perGame = (total: number) => (n === 0 ? null : round1(total / n))
  return {
    _source: 'api.team_penalties (aggregated)',
    games: n,
    penalties: totals.penalties,
    penalty_yards: totals.penaltyYards,
    penalties_per_game: perGame(totals.penalties),
    penalty_yards_per_game: perGame(totals.penaltyYards),
    opponent_penalties: totals.oppPenalties,
    opponent_penalty_yards: totals.oppPenaltyYards,
    opponent_penalties_per_game: perGame(totals.oppPenalties),
    opponent_penalty_yards_per_game: perGame(totals.oppPenaltyYards),
    penalty_margin_per_game: perGame(totals.oppPenalties - totals.penalties),
    penalty_yards_margin_per_game: perGame(totals.oppPenaltyYards - totals.penaltyYards),
  }
}

export interface GetPenaltyProfileArgs {
  team: string
  season?: number
}

async function getPenaltyProfileToolImpl(args: GetPenaltyProfileArgs): Promise<string> {
  const season = args.season ?? CURRENT_SEASON

  const [games, committed, drawn] = await Promise.all([
    queryTeamPenaltyGames(args.team, season),
    queryTeamSeasonPenaltyPlays(args.team, season, 'committed'),
    queryTeamSeasonPenaltyPlays(args.team, season, 'drawn'),
  ])

  // The game log is the profile's backbone -- without it there is no summary,
  // so its error fails the whole tool. The two penalty_log fetches are
  // secondary: their errors degrade to *_error keys below (search_players'
  // partial-result precedent) rather than discarding a good summary.
  if (games.error) return games.error

  if (games.rows.length === 0 && committed.rows.length === 0 && drawn.rows.length === 0 && !committed.error && !drawn.error) {
    return (
      `No penalty data found for '${args.team}' in ${season}. Penalty data covers seasons from ` +
      '2004 (parse quality is best 2022+); also check the team name (exact, case-sensitive).'
    )
  }

  return dump({
    team: args.team,
    season,
    summary: aggregatePenaltySummary(games.rows),
    ...(committed.error
      ? { infraction_breakdown_error: committed.error }
      : {
          infraction_breakdown: wrap('api.penalty_log (aggregated: penalized_team = team)', groupInfractions(committed.rows)),
          most_costly: wrap('api.penalty_log (top accepted by penalty_yards)', mostCostlyPenalties(committed.rows)),
        }),
    ...(drawn.error
      ? { drawn_breakdown_error: drawn.error }
      : { drawn_breakdown: wrap('api.penalty_log (aggregated: benefiting_team = team)', groupInfractions(drawn.rows)) }),
    game_log: wrap('api.team_penalties', games.rows),
  })
}

export const getPenaltyProfileDescription =
  "Get a team's discipline profile for a season: penalty totals and per-game rates, the " +
  'differential vs its opponents, a breakdown of which infractions it commits, a breakdown of ' +
  'which infractions it DRAWS from opponents, and its most costly individual penalties. Use for ' +
  '"how undisciplined is Oklahoma this year", "what penalties does this team commit most", "does ' +
  'this defense draw a lot of holding calls", "who wins the penalty battle in their games". ' +
  'Combines api.team_penalties (per-game totals for the team and its opponents, aggregated to a ' +
  'season summary in the "summary" key -- penalty_margin_per_game and penalty_yards_margin_per_game ' +
  'are opponent minus own, so POSITIVE means more disciplined than the opposition) and ' +
  'api.penalty_log (play-level penalties parsed from play text): "infraction_breakdown" groups the ' +
  "penalties the team COMMITTED (penalized_team = team) by infraction label, \"drawn_breakdown\" " +
  'groups the penalties opponents committed that BENEFITED the team (benefiting_team = team -- e.g. ' +
  'holding calls a good pass rush generates), and "most_costly" lists the top accepted penalties by ' +
  'yardage. In each breakdown, accepted/declined/offsetting are disjoint counts summing to total, ' +
  'and accepted_yards only counts enforced yardage. IMPORTANT data honesty: api.penalty_log is ' +
  "parsed from CFBD's free-text play descriptions, so an 'Unknown' infraction or an unattributed " +
  'team means UNCLASSIFIED, not absent -- the two breakdowns silently exclude unattributed plays ' +
  'and are therefore FLOORS, not exact officiating counts; relay that when answering. The "summary" ' +
  "key is the scorer's official box-score tally and is the authoritative source for totals (which " +
  'is also why breakdown totals run below the summary counts); use the breakdowns for the ' +
  'infraction MIX only. Coverage runs from 2004; parse quality is validated for seasons >= 2022 ' +
  '(>= 90% of penalties get an infraction label, >= 50% get a team attribution) and degrades in ' +
  `older seasons. \`season\` defaults to the current season (${CURRENT_SEASON}) if omitted. For ` +
  'league-wide discipline leaderboards or cross-metric combos (e.g. havoc rate vs penalties drawn), ' +
  'use run_sql over api.team_penalties / api.penalty_log instead. Returns JSON with "team", ' +
  '"season", "summary", "infraction_breakdown", "drawn_breakdown", "most_costly", and "game_log" ' +
  'keys (envelope keys are {"_source", "count", "rows"}; a failed secondary lookup degrades to an ' +
  '"..._error" key without discarding the rest), or a friendly "No penalty data found..." string.'

export const getPenaltyProfileInputShape = {
  team: z.string().describe("Exact school name as used by CFBD, e.g. 'Oklahoma'. Case-sensitive."),
  season: z
    .number()
    .int()
    .optional()
    .describe(
      `Season year, e.g. 2024. Defaults to the current season (${CURRENT_SEASON}) if omitted. ` +
        'Penalty data covers 2004+; parse quality is best for seasons >= 2022.'
    ),
} as const

// ---------------------------------------------------------------------------
// 22. get_penalty_log
// ---------------------------------------------------------------------------

export interface GetPenaltyLogArgs {
  team?: string
  season?: number
  week?: number
  game_id?: number
  infraction?: string
  limit?: number
}

async function getPenaltyLogToolImpl(args: GetPenaltyLogArgs): Promise<string> {
  // `week` alone is not selective (it spans every season), so it doesn't
  // count toward the at-least-one-filter requirement.
  if (!args.team && args.game_id == null && args.season == null && !args.infraction) {
    return (
      'Provide at least one of team, game_id, season, or infraction -- an unfiltered penalty ' +
      'log would just be the most recent plays across all of FBS.'
    )
  }

  const result = await queryPenaltyLog({
    team: args.team,
    season: args.season,
    week: args.week,
    gameId: args.game_id,
    infraction: args.infraction,
    limit: args.limit,
  })

  if (result.error) return result.error
  if (result.rows.length === 0) {
    return (
      'No penalties found matching the given filters. Penalty data covers seasons from 2004 ' +
      '(team attribution is best-effort -- unattributed plays never match a team filter); ' +
      'team and infraction are exact, case-sensitive matches.'
    )
  }
  return dump(wrap('api.penalty_log', result.rows))
}

export const getPenaltyLogDescription =
  'Search the play-level penalty log by penalized team, season, week, game, and/or infraction ' +
  'type. Use for drill-downs the profile aggregates hide -- "what penalties did Oklahoma commit ' +
  'against Texas", "show every targeting call in 2024", "which penalties killed that drive". ' +
  'Backed by api.penalty_log (2004+), one row per play carrying penalty text, parsed BEST-EFFORT ' +
  "from CFBD's free-text play descriptions: offense/defense, penalized_team and benefiting_team, " +
  'infraction label, penalty_yards, declined/offsetting/no_play/multi_penalty flags, ' +
  'down/distance/period situation, ppa, the raw play_text, plus is_penalty_play_type (the penalty ' +
  'WAS the play, vs. tacked onto another play) and parse_ok (both infraction and team attribution ' +
  "succeeded). 'Unknown' infractions and unattributed teams mean UNCLASSIFIED, not absent -- " +
  'filtered counts are floors (team attribution is validated >= 50% for seasons >= 2022 and worse ' +
  'earlier), so relay that; use api.team_penalties or get_penalty_profile for official totals. ' +
  'All filters combine with AND; `team` matches the PENALIZED team (who committed it -- to find ' +
  'penalties a team drew, filter by its opponent or use get_penalty_profile\'s drawn_breakdown). ' +
  "`infraction` is an exact label match (~30 distinct values, e.g. 'Holding', 'False Start', " +
  "'Pass Interference', 'Targeting'; unparseable penalties are labeled 'Unknown'). Requires at " +
  'least one of team/game_id/season/infraction. Ordered most recent first. Returns JSON ' +
  '{"_source": "api.penalty_log", "count", "rows"}, or "No penalties found..." if nothing matches.'

export const getPenaltyLogInputShape = {
  team: z
    .string()
    .optional()
    .describe('Exact school name; matches the PENALIZED team (who committed the penalty).'),
  season: z
    .number()
    .int()
    .optional()
    .describe('Season year, e.g. 2024. Coverage is 2004+; parse quality is best for seasons >= 2022.'),
  week: z
    .number()
    .int()
    .optional()
    .describe('Week number within the season. Not selective on its own -- combine with season or team.'),
  game_id: z
    .number()
    .int()
    .optional()
    .describe('Restrict to a single game (same id as api.game_detail).'),
  infraction: z
    .string()
    .optional()
    .describe(
      "Exact infraction label, e.g. 'Holding', 'False Start', 'Pass Interference', 'Personal " +
        "Foul', 'Targeting'. Case-sensitive; unparseable penalties are labeled 'Unknown'."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(DEFAULT_ROW_CAP)
    .optional()
    .describe(`Max rows to return (default 50, hard-capped at ${DEFAULT_ROW_CAP}).`),
} as const

// ---------------------------------------------------------------------------
// 23. render_chart
// ---------------------------------------------------------------------------

/**
 * Static per-chart metadata: nominal render dimensions (the actual PNG height
 * for 'team-playcalling' varies with row count -- see teamPlaycalling.tsx --
 * so `height` here is a description-scale hint, not a pixel guarantee) plus a
 * short human description used to build the `alt` text.
 *
 * Typed `Record<ChartId, ...>` rather than a loose object so this literal is
 * required to name every id in svg.ts's CHART_IDS registry: add a chart
 * there and this fails to typecheck until a matching entry is added here.
 * That is the "derive from the existing registry" requirement, done without
 * a real (value) import of svg.ts -- see the `ChartId` import above.
 */
const CHART_METADATA: Record<ChartId, { width: number; height: number; description: string }> = {
  'team-playcalling': {
    width: 700,
    height: 350,
    description:
      'run/pass play-call split by situation (overall, early downs, 3rd down, red zone, leading vs trailing)',
  },
  'team-metric-trend': {
    width: 700,
    height: 400,
    description: 'one metric plotted season by season, as hand-drawn lines',
  },
  'team-metric-bars': {
    width: 700,
    // Grows with the row count (1-4 teams); this is the four-team card, which
    // is what the model should assume when it sizes an embed.
    height: 366,
    description: 'one metric for one season, as ranked hand-drawn bars',
  },
  'team-metric-scatter': {
    width: 700,
    // Grows with the legend (0-4 highlighted teams); this is the four-team
    // card, the tallest one a caller can ask for.
    height: 550,
    description:
      'two metrics plotted against each other for one season, as team logos across a ~25-team field, ' +
      'with named teams highlighted (top-right is always the good corner)',
  },
}

// z.enum() needs a real, non-empty tuple of string literals -- Object.keys()
// over the Record above is that tuple, kept in sync with CHART_METADATA (and
// therefore with svg.ts's registry) by construction rather than retyped here.
const RENDER_CHART_IDS = Object.keys(CHART_METADATA) as [ChartId, ...ChartId[]]

export interface RenderChartArgs {
  chart: ChartId
  /** team-playcalling. Also accepted as a one-team shorthand for team-metric-*. */
  team?: string
  /** team-playcalling and team-metric-bars: the single season to draw. */
  season?: number
  /** team-metric-*: 1-4 teams. Readonly so an `as const` literal fits. */
  teams?: readonly string[]
  /** team-metric-*: which column to plot. */
  metric?: MetricId
  /** team-metric-scatter: the horizontal metric. */
  x?: MetricId
  /** team-metric-scatter: the vertical metric. */
  y?: MetricId
  /** team-metric-scatter: which metric picks the ~25-team field. Defaults to sp_rating. */
  rank_by?: MetricId
  /** team-metric-trend: first season, inclusive. */
  from?: number
  /** team-metric-trend: last season, inclusive. */
  to?: number
  /** team-metric-trend: dated events drawn as vertical rules. */
  annotations?: ReadonlyArray<{ season: number; label: string }>
  mode?: 'light' | 'dark'
}

/** A minted request, or the sentence to say instead of minting one. */
type ChartRequest = { params: Record<string, string | number>; alt: string } | { guidance: string }

/** Default span when a caller names a metric but no seasons: the last decade. */
const TREND_DEFAULT_SPAN = 10
/** Mirrors the route's `.strict()` schema so a minted URL never 400s. */
const METRIC_MAX_TEAMS = 4
const TREND_MAX_SPAN = 40
const METRIC_MIN_SEASON = 1950
const TREND_MAX_ANNOTATIONS = 3
const TREND_MAX_ANNOTATION_LABEL = 40
/** Mirrors the route schema's `rankBy` default -- the two must agree exactly. */
const SCATTER_DEFAULT_RANK_BY: MetricId = 'sp_rating'

/**
 * Team-list normalization shared by every `team-metric-*` shape.
 *
 * Dedupes while preserving the order the caller named them: that order decides
 * series colors AND the URL, so the same request always mints the same
 * cacheable URL. Over the cap it refuses rather than truncating -- a dropped
 * team is a wrong answer that looks like a right one.
 */
function metricTeams(args: RenderChartArgs, chart: string): { teams: string[] } | { guidance: string } {
  const requested = (args.teams ?? (args.team ? [args.team] : [])).map(team => team.trim()).filter(Boolean)
  const teams = [...new Set(requested)]

  if (teams.length === 0) {
    return { guidance: `chart='${chart}' needs \`teams\`, e.g. teams=['Oklahoma', 'Clemson'].` }
  }
  if (teams.length > METRIC_MAX_TEAMS) {
    return {
      guidance:
        `render_chart plots at most ${METRIC_MAX_TEAMS} teams on one chart (asked for ${teams.length}). ` +
        'Pick the most important ones, or render more than one chart across separate answers.',
    }
  }
  return { teams }
}

/** The metric guard, shared for the same reason as `metricTeams`. */
function metricChoice(args: RenderChartArgs, chart: string): { metric: MetricId } | { guidance: string } {
  const metric = args.metric
  if (!metric || !(metric in METRICS)) {
    return {
      guidance:
        `chart='${chart}' needs a \`metric\` from: ${METRIC_IDS.join(', ')}. ` +
        'Pick the closest one -- there is no free-text metric.',
    }
  }
  return { metric }
}

function playcallingRequest(args: RenderChartArgs): ChartRequest {
  const team = args.team?.trim()
  if (!team) return { guidance: "chart='team-playcalling' needs a `team`, e.g. team='Oklahoma'." }

  const season = args.season ?? CURRENT_SEASON
  return {
    params: { team, season, mode: args.mode ?? 'light' },
    alt: `${team} -- ${CHART_METADATA['team-playcalling'].description} (${season})`,
  }
}

/**
 * Builds the trend request, validating exactly what the route's schema
 * validates. Minting a URL the route will 400 is worse than answering in
 * text: in Discord a 400 is a broken-image icon with no explanation, while a
 * sentence back to the model gets the next call right.
 */
function trendRequest(args: RenderChartArgs): ChartRequest {
  const chosen = metricChoice(args, 'team-metric-trend')
  if ('guidance' in chosen) return chosen
  const { metric } = chosen

  const named = metricTeams(args, 'team-metric-trend')
  if ('guidance' in named) return named
  const { teams } = named

  const to = args.to ?? CURRENT_SEASON
  const from = args.from ?? to - (TREND_DEFAULT_SPAN - 1)
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < METRIC_MIN_SEASON || to > CURRENT_SEASON + 5) {
    return { guidance: `Seasons must be whole years between ${METRIC_MIN_SEASON} and ${CURRENT_SEASON}.` }
  }
  if (to < from) return { guidance: '`to` must be the same season as `from` or later.' }
  if (to - from >= TREND_MAX_SPAN) {
    return { guidance: `A trend chart covers at most ${TREND_MAX_SPAN} seasons; narrow the range.` }
  }

  // `:` and `|` are the annotation encoding's own separators, so they are
  // stripped rather than escaped -- a label is a short human phrase.
  const annotations = (args.annotations ?? [])
    .filter(a => Number.isInteger(a.season) && a.season >= from && a.season <= to && a.label.trim())
    .slice(0, TREND_MAX_ANNOTATIONS)
    .map(a => `${a.season}:${a.label.replace(/[|:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TREND_MAX_ANNOTATION_LABEL)}`)

  const meta = METRICS[metric]
  const range = from === to ? `${from}` : `${from}-${to}`

  return {
    params: {
      metric,
      teams: teams.join(','),
      from,
      to,
      mode: args.mode ?? 'light',
      ...(annotations.length > 0 ? { annotations: annotations.join('|') } : {}),
    },
    alt: `${teams.join(' vs ')} -- ${meta.blurb} by season, ${range}`,
  }
}

/**
 * The bars request. Same registry, same teams, same never-mint-a-400 rule --
 * one `season` instead of a range, and no annotations (there is no time axis
 * to mark, and the route's `.strict()` would reject one).
 */
function barsRequest(args: RenderChartArgs): ChartRequest {
  const chosen = metricChoice(args, 'team-metric-bars')
  if ('guidance' in chosen) return chosen
  const { metric } = chosen

  const named = metricTeams(args, 'team-metric-bars')
  if ('guidance' in named) return named
  const { teams } = named

  const season = args.season ?? CURRENT_SEASON
  if (!Number.isInteger(season) || season < METRIC_MIN_SEASON || season > CURRENT_SEASON + 5) {
    return { guidance: `\`season\` must be a whole year between ${METRIC_MIN_SEASON} and ${CURRENT_SEASON}.` }
  }

  const meta = METRICS[metric]
  return {
    params: { metric, teams: teams.join(','), season, mode: args.mode ?? 'light' },
    alt: `${teams.join(' vs ')} -- ${meta.blurb}, ${season}, ranked best first`,
  }
}

/**
 * The scatter request.
 *
 * Two differences from its siblings, both of which the route's schema enforces
 * and this therefore has to enforce identically or it mints a URL that 400s:
 *
 * - two metrics, which must differ. `metric` is accepted as a shorthand for
 *   `x` so a model that reaches for the family's usual param name gets a chart
 *   rather than a lecture, but it still has to name the other axis;
 * - `teams` is OPTIONAL. Named teams are highlighted against the field, not the
 *   whole chart, so a scatter with none is a legitimate picture of the season.
 *   `rank_by` chooses the field and is left off the URL when it is the default,
 *   so the common request keeps the shortest, most cacheable URL.
 */
function scatterRequest(args: RenderChartArgs): ChartRequest {
  const x = args.x ?? args.metric
  const y = args.y
  if (!x || !(x in METRICS) || !y || !(y in METRICS)) {
    return {
      guidance:
        `chart='team-metric-scatter' needs two metrics, \`x\` and \`y\`, from: ${METRIC_IDS.join(', ')}. ` +
        "For example x='sp_offense', y='sp_defense'.",
    }
  }
  if (x === y) {
    return {
      guidance:
        'A scatter needs two DIFFERENT metrics -- a metric against itself is just a diagonal line. ' +
        "Try x='sp_offense', y='sp_defense'.",
    }
  }

  const rankBy = args.rank_by ?? SCATTER_DEFAULT_RANK_BY
  if (!(rankBy in METRICS)) {
    return { guidance: `\`rank_by\` must be one of: ${METRIC_IDS.join(', ')}.` }
  }

  // Optional here, unlike every other shape -- so this deliberately does NOT
  // go through `metricTeams`, whose contract is "no teams is a mistake".
  const requested = (args.teams ?? (args.team ? [args.team] : [])).map(team => team.trim()).filter(Boolean)
  const teams = [...new Set(requested)]
  if (teams.length > METRIC_MAX_TEAMS) {
    return {
      guidance:
        `render_chart highlights at most ${METRIC_MAX_TEAMS} teams on one scatter (asked for ${teams.length}). ` +
        'The rest of the field is drawn anyway -- pick the ones the answer is actually about.',
    }
  }

  const season = args.season ?? CURRENT_SEASON
  if (!Number.isInteger(season) || season < METRIC_MIN_SEASON || season > CURRENT_SEASON + 5) {
    return { guidance: `\`season\` must be a whole year between ${METRIC_MIN_SEASON} and ${CURRENT_SEASON}.` }
  }

  const subject = teams.length > 0 ? `${teams.join(' and ')} against the ${season} field` : `the ${season} field`
  return {
    params: {
      x,
      y,
      season,
      mode: args.mode ?? 'light',
      ...(rankBy === SCATTER_DEFAULT_RANK_BY ? {} : { rankBy }),
      ...(teams.length > 0 ? { teams: teams.join(',') } : {}),
    },
    alt: `${subject} -- ${METRICS[y].blurb} against ${METRICS[x].blurb}, top-right is best`,
  }
}

/** Which builder answers for which id. Exhaustive over `ChartId` by construction. */
const CHART_REQUEST_BUILDERS: Record<ChartId, (args: RenderChartArgs) => ChartRequest> = {
  'team-playcalling': playcallingRequest,
  'team-metric-trend': trendRequest,
  'team-metric-bars': barsRequest,
  'team-metric-scatter': scatterRequest,
}

async function renderChartToolImpl(args: RenderChartArgs): Promise<string> {
  const meta = CHART_METADATA[args.chart]
  const build = CHART_REQUEST_BUILDERS[args.chart]
  // Typed as a ChartId, but this tool's contract is that it never throws --
  // and a model can send anything down an MCP transport.
  if (!meta || !build) {
    return `Unknown chart '${args.chart}'. Available charts: ${RENDER_CHART_IDS.join(', ')}.`
  }

  const request = build(args)
  if ('guidance' in request) return request.guidance

  let url: string
  try {
    url = signChartUrl(args.chart, request.params)
  } catch {
    // signChartUrl throws when CHART_SIGNING_SECRET is unset; it also calls
    // chartBaseUrl() internally, which throws when no base URL is
    // resolvable. Both are deployment-configuration problems, not something
    // fixable mid-conversation -- degrade to a plain string so the model
    // just answers in text instead of surfacing a tool-call error.
    return 'Chart rendering is not configured on this deployment. Answer in text instead.'
  }

  return dump({
    _source: 'chart-renderer',
    chart: args.chart,
    url,
    alt: request.alt,
    width: meta.width,
    height: meta.height,
    usage:
      'Post this URL on its own line in your reply so it renders as an image -- do not wrap it in ' +
      'markdown link syntax or describe it as a hyperlink. This tool never queries the database and ' +
      'this response carries no numbers, so also call the matching data tool (e.g. ' +
      "get_playcalling_profile for chart='team-playcalling', query_team for " +
      "chart='team-metric-trend' and chart='team-metric-bars') and state the key figures in prose -- " +
      'the chart supplements the numbers, it does not replace them. Include at most one chart per answer. ' +
      "For chart='team-metric-scatter', get_leaderboard or query_team gives the figures behind the field.",
  })
}

export const renderChartDescription =
  'Mint a signed, ready-to-post PNG chart URL for a team -- without querying the database. Use ' +
  'this whenever the user asks to *see*, *show*, *chart*, *plot*, or *visualize* something, or ' +
  'whenever the answer would otherwise be more than a handful of numbers spread across several ' +
  'categories (e.g. a run/pass split across five situations reads far faster as bars than as a ' +
  'list of percentages in a chat reply). This tool is effectively instant (~1ms, no Supabase ' +
  'round trip) and safe to call speculatively alongside a data tool without adding latency to an ' +
  'already-slow /ask -- it can never fail on missing data: an unrecognized team, or a team/season ' +
  'with nothing to chart, still returns a valid URL, and the image itself renders a friendly ' +
  'empty-state card rather than a broken link. Because this tool never touches the database, ' +
  'ALWAYS also call the matching data tool for the actual figures (e.g. get_playcalling_profile ' +
  "for chart='team-playcalling', query_team for the team-metric-* charts) -- this tool's " +
  "response carries a URL and a usage note, never the chart's underlying numbers.\n\n" +
  'CHARTS:\n' +
  "- 'team-metric-trend' -- ONE metric plotted season by season for 1-4 teams, as hand-drawn " +
  'lines. Reach for it for any "over time", "since 20xx", "last decade", "trend", "trajectory", ' +
  'or "team A vs team B historically" question. Needs `metric` and `teams`; `from`/`to` default ' +
  'to the last ten seasons. Metrics where smaller is better (sp_defense, sp_rank, losses, ' +
  'opp_ppg, recruiting_rank) are drawn on an inverted axis so better is always up, and the ' +
  'chart says so. Optional `annotations` mark a season with a labelled vertical rule (e.g. a ' +
  'coaching change).\n' +
  "- 'team-metric-bars' -- the SAME metric enum for 1-4 teams in ONE season, as ranked " +
  'horizontal bars. Reach for it when the question is "who is best/worst right now", "compare ' +
  'these teams this season", or any single-season comparison across teams -- a line chart of ' +
  'one season is a dot. Needs `metric` and `teams`; `season` defaults to the current one. Rows ' +
  'are always sorted best-first whichever way the metric runs, and the chart states which end ' +
  'is good.\n' +
  "- 'team-metric-scatter' -- TWO metrics plotted against each other for ONE season, as team " +
  'logos across roughly the top 25 of that season. Reach for it when the question relates two ' +
  'different things ("offense vs defense", "does recruiting buy wins", "who is efficient AND ' +
  'explosive") or asks where a team sits in the wider landscape rather than against a handful ' +
  'of named rivals. Needs `x` and `y` (two DIFFERENT metrics); `season` defaults to the current ' +
  'one, `rank_by` (which metric picks the 25) defaults to sp_rating. `teams` is OPTIONAL here ' +
  'and highlights those teams against the field -- a named team outside the top 25 is drawn ' +
  'anyway, with its placing. The top-right corner is ALWAYS the good one: an axis whose metric ' +
  'is better when smaller is drawn reversed, and the chart says so.\n' +
  'All three team-metric-* charts share one fixed metric enum ' +
  `(${METRIC_IDS.join(', ')}) mapped to real api.team_history columns -- pick the closest one ` +
  'rather than inventing a name.\n' +
  "- 'team-playcalling' -- one team's run/pass play-call split by situation (overall, early " +
  'downs, 3rd down, red zone, leading vs trailing) as diverging hand-drawn bars, for a single ' +
  'season; backed by the same api.team_playcalling_profile view as get_playcalling_profile. ' +
  'Needs `team`, optionally `season`.\n\n' +
  'Post the returned URL on its own line in the reply so it renders as ' +
  'an image, and still state the key numbers in prose alongside it; include at most one chart per ' +
  'answer. Returns JSON {"_source": "chart-renderer", "chart", "url", "alt", "width", "height", ' +
  '"usage"}, a short sentence explaining what is missing if the arguments do not describe a ' +
  'chart (e.g. no metric, or more than four teams), or a plain "Chart rendering is not configured ' +
  'on this deployment..." string if the deployment is missing required signing configuration -- ' +
  'in either case just answer in text and, for the former, fix the arguments if a chart still helps.'

export const renderChartInputShape = {
  chart: z
    .enum(RENDER_CHART_IDS)
    .describe(
      "Which chart to render. 'team-metric-trend' for a metric across multiple seasons; " +
        "'team-metric-bars' for the same metric compared across teams within ONE season; " +
        "'team-metric-scatter' for TWO metrics against each other across a whole season's " +
        "field; 'team-playcalling' for one team's single-season run/pass situational split."
    ),
  team: z
    .string()
    .optional()
    .describe(
      "Required for chart='team-playcalling': exact school name as used by CFBD, e.g. 'Oklahoma', " +
        "'Ohio State', 'Texas A&M'. Exact, case-sensitive -- not a fuzzy search. Also accepted as a " +
        'one-team shorthand for the team-metric-* charts.'
    ),
  season: z
    .number()
    .int()
    .optional()
    .describe(
      "The single season to draw, for chart='team-playcalling', chart='team-metric-bars' and " +
        `chart='team-metric-scatter', e.g. 2024. Defaults to the current season ` +
        `(${CURRENT_SEASON}) if omitted. Use from/to for chart='team-metric-trend' instead.`
    ),
  teams: z
    .array(z.string())
    .optional()
    .describe(
      "For the team-metric-* charts: 1 to 4 exact school names, e.g. ['Oklahoma', 'Clemson']. " +
        "The order given decides each team's color (and, on the trend chart, its marker); the " +
        'bars chart additionally sorts its rows best-first. More than four is refused rather ' +
        'than truncated -- a dropped team would be a wrong answer. Required for the trend and ' +
        "bars charts; OPTIONAL for chart='team-metric-scatter', where it highlights teams " +
        'against the season field rather than being the whole chart.'
    ),
  metric: z
    .enum(METRIC_IDS)
    .optional()
    .describe(
      'Required for chart=\'team-metric-trend\' and chart=\'team-metric-bars\': which ' +
        'api.team_history column to plot. ' +
        METRIC_IDS.map(id => `${id} (${METRICS[id].blurb})`).join('; ') +
        ". For chart='team-metric-scatter' use x and y instead."
    ),
  x: z
    .enum(METRIC_IDS)
    .optional()
    .describe(
      "Required for chart='team-metric-scatter': the horizontal metric, from the same enum as " +
        "`metric`. Must differ from `y`. The axis is drawn reversed when smaller is better, so " +
        'the right-hand side is always the good side.'
    ),
  y: z
    .enum(METRIC_IDS)
    .optional()
    .describe(
      "Required for chart='team-metric-scatter': the vertical metric, from the same enum as " +
        '`metric`. Must differ from `x`. The axis is drawn reversed when smaller is better, so ' +
        'the top is always the good side.'
    ),
  rank_by: z
    .enum(METRIC_IDS)
    .optional()
    .describe(
      "For chart='team-metric-scatter': which metric chooses the ~25 teams drawn as the field. " +
        "Defaults to sp_rating (the closest thing to an overall 'top 25'). Teams named in " +
        '`teams` are always drawn, even when they fall outside it.'
    ),
  from: z
    .number()
    .int()
    .optional()
    .describe(
      "First season, inclusive, for chart='team-metric-trend'. Defaults to nine seasons before " +
        '`to`, i.e. the last decade. At most 40 seasons per chart.'
    ),
  to: z
    .number()
    .int()
    .optional()
    .describe(
      `Last season, inclusive, for chart='team-metric-trend'. Defaults to the current season (${CURRENT_SEASON}).`
    ),
  annotations: z
    .array(
      z.object({
        season: z.number().int().describe('Season the event belongs to, e.g. 2022.'),
        label: z.string().describe("Short phrase, e.g. 'Venables hired'. Max 40 characters."),
      })
    )
    .optional()
    .describe(
      "For chart='team-metric-trend': up to 3 dated events, each drawn as a labelled vertical " +
        'rule. Use for coaching changes, conference moves, or a rule change worth marking. ' +
        'Annotations outside the season range are dropped.'
    ),
  mode: z
    .enum(['light', 'dark'])
    .optional()
    .describe("Color palette to render in, matching the site's light/dark themes. Defaults to 'light'."),
} as const

// ---------------------------------------------------------------------------
// 24. get_season_outlook -- api.season_outlook + api.model_backtest
//
// The only tool that hands back a forward-looking number, and the only one
// whose payload carries honesty metadata structurally: an `accuracy` block and
// a `caveats` array alongside the usual envelope. A projected standings table
// with no error band is the same overconfidence as inventing one, just better
// dressed.
//
// `accuracy` is read live from api.model_backtest. It used to be a hardcoded
// constant here, which was correct right up until cfb-database re-ran the
// backtest -- at which point the shipped figures would have described a model
// that no longer existed and nothing would have failed. When the view has no
// row for the model, the block is null and a caveat says the error is
// UNMEASURED; it is never rendered as zero.
//
// `caveats` is computed per result set, because this view's honesty problems
// are properties of the ROWS, not of the view -- a completed season, a
// half-loaded schedule and an unscored game each need a different warning, and
// none of them can be stated in a static description.
// ---------------------------------------------------------------------------

export interface GetSeasonOutlookArgs {
  team?: string
  conference?: string
  classification?: string
  season?: number
  limit?: number
}

const SEASON_OUTLOOK_CLASSIFICATIONS = ['fbs', 'fcs', 'ii', 'iii', 'all'] as const

/**
 * Shape the backtest row into the payload block.
 *
 * Two renames are deliberate. `n` becomes `n_team_seasons` because cfb-database
 * flags it as the field most often misread as a game count. `resid_p10`/
 * `resid_p90` become an explicit interval because the alternative a reader
 * reaches for -- plus or minus the MAE -- spans only ~58% of the error
 * distribution while reading like a range, and the real interval is asymmetric.
 */
function seasonOutlookAccuracy(row: ModelBacktestRow) {
  return {
    _source: 'api.model_backtest',
    model_version: row.model_version,
    scope: row.scope,
    run_date: row.run_date,
    metric: 'final win total, preseason projection',
    // Verbatim from the row, and named for what it actually is. The bounds are
    // the CONFIGURED window, which can start before the first season the model
    // could evaluate -- calling this "backtest_seasons" made the payload assert
    // a validated span that the sample size contradicts. See scale_note.
    season_window_configured: `${row.season_start}-${row.season_end}`,
    n_team_seasons: row.n,
    scale_note:
      'n_team_seasons is the evaluated sample and is the defensible statement of scale. The ' +
      'configured window can begin earlier than the first evaluable season, because the model ' +
      'needs a prior-season feature vector -- do not restate the window as the number of ' +
      'seasons validated, and do not multiply it out.',
    win_mae: row.win_mae,
    rmse: row.rmse,
    bias: row.bias,
    coverage: row.coverage,
    interval_80_pct: { low: row.resid_p10, high: row.resid_p90 },
    baseline_win_mae: {
      prior_season_record: row.baseline_prior_mae,
      flat_500: row.baseline_flat_mae,
    },
    summary:
      `A typical projection misses by about ${row.win_mae} wins, and 80% of teams finish between ` +
      `${Math.abs(row.resid_p10)} wins below and ${row.resid_p90} wins above their projection. ` +
      'Report that range, never a bare number, and never +/- the MAE -- the interval is asymmetric.',
  }
}

/**
 * Warnings derived from the returned rows. Everything here is conditional on
 * the data: a static description cannot say "6 of these 16 teams have half a
 * schedule loaded", and that is exactly the sentence a reader needs.
 */
function seasonOutlookCaveats(
  rows: SeasonOutlookRow[],
  season: number,
  conferenceMode: boolean
): string[] {
  const caveats: string[] = [
    'These are simulated projections, not results: each row summarizes n_sims Monte Carlo ' +
      "seasons drawn from the game-level model's per-game predictions. projected_wins is the " +
      'MEAN of that distribution; median_wins and wins_p10/p25/p75/p90 describe its spread. ' +
      'Always report a range or the accuracy block alongside the point estimate.',
    'playoff_prob is NULL on every row by design -- the 12-team format\'s autobids and seeding ' +
      'are not modeled here. Do not state or estimate a playoff probability.',
  ]

  // `is_projection` is the view's own answer (games_simulated > games_completed).
  // Trust it rather than re-deriving from games_completed.
  const projecting = rows.filter(r => r.is_projection)
  if (projecting.length === 0) {
    caveats.push(
      `Season ${season} is already fully played -- is_projection is false on every row. Every ` +
        '"projection" here is just the final record, and the percentile band has collapsed onto ' +
        'it. Report these as results, not as a forecast.',
      'conf_title_prob for a completed season is a simulation tiebreak artifact -- teams that ' +
        'finished level split it evenly -- NOT the actual conference champion. Do not report it ' +
        'as history.'
    )
  } else if (projecting.length < rows.length) {
    caveats.push(
      `${rows.length - projecting.length} of ${rows.length} rows are already settled ` +
        '(is_projection false) while the rest are still being simulated. Do not present the two ' +
        'as the same kind of number in one table.'
    )
  }

  const partial = rows.filter(r => !r.schedule_complete)
  if (partial.length > 0) {
    const fewest = Math.min(...partial.map(r => r.games_simulated))
    caveats.push(
      `${partial.length} of ${rows.length} teams have an incomplete schedule loaded (as few as ` +
        `${fewest} games). Their projected_wins/projected_losses cover only the games that exist ` +
        'and are floors, never extrapolated to a full slate.'
    )
    // cfb-database calibrates schedule_complete against the modal games_scheduled
    // among a team's conference peers, and has not verified that the modal
    // threshold finds peers at all in DII/DIII -- so a false flag there may be
    // the flag failing rather than the schedule being short.
    const lowerDivision = partial.filter(r => r.classification === 'ii' || r.classification === 'iii')
    if (lowerDivision.length > 0) {
      caveats.push(
        `${lowerDivision.length} of those are DII/DIII, where cfb-database has NOT confirmed that ` +
          'schedule_complete is calibrated correctly. Treat the incomplete flag as unverified for ' +
          'those divisions rather than asserting their schedules are short.'
      )
    }
  }

  const unscored = rows.filter(r => r.games_unscored > 0)
  if (unscored.length > 0) {
    caveats.push(
      `${unscored.length} of ${rows.length} teams have scheduled games the model could not score ` +
        '(unrated opponent). Those games are EXCLUDED from the simulation, not counted as losses, ' +
        'so projected_losses understates their remaining slate -- read games_unscored first.'
    )
  }

  if (rows.some(r => r.conf_title_prob != null)) {
    caveats.push(
      'conf_title_prob is a naive v1: the share of simulations in which a team has the best ' +
        'conference win percentage, ties split evenly. It models NO tiebreakers and NO conference ' +
        'championship game. Prefer projected wins for a standings question and call the title ' +
        'odds approximate.'
    )
  }

  const noConference = rows.filter(r => r.conference == null)
  if (noConference.length > 0) {
    caveats.push(
      `${noConference.length} of ${rows.length} teams have no conference assigned, so they have no ` +
        'conference-title probability and cannot be placed in a standings table.'
    )
  }

  if (conferenceMode) {
    caveats.push(
      'Rows are ordered by TOTAL projected wins, which is not a conference table. Real standings ' +
        'are decided on conference record, and two teams with identical league form can separate ' +
        'here on nonconference schedule alone. This view does not expose a projected conference ' +
        'record, so present the order as "projected wins, best to worst" and not as the projected ' +
        'standings.'
    )
  }

  const nonFbs = rows.filter(r => r.classification !== 'fbs')
  if (nonFbs.length > 0) {
    caveats.push(
      `${nonFbs.length} of ${rows.length} teams are outside FBS, so p_bowl_eligible is NULL for ` +
        'them BY DESIGN -- those divisions have no bowl system, and a null there is not missing ' +
        'data. p_ten_plus still means the same thing everywhere. Do not rank teams from different ' +
        'classifications against each other on projected_wins: they play different-length seasons.'
    )
  }

  return caveats
}

async function getSeasonOutlookToolImpl(args: GetSeasonOutlookArgs): Promise<string> {
  // Default to FBS. The view spans four divisions plus rows CFBD could not
  // place at all, and those play different-length seasons, so an unfiltered
  // ranking by projected wins compares teams that are not comparable. 'all'
  // opts out deliberately; the caveats then say what got mixed together.
  const classification = args.classification ?? 'fbs'
  const classificationFilter = classification === 'all' ? undefined : classification

  // Resolve the season from the data rather than CURRENT_SEASON: that constant
  // trails the calendar in the offseason, and the season it trails to is a
  // COMPLETED one whose rows are final records wearing projection column names.
  let season = args.season
  let seasonSource: 'requested' | 'latest_projection' | 'fallback' = 'requested'
  const resolverCaveats: string[] = []

  if (season == null) {
    const latest = await queryLatestOutlookSeason()
    if (latest.rows.length > 0) {
      season = latest.rows[0].season
      seasonSource = 'latest_projection'
    } else {
      season = CURRENT_SEASON + 1
      seasonSource = 'fallback'
      resolverCaveats.push(
        `The newest projected season could not be read from the view, so this fell back to ` +
          `${season}. Confirm the season before quoting these numbers.`
      )
    }
  }

  const effectiveLimit = args.limit ?? SEASON_OUTLOOK_DEFAULT_LIMIT
  // api.model_backtest only measures FBS. Attaching that error distribution to
  // FCS/DII/DIII rows would be quoting one population's uncertainty over
  // another's -- the same category error the code already avoids by refusing to
  // treat 'all_divisions' as a superset of 'fbs'. Outside FBS there is nothing
  // applicable to fetch, so don't: the request is skipped and the payload says
  // the error is unmeasured for that division.
  const accuracyApplies = classification === MODEL_BACKTEST_SCOPE_FBS
  // The backtest is model-level, not row-level, so it does not depend on the
  // outlook query and can go out in parallel with it.
  const [result, backtest] = await Promise.all([
    querySeasonOutlook({
      season,
      team: args.team,
      conference: args.conference,
      classification: classificationFilter,
      limit: args.limit,
    }),
    accuracyApplies
      ? resolveModelBacktest()
      : Promise.resolve({ rows: [], error: null, windowFallback: false }),
  ])

  if (result.error) return result.error
  if (result.rows.length === 0) {
    const scope = args.team
      ? `team '${args.team}'`
      : args.conference
        ? `conference '${args.conference}'`
        : `classification '${classification}'`
    const classificationHint =
      !args.team && !args.conference
        ? ''
        : ` This query was also filtered to classification='${classification}' (the default is` +
          " 'fbs'), so a non-FBS team or conference returns nothing unless you pass a matching" +
          " classification or 'all'."
    return (
      `No season outlook found for ${scope} in season ${season}. Team and conference names are ` +
      "exact and case-sensitive ('SEC', not 'sec'; 'Ole Miss', not 'Mississippi'), and a season " +
      `only appears here once cfb-database has simulated it.${classificationHint}`
    )
  }

  const teamMode = Boolean(args.team) && result.rows.length === 1
  // p_win_dist is ~14 float pairs per team. Worth returning for a single team;
  // for a 16-team conference it is 200+ numbers nobody will cite, crowding out
  // the percentile columns that answer the same question in one line.
  const rows: Record<string, unknown>[] = result.rows.map(r => {
    const copy: Record<string, unknown> = { ...r }
    if (!teamMode) delete copy.p_win_dist
    return copy
  })

  // No backtest row means this model has never been measured. That must read as
  // UNMEASURED, never as zero error and never as a silently missing key -- a
  // projection whose accuracy is unknown is a louder caveat than one whose
  // accuracy is merely poor. Same treatment on a query error: the outlook rows
  // are still worth returning, just not with an implied error bar.
  const backtestRow = backtest.rows[0]
  const accuracyCaveats = backtestRow
    ? // A second row for the same model+scope is a different season window, which
      // is a legitimate grain -- but if the two disagree on the numbers, the pick
      // stops being cosmetic and the reader has to know the source was ambiguous.
      [
        ...(backtest.rows[1] && backtestRowsDisagree(backtestRow, backtest.rows[1])
          ? [
              'api.model_backtest holds more than one run for this model and scope and they do ' +
                'NOT agree. The reported accuracy is the most recent run over the latest season ' +
                'window; treat the error figures as approximate and say the backtest source was ' +
                'ambiguous.',
            ]
          : []),
        ...(backtest.windowFallback
          ? [
              `The canonical backtest window is missing, so these accuracy figures come from the ` +
                `newest run over ${backtestRow.season_start}-${backtestRow.season_end} instead. ` +
                'The numbers are real but may describe a different evaluation span than usual.',
            ]
          : []),
      ]
    : [
        !accuracyApplies
          ? `api.model_backtest measures FBS projections only, and this result is scoped to ` +
            `classification='${classification}'. There is therefore NO measured error for these ` +
            'projections, and the FBS figures do not transfer -- those teams play different ' +
            'schedules against a different population. Present these win totals without an error ' +
            'band and say the model has not been validated for this division.'
          : backtest.error
            ? 'The backtest could not be read from api.model_backtest, so the accuracy of these ' +
              'projections is UNKNOWN for this answer. Say that the typical error could not be ' +
              'retrieved -- do not fall back to a remembered figure and do not imply the ' +
              'projections are exact.'
            : `No backtest has been recorded for '${SEASON_OUTLOOK_MODEL}' at scope ` +
              `'${MODEL_BACKTEST_SCOPE_FBS}', so this model's error is UNMEASURED -- not zero. ` +
              'Present the projections without an error band and say plainly that how wrong they ' +
              'usually are has not been measured.',
      ]

  const truncated = result.rows.length >= effectiveLimit
  const truncationCaveats = truncated
    ? [
        `Exactly ${result.rows.length} rows came back, which is the row limit -- the result is ` +
          'likely cut off. Do not describe this as a complete list; raise `limit` to see more.',
      ]
    : []

  const first = result.rows[0]
  return dump({
    season,
    season_source: seasonSource,
    model_version: first.model_version,
    projection_date: first.projection_date,
    scope: {
      ...(args.team ? { team: args.team } : {}),
      ...(args.conference ? { conference: args.conference } : {}),
      classification,
    },
    n_sims: first.n_sims,
    // A model hyperparameter shared by every row, not a team attribute -- so it
    // is reported once here rather than repeated down the rows.
    residual_sigma: first.residual_sigma,
    accuracy: backtestRow ? seasonOutlookAccuracy(backtestRow) : null,
    caveats: [
      ...resolverCaveats,
      ...accuracyCaveats,
      ...truncationCaveats,
      ...seasonOutlookCaveats(result.rows, season, Boolean(args.conference)),
    ],
    ...wrap('api.season_outlook', rows),
  })
}

export const getSeasonOutlookDescription =
  'Get the simulated season win-total outlook for one team or a whole conference: projected ' +
  'wins/losses, the percentile band around them, bowl-eligibility and ten-win probabilities, ' +
  'strength of schedule, and conference-title odds. Use for "projected final SEC standings", ' +
  '"how many games does Oklahoma win this year", "who is favored to win the Big 12", "what is ' +
  "this team's ceiling and floor\". These are real simulated projections -- answering a " +
  'season-outlook question from them is grounded, not invented. Backed by api.season_outlook: ' +
  `one row per (season, team) at model_version '${DEFAULT_PREDICTION_MODEL}', already ` +
  'latest-snapshot per team-season, each row summarizing n_sims Monte Carlo seasons drawn from ' +
  'the same game-level model get_game_prediction serves. Pass `conference` for standings-style ' +
  'questions, `team` for one team, or neither for a national ranking. Rows come back sorted by ' +
  'projected_wins descending. NOTE that this is TOTAL wins, not a conference table: real ' +
  'standings are decided on conference record, and two teams with identical league form can ' +
  'separate here on nonconference schedule alone. The view does not expose a projected ' +
  'conference record, so answer a "projected standings" question as a projected-wins ranking ' +
  'and say which it is. Results are ' +
  "filtered to `classification` (default 'fbs') because this view is NOT FBS-only -- it also " +
  'carries FCS/DII/DIII teams playing different-length seasons, so an unfiltered ranking by ' +
  'projected wins compares teams that are not comparable.\n\n' +
  'HOW TO REPORT IT. projected_wins is the MEAN of the simulated distribution; median_wins and ' +
  'wins_p10/p25/p75/p90 are its spread. A standings table with no error band is overconfidence ' +
  'in a nicer suit -- always pair the point estimate with either the percentile band or the ' +
  'response\'s "accuracy" block, which is read live from api.model_backtest and carries the ' +
  'model\'s measured error (win_mae plus an ASYMMETRIC 80% interval in interval_80_pct; quote ' +
  'that interval, never +/- the MAE, which spans only ~58% of outcomes while reading like a ' +
  'range). n_team_seasons counts TEAM-SEASONS, not games. If "accuracy" is null the model has ' +
  'not been backtested: say the typical error is unmeasured -- do NOT treat null as zero error ' +
  'and do not substitute a figure you remember. The response also carries a "caveats" array ' +
  'computed from the rows actually returned -- it flags an already-played season, partially ' +
  'loaded schedules, unscored games and mixed divisions. Relay every caveat that bears on the ' +
  'answer.\n\n' +
  'THINGS THAT ARE EASY TO GET WRONG: playoff_prob is NULL on every row BY DESIGN -- there is ' +
  'no playoff projection here, never state or estimate one. is_projection is the authoritative ' +
  'flag for whether a row is a forecast at all; when it is false the season is already played ' +
  'and the row is a final record with a collapsed band. Projected quantities are over ' +
  'games_simulated, NEVER games_scheduled: a game the model could not score is excluded from ' +
  'the simulation, not counted as a loss, so check games_unscored before quoting ' +
  'projected_losses. schedule_complete=false means the slate is still filling in and the win ' +
  'total is a floor over listed games only. p_bowl_eligible is NULL outside FBS by design -- ' +
  'those divisions have no bowls; p_ten_plus still applies everywhere. conf_title_prob is a ' +
  'naive v1 that models no tiebreakers and no championship game -- prefer projected wins and ' +
  'call title odds approximate. Do not rank teams of different classifications against each ' +
  'other on projected_wins.\n\n' +
  'ON COACHING CHANGES, if you narrate one: the model does NOT believe "new coach, therefore ' +
  'worse". The first-year effect belongs entirely to hiring an UNPROVEN coach; a hire with a ' +
  'track record at previous stops is projected roughly as though nothing happened (a measured ' +
  'null, not an absence of evidence). Separately, the coaching feature is still empty for any ' +
  'season CFBD has not yet published coaching records for -- typically the upcoming one until ' +
  'late summer -- so for that season every team is projected as though its staff were ' +
  'unchanged, new hires included. Say so if coaching comes up.\n\n' +
  'Returns JSON with "season", "season_source", "model_version", "projection_date", "scope", ' +
  '"n_sims", "residual_sigma", "accuracy" (or null), "caveats", plus {"_source": ' +
  '"api.season_outlook", "count", "rows"} -- or a friendly "No season outlook found..." ' +
  'string. p_win_dist (the full win distribution) is included only in single-team mode.'

export const getSeasonOutlookInputShape = {
  team: z
    .string()
    .optional()
    .describe(
      "Exact school name as used by CFBD, e.g. 'Oklahoma'. Case-sensitive. Returns one row, " +
        'including p_win_dist (the full win distribution). Combine with `classification` if ' +
        "the team is not FBS -- the default filter would otherwise exclude it."
    ),
  conference: z
    .string()
    .optional()
    .describe(
      "Exact conference name, e.g. 'SEC', 'Big Ten', 'American Athletic'. Case-sensitive. " +
        'Returns every team in it sorted by TOTAL projected wins descending -- a win ranking, ' +
        'not a conference table (standings go by conference record, which this view does not ' +
        "expose). For an FCS conference (e.g. 'Ivy') also pass classification='fcs'."
    ),
  classification: z
    .enum(SEASON_OUTLOOK_CLASSIFICATIONS)
    .optional()
    .describe(
      "Division filter. Defaults to 'fbs'. Use 'all' to span every division -- but note the " +
        'divisions play different-length seasons, so a mixed ranking by projected_wins is not ' +
        "meaningful. A NULL classification in the data means CFBD could not place the team; " +
        "those rows are unplaceable rather than FBS, and every filter except 'all' drops them."
    ),
  season: z
    .number()
    .int()
    .optional()
    .describe(
      'Season year, e.g. 2026. Defaults to the NEWEST season present in api.season_outlook, ' +
        `which is normally the upcoming season and NOT the app's current-season constant ` +
        `(${CURRENT_SEASON}). Pass a season only if the user named one -- the resolved season ` +
        'comes back as "season" with "season_source" saying where it came from. Older seasons ' +
        'are present but already played, so their "projections" are final records.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(DEFAULT_ROW_CAP)
    .optional()
    .describe(
      `Max rows (default ${SEASON_OUTLOOK_DEFAULT_LIMIT}, hard-capped at ${DEFAULT_ROW_CAP}). ` +
        'A conference is at most ~18 teams, so the default covers any single conference. A ' +
        'national query spans ~138 FBS teams and will be truncated -- the caveats say so when ' +
        'that happens.'
    ),
} as const

// ---------------------------------------------------------------------------
// 25. get_expected_points -- api.expected_points
// ---------------------------------------------------------------------------

export interface GetExpectedPointsArgs {
  down?: number
  distance?: number
  yards_to_goal?: number
  distance_bucket?: ExpectedPointsDistanceBucket
  season?: number
  limit?: number
}

/** How the ep_drive scoring basis is defined -- reported once per payload so
 * answers can explain what the number means without the model reciting it
 * from memory. */
const EXPECTED_POINTS_BASIS = {
  model:
    'house EP v1.5 (drive / next-score basis). Validation at publication: zone and down ' +
    'monotonicity pass in all three eras; realized-outcome P(TD) calibration MAE 0.0072-0.0077; ' +
    'play-level r = 0.86 vs CFBD ppa against a 0.93 grid ceiling.',
  ep_drive:
    'Drive-scoring basis: absorption probabilities x values {TD 6.97, FG 3, SAFETY -2, ' +
    'TURNOVER_TD -6.97, else 0}. What THIS possession is worth, ignoring the field position ' +
    'handed to the opponent afterward. Never negative in practice.',
  ep_net:
    'Net next-score basis -- the number comparable to CFBD ppa / nflfastR EP. Lower than ' +
    'ep_drive, and legitimately NEGATIVE when the opponent is likelier to score next -- never ' +
    'clamp or abs() it. Build EPA-style deltas only from ep_net. NULL means not computed ' +
    '(partial recompute), never 0.',
  se_boot:
    'Bootstrap standard error of ep_drive, cluster-resampled by game_id. Quote intervals, not ' +
    'verdicts: ep_drive +/- 2*se_boot. NULL means no interval is available, never +/- 0.',
} as const

/** Cells observed fewer times than this get a reliability caveat. */
const EXPECTED_POINTS_SPARSE_N = 100

/**
 * Punting zones with fewer real punts than this behind their empirical
 * opponent-start average get an anecdote caveat -- in the modern era that is
 * exactly the opponent-territory zones where punting is nearly extinct.
 */
const PUNT_SPARSE_N = 500

function expectedPointsCaveats(rows: ExpectedPointsRow[], effectiveLimit: number): string[] {
  const caveats: string[] = []

  if (rows.some(r => r.down === 4)) {
    caveats.push(
      'down=4 rows are GO-FOR-IT-CONDITIONAL: the value of fourth down given the offense keeps ' +
        'the ball, not the unconditional value of facing fourth down. Do not read them as "what ' +
        'a fourth down is worth" without saying so.'
    )
  }

  const sparse = rows.filter(r => r.n_obs < EXPECTED_POINTS_SPARSE_N)
  if (sparse.length > 0) {
    const minObs = Math.min(...sparse.map(r => r.n_obs))
    caveats.push(
      `${sparse.length} of ${rows.length} cells rest on fewer than ${EXPECTED_POINTS_SPARSE_N} ` +
        `observed plays (as few as ${minObs}). Their EP values are anecdotes with wide se_boot, ` +
        'not settled numbers -- quote se_boot alongside them or prefer a better-observed ' +
        'neighboring cell.'
    )
  }

  if (rows.some(r => r.ep_net == null)) {
    caveats.push(
      'Some cells have NULL ep_net: the net next-score basis was not computed for them ' +
        '(partial recompute). Say "not computed" -- NEVER present it as 0, and do not ' +
        'substitute ep_drive for it.'
    )
  }

  if (rows.some(r => r.se_boot == null)) {
    caveats.push(
      'Some cells have NULL se_boot: the compute ran without bootstrapping, so no interval ' +
        'is available for them. Say "interval unavailable" -- NEVER render it as +/- 0.'
    )
  }

  if (rows.length >= effectiveLimit) {
    caveats.push(
      `Exactly ${rows.length} rows came back, which is the row limit -- the result is likely ` +
        'cut off. Do not describe this as the complete table; raise `limit` or narrow the state.'
    )
  }

  return caveats
}

async function getExpectedPointsToolImpl(args: GetExpectedPointsArgs): Promise<string> {
  // Era resolves from the season asked about, defaulting to the current era.
  // Seasons before the model's coverage fail fast with the valid range rather
  // than silently answering from the oldest era.
  let era: ExpectedPointsEra | null
  let eraSource: 'requested_season' | 'current_era'
  if (args.season != null) {
    era = eraForSeason(args.season)
    eraSource = 'requested_season'
    if (era == null) {
      return (
        `No expected-points model covers season ${args.season}. The play-by-play behind it ` +
        `starts in ${EXPECTED_POINTS_FIRST_SEASON}; eras are ${EXPECTED_POINTS_ERAS.join(', ')}.`
      )
    }
  } else {
    era = '2021+'
    eraSource = 'current_era'
  }

  const fieldZone = args.yards_to_goal != null ? fieldZoneForYardsToGoal(args.yards_to_goal) : undefined
  const effectiveLimit = args.limit ?? EXPECTED_POINTS_DEFAULT_LIMIT

  // Bucket resolution. When (down, distance) can derive the bucket, the
  // NUMBERS are authoritative: an explicit distance_bucket that contradicts
  // them is ignored with a caveat rather than silently rewriting the state
  // ("4th-and-2 at midfield" with distance_bucket='goal' would otherwise
  // price a goal-to-go cell and flip the go-vs-punt recommendation). An
  // explicit bucket stands only when there is nothing to check it against;
  // distance without down stays unmapped (the boundaries differ by down).
  const bucketCaveats: string[] = []
  const derivedBucket =
    args.distance != null && args.down != null
      ? distanceBucketFor(args.down, args.distance, args.yards_to_goal)
      : undefined
  const distanceBucket = derivedBucket ?? args.distance_bucket
  const bucketSource: 'requested' | 'derived_from_distance' | undefined = derivedBucket
    ? 'derived_from_distance'
    : args.distance_bucket
      ? 'requested'
      : undefined
  if (derivedBucket && args.distance_bucket && args.distance_bucket !== derivedBucket) {
    bucketCaveats.push(
      `distance_bucket '${args.distance_bucket}' contradicts down ${args.down} and distance ` +
        `${args.distance}${args.yards_to_goal != null ? ` at yards_to_goal ${args.yards_to_goal}` : ''}, ` +
        `which map to '${derivedBucket}'. The numbers win: this result uses '${derivedBucket}'. ` +
        'Drop the explicit bucket, or drop distance, if you meant something else.'
    )
  }

  // A fully-resolved 4th-down state with a known spot also gets the go-vs-punt
  // comparison: EP(go) is the state's own ep_net (d4 rows are go-conditional,
  // exactly the "given they go" number), EP(punt) is the distribution-weighted
  // E[EP(outcome)] over the era's real punt outcomes from this zone. The punt
  // side needs the era's whole down-1 EP curve (every opponent starting zone
  // has weight), so the second query fetches all down-1 rows -- independent of
  // the main query, same round trip.
  const puntEligible = args.down === 4 && args.yards_to_goal != null && distanceBucket != null

  const [result, downOneResult] = await Promise.all([
    queryExpectedPoints({
      era,
      down: args.down,
      fieldZone,
      distanceBucket,
      limit: args.limit,
    }),
    puntEligible
      ? queryExpectedPoints({ era, down: 1, limit: 50 })
      : Promise.resolve({ rows: [] as ExpectedPointsRow[], error: null }),
  ])

  if (result.error) return result.error
  if (result.rows.length === 0) {
    // The most common miss: asking for a bucket the down does not have.
    // Down 1 has goal/short/standard/long only; downs 2-4 swap standard for
    // med/xlong. Say so instead of returning an empty envelope.
    return (
      `No expected-points cell matches era '${era}'` +
      (args.down != null ? `, down ${args.down}` : '') +
      (distanceBucket ? `, distance_bucket '${distanceBucket}'` : '') +
      (fieldZone != null ? `, field_zone ${fieldZone}` : '') +
      ". Note the bucket vocabulary differs by down: down 1 uses 'standard' (the ordinary " +
      "1st-and-10 state) and has no 'med'/'xlong'; downs 2-4 use short/med/long/xlong and have " +
      "no 'standard'. 'goal' means goal-to-go at any down. Retry without distance_bucket to " +
      'see every bucket for the state.'
    )
  }

  // ------- fourth-down go-vs-punt block (all math on ep_net; rule 1) -------
  const decisionCaveats: string[] = []
  let fourthDownDecision: Record<string, unknown> | undefined

  if (args.down === 4 && args.yards_to_goal != null && distanceBucket == null) {
    decisionCaveats.push(
      'This is a 4th-down spot but the distance is unresolved, so no go-vs-punt comparison was ' +
        'computed. Pass `distance` (or `distance_bucket`) to get the fourth_down_decision block.'
    )
  }

  if (puntEligible) {
    // Opponent-zone EP curve: the opponent's 1st-and-10 ep_net per starting
    // zone. Zone 1 (inside their 10... which from the punting team's view is
    // nearly conceding a score against the punter's own goal) has no
    // 'standard' cell -- 1st-and-10 there is goal-to-go -- so 'goal' stands in.
    const epNetByZone = new Map<number, number>()
    for (const r of downOneResult.rows) {
      const preferred = r.field_zone === 1 ? 'goal' : 'standard'
      if (r.distance_bucket === preferred && r.ep_net != null) {
        epNetByZone.set(r.field_zone, r.ep_net)
      }
    }
    const puntEp =
      downOneResult.error == null && args.yards_to_goal != null
        ? computePuntEp(era, args.yards_to_goal, epNetByZone)
        : null

    const goRow = result.rows.length === 1 ? result.rows[0] : null
    if (!goRow || goRow.ep_net == null || puntEp == null) {
      decisionCaveats.push(
        'The go-vs-punt comparison could not be computed for this 4th-down state (a required ' +
          'ep_net was missing or not computed, or no punt data covers this zone). Do not ' +
          'improvise the punt side by hand.'
      )
    } else {
      const epGo = goRow.ep_net
      fourthDownDecision = {
        go: { state: goRow.state, ep_net: epGo, n_obs: goRow.n_obs, se_boot: goRow.se_boot },
        punt: {
          ep_punt: puntEp.epPunt,
          n_punts_basis: puntEp.nPunts,
          p_return_td: puntEp.pReturnTd,
          p_kick_team_keeps: puntEp.pKickKeep,
          expected_opponent_start_ytg: puntEp.expectedOppStartYtg,
        },
        ep_delta_go_minus_punt: epGo - puntEp.epPunt,
        assumptions: [
          'EP(go) is the ep_net of the 4th-down state itself -- d4 rows are conditional on ' +
            'going, which is exactly the "given they go" number.',
          `EP(punt) is the distribution-weighted E[EP(outcome)] over ${puntEp.nPunts} real ` +
            'punts from this zone in this era: each resulting opponent starting zone valued at ' +
            "-ep_net of the opponent's 1st-and-10 there (touchbacks, returns and receiver-kept " +
            'muffs included), punts returned or blocked for a TD valued at -6.97, and ' +
            'kicking-team recoveries valued at the average retained spot. NOT ' +
            'EP-of-the-average-spot: the weighting happens over outcomes, so nonlinearity in ' +
            'the EP curve is respected. expected_opponent_start_ytg is narration only.',
          'The FG option is NOT modeled here. Inside plausible FG range, this comparison is ' +
            'incomplete -- say so rather than presenting go-vs-punt as the whole decision.',
        ],
      }
      if (puntEp.nPunts < PUNT_SPARSE_N) {
        decisionCaveats.push(
          `Only ${puntEp.nPunts} real punts back the punt side of the comparison -- teams ` +
            'almost never punt from this zone (it is FG/go territory). Treat the punt EP as an ' +
            'anecdote, not a baseline.'
        )
      }
    }
  }

  return dump({
    era,
    era_source: eraSource,
    ...(args.season != null ? { season: args.season } : {}),
    ...(args.yards_to_goal != null
      ? { yards_to_goal: args.yards_to_goal, field_zone: fieldZone }
      : {}),
    ...(distanceBucket
      ? {
          ...(args.distance != null ? { distance: args.distance } : {}),
          distance_bucket: distanceBucket,
          distance_bucket_source: bucketSource,
        }
      : {}),
    ...(fourthDownDecision ? { fourth_down_decision: fourthDownDecision } : {}),
    basis: EXPECTED_POINTS_BASIS,
    caveats: [
      ...bucketCaveats,
      ...expectedPointsCaveats(result.rows, effectiveLimit),
      ...decisionCaveats,
    ],
    ...wrap('api.expected_points', result.rows),
  })
}

export const getExpectedPointsDescription =
  'Get the house expected-points value of a game SITUATION: what a down, distance bucket and ' +
  'field position are worth in points, plus how the possession tends to end. Use for "what is ' +
  'a 1st-and-10 at midfield worth", "how much did that holding penalty cost in expected ' +
  'points", "should they have gone for it -- what was 4th-and-short at the 40 worth", "how ' +
  'often does a drive from your own 5 end in a touchdown". Backed by api.expected_points: the ' +
  'solved play-by-play Markov chain, one row per (era, state) where state = down x distance ' +
  'bucket x field-position decile, three eras (2004-2013, 2014-2020, 2021+), ~483 rows total. ' +
  'This is a STATE lookup, NOT a team stat -- there is no team column, and "expected points ' +
  'FOR Ohio State" is not answerable here (use query_team / get_adjusted_epa for team ' +
  'strength). The era resolves from `season` when given, else the current era -- states move ' +
  'materially between eras (1st-and-10 at own 25: ~1.58 in 2004-2013 vs ~1.80 in 2021+), so ' +
  'NEVER average eras; compare them explicitly instead. Pass `yards_to_goal` (1-99, distance ' +
  'to the goal line, NOT yard-line-on-the-field) and it maps to the right decile for you; ' +
  'pass `distance` (yards to go) with `down` and it maps to the right bucket for you. With ' +
  'neither `distance` nor `distance_bucket`, every bucket for the state comes back, and the ' +
  'spread across buckets IS the answer to "how much does distance matter here".\n\n' +
  'HOW TO REPORT IT. ep_drive is the drive-scoring basis (absorption probabilities x values ' +
  '{TD 6.97, FG 3, SAFETY -2, TURNOVER_TD -6.97}) -- what THIS possession is worth. ep_net is ' +
  'the net next-score basis, the number comparable to CFBD ppa / nflfastR EP -- lower, and ' +
  'legitimately NEGATIVE deep in own territory; never clamp or abs() it, and build EPA-style ' +
  'deltas only from ep_net. Say which basis you are quoting; for "cost of a penalty in EP" ' +
  'subtract two states on the SAME basis. Intervals, not verdicts: quote ep_drive +/- ' +
  '2*se_boot, and pair any cell-level claim with n_obs. The payload carries a "basis" block ' +
  "(including the model's validation stats) and a \"caveats\" array computed from the rows " +
  'actually returned -- relay every caveat that bears on the answer. p_td/p_fg/p_punt/' +
  'p_turnover are drive-outcome absorption probabilities from this state (p_turnover ' +
  'includes defensive-TD turnovers).\n\n' +
  'THINGS THAT ARE EASY TO GET WRONG: down=4 rows are GO-FOR-IT-CONDITIONAL -- a 4th-down ' +
  'state exists in the chain only when the offense lined up to go (punts and FGs exit from ' +
  'the 3rd-down play), so EP(d4) answers "what is this worth GIVEN they go" and can ' +
  'legitimately price ABOVE d3. Never quote it as the unconditional value of facing 4th ' +
  'down, and keep d4 out of down-ladder comparisons or caveat it. The bucket vocabulary is ' +
  "down-aware: down 1 uses 'standard' (=10) / 'short' (<10) / 'long' (>10) / 'goal' and has " +
  "NO 'med'/'xlong'; downs 2-4 use 'short' (<=3) / 'med' (4-6) / 'long' (7-10) / 'xlong' " +
  "(>10) / 'goal' and have NO 'standard'; 'goal' means goal-to-go at any down. NULL ep_net " +
  'means not computed (never 0); NULL se_boot means no interval (never +/- 0). Sparse cells ' +
  'are real: oddball states can rest on a single observed play (the caveats flag anything ' +
  'under 100), and their EP is an anecdote. field_zone counts from the GOAL LINE: zone 1 = ' +
  '1-10 yards out (about to score), zone 10 = 91-99 (backed up).\n\n' +
  'FOURTH-DOWN DECISIONS: ask with down=4 + distance + yards_to_goal and the response ' +
  'attaches a "fourth_down_decision" block -- EP(go) (the state\'s own ep_net; d4 rows are ' +
  'go-conditional, exactly the "given they go" number) vs EP(punt) (the distribution-' +
  'weighted E[EP] over real punt outcomes from this zone and era: every resulting opponent ' +
  'starting zone valued at its own -ep_net, punts returned/blocked for TDs at -6.97, ' +
  'kicking-team recoveries at the retained spot -- outcome-weighted, never EP of the ' +
  'average spot), plus ep_delta_go_minus_punt and an assumptions list. All of it is on the ' +
  'ep_net basis. The FG option is NOT modeled -- inside plausible FG range say the ' +
  'comparison is incomplete. Relay the assumptions when you use the block.\n\n' +
  'Returns JSON with "era", "era_source", optional "season"/"yards_to_goal"/"field_zone"/' +
  '"distance"/"distance_bucket"/"distance_bucket_source"/"fourth_down_decision", "basis", ' +
  '"caveats", plus {"_source": "api.expected_points", "count", "rows"} -- or a friendly ' +
  '"No expected-points cell matches..." string naming the bucket-vocabulary trap.'

export const getExpectedPointsInputShape = {
  down: z
    .number()
    .int()
    .min(1)
    .max(4)
    .optional()
    .describe(
      'Down, 1-4. Omit to span all downs at the given spot. Remember down=4 rows are ' +
        'conditional on going for it.'
    ),
  distance: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Yards to go for a first down (the "7" in 3rd-and-7). Requires `down` to map to a ' +
        'bucket -- the boundaries are down-aware. Pass `yards_to_goal` too when known, so ' +
        'goal-to-go is detected. When both this and `distance_bucket` are passed and they ' +
        'disagree, the numbers win and a caveat says so. Ignored entirely without `down`.'
    ),
  yards_to_goal: z
    .number()
    .int()
    .min(1)
    .max(99)
    .optional()
    .describe(
      'Distance to the GOAL LINE in yards, 1-99 -- not the painted yard line. "At midfield" ' +
        'is 50, "at their own 25" is 75, "at the opponent 25" is 25. Mapped to the ' +
        "view's field-position decile server-side; the resolved zone comes back as " +
        '"field_zone".'
    ),
  distance_bucket: z
    .enum(EXPECTED_POINTS_DISTANCE_BUCKETS)
    .optional()
    .describe(
      "Distance-to-go bucket, if you'd rather pick it than pass `distance`. Down-aware " +
        "boundaries: down 1 has 'standard' (=10) / 'short' (<10) / 'long' (>10) / 'goal'; " +
        "downs 2-4 have 'short' (<=3) / 'med' (4-6) / 'long' (7-10) / 'xlong' (>10) / " +
        "'goal'. Prefer `distance` + `down` (the tool maps it), or omit both to read the " +
        'spread across buckets.'
    ),
  season: z
    .number()
    .int()
    .optional()
    .describe(
      `Season year the question is about, e.g. 2015. Selects the model era ` +
        `(${EXPECTED_POINTS_ERAS.join(', ')}); defaults to the current era ('2021+'). ` +
        `Seasons before ${EXPECTED_POINTS_FIRST_SEASON} are not covered and return a ` +
        'friendly error.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(DEFAULT_ROW_CAP)
    .optional()
    .describe(
      `Max rows (default ${EXPECTED_POINTS_DEFAULT_LIMIT}, hard-capped at ${DEFAULT_ROW_CAP}). ` +
        'A fully-specified state returns at most 6 rows (one per bucket); a whole era is ' +
        '~165 and will truncate -- the caveats say so when that happens.'
    ),
} as const

// ---------------------------------------------------------------------------
// Tool registration (MCP SDK wiring).
// ---------------------------------------------------------------------------
// Instrumented exports
// ---------------------------------------------------------------------------
// Every tool function is exported through withToolTelemetry: one
// {evt:'tool',...} JSON log line per call (name, latency, truncated args,
// errish flag) plus the hard per-call deadline. Both consumers -- the MCP
// registration below and the eve wrappers in agent/tools/ -- import these
// wrapped bindings, so no call bypasses instrumentation. The wrapper is a
// byte-identical pass-through of the impl's return value.

export const queryTeamTool = withToolTelemetry('query_team', queryTeamToolImpl)
export const queryGamesTool = withToolTelemetry('query_games', queryGamesToolImpl)
export const queryMatchupTool = withToolTelemetry('query_matchup', queryMatchupToolImpl)
export const getRankingsTool = withToolTelemetry('get_rankings', getRankingsToolImpl)
export const getLeaderboardTool = withToolTelemetry('get_leaderboard', getLeaderboardToolImpl)
export const situationalSplitsTool = withToolTelemetry('situational_splits', situationalSplitsToolImpl)
export const searchPlayersTool = withToolTelemetry('search_players', searchPlayersToolImpl)
export const getDataFreshnessTool = withToolTelemetry('get_data_freshness', getDataFreshnessToolImpl)
export const getGamePredictionTool = withToolTelemetry('get_game_prediction', getGamePredictionToolImpl)
export const getTeamEloTool = withToolTelemetry('get_team_elo', getTeamEloToolImpl)
export const getMatchupEdgesTool = withToolTelemetry('get_matchup_edges', getMatchupEdgesToolImpl)
export const getPlaycallingProfileTool = withToolTelemetry('get_playcalling_profile', getPlaycallingProfileToolImpl)
export const getAdjustedEpaTool = withToolTelemetry('get_adjusted_epa', getAdjustedEpaToolImpl)
export const getLiveScoreboardTool = withToolTelemetry('get_live_scoreboard', getLiveScoreboardToolImpl)
export const getModelAccuracyTool = withToolTelemetry('get_model_accuracy', getModelAccuracyToolImpl)
export const getPlayerLeadersTool = withToolTelemetry('get_player_leaders', getPlayerLeadersToolImpl)
export const comparePlayersTool = withToolTelemetry('compare_players', comparePlayersToolImpl)
export const getConferenceComparisonTool = withToolTelemetry('get_conference_comparison', getConferenceComparisonToolImpl)
export const getCoachingHistoryTool = withToolTelemetry('get_coaching_history', getCoachingHistoryToolImpl)
export const runSqlTool = withToolTelemetry('run_sql', runSqlToolImpl)
export const getPenaltyProfileTool = withToolTelemetry('get_penalty_profile', getPenaltyProfileToolImpl)
export const getPenaltyLogTool = withToolTelemetry('get_penalty_log', getPenaltyLogToolImpl)
export const getSeasonOutlookTool = withToolTelemetry('get_season_outlook', getSeasonOutlookToolImpl)
export const getExpectedPointsTool = withToolTelemetry('get_expected_points', getExpectedPointsToolImpl)
export const renderChartTool = withToolTelemetry('render_chart', renderChartToolImpl)

// ---------------------------------------------------------------------------

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

export function registerMcpTools(server: McpServer): void {
  server.registerTool(
    'query_team',
    {
      title: 'Query Team',
      description: queryTeamDescription,
      inputSchema: queryTeamInputShape,
      annotations: { title: 'Query Team', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await queryTeamTool(args))
  )

  server.registerTool(
    'query_games',
    {
      title: 'Query Games',
      description: queryGamesDescription,
      inputSchema: queryGamesInputShape,
      annotations: { title: 'Query Games', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await queryGamesTool(args))
  )

  server.registerTool(
    'query_matchup',
    {
      title: 'Query Head-to-Head Matchup',
      description: queryMatchupDescription,
      inputSchema: queryMatchupInputShape,
      annotations: { title: 'Query Head-to-Head Matchup', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await queryMatchupTool(args))
  )

  server.registerTool(
    'get_rankings',
    {
      title: 'Get Poll Rankings',
      description: getRankingsDescription,
      inputSchema: getRankingsInputShape,
      annotations: { title: 'Get Poll Rankings', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getRankingsTool(args))
  )

  server.registerTool(
    'get_leaderboard',
    {
      title: 'Get Team Leaderboard',
      description: getLeaderboardDescription,
      inputSchema: getLeaderboardInputShape,
      annotations: { title: 'Get Team Leaderboard', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getLeaderboardTool(args))
  )

  server.registerTool(
    'situational_splits',
    {
      title: 'Get Situational Splits',
      description: situationalSplitsDescription,
      inputSchema: situationalSplitsInputShape,
      annotations: { title: 'Get Situational Splits', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await situationalSplitsTool(args))
  )

  server.registerTool(
    'search_players',
    {
      title: 'Search Players',
      description: searchPlayersDescription,
      inputSchema: searchPlayersInputShape,
      annotations: { title: 'Search Players', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await searchPlayersTool(args))
  )

  server.registerTool(
    'get_data_freshness',
    {
      title: 'Get Data Freshness',
      description: getDataFreshnessDescription,
      inputSchema: getDataFreshnessInputShape,
      annotations: { title: 'Get Data Freshness', ...READ_ONLY_ANNOTATIONS },
    },
    async () => textResult(await getDataFreshnessTool())
  )

  server.registerTool(
    'get_game_prediction',
    {
      title: 'Get Game Prediction',
      description: getGamePredictionDescription,
      inputSchema: getGamePredictionInputShape,
      annotations: { title: 'Get Game Prediction', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getGamePredictionTool(args))
  )

  server.registerTool(
    'get_team_elo',
    {
      title: 'Get Team Elo',
      description: getTeamEloDescription,
      inputSchema: getTeamEloInputShape,
      annotations: { title: 'Get Team Elo', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getTeamEloTool(args))
  )

  server.registerTool(
    'get_matchup_edges',
    {
      title: 'Get Matchup Edges',
      description: getMatchupEdgesDescription,
      inputSchema: getMatchupEdgesInputShape,
      annotations: { title: 'Get Matchup Edges', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getMatchupEdgesTool(args))
  )

  server.registerTool(
    'get_playcalling_profile',
    {
      title: 'Get Playcalling Profile',
      description: getPlaycallingProfileDescription,
      inputSchema: getPlaycallingProfileInputShape,
      annotations: { title: 'Get Playcalling Profile', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getPlaycallingProfileTool(args))
  )

  server.registerTool(
    'get_adjusted_epa',
    {
      title: 'Get Adjusted EPA',
      description: getAdjustedEpaDescription,
      inputSchema: getAdjustedEpaInputShape,
      annotations: { title: 'Get Adjusted EPA', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getAdjustedEpaTool(args))
  )

  server.registerTool(
    'get_live_scoreboard',
    {
      title: 'Get Live Scoreboard',
      description: getLiveScoreboardDescription,
      inputSchema: getLiveScoreboardInputShape,
      annotations: { title: 'Get Live Scoreboard', ...READ_ONLY_ANNOTATIONS },
    },
    async () => textResult(await getLiveScoreboardTool())
  )

  server.registerTool(
    'get_model_accuracy',
    {
      title: 'Get Model Accuracy',
      description: getModelAccuracyDescription,
      inputSchema: getModelAccuracyInputShape,
      annotations: { title: 'Get Model Accuracy', ...READ_ONLY_ANNOTATIONS },
    },
    async () => textResult(await getModelAccuracyTool())
  )

  server.registerTool(
    'get_player_leaders',
    {
      title: 'Get Player Leaders',
      description: getPlayerLeadersDescription,
      inputSchema: getPlayerLeadersInputShape,
      annotations: { title: 'Get Player Leaders', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getPlayerLeadersTool(args))
  )

  server.registerTool(
    'compare_players',
    {
      title: 'Compare Players',
      description: comparePlayersDescription,
      inputSchema: comparePlayersInputShape,
      annotations: { title: 'Compare Players', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await comparePlayersTool(args))
  )

  server.registerTool(
    'get_conference_comparison',
    {
      title: 'Get Conference Comparison',
      description: getConferenceComparisonDescription,
      inputSchema: getConferenceComparisonInputShape,
      annotations: { title: 'Get Conference Comparison', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getConferenceComparisonTool(args))
  )

  server.registerTool(
    'get_coaching_history',
    {
      title: 'Get Coaching History',
      description: getCoachingHistoryDescription,
      inputSchema: getCoachingHistoryInputShape,
      annotations: { title: 'Get Coaching History', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getCoachingHistoryTool(args))
  )

  server.registerTool(
    'run_sql',
    {
      title: 'Run Analyst SQL',
      description: runSqlDescription,
      inputSchema: runSqlInputShape,
      annotations: { title: 'Run Analyst SQL', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await runSqlTool(args))
  )

  server.registerTool(
    'get_penalty_profile',
    {
      title: 'Get Penalty Profile',
      description: getPenaltyProfileDescription,
      inputSchema: getPenaltyProfileInputShape,
      annotations: { title: 'Get Penalty Profile', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getPenaltyProfileTool(args))
  )

  server.registerTool(
    'get_penalty_log',
    {
      title: 'Get Penalty Log',
      description: getPenaltyLogDescription,
      inputSchema: getPenaltyLogInputShape,
      annotations: { title: 'Get Penalty Log', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getPenaltyLogTool(args))
  )

  server.registerTool(
    'get_season_outlook',
    {
      title: 'Get Season Outlook',
      description: getSeasonOutlookDescription,
      inputSchema: getSeasonOutlookInputShape,
      annotations: { title: 'Get Season Outlook', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getSeasonOutlookTool(args))
  )

  server.registerTool(
    'get_expected_points',
    {
      title: 'Get Expected Points',
      description: getExpectedPointsDescription,
      inputSchema: getExpectedPointsInputShape,
      annotations: { title: 'Get Expected Points', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getExpectedPointsTool(args))
  )

  server.registerTool(
    'render_chart',
    {
      title: 'Render Chart',
      description: renderChartDescription,
      inputSchema: renderChartInputShape,
      annotations: { title: 'Render Chart', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await renderChartTool(args))
  )
}
