import Link from 'next/link'
import { getScoredMatchupEdges } from '@/lib/queries/predictions'
import { getAvailableWeeks } from '@/lib/queries/games'
import { CURRENT_SEASON, DEFAULT_PREDICTION_MODEL } from '@/lib/queries/constants'
import { EdgeBoardTable } from '@/components/predictions/EdgeBoardTable'

export const metadata = {
  title: 'Edge Board | CFB Team 360',
  description: 'Full slate of scored model-vs-market edges for the current season, ranked by conviction.',
}

// Full Edge Board view -- the dashboard EdgeBoardWidget's "View All" links
// here. Fetches the whole season's slate (all weeks) at the default model
// version server-side; EdgeBoardTable takes it from there with client-side
// week/model filters. Off-season is a legitimately empty slate, not an
// error -- see EdgeBoardTable's designed empty state.
export default async function PredictionsPage() {
  const [edges, availableWeeks] = await Promise.all([
    getScoredMatchupEdges(CURRENT_SEASON, undefined, DEFAULT_PREDICTION_MODEL),
    getAvailableWeeks(CURRENT_SEASON),
  ])

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Edge Board
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-2xl">
          Every upcoming FBS game the house model has scored against the market line, ranked by
          conviction (largest edge first). How good is this model? See{' '}
          <Link href="/models" className="text-[var(--text-primary)] hover:underline">
            Models
          </Link>{' '}
          for methodology.
        </p>
      </header>

      <EdgeBoardTable
        initialEdges={edges}
        season={CURRENT_SEASON}
        availableWeeks={availableWeeks}
        defaultModelVersion={DEFAULT_PREDICTION_MODEL}
      />
    </div>
  )
}
