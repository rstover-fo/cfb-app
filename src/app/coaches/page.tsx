import type { Metadata } from 'next'
import { getCoachRecords } from '@/lib/queries/coaches'
import { CoachesClient } from '@/components/coaches/CoachesClient'

export const metadata: Metadata = {
  title: 'Coaches | CFB Team 360',
  description: 'Coach career records and against-the-spread performance across college football',
}

export default async function CoachesPage() {
  // All four sort x scope combinations are fetched up front so both toggles
  // in CoachesClient are pure client-side swaps -- no refetch. Each list is
  // independently capped server-side; the active lists cannot be derived by
  // filtering the all-time lists (active coaches below the all-time top-100
  // cutoff would be missing).
  const [byWinPct, byAtsWinPct, activeByWinPct, activeByAtsWinPct] = await Promise.all([
    getCoachRecords({ sortBy: 'win_pct' }),
    getCoachRecords({ sortBy: 'ats_win_pct' }),
    getCoachRecords({ sortBy: 'win_pct', activeOnly: true }),
    getCoachRecords({ sortBy: 'ats_win_pct', activeOnly: true }),
  ])

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Coaches
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          Career records at each school, straight-up and against the spread
        </p>
      </header>

      <CoachesClient
        byWinPct={byWinPct}
        byAtsWinPct={byAtsWinPct}
        activeByWinPct={activeByWinPct}
        activeByAtsWinPct={activeByAtsWinPct}
      />
    </div>
  )
}
