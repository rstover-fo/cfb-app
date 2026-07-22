import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getTeamLookup } from './shared'
import { CURRENT_SEASON } from './constants'

// ---------------------------------------------------------------------------
// Row shape for the contracted api.coach_records view (career-at-school
// grain: one row per coach x team). Hand-typed because the generated
// Supabase types only cover the `public` schema -- see matchups.ts's
// GameDetailRow for the established pattern.
// TODO: regenerate supabase types to include `api` schema views/tables
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
