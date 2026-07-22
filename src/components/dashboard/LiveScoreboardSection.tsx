import { getLiveScoreboard } from '@/lib/queries/live'
import { LiveScoreboardWidget } from './LiveScoreboardWidget'

// Thin async server wrapper: fetches the current slate server-side (an
// empty result is the normal off-window state, see src/lib/queries/live.ts)
// and hands it to the client widget as initialGames, which decides
// visibility/polling from there. Kept separate from LiveScoreboardWidget.tsx
// because that file is 'use client' and can't itself export a server
// component.
export async function LiveScoreboardSection() {
  const games = await getLiveScoreboard()
  return <LiveScoreboardWidget initialGames={games} />
}
