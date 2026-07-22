/**
 * Query fns for the conferences surface: conference-level aggregate
 * comparison metrics and conference-vs-conference head-to-head records.
 * Rows come from the contracted `api` schema (conference_comparison) and a
 * `public` RPC (get_conference_head_to_head).
 * Authoritative SQL: /workspace/cfb-database's
 * src/schemas/api/018_conference_comparison.sql,
 * src/schemas/marts/026_conference_comparison.sql,
 * src/schemas/public/010_conference_h2h_function.sql.
 */
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// api.conference_comparison -- one row per (conference, season), grain
// guaranteed by a unique index in the mart; member_count is always >= 4 (the
// mart's HAVING clause drops smaller groupings), so conference/season/
// member_count are narrowed non-null here. The remaining aggregate/percentile
// columns stay nullable per the generated Row -- an AVG()/PERCENT_RANK() over
// a conference with sparse source data (e.g. missing recruiting/EPA
// coverage) can legitimately be null.
//
// See src/lib/types/api.generated.ts's `conference_comparison` Row for the
// full generated shape (every column nullable there) -- kept hand-typed
// here since this query's .select() pulls a column subset.
// ---------------------------------------------------------------------------
export interface ConferenceComparison {
  conference: string
  season: number
  member_count: number
  avg_wins: number | null
  avg_sp_rating: number | null
  avg_epa_per_play: number | null
  avg_recruiting_rank: number | null
  non_conf_win_pct: number | null
  avg_sp_pctl: number | null
  avg_epa_pctl: number | null
  avg_recruiting_pctl: number | null
  non_conf_win_pct_pctl: number | null
}

// Get conference-level aggregate metrics for a season from the contracted
// api.conference_comparison view, sorted strongest-first by avg_sp_rating
// (nulls last). Returns [] on error/empty -- a season with no computed
// aggregates yet (e.g. current season before enough games) is a valid state,
// not an error; callers fall back to the latest season with data.
export const getConferenceComparison = cache(async (season: number): Promise<ConferenceComparison[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('conference_comparison')
    .select('conference, season, member_count, avg_wins, avg_sp_rating, avg_epa_per_play, avg_recruiting_rank, non_conf_win_pct, avg_sp_pctl, avg_epa_pctl, avg_recruiting_pctl, non_conf_win_pct_pctl')
    .eq('season', season)
    .order('avg_sp_rating', { ascending: false, nullsFirst: false })

  if (error || !data) return []

  return data as ConferenceComparison[]
})

// ---------------------------------------------------------------------------
// public.get_conference_head_to_head(p_conf1, p_conf2, p_season_start?,
// p_season_end?) -- season-by-season breakdown between two conferences.
// Not yet present in src/lib/types/database.generated.ts's generated
// Functions map (types haven't been regenerated since the RPC shipped in
// cfb-database's 010_conference_h2h_function.sql) -- kept hand-typed here
// per that SQL's RETURNS TABLE. createClient() returns an untyped generic
// SupabaseClient (no `<Database>` type param), matching the existing
// precedent of calling not-yet-generated RPCs (e.g. players.ts's
// get_player_detail/get_player_search), so this compiles without a cast.
//
// The SQL always orients results to the caller's argument order (conf1_wins/
// conf1_win_pct/avg_point_diff are computed relative to p_conf1, flipping the
// underlying marts.conference_head_to_head row when p_conf1 sorts after
// p_conf2 alphabetically) -- callers never need to flip anything themselves.
// ---------------------------------------------------------------------------
export interface ConferenceHeadToHeadRow {
  conference_1: string
  conference_2: string
  season: number
  total_games: number
  conf1_wins: number
  conf2_wins: number
  ties: number
  conf1_win_pct: number | null
  avg_point_diff: number | null
}

// Get the season-by-season head-to-head record between two conferences from
// the get_conference_head_to_head RPC, oriented so conf1_wins/conf1_win_pct/
// avg_point_diff are always from conf1's perspective regardless of which
// order the two names are passed in. seasonStart/seasonEnd are optional --
// omitted, the RPC returns every season on record. Returns [] on error/no
// games played between the two conferences in range (never an error state).
export const getConferenceHeadToHead = cache(async (
  conf1: string,
  conf2: string,
  seasonStart?: number,
  seasonEnd?: number
): Promise<ConferenceHeadToHeadRow[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_conference_head_to_head', {
    p_conf1: conf1,
    p_conf2: conf2,
    p_season_start: seasonStart ?? null,
    p_season_end: seasonEnd ?? null,
  })

  if (error || !data) return []

  return data as ConferenceHeadToHeadRow[]
})
