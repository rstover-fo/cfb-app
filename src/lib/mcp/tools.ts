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

// ---------------------------------------------------------------------------
// MCP v2: eight read-only tools over the cfb-database warehouse, mounted at
// src/app/api/[transport]/route.ts via mcp-handler's createMcpHandler.
//
// This is a TypeScript port of the reference Python server
// (../../../cfb-database/mcp/src/cfb_mcp/server.py) -- same eight tools,
// same argument semantics, same `_source`/count/rows JSON envelope, same
// row caps, same friendly-string-never-throw error contract. Tool
// implementations are exported as plain async (args) => string functions
// (below) so they're unit-testable without spinning up the MCP transport;
// registerMcpTools() is the only place that touches the SDK's McpServer.
// ---------------------------------------------------------------------------

// All eight tools are read-only, non-destructive, idempotent, and talk to an
// external service (Supabase/PostgREST) -- same annotation set for every one,
// mirroring cfb_mcp/server.py's READ_ONLY_ANNOTATIONS.
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

  const games = await getMatchupGames(teamA, teamB)

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
        'EPA in 2024", "best scoring defense last season", "who led the country in wins". All metrics ' +
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
}
