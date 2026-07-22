import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getTeamHistory } from '@/lib/queries/compare'
import { getMatchup, getMatchupGames } from '@/lib/queries/matchups'
import {
  DEFAULT_ROW_CAP,
  queryTeamDetail,
  queryGameDetail,
  queryPollRankings,
  queryLeaderboardTeams,
  queryTeamWepaSeason,
  callSituationalSplitRpc,
  callPlayerSearch,
  callPlayerDetail,
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
import { getWepaLeaders, getUsageLeaders, getPlayerComparison, type WepaCategory } from '@/lib/queries/players'
import { getConferenceComparison } from '@/lib/queries/conferences'
import { getCoachingHistory } from '@/lib/queries/coaches'
import { CURRENT_SEASON, PREDICTION_MODEL_VERSIONS, DEFAULT_PREDICTION_MODEL } from '@/lib/queries/constants'

// ---------------------------------------------------------------------------
// MCP v2: nineteen read-only tools over the cfb-database warehouse, mounted at
// src/app/api/[transport]/route.ts via mcp-handler's createMcpHandler.
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
// Tool implementations are exported as plain async (args) => string
// functions (below) so they're unit-testable without spinning up the MCP
// transport; registerMcpTools() is the only place that touches the SDK's
// McpServer.
// ---------------------------------------------------------------------------

// All nineteen tools are read-only, non-destructive, idempotent, and talk to
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

export async function queryTeamTool(args: QueryTeamArgs): Promise<string> {
  const { team } = args

  const [detail, historyDesc] = await Promise.all([
    queryTeamDetail(team),
    // getTeamHistory (src/lib/queries/compare.ts) already wraps api.team_history
    // for this exact team; it sorts ascending for chart display, so undo that
    // here -- the MCP contract mirrors the Python server's `order=season.desc`
    // (most recent season first), capped at the standard 100-row limit rather
    // than compare.ts's UI-oriented default of 8 seasons.
    getTeamHistory(team, DEFAULT_ROW_CAP).then(rows => [...rows].reverse()),
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
  })
}

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

export async function queryGamesTool(args: QueryGamesArgs): Promise<string> {
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

// ---------------------------------------------------------------------------
// 3. query_matchup
// ---------------------------------------------------------------------------

export interface QueryMatchupArgs {
  team_a: string
  team_b: string
}

export async function queryMatchupTool(args: QueryMatchupArgs): Promise<string> {
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

export async function getRankingsTool(args: GetRankingsArgs): Promise<string> {
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

// ---------------------------------------------------------------------------
// 5. get_leaderboard
// ---------------------------------------------------------------------------

export interface GetLeaderboardArgs {
  season: number
  metric: LeaderboardMetric
  limit?: number
}

export async function getLeaderboardTool(args: GetLeaderboardArgs): Promise<string> {
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

// ---------------------------------------------------------------------------
// 6. situational_splits
// ---------------------------------------------------------------------------

export interface SituationalSplitsArgs {
  team: string
  season: number
  split_type: SplitType
}

export async function situationalSplitsTool(args: SituationalSplitsArgs): Promise<string> {
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

// ---------------------------------------------------------------------------
// 7. search_players
// ---------------------------------------------------------------------------

export interface SearchPlayersArgs {
  query: string
  team?: string
  season?: number
  limit?: number
}

export async function searchPlayersTool(args: SearchPlayersArgs): Promise<string> {
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

// ---------------------------------------------------------------------------
// 8. get_data_freshness
// ---------------------------------------------------------------------------

export async function getDataFreshnessTool(): Promise<string> {
  const result = await callDataFreshness()
  if (result.error) return result.error
  return dump(wrap('public.get_data_freshness', result.rows))
}

// ---------------------------------------------------------------------------
// 9. get_game_prediction
// ---------------------------------------------------------------------------

export interface GetGamePredictionArgs {
  game_id: number
  model_version?: string
}

export async function getGamePredictionTool(args: GetGamePredictionArgs): Promise<string> {
  const modelVersion = args.model_version ?? DEFAULT_PREDICTION_MODEL
  const prediction = await getGamePrediction(args.game_id, modelVersion)

  // getGamePrediction (src/lib/queries/predictions.ts) returns null for both
  // "no row" and "query error" -- there is no separate error string to pass
  // through here, so a null result always renders as this friendly string.
  if (!prediction) {
    return (
      `No prediction found for game_id=${args.game_id} with model_version='${modelVersion}'. This is normal ` +
      "if the model hasn't run for this game yet, the game_id doesn't exist, or that model_version wasn't " +
      'written for this game.'
    )
  }

  return dump(wrap('api.game_predictions', [prediction]))
}

// ---------------------------------------------------------------------------
// 10. get_team_elo
// ---------------------------------------------------------------------------

export interface GetTeamEloArgs {
  team: string
  season?: number
}

export async function getTeamEloTool(args: GetTeamEloArgs): Promise<string> {
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

export async function getMatchupEdgesTool(args: GetMatchupEdgesArgs): Promise<string> {
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

// ---------------------------------------------------------------------------
// 12. get_playcalling_profile
// ---------------------------------------------------------------------------

export interface GetPlaycallingProfileArgs {
  team: string
  season?: number
}

export async function getPlaycallingProfileTool(args: GetPlaycallingProfileArgs): Promise<string> {
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

// ---------------------------------------------------------------------------
// 13. get_adjusted_epa
// ---------------------------------------------------------------------------

export interface GetAdjustedEpaArgs {
  team: string
  season?: number
}

export async function getAdjustedEpaTool(args: GetAdjustedEpaArgs): Promise<string> {
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

// ---------------------------------------------------------------------------
// 14. get_live_scoreboard
// ---------------------------------------------------------------------------

export async function getLiveScoreboardTool(): Promise<string> {
  const games = await getLiveScoreboard()

  // api.live_scoreboard is only populated during Saturday polling windows in
  // season (see live.ts's module header) -- an empty slate is the normal
  // state most of the time (weekdays, off-season, outside an active polling
  // window), not an error, so this always returns the envelope (possibly
  // count: 0) rather than a "No ... found" string, mirroring get_matchup_edges.
  return dump(wrap('api.live_scoreboard', games))
}

// ---------------------------------------------------------------------------
// 15. get_model_accuracy
// ---------------------------------------------------------------------------

export async function getModelAccuracyTool(): Promise<string> {
  const rows = await getPredictionAccuracy()

  // api.prediction_accuracy is a small (~90-row), system-level backtest
  // table with no caller-supplied filters -- always returns the envelope,
  // never a "No ... found" string (an empty table before the backtest job
  // has ever run is the only empty case, and is still not an error).
  return dump(wrap('api.prediction_accuracy', rows))
}

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

export async function getPlayerLeadersTool(args: GetPlayerLeadersArgs): Promise<string> {
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

// ---------------------------------------------------------------------------
// 17. compare_players
// ---------------------------------------------------------------------------

export interface ComparePlayersArgs {
  player_id_1: number
  player_id_2: number
  season?: number
}

export async function comparePlayersTool(args: ComparePlayersArgs): Promise<string> {
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

// ---------------------------------------------------------------------------
// 18. get_conference_comparison
// ---------------------------------------------------------------------------

export interface GetConferenceComparisonArgs {
  season?: number
}

export async function getConferenceComparisonTool(args: GetConferenceComparisonArgs): Promise<string> {
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

// ---------------------------------------------------------------------------
// 19. get_coaching_history
// ---------------------------------------------------------------------------

export interface GetCoachingHistoryArgs {
  first_name: string
  last_name: string
}

export async function getCoachingHistoryTool(args: GetCoachingHistoryArgs): Promise<string> {
  const rows = await getCoachingHistory(args.first_name, args.last_name)

  if (rows.length === 0) {
    return (
      `No coaching history found for '${args.first_name} ${args.last_name}'. Check the spelling -- ` +
      'first_name/last_name must exactly match api.coaching_history (case-sensitive).'
    )
  }

  return dump(wrap('api.coaching_history', rows))
}

// ---------------------------------------------------------------------------
// Tool registration (MCP SDK wiring).
// ---------------------------------------------------------------------------

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

export function registerMcpTools(server: McpServer): void {
  server.registerTool(
    'query_team',
    {
      title: 'Query Team',
      description:
        "Get a team's current-season snapshot plus its full multi-season history. Use for any " +
        'question about a single team -- "how good is Oklahoma this year", "show Oklahoma\'s ' +
        'history since 2014", ratings/EPA trends over time. Combines api.team_detail (current-season ' +
        'snapshot: record, SP+/Elo/FPI ratings, EPA/success rate/explosiveness, recruiting rank -- at ' +
        'most one row) and api.team_history (one row per season, ordered season DESC, up to 100 rows). ' +
        "Team names must match CFBD's convention exactly (case-sensitive) -- 'oklahoma' or 'OU' will " +
        'not match \'Oklahoma\'. api.team_detail only includes FBS-classification teams. Returns JSON ' +
        'with "team_detail" and "team_history" keys, each {"_source", "count", "rows"}, or a plain ' +
        '"No team found..." string if nothing matches.',
      inputSchema: {
        team: z
          .string()
          .describe(
            "Exact school name as used by CFBD, e.g. 'Oklahoma', 'Ohio State', 'Texas A&M'. This is " +
              'an exact, case-sensitive match, not a fuzzy search -- if unsure of the exact spelling, ' +
              'try get_leaderboard or query_games first to confirm it.'
          ),
      },
      annotations: { title: 'Query Team', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await queryTeamTool(args))
  )

  server.registerTool(
    'query_games',
    {
      title: 'Query Games',
      description:
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
        '{"_source": "api.game_detail", "count", "rows"}, or "No games found..." if nothing matches.',
      inputSchema: {
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
      },
      annotations: { title: 'Query Games', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await queryGamesTool(args))
  )

  server.registerTool(
    'query_matchup',
    {
      title: 'Query Head-to-Head Matchup',
      description:
        'Get head-to-head history and current-season comparison between two teams. Use for "Oklahoma ' +
        'vs Texas all-time record", "how do these two teams compare this season" (rivalry games, bowl ' +
        'previews). Backed by api.matchup (one row per unordered team pair; order of team_a/team_b ' +
        "doesn't matter) plus the full api.game_detail game log between the pair. Returns all-time " +
        'record (total games, wins for each side, ties, first/last meeting), recent results, and each ' +
        "team's current-season record/SP+ rank/EPA for context. Returns JSON with \"matchup\" and " +
        '"games" keys, each {"_source", "count", "rows"}, or "No matchup history found..." if the teams ' +
        'have never played or a name is misspelled.',
      inputSchema: {
        team_a: z.string().describe("First team's exact school name."),
        team_b: z
          .string()
          .describe(
            "Second team's exact school name. Order relative to team_a doesn't matter -- results are " +
              'identical either way.'
          ),
      },
      annotations: { title: 'Query Head-to-Head Matchup', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await queryMatchupTool(args))
  )

  server.registerTool(
    'get_rankings',
    {
      title: 'Get Poll Rankings',
      description:
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
        '"rows"}, or "No rankings found..." if nothing matches.',
      inputSchema: {
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
      },
      annotations: { title: 'Get Poll Rankings', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getRankingsTool(args))
  )

  server.registerTool(
    'get_leaderboard',
    {
      title: 'Get Team Leaderboard',
      description:
        'Get a ranked leaderboard of teams for a season by a chosen metric. Use for "top 10 teams by ' +
        'EPA in 2024", "best scoring defense last season", "who led the country in wins". Ranks are ' +
        'FBS-scoped (FCS teams are excluded and do not count toward rank position). All metrics ' +
        'except \'wepa\' are served from api.leaderboard_teams, which pre-computes rank columns ' +
        "(wins_rank, ppg_rank, defense_ppg_rank, epa_rank) via SQL window functions -- ties are " +
        "possible. 'wepa' (opponent-adjusted EPA) is served from the separate api.team_wepa_season " +
        'view. Returns JSON {"_source", "count", "rows"} ordered best-to-worst, or "No leaderboard data ' +
        'found..." if the season has no data.',
      inputSchema: {
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
      },
      annotations: { title: 'Get Team Leaderboard', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getLeaderboardTool(args))
  )

  server.registerTool(
    'situational_splits',
    {
      title: 'Get Situational Splits',
      description:
        'Get a team\'s situational performance splits for a season. Use for "how does Oklahoma perform ' +
        'on 3rd down", "home vs away splits for Oklahoma in 2023", "red zone efficiency", "conference ' +
        'vs non-conference performance". Fans out to one of five public RPCs based on split_type: ' +
        'get_home_away_splits, get_conference_splits, get_red_zone_splits, get_down_distance_splits, ' +
        'get_field_position_splits -- each called as (p_team=team, p_season=season). All five exclude ' +
        'garbage-time plays. Play-by-play data is available from the 2014 season on; earlier seasons ' +
        'will return empty or partial results. Returns JSON {"_source": "public.<rpc_name>", "count", ' +
        '"rows"}, or "No <split_type> splits found..." if the team/season has no matching plays.',
      inputSchema: {
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
      },
      annotations: { title: 'Get Situational Splits', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await situationalSplitsTool(args))
  )

  server.registerTool(
    'search_players',
    {
      title: 'Search Players',
      description:
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
        'results are never discarded), or "No players found..." if the search itself is empty.',
      inputSchema: {
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
      },
      annotations: { title: 'Search Players', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await searchPlayersTool(args))
  )

  server.registerTool(
    'get_data_freshness',
    {
      title: 'Get Data Freshness',
      description:
        'Get freshness/staleness status for all tracked warehouse tables. Use before answering ' +
        'questions about very recent games/stats, to qualify how current the data is -- e.g. "as of ' +
        'the last refresh (X days ago), ...". Also useful if a query returns unexpectedly few/no rows ' +
        'for the current week, to check whether the pipeline has run yet. Takes no arguments. Backed by ' +
        'the public.get_data_freshness() RPC, which reports row_count, expected_refresh_frequency, ' +
        'days_since_activity, and is_stale for each of ~23 tracked tables, ordered stale-first. Returns ' +
        'JSON {"_source": "public.get_data_freshness", "count", "rows"}.',
      inputSchema: {},
      annotations: { title: 'Get Data Freshness', ...READ_ONLY_ANNOTATIONS },
    },
    async () => textResult(await getDataFreshnessTool())
  )

  server.registerTool(
    'get_game_prediction',
    {
      title: 'Get Game Prediction',
      description:
        'Get the house model\'s prediction for a single game, plus how it stacks up against the market ' +
        'line. Use for "what does the model predict for the Oklahoma vs Texas game", "is there value on ' +
        'this line", "how confident is the model in this matchup". Backed by api.game_predictions, which ' +
        'is already latest-snapshot per (game_id, model_version) -- at most one row. Two model versions ' +
        "are written per game: 'elo_v1' (Elo rating differential only) and 'elo_epa_blend_v1' (default -- " +
        'blends Elo with recent EPA form); home_win_prob is Elo-only in BOTH versions, so only ' +
        'expected_home_margin changes between them. `edge` = expected_home_margin + market_spread: a ' +
        'positive edge means the model favors the home team more than the market does (vs. the number); a ' +
        'negative edge means the model favors the away team relative to the market. market_provider, ' +
        'market_spread, market_home_margin, market_captured_at, edge, and edge_pick are all null when no ' +
        'betting line has been posted for this game -- that is a normal state (e.g. very early in the week, ' +
        'or a game with no market coverage), not an error. Returns JSON {"_source": "api.game_predictions", ' +
        '"count", "rows"} with at most one row, or a friendly "No prediction found..." string if the model ' +
        "hasn't run for this game_id/model_version combination or the game_id doesn't exist.",
      inputSchema: {
        game_id: z
          .number()
          .int()
          .describe('The game_id to fetch a prediction for (same id as api.game_detail/api.game_predictions).'),
        model_version: z
          .enum(PREDICTION_MODEL_VERSIONS)
          .optional()
          .describe(
            `Which model version to fetch. Defaults to '${DEFAULT_PREDICTION_MODEL}' (Elo + recent-EPA ` +
              "blend). 'elo_v1' is Elo-only; home_win_prob is identical between versions, only " +
              'expected_home_margin (and therefore edge) differs.'
          ),
      },
      annotations: { title: 'Get Game Prediction', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getGamePredictionTool(args))
  )

  server.registerTool(
    'get_team_elo',
    {
      title: 'Get Team Elo',
      description:
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
        'friendly "No Elo data found..." string if the team/season combination has no coverage at all.',
      inputSchema: {
        team: z.string().describe("Exact school name as used by CFBD, e.g. 'Oklahoma'. Case-sensitive."),
        season: z
          .number()
          .int()
          .optional()
          .describe(`Season year, e.g. 2024. Defaults to the current season (${CURRENT_SEASON}) if omitted.`),
      },
      annotations: { title: 'Get Team Elo', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getTeamEloTool(args))
  )

  server.registerTool(
    'get_matchup_edges',
    {
      title: 'Get Matchup Edges',
      description:
        'Get the scored slate of upcoming games where the house model\'s prediction diverges most from the ' +
        'market line, ranked by conviction. Use for "which games have the biggest edge this week", "where ' +
        'does the model disagree with Vegas", "best value on the board". Backed by ' +
        'api.scored_matchup_edges (upcoming/scheduled games only -- a game drops off this view once it ' +
        "completes), ordered by abs_edge descending (biggest model-vs-market disagreement first; rows with " +
        'no posted market line have a null edge and sort last, but are still included, not filtered out). ' +
        '`edge` = expected_home_margin + market_spread: positive favors the home team vs. the market, ' +
        'negative favors the away team. Two model versions are written per game; pass `model_version` ' +
        `explicitly to pin one, otherwise the default blended model ('${DEFAULT_PREDICTION_MODEL}') is used. ` +
        'IMPORTANT: this view only ever contains games that have not yet been played, so during the ' +
        'off-season, or after a season\'s full slate has already locked in and completed, an EMPTY result ' +
        '({"count": 0, "rows": []}) is the expected, correct response -- not an error and not a sign the ' +
        'query is broken. Returns JSON {"_source": "api.scored_matchup_edges", "count", "rows"}, sliced to ' +
        'at most `limit` rows (default 25, hard-capped at 100) after sorting by conviction.',
      inputSchema: {
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
      },
      annotations: { title: 'Get Matchup Edges', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getMatchupEdgesTool(args))
  )

  server.registerTool(
    'get_playcalling_profile',
    {
      title: 'Get Playcalling Profile',
      description:
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
        'plays for the view to emit a row.',
      inputSchema: {
        team: z.string().describe("Exact school name as used by CFBD, e.g. 'Oklahoma'. Case-sensitive."),
        season: z
          .number()
          .int()
          .optional()
          .describe(`Season year, e.g. 2024. Defaults to the current season (${CURRENT_SEASON}) if omitted.`),
      },
      annotations: { title: 'Get Playcalling Profile', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getPlaycallingProfileTool(args))
  )

  server.registerTool(
    'get_adjusted_epa',
    {
      title: 'Get Adjusted EPA',
      description:
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
        "the feature build hasn't run yet for this team/season.",
      inputSchema: {
        team: z.string().describe("Exact school name as used by CFBD, e.g. 'Oklahoma'. Case-sensitive."),
        season: z
          .number()
          .int()
          .optional()
          .describe(`Season year, e.g. 2024. Defaults to the current season (${CURRENT_SEASON}) if omitted.`),
      },
      annotations: { title: 'Get Adjusted EPA', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getAdjustedEpaTool(args))
  )

  server.registerTool(
    'get_live_scoreboard',
    {
      title: 'Get Live Scoreboard',
      description:
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
        '"rows"}.',
      inputSchema: {},
      annotations: { title: 'Get Live Scoreboard', ...READ_ONLY_ANNOTATIONS },
    },
    async () => textResult(await getLiveScoreboardTool())
  )

  server.registerTool(
    'get_model_accuracy',
    {
      title: 'Get Model Accuracy',
      description:
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
        "samples, e.g. early in a new model_version's life, should be read with more caution). Takes " +
        'no arguments. Returns JSON {"_source": "api.prediction_accuracy", "count", "rows"}, ordered ' +
        'season descending, then model_version, then edge_threshold ascending.',
      inputSchema: {},
      annotations: { title: 'Get Model Accuracy', ...READ_ONLY_ANNOTATIONS },
    },
    async () => textResult(await getModelAccuracyTool())
  )

  server.registerTool(
    'get_player_leaders',
    {
      title: 'Get Player Leaders',
      description:
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
        '... leaders found..." string if the season/category combination has no data yet.',
      inputSchema: {
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
      },
      annotations: { title: 'Get Player Leaders', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getPlayerLeadersTool(args))
  )

  server.registerTool(
    'compare_players',
    {
      title: 'Compare Players',
      description:
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
        'player_id(s) came back empty if either lookup fails.',
      inputSchema: {
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
      },
      annotations: { title: 'Compare Players', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await comparePlayersTool(args))
  )

  server.registerTool(
    'get_conference_comparison',
    {
      title: 'Get Conference Comparison',
      description:
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
        'season-1 come back empty.',
      inputSchema: {
        season: z
          .number()
          .int()
          .optional()
          .describe(
            `Season year, e.g. 2024. Defaults to the current season (${CURRENT_SEASON}) if omitted; ` +
              'falls back to season-1 automatically if the season has no computed aggregates yet.'
          ),
      },
      annotations: { title: 'Get Conference Comparison', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getConferenceComparisonTool(args))
  )

  server.registerTool(
    'get_coaching_history',
    {
      title: 'Get Coaching History',
      description:
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
        'coach on record.',
      inputSchema: {
        first_name: z.string().describe("Coach's first name, exact match, e.g. 'Nick'."),
        last_name: z.string().describe("Coach's last name, exact match, e.g. 'Saban'."),
      },
      annotations: { title: 'Get Coaching History', ...READ_ONLY_ANNOTATIONS },
    },
    async args => textResult(await getCoachingHistoryTool(args))
  )
}
