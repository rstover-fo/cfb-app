import { Suspense } from 'react'
import type { Metadata } from 'next'
import { CompareTeamsSection } from '@/components/comparison/CompareTeamsSection'
import { CompareHistorySection } from '@/components/comparison/CompareHistorySection'
import { WidgetSkeleton } from '@/components/dashboard/WidgetSkeleton'
import { CURRENT_SEASON } from '@/lib/queries/constants'

export const metadata: Metadata = {
  title: 'Compare Teams | CFB Team 360',
  description: 'Side-by-side team comparison across EPA, success rate, style, and multi-season history.'
}

interface ComparePageProps {
  searchParams: Promise<{ t1?: string; t2?: string }>
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const { t1, t2 } = await searchParams

  return (
    <div className="p-8">
      {/* Page Header */}
      <header className="mb-8 pb-6 border-b border-[var(--border)]">
        <h1 className="font-headline text-4xl text-[var(--text-primary)] underline-sketch inline-block">
          Compare Teams
        </h1>
        <p className="text-[var(--text-secondary)] mt-1">
          {CURRENT_SEASON} Season · Pick two teams to compare head-to-head
        </p>
      </header>

      {/* Head-to-head metrics -- reuses CompareView, the same component that powers the team page's Compare tab */}
      <Suspense key={`teams-${t1 ?? ''}-${t2 ?? ''}`} fallback={<WidgetSkeleton title="Comparison" rows={7} />}>
        <CompareTeamsSection t1={t1} t2={t2} season={CURRENT_SEASON} />
      </Suspense>

      {/* Multi-season trend */}
      <div className="mt-10">
        <Suspense key={`history-${t1 ?? ''}-${t2 ?? ''}`} fallback={<WidgetSkeleton title="Historical Trend" rows={5} />}>
          <CompareHistorySection t1={t1} t2={t2} />
        </Suspense>
      </div>
    </div>
  )
}
