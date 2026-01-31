'use client'

import { TrendUp, TrendDown, Minus } from '@phosphor-icons/react'
import { DownDistanceSplit } from '@/lib/types/database'

interface KeySituationsCardsProps {
  data: DownDistanceSplit[]
}

interface SituationCardProps {
  label: string
  description: string
  value: string
  rank?: number
  trend?: number
}

function SituationCard({ label, description, value, rank, trend }: SituationCardProps) {
  const trendIcon = trend && trend > 0.02
    ? <TrendUp size={14} weight="thin" className="text-[var(--color-positive)]" />
    : trend && trend < -0.02
    ? <TrendDown size={14} weight="thin" className="text-[var(--color-negative)]" />
    : <Minus size={14} weight="thin" className="text-[var(--text-muted)]" />

  const trendText = trend
    ? trend > 0 ? `+${(trend * 100).toFixed(0)}%` : `${(trend * 100).toFixed(0)}%`
    : null

  return (
    <div className="card p-4">
      <p className="font-headline text-base text-[var(--text-primary)]">{label}</p>
      <p className="text-xs text-[var(--text-muted)] mb-3">{description}</p>

      <p className="font-headline text-3xl text-[var(--text-primary)] mb-2">{value}</p>

      <div className="flex items-center justify-between text-xs">
        {rank && (
          <span className="text-[var(--text-secondary)]">#{rank} FBS</span>
        )}
        {trendText && (
          <span className="flex items-center gap-1 text-[var(--text-muted)]">
            {trendIcon}
            {trendText}
          </span>
        )}
      </div>
    </div>
  )
}

export function KeySituationsCards({ data }: KeySituationsCardsProps) {
  // Filter for offensive data
  const offenseData = data.filter(d => d.side === 'offense')

  // Find specific situations
  const thirdShort = offenseData.find(d => d.down === 3 && d.distance_bucket === '1-3')
  const thirdLong = offenseData.filter(d => d.down === 3 && (d.distance_bucket === '7-10' || d.distance_bucket === '11+'))
  const fourthDown = offenseData.filter(d => d.down === 4)
  const secondLong = offenseData.filter(d => d.down === 2 && (d.distance_bucket === '7-10' || d.distance_bucket === '11+'))

  // Calculate aggregates
  const thirdLongRate = thirdLong.length > 0
    ? thirdLong.reduce((sum, d) => sum + d.success_rate * d.play_count, 0) / thirdLong.reduce((sum, d) => sum + d.play_count, 0)
    : null

  const fourthDownTotal = fourthDown.reduce((sum, d) => sum + d.play_count, 0)
  const fourthDownConversions = fourthDown.reduce((sum, d) => sum + (d.conversion_rate || 0) * d.play_count, 0)
  const fourthDownRate = fourthDownTotal > 0 ? fourthDownConversions / fourthDownTotal : null

  const secondLongRate = secondLong.length > 0
    ? secondLong.reduce((sum, d) => sum + d.success_rate * d.play_count, 0) / secondLong.reduce((sum, d) => sum + d.play_count, 0)
    : null

  return (
    <div>
      <h3 className="font-headline text-lg text-[var(--text-primary)] mb-4">Key Situations</h3>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SituationCard
          label="3rd & Short"
          description="1-3 yards"
          value={thirdShort ? `${(thirdShort.conversion_rate ? thirdShort.conversion_rate * 100 : thirdShort.success_rate * 100).toFixed(0)}%` : 'N/A'}
          rank={thirdShort?.national_rank}
        />
        <SituationCard
          label="3rd & Long"
          description="7+ yards"
          value={thirdLongRate !== null ? `${(thirdLongRate * 100).toFixed(0)}%` : 'N/A'}
        />
        <SituationCard
          label="4th Down"
          description="Attempts"
          value={fourthDownTotal > 0 ? `${fourthDownTotal}` : 'N/A'}
        />
        <SituationCard
          label="2nd & Long"
          description="7+ yards"
          value={secondLongRate !== null ? `${(secondLongRate * 100).toFixed(0)}%` : 'N/A'}
        />
      </div>
    </div>
  )
}
