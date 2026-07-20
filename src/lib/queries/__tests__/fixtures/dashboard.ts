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
