'use server'

import { getGames, type GamesFilter, type GameWithTeams } from '@/lib/queries/games'

export async function fetchGames(filter: GamesFilter): Promise<GameWithTeams[]> {
  return getGames(filter)
}
