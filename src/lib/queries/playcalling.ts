/**
 * Query fns for the playcalling/adjusted-EPA surface: a team's situational
 * run/pass tendencies, and the week-by-week adjusted-EPA and feature-build
 * arcs behind the trajectory charts. All rows come from the contracted `api`
 * schema. Authoritative SQL: /workspace/cfb-database/src/schemas/api/*.sql
 * (team_playcalling_profile, adjusted_epa_week, team_week_features).
 */
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// api.team_playcalling_profile -- one row per (team, season): situational
// run/pass rates, success rates, avg EPA, and percentile ranks vs the rest of
// FBS for the season. See src/lib/types/api.generated.ts's
// `team_playcalling_profile` Row for the full generated shape (every column
// nullable there, including team/season) -- kept hand-typed here narrowing
// team/season/conference/games_played non-null (grain + descriptive columns
// guaranteed by the view whenever a (team, season) row exists at all), while
// every rate/EPA/percentile column stays nullable (small-sample seasons or
// situational splits with zero qualifying plays yield nulls, not zeros).
// ---------------------------------------------------------------------------
export interface PlaycallingProfile {
  team: string
  season: number
  conference: string | null
  games_played: number | null
  overall_run_rate: number | null
  early_down_run_rate: number | null
  third_down_pass_rate: number | null
  red_zone_run_rate: number | null
  overall_success_rate: number | null
  overall_avg_epa: number | null
  third_down_success_rate: number | null
  red_zone_success_rate: number | null
  leading_run_rate: number | null
  trailing_run_rate: number | null
  run_rate_delta: number | null
  pace_plays_per_game: number | null
  overall_run_rate_pctl: number | null
  early_down_run_rate_pctl: number | null
  third_down_pass_rate_pctl: number | null
  overall_epa_pctl: number | null
  third_down_success_pctl: number | null
  red_zone_success_pctl: number | null
  run_rate_delta_pctl: number | null
  pace_pctl: number | null
}

// Get a team's season playcalling/tendency profile from the contracted
// api.team_playcalling_profile view. Returns null on error/no row -- normal
// for teams/seasons without enough qualifying plays for the view to emit a row.
export const getPlaycallingProfile = cache(async (team: string, season: number): Promise<PlaycallingProfile | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('team_playcalling_profile')
    .select('team, season, conference, games_played, overall_run_rate, early_down_run_rate, third_down_pass_rate, red_zone_run_rate, overall_success_rate, overall_avg_epa, third_down_success_rate, red_zone_success_rate, leading_run_rate, trailing_run_rate, run_rate_delta, pace_plays_per_game, overall_run_rate_pctl, early_down_run_rate_pctl, third_down_pass_rate_pctl, overall_epa_pctl, third_down_success_pctl, red_zone_success_pctl, run_rate_delta_pctl, pace_pctl')
    .eq('team', team)
    .eq('season', season)
    .maybeSingle()

  if (error || !data) return null

  return data as PlaycallingProfile
})

// ---------------------------------------------------------------------------
// api.adjusted_epa_week -- one row per (team, season, week_index): the
// ridge-regression coefficients behind adjusted EPA for that week's fit.
// week_index is a dense 1..N index within the season (not the raw `week`
// column -- some weeks/teams are skipped by the model), so callers chart
// against week_index, not week.
// ---------------------------------------------------------------------------
export interface AdjustedEpaWeek {
  team: string
  season: number
  week_index: number
  off_coef: number | null
  def_coef: number | null
  hfa_coef: number | null
  mu: number | null
  plays: number | null
}

const ADJUSTED_EPA_WEEK_ROW_LIMIT = 50

// Get a team's week-by-week adjusted-EPA regression coefficients from the
// contracted api.adjusted_epa_week view, ordered week_index ascending.
// Returns [] on error/empty -- normal before the model has run for this
// team/season.
export const getAdjustedEpaWeeks = cache(async (team: string, season: number): Promise<AdjustedEpaWeek[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('adjusted_epa_week')
    .select('team, season, week_index, off_coef, def_coef, hfa_coef, mu, plays')
    .eq('team', team)
    .eq('season', season)
    .order('week_index', { ascending: true })
    .limit(ADJUSTED_EPA_WEEK_ROW_LIMIT)

  if (error || !data) return []

  return data as AdjustedEpaWeek[]
})

// ---------------------------------------------------------------------------
// api.team_week_features -- one row per (team, season, week_index): the wide
// feature-build feeding the adjusted-EPA/prediction models (elo, adjusted and
// raw EPA splits, havoc, returning production, preseason SP+, build metadata
// -- see src/lib/types/api.generated.ts's `team_week_features` Row for the
// full ~28-column shape). This query selects only the chart-relevant subset:
// grain (season/week/week_index/team/conference/game_id), games_played_to_date,
// elo_pregame, the three adjusted-EPA components, and the raw off/def
// per-play + success + havoc columns a trajectory chart plots alongside them.
// Deliberately omits explosiveness/plays-per-game, returning-production,
// preseason SP+, and build-metadata columns -- narrower callers can widen
// the .select() here if a future chart needs them.
// ---------------------------------------------------------------------------
export interface TeamWeekFeature {
  season: number
  week: number | null
  week_index: number
  team: string
  conference: string | null
  game_id: number | null
  games_played_to_date: number | null
  elo_pregame: number | null
  adj_epa_off: number | null
  adj_epa_def: number | null
  adj_epa_net: number | null
  off_epa_per_play: number | null
  off_success_rate: number | null
  def_epa_per_play_allowed: number | null
  havoc_rate_defense: number | null
  havoc_rate_offense_allowed: number | null
}

const TEAM_WEEK_FEATURES_ROW_LIMIT = 50

// Get a team's week-by-week feature-build subset from the contracted
// api.team_week_features view, ordered week_index ascending. Returns [] on
// error/empty -- normal before the feature build has run for this team/season.
export const getTeamWeekFeatures = cache(async (team: string, season: number): Promise<TeamWeekFeature[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('team_week_features')
    .select('season, week, week_index, team, conference, game_id, games_played_to_date, elo_pregame, adj_epa_off, adj_epa_def, adj_epa_net, off_epa_per_play, off_success_rate, def_epa_per_play_allowed, havoc_rate_defense, havoc_rate_offense_allowed')
    .eq('team', team)
    .eq('season', season)
    .order('week_index', { ascending: true })
    .limit(TEAM_WEEK_FEATURES_ROW_LIMIT)

  if (error || !data) return []

  return data as TeamWeekFeature[]
})
