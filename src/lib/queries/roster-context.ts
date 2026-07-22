/**
 * Query fns for offseason roster-context signals on the team page's
 * Recruiting tab: returning production (who's back from last year's PPA)
 * and transfer-portal impact (net transfers and their downstream win/SP+
 * effect), each carrying league-wide percentile ranks. All rows come from
 * the contracted `api` schema. Authoritative SQL:
 * /workspace/cfb-database/src/schemas/marts/031_returning_production.sql
 * and marts.transfer_portal_impact (wrapped by api.transfer_portal_impact).
 */
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// api.team_returning_production -- one row per (team, season): returning PPA
// (total + passing/receiving/rushing splits), returning-PPA share, usage
// splits, and returning_rank vs the rest of FBS. See
// src/lib/types/api.generated.ts's `team_returning_production` Row for the
// full generated shape (every column nullable there, including team/season)
// -- kept hand-typed here narrowing team/season non-null (grain columns
// guaranteed by the view whenever a (team, season) row exists at all), while
// every PPA/pct/usage/rank column stays nullable: this is an offseason-
// strength signal, so the current season's row is legitimately absent until
// the roster build runs (normal early in the season, not an error state),
// and even a present row can have null splits with zero qualifying returners.
// ---------------------------------------------------------------------------
export interface ReturningProduction {
  team: string
  season: number
  conference: string | null
  total_ppa: number | null
  total_passing_ppa: number | null
  total_receiving_ppa: number | null
  total_rushing_ppa: number | null
  returning_ppa_pct: number | null
  returning_passing_ppa_pct: number | null
  returning_receiving_ppa_pct: number | null
  returning_rushing_ppa_pct: number | null
  usage: number | null
  passing_usage: number | null
  receiving_usage: number | null
  rushing_usage: number | null
  returning_rank: number | null
}

// Get a team's season returning-production profile from the contracted
// api.team_returning_production view. Returns null on error/no row -- an
// offseason-strength signal, so a null current-season row is normal early in
// the season (before the roster build has run), never an error state.
export const getReturningProduction = cache(async (team: string, season: number): Promise<ReturningProduction | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('team_returning_production')
    .select('team, season, conference, total_ppa, total_passing_ppa, total_receiving_ppa, total_rushing_ppa, returning_ppa_pct, returning_passing_ppa_pct, returning_receiving_ppa_pct, returning_rushing_ppa_pct, usage, passing_usage, receiving_usage, rushing_usage, returning_rank')
    .eq('team', team)
    .eq('season', season)
    .maybeSingle()

  if (error || !data) return null

  return data as ReturningProduction
})

// ---------------------------------------------------------------------------
// api.transfer_portal_impact -- one row per (team, season): transfer counts,
// incoming talent, prior/current win + SP+ context, portal dependency, and
// league-wide percentile ranks for net transfers / win delta / portal
// dependency. Every column nullable in the generated Row (including
// team/season) -- kept hand-typed here with the same narrowing rationale as
// ReturningProduction above (grain non-null when a row exists at all; every
// count/rating/delta/percentile column stays nullable).
// ---------------------------------------------------------------------------
export interface TransferPortalImpact {
  team: string
  season: number
  conference: string | null
  transfers_in: number | null
  transfers_out: number | null
  net_transfers: number | null
  avg_incoming_stars: number | null
  avg_incoming_rating: number | null
  incoming_high_stars: number | null
  prior_season_wins: number | null
  prior_season_sp_rating: number | null
  current_wins: number | null
  current_sp_rating: number | null
  win_delta: number | null
  sp_delta: number | null
  portal_dependency: number | null
  win_delta_per_transfer_in: number | null
  net_transfers_pctl: number | null
  win_delta_pctl: number | null
  portal_dependency_pctl: number | null
}

// Get a team's season transfer-portal impact profile (counts, win/SP+
// context, and league-wide percentiles) from the contracted
// api.transfer_portal_impact view. Returns null on error/no row -- normal
// for teams/seasons the portal-impact build hasn't covered.
export const getTransferPortalImpact = cache(async (team: string, season: number): Promise<TransferPortalImpact | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('transfer_portal_impact')
    .select('team, season, conference, transfers_in, transfers_out, net_transfers, avg_incoming_stars, avg_incoming_rating, incoming_high_stars, prior_season_wins, prior_season_sp_rating, current_wins, current_sp_rating, win_delta, sp_delta, portal_dependency, win_delta_per_transfer_in, net_transfers_pctl, win_delta_pctl, portal_dependency_pctl')
    .eq('team', team)
    .eq('season', season)
    .maybeSingle()

  if (error || !data) return null

  return data as TransferPortalImpact
})
