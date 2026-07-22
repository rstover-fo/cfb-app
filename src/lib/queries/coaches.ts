import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { ApiSchema } from '@/lib/types/api.generated'
import { getTeamLookup } from './shared'
import { CURRENT_SEASON } from './constants'

// ---------------------------------------------------------------------------
// Row shape for the contracted api.coach_records view (career-at-school
// grain: one row per coach x team). Column names/order match
// src/lib/types/api.generated.ts's `coach_records` Row exactly (that Row is
// all-nullable per the generated-types convention for views; kept hand-typed
// non-null here since this query selects every column with no optional
// projection, matching the established pattern in matchups.ts's
// GameDetailRow). api.coach_records is "Pending deploy" per cfb-database's
// SCHEMA_CONTRACT.md as of 2026-07-22 -- getCoachRecords already degrades to
// [] on any query error, so no special-casing is needed here for that.
// ---------------------------------------------------------------------------
export interface CoachRecordRow {
  coach_name: string
  first_name: string | null
  last_name: string | null
  team: string
  first_season: number
  last_season: number
  seasons_count: number
  games: number
  wins: number
  losses: number
  ties: number
  win_pct: number
  ats_games: number
  ats_wins: number
  ats_losses: number
  ats_pushes: number
  ats_win_pct: number | null
  seasons_with_ats_data: number
}

// Caller-facing type: the raw view row plus team logo/color, resolved from
// getTeamLookup() since api.coach_records carries no logo of its own.
export interface CoachRecord extends CoachRecordRow {
  logo: string | null
  color: string | null
}

export type CoachSortKey = 'win_pct' | 'ats_win_pct'

export interface GetCoachRecordsParams {
  sortBy: CoachSortKey
  minGames?: number
  /** Only coaches whose most recent season at the school is the current
   *  season. Like the FBS restriction, this must be applied server-side
   *  (before .limit) -- filtering the top-100 all-time list client-side
   *  would drop active coaches ranked below the all-time cutoff. */
  activeOnly?: boolean
}

// Tiny samples (a coach who went 1-0 in an interim game) would otherwise
// dominate a naive win% sort -- filter those out server-side by default.
const DEFAULT_MIN_GAMES = 24
const COACH_RECORDS_LIMIT = 100

// Get coach career-at-school records, ranked by SU or ATS win%. api.coach_records
// has no classification column (unlike teams_with_logos), so the FBS restriction
// is pushed into the query via .in('team', <FBS team names from the lookup>).
// It must apply BEFORE .limit(): a client-side-only filter would let non-FBS
// coaches in the overall top-100 consume the cap and silently drop eligible
// FBS coaches ranked just below them.
export const getCoachRecords = cache(async ({
  sortBy,
  minGames,
  activeOnly,
}: GetCoachRecordsParams): Promise<CoachRecord[]> => {
  const supabase = await createClient()
  const teamLookup = await getTeamLookup()
  const fbsTeams = Array.from(teamLookup.keys())

  let query = supabase
    .schema('api')
    .from('coach_records')
    .select(
      'coach_name, first_name, last_name, team, first_season, last_season, seasons_count, games, wins, losses, ties, win_pct, ats_games, ats_wins, ats_losses, ats_pushes, ats_win_pct, seasons_with_ats_data'
    )
    .in('team', fbsTeams)
    .gte('games', minGames ?? DEFAULT_MIN_GAMES)

  if (activeOnly) {
    query = query.gte('last_season', CURRENT_SEASON)
  }

  const { data, error } = await query
    .order(sortBy, { ascending: false, nullsFirst: false })
    .limit(COACH_RECORDS_LIMIT)

  if (error || !data) return []

  return (data as CoachRecordRow[])
    .filter(row => teamLookup.has(row.team))
    .map(row => {
      const teamData = teamLookup.get(row.team)
      return {
        ...row,
        logo: teamData?.logo ?? null,
        color: teamData?.color ?? null,
      }
    })
})

// ---------------------------------------------------------------------------
// Row shape for the contracted api.coaching_history view (per-tenure grain:
// one row per coach x school-tenure -- distinct from api.coach_records'
// single career-at-school row, so a coach who left and later returned to the
// same school gets two rows here, not one). Adopted from
// src/lib/types/api.generated.ts's `coaching_history` Row (every column
// nullable there, per the generated-types convention for views). Grain
// columns (first_name, last_name, team, tenure_start, tenure_end,
// seasons_count) are narrowed non-null here: every row this query returns is
// filtered on first_name/last_name and, by definition of "a tenure," carries
// a real team and date range. The remaining metrics (talent ranks, bowl
// record, conference record) stay nullable -- genuinely absent for some
// tenures (e.g. pre-recruiting-rankings-era coaching stints have null
// inherited_talent_rank/year3_talent_rank; see the UI's "only when both
// non-null" rule for the talent-improvement line).
// ---------------------------------------------------------------------------
export type CoachingTenure = Pick<
  ApiSchema['Views']['coaching_history']['Row'],
  | 'total_wins'
  | 'total_losses'
  | 'win_pct'
  | 'conf_wins'
  | 'conf_losses'
  | 'conf_win_pct'
  | 'bowl_games'
  | 'bowl_wins'
  | 'inherited_talent_rank'
  | 'year3_talent_rank'
  | 'talent_improvement'
  | 'is_active'
> & {
  first_name: string
  last_name: string
  team: string
  tenure_start: number
  tenure_end: number
  seasons_count: number
}

// Explicit columns - NOT select('*'). Declared `as const` so Supabase can
// infer a literal return type instead of falling back to a generic error row.
const COACHING_HISTORY_COLUMNS = `
  first_name,
  last_name,
  team,
  tenure_start,
  tenure_end,
  seasons_count,
  total_wins,
  total_losses,
  win_pct,
  conf_wins,
  conf_losses,
  conf_win_pct,
  bowl_games,
  bowl_wins,
  inherited_talent_rank,
  year3_talent_rank,
  talent_improvement,
  is_active
` as const

// Get a coach's full per-tenure coaching history (one row per school stint),
// ordered chronologically by tenure_start. api.coaching_history carries no
// coach-id column to join on -- first_name + last_name is the only key it
// shares with api.coach_records (coach_records' own coach_name column is a
// single "First Last" display string, not reliably splittable back into
// parts, so the caller must pass through coach_records' first_name/
// last_name columns directly rather than parsing coach_name). Two coaches
// who share an exact first+last name would collide here; no such collision
// exists in current FBS data, and api.coach_records has the identical
// limitation, so this matches the established join strategy rather than
// introducing a new one. Returns [] on error or no rows -- normal for a
// coach with no history rows yet.
export const getCoachingHistory = cache(async (
  firstName: string,
  lastName: string
): Promise<CoachingTenure[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('coaching_history')
    .select(COACHING_HISTORY_COLUMNS)
    .eq('first_name', firstName)
    .eq('last_name', lastName)
    .order('tenure_start', { ascending: true })

  if (error || !data) return []

  return data as CoachingTenure[]
})
