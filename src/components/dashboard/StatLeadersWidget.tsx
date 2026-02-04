import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import { getStatLeaders } from '@/lib/queries/dashboard'
import { StatLeadersTabs } from './StatLeadersTabs'

const CURRENT_SEASON = 2025

export async function StatLeadersWidget() {
  const data = await getStatLeaders(CURRENT_SEASON)

  const hasData =
    data.epa.length > 0 ||
    data.havoc.length > 0 ||
    data.successRate.length > 0 ||
    data.explosiveness.length > 0

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-medium text-[var(--text-muted)]">Stat Leaders</h2>
        <Link
          href="/analytics"
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          View All
          <ArrowRight size={12} weight="thin" />
        </Link>
      </div>

      {hasData ? (
        <StatLeadersTabs data={data} />
      ) : (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          No stat data available
        </div>
      )}
    </div>
  )
}
