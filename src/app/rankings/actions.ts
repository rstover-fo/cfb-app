'use server'

import {
  getRankingsForWeek,
  getRankingsAllWeeks,
  getAvailablePolls,
  getLatestRankingWeek,
} from '@/lib/queries/rankings'

// Re-export types for client components
export type { EnrichedPollRanking, PollRanking } from '@/lib/types/database'

export async function fetchRankingsForWeek(season: number, week: number, poll: string) {
  return getRankingsForWeek(season, week, poll)
}

export async function fetchRankingsAllWeeks(season: number, poll: string) {
  return getRankingsAllWeeks(season, poll)
}

export async function fetchAvailablePolls(season: number) {
  return getAvailablePolls(season)
}

export async function fetchLatestRankingWeek(season: number, poll: string) {
  return getLatestRankingWeek(season, poll)
}
