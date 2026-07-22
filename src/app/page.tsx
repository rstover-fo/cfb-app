import { Suspense } from 'react'
import { TopMoversWidget } from '@/components/dashboard/TopMoversWidget'
import { RecentGamesWidget } from '@/components/dashboard/RecentGamesWidget'
import { StandingsWidget } from '@/components/dashboard/StandingsWidget'
import { StatLeadersWidget } from '@/components/dashboard/StatLeadersWidget'
import { EdgeBoardWidget } from '@/components/dashboard/EdgeBoardWidget'
import { LiveScoreboardSection } from '@/components/dashboard/LiveScoreboardSection'
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

      {/* Live Scoreboard - full-width strip, gates itself off entirely
          outside a gameday window (see LiveScoreboardWidget.isLiveWindow).
          fallback={null} so there is no skeleton height to collapse when it
          resolves to nothing -- the dashboard looks identical to today. */}
      <WidgetErrorBoundary title="Live Scoreboard">
        <Suspense fallback={null}>
          <LiveScoreboardSection />
        </Suspense>
      </WidgetErrorBoundary>

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

        {/* Edge Board */}
        <WidgetErrorBoundary title="Edge Board">
          <Suspense fallback={<WidgetSkeleton title="Edge Board" rows={6} />}>
            <EdgeBoardWidget />
          </Suspense>
        </WidgetErrorBoundary>
      </div>
    </div>
  )
}
