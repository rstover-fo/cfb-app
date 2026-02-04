import { getGames, getCurrentWeek, getAvailableWeeks, CURRENT_SEASON } from '@/lib/queries/games'
import { getFBSTeams, FBS_CONFERENCES } from '@/lib/queries/shared'
import { GamesList } from '@/components/GamesList'

export default async function GamesPage() {
  // Fetch initial data on the server
  const [currentWeek, availableWeeks, teams] = await Promise.all([
    getCurrentWeek(CURRENT_SEASON),
    getAvailableWeeks(CURRENT_SEASON),
    getFBSTeams(),
  ])

  // Fetch games for the current week
  const initialGames = await getGames({
    season: CURRENT_SEASON,
    week: currentWeek,
  })

  return (
    <div className="p-8">
      {/* Page Header */}
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Games
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          Browse completed FBS games by week, conference, or team
        </p>
      </header>

      {/* Games List with Filters */}
      <GamesList
        initialGames={initialGames}
        initialWeek={currentWeek}
        season={CURRENT_SEASON}
        availableWeeks={availableWeeks}
        conferences={[...FBS_CONFERENCES]}
        teams={teams}
      />
    </div>
  )
}
