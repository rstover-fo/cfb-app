/**
 * Fixtures matching the api.* view row shapes queried by
 * src/lib/queries/coaches.ts: api.coach_records (career-at-school grain)
 * and api.coaching_history (per-tenure grain).
 */
import type { CoachRecordRow, CoachingTenure } from '../../coaches'

// ---------------------------------------------------------------------------
// api.coach_records -- one row per (coach, school), career totals.
// ---------------------------------------------------------------------------

export function createCoachRecordRow(overrides: Partial<CoachRecordRow> = {}): CoachRecordRow {
  return {
    coach_name: 'Bob Stoops',
    first_name: 'Bob',
    last_name: 'Stoops',
    team: 'Oklahoma',
    first_season: 1999,
    last_season: 2016,
    seasons_count: 18,
    games: 200,
    wins: 190,
    losses: 48,
    ties: 0,
    win_pct: 0.798,
    ats_games: 150,
    ats_wins: 80,
    ats_losses: 65,
    ats_pushes: 5,
    ats_win_pct: 0.552,
    seasons_with_ats_data: 12,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// api.coaching_history -- one row per (coach, school, tenure). Two tenures
// for "Bob Stoops": an earlier Florida stint with no recruiting-rank data
// (pre-dates the ranking era) and the long, well-covered Oklahoma tenure,
// in tenure_start-ascending order to match getCoachingHistory's default sort.
// ---------------------------------------------------------------------------

export function createCoachingTenureRow(overrides: Partial<CoachingTenure> = {}): CoachingTenure {
  return {
    first_name: 'Bob',
    last_name: 'Stoops',
    team: 'Oklahoma',
    tenure_start: 1999,
    tenure_end: 2016,
    seasons_count: 18,
    total_wins: 190,
    total_losses: 48,
    win_pct: 0.798,
    conf_wins: 112,
    conf_losses: 28,
    conf_win_pct: 0.8,
    bowl_games: 15,
    bowl_wins: 9,
    inherited_talent_rank: 34,
    year3_talent_rank: 12,
    talent_improvement: 22,
    is_active: false,
    ...overrides,
  }
}

/** Two Stoops tenures, ascending tenure_start: Florida (no talent data) then Oklahoma. */
export function createCoachingTenureRows(): CoachingTenure[] {
  return [
    createCoachingTenureRow({
      team: 'Florida',
      tenure_start: 1996,
      tenure_end: 1998,
      seasons_count: 3,
      total_wins: 20,
      total_losses: 13,
      win_pct: 0.606,
      conf_wins: 12,
      conf_losses: 9,
      conf_win_pct: 0.571,
      bowl_games: 2,
      bowl_wins: 1,
      inherited_talent_rank: null,
      year3_talent_rank: null,
      talent_improvement: null,
      is_active: false,
    }),
    createCoachingTenureRow({ team: 'Oklahoma', tenure_start: 1999, tenure_end: 2016, is_active: false }),
  ]
}
