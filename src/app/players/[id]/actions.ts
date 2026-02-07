'use server'

import { getPlayerDetail, getPlayerGameLog, getPlayerPercentiles } from '@/lib/queries/players'

// Re-export types for client components to import from this module
export type { PlayerProfile, PlayerPercentiles, PlayerGameLogEntry } from '@/lib/types/database'

export async function fetchPlayerDetail(playerId: string, season?: number) {
  return getPlayerDetail(playerId, season)
}

export async function fetchPlayerGameLog(playerId: string, season: number) {
  return getPlayerGameLog(playerId, season)
}

export async function fetchPlayerPercentiles(playerId: string, season: number) {
  return getPlayerPercentiles(playerId, season)
}
