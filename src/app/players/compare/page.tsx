import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ComparePlayersSection } from '@/components/players/ComparePlayersSection'
import { WidgetSkeleton } from '@/components/dashboard/WidgetSkeleton'

export const metadata: Metadata = {
  title: 'Compare Players | CFB Team 360',
  description: 'Side-by-side player comparison with position-group percentile bars.',
}

interface PlayersComparePageProps {
  searchParams: Promise<{ p1?: string; p2?: string }>
}

export default async function PlayersComparePage({ searchParams }: PlayersComparePageProps) {
  const { p1, p2 } = await searchParams

  return (
    <div className="p-8">
      {/* Page Header */}
      <header className="mb-8 pb-6 border-b border-[var(--border)]">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Compare Players
        </h1>
        <p className="text-[var(--text-secondary)] mt-1">
          Pick two players to compare position-group percentiles side by side
        </p>
      </header>

      {/* Pickers + mirrored percentile bars -- re-fetches when either slot changes */}
      <Suspense key={`players-${p1 ?? ''}-${p2 ?? ''}`} fallback={<WidgetSkeleton title="Player Comparison" rows={8} />}>
        <ComparePlayersSection p1={p1} p2={p2} />
      </Suspense>
    </div>
  )
}
