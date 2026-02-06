import { Suspense } from 'react'
import { TopMoversWidget } from '@/components/dashboard/TopMoversWidget'
import { RecentGamesWidget } from '@/components/dashboard/RecentGamesWidget'
import { StandingsWidget } from '@/components/dashboard/StandingsWidget'
import { StatLeadersWidget } from '@/components/dashboard/StatLeadersWidget'
import { WidgetSkeleton } from '@/components/dashboard/WidgetSkeleton'
import { WidgetErrorBoundary } from '@/components/dashboard/WidgetErrorBoundary'

export default function Home() {
  return (
    <div className="p-8">
      {/* Page Header */}
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Dashboard
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          College football analytics at a glance
        </p>
      </header>

      {/* Widget Grid - 2x2 responsive layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Top Movers */}
        <WidgetErrorBoundary title="Top Movers">
          <Suspense fallback={<WidgetSkeleton title="Top Movers" rows={6} />}>
            <TopMoversWidget />
          </Suspense>
        </WidgetErrorBoundary>

        {/* Recent Games */}
        <WidgetErrorBoundary title="Recent Games">
          <Suspense fallback={<WidgetSkeleton title="Recent Games" rows={5} />}>
            <RecentGamesWidget />
          </Suspense>
        </WidgetErrorBoundary>

        {/* Standings */}
        <WidgetErrorBoundary title="Composite Rankings">
          <Suspense fallback={<WidgetSkeleton title="Composite Rankings" rows={10} />}>
            <StandingsWidget />
          </Suspense>
        </WidgetErrorBoundary>

        {/* Stat Leaders */}
        <WidgetErrorBoundary title="Stat Leaders">
          <Suspense fallback={<WidgetSkeleton title="Stat Leaders" rows={5} />}>
            <StatLeadersWidget />
          </Suspense>
        </WidgetErrorBoundary>
      </div>
    </div>
  )
}
