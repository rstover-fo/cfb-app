/**
 * Fixtures matching the row shapes queried by src/lib/queries/conferences.ts.
 * Authoritative column definitions: /workspace/cfb-database's
 * src/schemas/api/018_conference_comparison.sql (api.conference_comparison)
 * and src/schemas/public/010_conference_h2h_function.sql
 * (get_conference_head_to_head RPC).
 */
import type { ConferenceComparison, ConferenceHeadToHeadRow } from '@/lib/queries/conferences'

// ---------------------------------------------------------------------------
// api.conference_comparison
// ---------------------------------------------------------------------------

export function createConferenceComparisonRow(overrides: Partial<ConferenceComparison> = {}): ConferenceComparison {
  return {
    conference: 'SEC',
    season: 2025,
    member_count: 16,
    avg_wins: 8.4,
    avg_sp_rating: 15.2,
    avg_epa_per_play: 0.118,
    avg_recruiting_rank: 18.3,
    non_conf_win_pct: 0.712,
    avg_sp_pctl: 0.933,
    avg_epa_pctl: 0.9,
    avg_recruiting_pctl: 0.9,
    non_conf_win_pct_pctl: 0.867,
    ...overrides,
  }
}

/** Three conferences, pre-sorted strongest-first by avg_sp_rating (matches the query's order). */
export function createConferenceComparisonRows(): ConferenceComparison[] {
  return [
    createConferenceComparisonRow(),
    createConferenceComparisonRow({
      conference: 'Big Ten',
      avg_wins: 8.1,
      avg_sp_rating: 13.6,
      avg_epa_per_play: 0.101,
      avg_recruiting_rank: 22.1,
      non_conf_win_pct: 0.68,
      avg_sp_pctl: 0.867,
      avg_epa_pctl: 0.833,
      avg_recruiting_pctl: 0.833,
      non_conf_win_pct_pctl: 0.8,
    }),
    createConferenceComparisonRow({
      conference: 'Big 12',
      member_count: 14,
      avg_wins: 6.9,
      avg_sp_rating: 4.8,
      avg_epa_per_play: 0.042,
      avg_recruiting_rank: 41.5,
      non_conf_win_pct: 0.53,
      avg_sp_pctl: 0.4,
      avg_epa_pctl: 0.367,
      avg_recruiting_pctl: 0.367,
      non_conf_win_pct_pctl: 0.433,
    }),
  ]
}

// ---------------------------------------------------------------------------
// get_conference_head_to_head RPC -- season-by-season rows, always oriented
// to the caller's conf1/conf2 argument order.
// ---------------------------------------------------------------------------

export function createConferenceHeadToHeadRow(overrides: Partial<ConferenceHeadToHeadRow> = {}): ConferenceHeadToHeadRow {
  return {
    conference_1: 'SEC',
    conference_2: 'Big Ten',
    season: 2025,
    total_games: 3,
    conf1_wins: 2,
    conf2_wins: 1,
    ties: 0,
    conf1_win_pct: 0.6667,
    avg_point_diff: 4.2,
    ...overrides,
  }
}

/** Three seasons of SEC-vs-Big Ten meetings, newest first (matches the RPC's ORDER BY season DESC). */
export function createConferenceHeadToHeadRows(): ConferenceHeadToHeadRow[] {
  return [
    createConferenceHeadToHeadRow(),
    createConferenceHeadToHeadRow({
      season: 2024,
      total_games: 2,
      conf1_wins: 1,
      conf2_wins: 1,
      ties: 0,
      conf1_win_pct: 0.5,
      avg_point_diff: -1.5,
    }),
    createConferenceHeadToHeadRow({
      season: 2023,
      total_games: 4,
      conf1_wins: 3,
      conf2_wins: 1,
      ties: 0,
      conf1_win_pct: 0.75,
      avg_point_diff: 6.1,
    }),
  ]
}
