/**
 * Query fns for the live scoreboard surface: in-progress game state (score,
 * period/clock, possession, live win probability) for the current slate.
 * Row comes from the contracted `api` schema. Authoritative SQL:
 * /workspace/cfb-database/src/schemas/api/*.sql (live_scoreboard).
 *
 * api.live_scoreboard is only populated during Saturday polling windows in
 * season (cfb-database's live poller writes/refreshes rows while games are
 * scheduled/in progress that day and the table is otherwise empty). An empty
 * [] result is the normal state most of the time -- weekdays, off-season, and
 * any moment outside an active polling window -- never treat [] as an error.
 */
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// api.live_scoreboard -- one row per game currently tracked by the live
// poller (pregame/in-progress/final for the day's slate). Narrow view (19
// columns); selected in full. See src/lib/types/api.generated.ts's
// `live_scoreboard` Row for the generated shape (every column nullable there,
// including game_id) -- kept hand-typed here narrowing only game_id/season/
// week/season_type/status/home_team/away_team non-null (grain + identity
// columns guaranteed whenever the poller has written a row at all), while
// score/clock/possession/market/win-prob columns stay nullable (pregame rows
// have no period/clock/points yet; win-prob columns depend on which model(s)
// have scored this snapshot).
// ---------------------------------------------------------------------------
export interface LiveScoreboardGame {
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

const LIVE_SCOREBOARD_ROW_LIMIT = 200

// Get the current live scoreboard slate from the contracted
// api.live_scoreboard view, ordered by game_id (the view has no start-time
// column to order by). Returns [] on error/empty -- the normal state outside
// an active Saturday polling window (see module header), never an error.
export const getLiveScoreboard = cache(async (): Promise<LiveScoreboardGame[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('live_scoreboard')
    .select('game_id, season, week, season_type, status, period, clock, seconds_remaining, home_team, away_team, home_points, away_points, possession, spread, over_under, cfbd_home_wp, house_live_home_wp, pregame_expected_margin, captured_at')
    .order('game_id', { ascending: true })
    .limit(LIVE_SCOREBOARD_ROW_LIMIT)

  if (error || !data) return []

  return data as LiveScoreboardGame[]
})
