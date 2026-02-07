'use server'

import { getPlayerSeasonLeaders, searchPlayers } from '@/lib/queries/players'
import type { LeaderCategory } from '@/lib/types/database'

// Re-export types for client components
export type { PlayerLeaderRow, LeaderCategory, PlayerSearchResult } from '@/lib/types/database'

export async function fetchPlayerSeasonLeaders(
  season: number,
  category: LeaderCategory,
  conference: string | null = null,
  limit: number = 50
) {
  return getPlayerSeasonLeaders(season, category, conference, limit)
}

export async function fetchSearchPlayers(query: string) {
  return searchPlayers(query)
}
