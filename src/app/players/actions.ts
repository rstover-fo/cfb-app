'use server'

import { getPlayerSeasonLeaders, searchPlayers, getWepaLeaders, getUsageLeaders } from '@/lib/queries/players'
import type { LeaderCategory } from '@/lib/types/database'
import type { WepaCategory } from '@/lib/queries/players'

// Re-export types for client components
export type { PlayerLeaderRow, LeaderCategory, PlayerSearchResult } from '@/lib/types/database'
export type { WepaCategory, WepaLeader, UsageLeader } from '@/lib/queries/players'

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

export async function fetchWepaLeaders(
  season: number,
  category?: WepaCategory,
  limit: number = 25
) {
  return getWepaLeaders(season, category, limit)
}

export async function fetchUsageLeaders(season: number, limit: number = 25) {
  return getUsageLeaders(season, limit)
}
