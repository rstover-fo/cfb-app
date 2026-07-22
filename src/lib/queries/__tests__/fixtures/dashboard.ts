/**
 * Fixtures for the marts views queried by getStandings() in
 * src/lib/queries/dashboard.ts: team_epa_season (public), team_special_teams_sos
 * (public), and api.team_history (wins/losses).
 */

export interface TeamEpaRankRow {
  team: string
  off_epa_rank: number | null
  def_epa_rank: number | null
}

export function createTeamEpaRankRow(overrides: Partial<TeamEpaRankRow> = {}): TeamEpaRankRow {
  return { team: 'Oklahoma', off_epa_rank: 5, def_epa_rank: 10, ...overrides }
}

export interface TeamSpecialTeamsRow {
  team: string
  sp_st_rating: number | null
}

export function createTeamSpecialTeamsRow(
  overrides: Partial<TeamSpecialTeamsRow> = {}
): TeamSpecialTeamsRow {
  return { team: 'Oklahoma', sp_st_rating: 1.5, ...overrides }
}

export interface TeamHistoryRecordRow {
  team: string
  wins: number
  losses: number
}

export function createTeamHistoryRecordRow(
  overrides: Partial<TeamHistoryRecordRow> = {}
): TeamHistoryRecordRow {
  return { team: 'Oklahoma', wins: 9, losses: 1, ...overrides }
}

/**
 * Raw (snake_case) row shape returned by the public.get_data_freshness() RPC,
 * consumed by getDataFreshness() in src/lib/queries/dashboard.ts.
 */
export interface RawDataFreshnessRow {
  schema_name: string
  table_name: string
  row_count: number
  expected_refresh_frequency: string
  days_since_activity: number | null
  is_stale: boolean
}

export function createRawDataFreshnessRow(
  overrides: Partial<RawDataFreshnessRow> = {}
): RawDataFreshnessRow {
  return {
    schema_name: 'marts',
    table_name: 'team_epa_season',
    row_count: 134,
    expected_refresh_frequency: 'daily',
    days_since_activity: 0.5,
    is_stale: false,
    ...overrides,
  }
}

/** Two fresh tables and one stale, null-activity table -- exercises both the
 *  "pick the minimum" and "ignore nulls" branches of getFreshestUpdateDays(). */
export function createDataFreshnessScenario(): RawDataFreshnessRow[] {
  return [
    createRawDataFreshnessRow({ table_name: 'team_epa_season', days_since_activity: 0.125, is_stale: false }),
    createRawDataFreshnessRow({ table_name: 'games', days_since_activity: 2, is_stale: false }),
    createRawDataFreshnessRow({ table_name: 'recruiting', days_since_activity: null, expected_refresh_frequency: 'yearly', is_stale: true }),
  ]
}

/** Two FBS teams with full metrics + records, matching the shared team lookup fixture. */
export function createStandingsScenario() {
  return {
    metrics: [
      createTeamEpaRankRow({ team: 'Oklahoma', off_epa_rank: 5, def_epa_rank: 10 }),
      createTeamEpaRankRow({ team: 'Texas', off_epa_rank: 2, def_epa_rank: 3 }),
      // Alabama has metrics but no special-teams or record row -> should default gracefully
      createTeamEpaRankRow({ team: 'Alabama', off_epa_rank: 20, def_epa_rank: 25 }),
    ],
    specialTeams: [
      createTeamSpecialTeamsRow({ team: 'Oklahoma', sp_st_rating: 1.5 }),
      createTeamSpecialTeamsRow({ team: 'Texas', sp_st_rating: 2.8 }),
    ],
    records: [
      createTeamHistoryRecordRow({ team: 'Oklahoma', wins: 9, losses: 1 }),
      createTeamHistoryRecordRow({ team: 'Texas', wins: 11, losses: 0 }),
    ],
  }
}
