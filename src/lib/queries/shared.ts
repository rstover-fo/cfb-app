import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// Re-export constants for server components
export { CURRENT_SEASON, REGULAR_SEASON_MAX_WEEK, POSTSEASON_MIN_WEEK } from './constants'

// FBS conferences for filtering
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

// Shared helper to get FBS team lookup (cached per request)
export const getTeamLookup = cache(async (): Promise<Map<string, TeamLookupData>> => {
  const supabase = await createClient()
  const { data: teamsData } = await supabase
    .from('teams_with_logos')
    .select('school, logo, color, conference')
    .in('conference', FBS_CONFERENCES as unknown as string[])

  const teamLookup = new Map<string, TeamLookupData>()
  teamsData?.forEach(t => teamLookup.set(t.school, { logo: t.logo, color: t.color, conference: t.conference }))
  return teamLookup
})

// Get all FBS team names (sorted alphabetically)
export const getFBSTeams = cache(async (): Promise<string[]> => {
  const teamLookup = await getTeamLookup()
  return Array.from(teamLookup.keys()).sort()
})
