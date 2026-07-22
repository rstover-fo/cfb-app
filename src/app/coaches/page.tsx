import type { Metadata } from 'next'
import { getCoachRecords } from '@/lib/queries/coaches'
import { CoachesClient } from '@/components/coaches/CoachesClient'

export const metadata: Metadata = {
  title: 'Coaches | CFB Team 360',
  description: 'Coach career records and against-the-spread performance across college football',
}

export default async function CoachesPage() {
  // Both orderings are fetched up front so the SU/ATS toggle in CoachesClient
  // is a pure client-side swap -- no refetch on toggle.
  const [byWinPct, byAtsWinPct] = await Promise.all([
    getCoachRecords({ sortBy: 'win_pct' }),
    getCoachRecords({ sortBy: 'ats_win_pct' }),
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

      <CoachesClient byWinPct={byWinPct} byAtsWinPct={byAtsWinPct} />
    </div>
  )
}
