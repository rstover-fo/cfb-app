import { getGames, getDefaultWeek, getAvailableWeeks, getAvailableSeasons } from '@/lib/queries/games'
import { getFBSTeams, FBS_CONFERENCES, getLatestSeason } from '@/lib/queries/shared'
import { GamesList } from '@/components/GamesList'

export default async function GamesPage() {
  // Fetch initial data on the server
  const [latestSeason, availableSeasons, teams] = await Promise.all([
    getLatestSeason(),
    getAvailableSeasons(),
    getFBSTeams(),
  ])

  // Fetch season-specific data
  const [defaultWeek, availableWeeks] = await Promise.all([
    getDefaultWeek(latestSeason),
    getAvailableWeeks(latestSeason),
  ])

  // Fetch games for the default week with regular phase
  const initialGames = await getGames({
    season: latestSeason,
    phase: 'regular',
    week: defaultWeek,
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
        initialWeek={defaultWeek}
        initialSeason={latestSeason}
        initialPhase="regular"
        availableWeeks={availableWeeks}
        conferences={[...FBS_CONFERENCES]}
        teams={teams}
        availableSeasons={availableSeasons}
      />
    </div>
  )
}
