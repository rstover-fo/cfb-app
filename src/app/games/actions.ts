'use server'

import { getGames, getAvailableWeeks, getDefaultWeek } from '@/lib/queries/games'

// Re-export types for client components to import from this module
// This avoids client components importing from server-only modules
export type { GamesFilter, GameWithTeams, SeasonPhase } from '@/lib/queries/games'

export async function fetchGames(filter: import('@/lib/queries/games').GamesFilter): Promise<import('@/lib/queries/games').GameWithTeams[]> {
  return getGames(filter)
}

export async function fetchAvailableWeeks(season: number): Promise<number[]> {
  return getAvailableWeeks(season)
}

export async function fetchDefaultWeek(season: number): Promise<number> {
  return getDefaultWeek(season)
}
