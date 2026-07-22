'use server'

import { getConferenceHeadToHead } from '@/lib/queries/conferences'

// Re-export types for client components to import from this module
// This avoids client components importing from server-only modules
export type { ConferenceComparison, ConferenceHeadToHeadRow } from '@/lib/queries/conferences'

export async function fetchConferenceHeadToHead(
  conf1: string,
  conf2: string,
  seasonStart?: number,
  seasonEnd?: number
): Promise<import('@/lib/queries/conferences').ConferenceHeadToHeadRow[]> {
  return getConferenceHeadToHead(conf1, conf2, seasonStart, seasonEnd)
}
