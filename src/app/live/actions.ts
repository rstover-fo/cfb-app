'use server'

import { getLiveScoreboard } from '@/lib/queries/live'

// Re-export the type for client components to import from this module.
// This avoids client components importing from server-only query modules
// (see games/actions.ts for the same convention). There is no page.tsx
// under this route -- this is an actions-only module backing the
// dashboard's LiveScoreboardWidget (client-side polling refetch).
export type { LiveScoreboardGame } from '@/lib/queries/live'

export async function fetchLiveScoreboard(): Promise<import('@/lib/queries/live').LiveScoreboardGame[]> {
  return getLiveScoreboard()
}
