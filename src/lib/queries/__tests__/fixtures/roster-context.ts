/**
 * Fixtures matching the api.* view row shapes queried by
 * src/lib/queries/roster-context.ts. Authoritative column definitions:
 * /workspace/cfb-database/src/schemas/marts/031_returning_production.sql,
 * marts.transfer_portal_impact.
 */

// ---------------------------------------------------------------------------
// api.team_returning_production -- one row per (team, season). Full profile
// with every PPA/pct/usage/rank column populated (a well-covered season).
// ---------------------------------------------------------------------------

export interface ReturningProductionRow {
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

export function createReturningProductionRow(overrides: Partial<ReturningProductionRow> = {}): ReturningProductionRow {
  return {
    team: 'Ohio State',
    season: 2025,
    conference: 'Big Ten',
    total_ppa: 142.7,
    total_passing_ppa: 61.2,
    total_receiving_ppa: 48.9,
    total_rushing_ppa: 32.6,
    returning_ppa_pct: 0.612,
    returning_passing_ppa_pct: 0.548,
    returning_receiving_ppa_pct: 0.671,
    returning_rushing_ppa_pct: 0.593,
    usage: 0.588,
    passing_usage: 0.521,
    receiving_usage: 0.634,
    rushing_usage: 0.577,
    returning_rank: 34,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// api.transfer_portal_impact -- one row per (team, season). Full profile
// with every count/rating/delta/percentile column populated.
// ---------------------------------------------------------------------------

export interface TransferPortalImpactRow {
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

export function createTransferPortalImpactRow(overrides: Partial<TransferPortalImpactRow> = {}): TransferPortalImpactRow {
  return {
    team: 'Ohio State',
    season: 2025,
    conference: 'Big Ten',
    transfers_in: 14,
    transfers_out: 9,
    net_transfers: 5,
    avg_incoming_stars: 3.4,
    avg_incoming_rating: 0.891,
    incoming_high_stars: 3,
    prior_season_wins: 8,
    prior_season_sp_rating: 21.3,
    current_wins: 11,
    current_sp_rating: 27.8,
    win_delta: 3,
    sp_delta: 6.5,
    portal_dependency: 0.284,
    win_delta_per_transfer_in: 0.214,
    net_transfers_pctl: 0.81,
    win_delta_pctl: 0.88,
    portal_dependency_pctl: 0.42,
    ...overrides,
  }
}
