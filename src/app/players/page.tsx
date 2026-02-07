import type { Metadata } from 'next'
import { getPlayerSeasonLeaders, getLeaderboardSeasons } from '@/lib/queries/players'
import { CURRENT_SEASON } from '@/lib/queries/constants'
import { FBS_CONFERENCES } from '@/lib/queries/shared'
import { PlayersClient } from '@/components/players/PlayersClient'

export const metadata: Metadata = {
  title: 'Player Leaderboards | CFB Team 360',
  description: 'College football statistical leaders — passing, rushing, receiving, and defense',
}

export default async function PlayersPage() {
  const [initialLeaders, availableSeasons] = await Promise.all([
    getPlayerSeasonLeaders(CURRENT_SEASON, 'passing'),
    getLeaderboardSeasons(),
  ])

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Players
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          Statistical leaders and player profiles across college football
        </p>
      </header>

      <PlayersClient
        initialLeaders={initialLeaders}
        initialSeason={CURRENT_SEASON}
        initialCategory="passing"
        availableSeasons={availableSeasons}
        conferences={[...FBS_CONFERENCES]}
      />
    </div>
  )
}
