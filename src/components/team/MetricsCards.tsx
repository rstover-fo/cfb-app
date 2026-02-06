'use client'

import { TeamSeasonEpa } from '@/lib/types/database'
import { formatRank } from '@/lib/utils'
import { useCountUp } from '@/hooks/useCountUp'
import { Info, TrendDown, TrendUp } from '@phosphor-icons/react'

interface MetricsCardsProps {
  metrics: TeamSeasonEpa
}

interface MetricCardProps {
  label: string
  value: number
  decimals?: number
  suffix?: string
  rank?: number
  tooltip?: string
  trend?: 'positive' | 'negative' | 'neutral'
}

function MetricCard({ label, value, decimals = 3, suffix = '', rank, tooltip, trend }: MetricCardProps) {
  const displayValue = useCountUp(value, { decimals, duration: 800 })

  const valueColorClass = trend === 'positive'
    ? 'text-[var(--color-positive)]'
    : trend === 'negative'
    ? 'text-[var(--color-negative)]'
    : 'text-[var(--text-primary)]'

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-[var(--text-muted)]">{label}</p>
        {tooltip && (
          <button
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            aria-label={`Info about ${label}`}
            title={tooltip}
          >
            <Info size={16} weight="thin" />
          </button>
        )}
      </div>

      <p className={`font-headline text-2xl tabular-nums ${valueColorClass} underline-sketch inline-block`}>
        {displayValue}{suffix}
      </p>

      {rank && (
        <div className="flex items-center gap-1 mt-3 text-sm text-[var(--text-secondary)]">
          {rank <= 50 ? (
            <TrendUp size={14} weight="thin" className="text-[var(--color-positive)]" />
          ) : rank > 100 ? (
            <TrendDown size={14} weight="thin" className="text-[var(--color-negative)]" />
          ) : null}
          <span>{formatRank(rank)} nationally</span>
        </div>
      )}
    </div>
  )
}

export function MetricsCards({ metrics }: MetricsCardsProps) {
  const epa = metrics.epa_per_play ?? 0
  const sr = metrics.success_rate ?? 0
  const epaTrend = epa > 0 ? 'positive' : epa < -0.05 ? 'negative' : 'neutral'
  const successTrend = sr > 0.45 ? 'positive' : sr < 0.4 ? 'negative' : 'neutral'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        label="EPA per Play"
        value={epa}
        decimals={3}
        rank={metrics.off_epa_rank ?? undefined}
        tooltip="Expected Points Added per play measures offensive efficiency"
        trend={epaTrend}
      />
      <MetricCard
        label="Success Rate"
        value={sr * 100}
        decimals={1}
        suffix="%"
        tooltip="Percentage of plays that are considered successful"
        trend={successTrend}
      />
      <MetricCard
        label="Explosiveness"
        value={metrics.explosiveness ?? 0}
        decimals={3}
        tooltip="Average EPA on successful plays"
      />
      <MetricCard
        label="Games Played"
        value={metrics.games ?? 0}
        decimals={0}
      />
    </div>
  )
}
