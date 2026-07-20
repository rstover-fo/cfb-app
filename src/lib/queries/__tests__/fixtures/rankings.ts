/**
 * Fixtures matching the api.* view row shapes queried by src/lib/queries/rankings.ts.
 * Authoritative column definitions: /workspace/cfb-database/src/schemas/api/*.sql
 * (021_poll_rankings.sql, 002_team_history.sql).
 */

// ---------------------------------------------------------------------------
// api.poll_rankings
// ---------------------------------------------------------------------------

export interface PollRankingRow {
  rank: number
  school: string
  conference: string
  first_place_votes: number
  points: number
  season: number
  week: number
  poll: string
}

export function createPollRankingRow(overrides: Partial<PollRankingRow> = {}): PollRankingRow {
  return {
    rank: 1,
    school: 'Oklahoma',
    conference: 'SEC',
    first_place_votes: 0,
    points: 1500,
    season: 2025,
    week: 10,
    poll: 'AP Top 25',
    ...overrides,
  }
}

/**
 * Current-week rankings with a duplicate school entry (Texas appears at rank
 * 4 and rank 7 — simulates a merge artifact) to exercise the best-rank dedupe.
 */
export function createCurrentWeekPollRows(): PollRankingRow[] {
  return [
    createPollRankingRow({ rank: 1, school: 'Oklahoma', first_place_votes: 40, points: 1550 }),
    createPollRankingRow({ rank: 4, school: 'Texas', first_place_votes: 0, points: 1300 }),
    createPollRankingRow({ rank: 7, school: 'Texas', first_place_votes: 0, points: 1250 }), // duplicate, worse rank
    createPollRankingRow({ rank: 2, school: 'Ohio State', first_place_votes: 15, points: 1500 }),
  ]
}

/** Previous-week rankings: only `rank, school` are selected by getRankingsForWeek. */
export function createPrevWeekPollRows(): Pick<PollRankingRow, 'rank' | 'school'>[] {
  return [
    { rank: 3, school: 'Oklahoma' }, // moved 3 -> 1, movement = +2
    { rank: 6, school: 'Texas' },
    { rank: 6, school: 'Texas' }, // duplicate best-rank case in prev week too
    // Ohio State absent from prev week -> prev_rank should be null
  ]
}

// ---------------------------------------------------------------------------
// api.team_history — only `team, wins, losses` selected by getRankingsForWeek
// ---------------------------------------------------------------------------

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

export function createTeamHistoryRecordRows(): TeamHistoryRecordRow[] {
  return [
    createTeamHistoryRecordRow({ team: 'Oklahoma', wins: 9, losses: 1 }),
    createTeamHistoryRecordRow({ team: 'Texas', wins: 8, losses: 2 }),
    // Ohio State intentionally missing -> record should default to 0/0
  ]
}

// ---------------------------------------------------------------------------
// getRankingsAllWeeks — multi-week series with a per-week dedupe case
// ---------------------------------------------------------------------------

export function createAllWeeksPollRows(): PollRankingRow[] {
  return [
    // Week 8: Oklahoma #3
    createPollRankingRow({ rank: 3, school: 'Oklahoma', season: 2025, week: 8, poll: 'AP Top 25' }),
    createPollRankingRow({ rank: 5, school: 'Texas', season: 2025, week: 8, poll: 'AP Top 25' }),
    // Week 9: Oklahoma #2, duplicate Texas row (rank 4 and rank 8) — dedupe keeps rank 4
    createPollRankingRow({ rank: 2, school: 'Oklahoma', season: 2025, week: 9, poll: 'AP Top 25' }),
    createPollRankingRow({ rank: 4, school: 'Texas', season: 2025, week: 9, poll: 'AP Top 25' }),
    createPollRankingRow({ rank: 8, school: 'Texas', season: 2025, week: 9, poll: 'AP Top 25' }),
  ]
}
