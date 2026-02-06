import {
  getRankingsForWeek,
  getRankingsAllWeeks,
  getAvailablePolls,
  getLatestRankingWeek,
  getAvailableRankingSeasons,
} from '@/lib/queries/rankings'
import { CURRENT_SEASON } from '@/lib/queries/constants'
import { RankingsClient } from '@/components/rankings/RankingsClient'

export default async function RankingsPage() {
  const [availableSeasons, availablePolls] = await Promise.all([
    getAvailableRankingSeasons(),
    getAvailablePolls(CURRENT_SEASON),
  ])

  const defaultPoll = availablePolls.includes('AP Top 25') ? 'AP Top 25' : availablePolls[0] ?? 'AP Top 25'
  const latestWeek = await getLatestRankingWeek(CURRENT_SEASON, defaultPoll)

  const [rankings, allWeeksData] = await Promise.all([
    getRankingsForWeek(CURRENT_SEASON, latestWeek, defaultPoll),
    getRankingsAllWeeks(CURRENT_SEASON, defaultPoll),
  ])

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Rankings
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          Official AP &amp; Coaches Poll rankings with season trajectories
        </p>
      </header>

      <RankingsClient
        initialRankings={rankings}
        initialAllWeeks={allWeeksData}
        initialPoll={defaultPoll}
        initialSeason={CURRENT_SEASON}
        initialWeek={latestWeek}
        availablePolls={availablePolls}
        availableSeasons={availableSeasons}
      />
    </div>
  )
}
