import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// Re-export constants for server components
export { CURRENT_SEASON, REGULAR_SEASON_MAX_WEEK, POSTSEASON_MIN_WEEK } from './constants'

// FBS conference names. NOT used to filter teams out of FBS-only data sets
// any more -- `.in('conference', FBS_CONFERENCES)` demonstrably leaked FCS
// schools into prod (e.g. "Ohio State Newark", North Dakota State on the
// homepage Stat Leaders). Independents/reclassifying/renamed conferences
// fall outside this allowlist, and a school's `conference` column doesn't
// reliably imply its `classification` (fbs/fcs) -- filter on the
// `classification` column instead (see getTeamLookup below and
// src/lib/queries/compare.ts's getAllTeams). Still used elsewhere purely as
// a static list of conference names for filter-dropdown UI (src/app/games,
// src/app/players) where leaking a team isn't a concern.
export const FBS_CONFERENCES = [
  'ACC',
  'American Athletic',
  'Big 12',
  'Big Ten',
  'Conference USA',
  'FBS Independents',
  'Mid-American',
  'Mountain West',
  'Pac-12',
  'SEC',
  'Sun Belt'
] as const

export type FBSConference = typeof FBS_CONFERENCES[number]

// Team lookup data shape
export interface TeamLookupData {
  logo: string | null
  color: string | null
  conference: string | null
}

// Shared helper to get FBS team lookup (cached per request). Filters on
// `classification`, not conference name -- see the FBS_CONFERENCES comment
// above for why the allowlist approach leaked FCS teams.
export const getTeamLookup = cache(async (): Promise<Map<string, TeamLookupData>> => {
  const supabase = await createClient()
  const { data: teamsData } = await supabase
    .from('teams_with_logos')
    .select('school, logo, color, conference')
    .eq('classification', 'fbs')

  const teamLookup = new Map<string, TeamLookupData>()
  teamsData?.forEach(t => teamLookup.set(t.school, { logo: t.logo, color: t.color, conference: t.conference }))
  return teamLookup
})

// Get all FBS team names (sorted alphabetically)
export const getFBSTeams = cache(async (): Promise<string[]> => {
  const teamLookup = await getTeamLookup()
  return Array.from(teamLookup.keys()).sort()
})
