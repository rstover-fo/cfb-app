import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Team, TeamSeasonEpa, TeamStyleProfile } from '@/lib/types/database'
import type { ApiSchema } from '@/lib/types/api.generated'
import { teamNameToSlug } from '@/lib/utils'

// Fetch all FBS teams for the /compare route's team pickers. Filtered via
// `classification` (not conference-name matching -- see FBS_CONFERENCES in
// shared.ts for why that approach leaks FCS schools, e.g. "Ohio State
// Newark" turning up as a compare-able team). NOTE: the team detail page's
// own inline Compare tab (src/app/teams/[slug]/page.tsx) still fetches
// `teams_with_logos` unfiltered -- that query doubles as the source for
// schedule-opponent logos (which legitimately include FCS opponents), so
// it wasn't narrowed here; splitting it into two queries is out of scope
// for this fix.
export const getAllTeams = cache(async (): Promise<Team[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('teams_with_logos')
    .select('*')
    .eq('classification', 'fbs')
    .order('school')
  return (data as Team[]) || []
})

// Resolve a team-page slug (see teamNameToSlug) back to its Team row. Pure
// lookup, no network call -- callers already have `allTeams` loaded. Used to
// turn the /compare route's ?t1=&t2= query params into real teams.
export function resolveTeamBySlug(allTeams: Team[], slug: string | undefined): Team | null {
  if (!slug) return null
  return allTeams.find(t => teamNameToSlug(t.school ?? '') === slug) ?? null
}

export interface CompareTeamMetrics {
  metrics: TeamSeasonEpa | null
  style: TeamStyleProfile | null
}

// Fetch current-season EPA + style metrics for one side of a comparison.
// Mirrors the data CompareView already consumes on the team detail page's
// Compare tab (team_epa_season / team_style_profile, both public views).
export const getCompareTeamMetrics = cache(async (school: string, season: number): Promise<CompareTeamMetrics> => {
  const supabase = await createClient()

  const [metricsResult, styleResult] = await Promise.all([
    supabase.from('team_epa_season').select('*').eq('team', school).eq('season', season).single(),
    supabase.from('team_style_profile').select('*').eq('team', school).eq('season', season).single(),
  ])

  return {
    metrics: (metricsResult.data as TeamSeasonEpa | null) ?? null,
    style: (styleResult.data as TeamStyleProfile | null) ?? null,
  }
})

// Row shape for api.team_history (contracted view; multi-season trends).
// Adopted from src/lib/types/api.generated.ts, which mirrors
// /workspace/cfb-database/src/schemas/api/002_team_history.sql column-for-
// column -- this query selects every one of them (TEAM_HISTORY_COLUMNS
// below), so no Pick narrowing is needed. `team`/`season` are narrowed
// non-null (the generated Row marks every view column nullable by
// convention) since every row here comes from a `.eq('team', school)`
// query and the chronological sort below (`a.season - b.season`) requires
// season to be a real number.
export type TeamHistoryRow = Omit<ApiSchema['Views']['team_history']['Row'], 'team' | 'season'> & {
  team: string
  season: number
}

// Explicit columns - NOT select('*'). Declared `as const` so Supabase can
// infer a literal return type instead of falling back to a generic error row.
const TEAM_HISTORY_COLUMNS = `
  team,
  season,
  conference,
  games,
  wins,
  losses,
  conf_wins,
  conf_losses,
  ppg,
  opp_ppg,
  avg_margin,
  sp_rating,
  sp_rank,
  elo,
  fpi,
  epa_per_play,
  epa_tier,
  success_rate,
  explosiveness,
  total_plays,
  recruiting_rank,
  recruiting_points
` as const

// Default number of most-recent seasons to pull for the /compare route's
// historical-trend section.
const DEFAULT_HISTORY_SEASONS = 8

// Fetch multi-season history for a team from the contracted api.team_history
// view, returned in chronological (ascending season) order for charting/table
// display.
export const getTeamHistory = cache(async (
  school: string,
  seasonLimit: number = DEFAULT_HISTORY_SEASONS
): Promise<TeamHistoryRow[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('api')
    .from('team_history')
    .select(TEAM_HISTORY_COLUMNS)
    .eq('team', school)
    .order('season', { ascending: false })
    .limit(seasonLimit)

  if (error || !data) {
    console.error('[compare] getTeamHistory error:', error)
    return []
  }

  return (data as TeamHistoryRow[]).slice().sort((a, b) => a.season - b.season)
})
