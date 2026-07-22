'use server'

import { getCoachRecords, getCoachingHistory } from '@/lib/queries/coaches'

// Re-export types for client components to import from this module
// This avoids client components importing from server-only modules
export type { CoachRecord, CoachSortKey, GetCoachRecordsParams, CoachingTenure } from '@/lib/queries/coaches'

export async function fetchCoachRecords(params: import('@/lib/queries/coaches').GetCoachRecordsParams): Promise<import('@/lib/queries/coaches').CoachRecord[]> {
  return getCoachRecords(params)
}

// Fetched client-side on demand (dialog open), not server-rendered with the
// page -- per-coach tenure history is only needed once a coach row is
// clicked, so it isn't part of the initial page payload.
export async function fetchCoachingHistory(firstName: string, lastName: string): Promise<import('@/lib/queries/coaches').CoachingTenure[]> {
  return getCoachingHistory(firstName, lastName)
}
