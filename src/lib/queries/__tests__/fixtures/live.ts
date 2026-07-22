/**
 * Fixtures matching the api.live_scoreboard row shape queried by
 * src/lib/queries/live.ts. Authoritative column definitions:
 * /workspace/cfb-database/src/schemas/api/*.sql (live_scoreboard).
 *
 * Three snapshots across a game's lifecycle: pregame (no score/clock yet),
 * in-progress (possession + clock + house_live_home_wp populated), final
 * (period/clock frozen at the end state, win prob settled toward the result).
 */

export interface LiveScoreboardRow {
  game_id: number
  season: number
  week: number
  season_type: string
  status: string
  period: number | null
  clock: string | null
  seconds_remaining: number | null
  home_team: string
  away_team: string
  home_points: number | null
  away_points: number | null
  possession: string | null
  spread: number | null
  over_under: number | null
  cfbd_home_wp: number | null
  house_live_home_wp: number | null
  pregame_expected_margin: number | null
  captured_at: string | null
}

export function createLiveScoreboardRow(overrides: Partial<LiveScoreboardRow> = {}): LiveScoreboardRow {
  return {
    game_id: 401752873,
    season: 2025,
    week: 14,
    season_type: 'regular',
    status: 'in_progress',
    period: 2,
    clock: '08:41',
    seconds_remaining: 1721,
    home_team: 'Ohio State',
    away_team: 'Michigan',
    home_points: 14,
    away_points: 10,
    possession: 'Ohio State',
    spread: -2.5,
    over_under: 44.5,
    cfbd_home_wp: 0.68,
    house_live_home_wp: 0.71,
    pregame_expected_margin: 4.0,
    captured_at: '2025-11-29T18:42:00+00:00',
    ...overrides,
  }
}

/** Pregame snapshot: scheduled, no score/clock/possession/live win prob yet. */
export function createPregameScoreboardRow(overrides: Partial<LiveScoreboardRow> = {}): LiveScoreboardRow {
  return createLiveScoreboardRow({
    game_id: 401752900,
    home_team: 'Boise State',
    away_team: 'Air Force',
    status: 'scheduled',
    period: null,
    clock: null,
    seconds_remaining: null,
    home_points: null,
    away_points: null,
    possession: null,
    house_live_home_wp: null,
    cfbd_home_wp: null,
    spread: -6.5,
    over_under: 51.5,
    pregame_expected_margin: 5.2,
    captured_at: '2025-11-29T17:00:00+00:00',
    ...overrides,
  })
}

/** In-progress snapshot: possession + clock + house_live_home_wp all populated. */
export function createInProgressScoreboardRow(overrides: Partial<LiveScoreboardRow> = {}): LiveScoreboardRow {
  return createLiveScoreboardRow(overrides)
}

/** Final snapshot: period/clock frozen at the end state, score settled. */
export function createFinalScoreboardRow(overrides: Partial<LiveScoreboardRow> = {}): LiveScoreboardRow {
  return createLiveScoreboardRow({
    game_id: 401752860,
    home_team: 'Ohio State',
    away_team: 'Purdue',
    status: 'final',
    period: 4,
    clock: '00:00',
    seconds_remaining: 0,
    home_points: 38,
    away_points: 14,
    possession: null,
    house_live_home_wp: 0.99,
    cfbd_home_wp: 0.98,
    pregame_expected_margin: 17.5,
    captured_at: '2025-11-15T22:05:00+00:00',
    ...overrides,
  })
}

/** One game at each lifecycle stage: pregame, in-progress, final. Ordered by game_id ascending. */
export function createLiveScoreboardRows(): LiveScoreboardRow[] {
  return [
    createFinalScoreboardRow(),
    createInProgressScoreboardRow(),
    createPregameScoreboardRow(),
  ].sort((a, b) => a.game_id - b.game_id)
}
