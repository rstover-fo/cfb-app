'use server'

import { getGames, getAvailableWeeks, type GamesFilter, type GameWithTeams } from '@/lib/queries/games'

export async function fetchGames(filter: GamesFilter): Promise<GameWithTeams[]> {
  return getGames(filter)
}

export async function fetchAvailableWeeks(season: number): Promise<number[]> {
  return getAvailableWeeks(season)
}
