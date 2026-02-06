'use client'

import { House, AirplaneTilt } from '@phosphor-icons/react'
import { HomeAwaySplit } from '@/lib/types/database'

interface HomeAwayViewProps {
  data: HomeAwaySplit[] | null
}

function ComparisonRow({
  label,
  homeValue,
  awayValue,
  format = 'number',
  higherIsBetter = true
}: {
  label: string
  homeValue: number
  awayValue: number
  format?: 'number' | 'percent' | 'decimal'
  higherIsBetter?: boolean
}) {
  const formatValue = (v: number) => {
    if (format === 'percent') return `${(v * 100).toFixed(0)}%`
    if (format === 'decimal') return v.toFixed(3)
    return v.toFixed(1)
  }

  const homeBetter = higherIsBetter ? homeValue > awayValue : homeValue < awayValue
  const awayBetter = higherIsBetter ? awayValue > homeValue : awayValue < homeValue

  return (
    <div className="grid grid-cols-3 gap-4 py-3 border-b border-[var(--border)]">
      <div className={`text-right tabular-nums ${homeBetter ? 'text-[var(--color-positive)] font-medium' : 'text-[var(--text-secondary)]'}`}>
        {formatValue(homeValue)}
      </div>
      <div className="text-center text-[var(--text-muted)] text-sm">{label}</div>
      <div className={`text-left tabular-nums ${awayBetter ? 'text-[var(--color-positive)] font-medium' : 'text-[var(--text-secondary)]'}`}>
        {formatValue(awayValue)}
      </div>
    </div>
  )
}

export function HomeAwayView({ data }: HomeAwayViewProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        Home/away data not available for this team.
      </p>
    )
  }

  const home = data.find(d => d.location === 'home')
  const away = data.find(d => d.location === 'away')

  if (!home || !away) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        Incomplete home/away data.
      </p>
    )
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4 max-w-2xl mx-auto">
      {/* Headers */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            <House size={20} weight="duotone" className="text-[var(--color-run)]" />
            <span className="font-headline text-lg text-[var(--text-primary)]">Home</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{home.games} games</p>
        </div>
        <div />
        <div className="text-left">
          <div className="flex items-center gap-2">
            <AirplaneTilt size={20} weight="duotone" className="text-[var(--color-pass)]" />
            <span className="font-headline text-lg text-[var(--text-primary)]">Away</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{away.games} games</p>
        </div>
      </div>

      {/* Record */}
      <div className="grid grid-cols-3 gap-4 py-4 mb-2 bg-[var(--bg-surface-alt)] rounded">
        <div className="text-right">
          <span className="font-headline text-xl tabular-nums text-[var(--text-primary)]">{home.wins}-{home.games - home.wins}</span>
        </div>
        <div className="text-center text-[var(--text-muted)] text-sm self-center">Record</div>
        <div className="text-left">
          <span className="font-headline text-xl tabular-nums text-[var(--text-primary)]">{away.wins}-{away.games - away.wins}</span>
        </div>
      </div>

      {/* Comparison rows */}
      <ComparisonRow label="Win %" homeValue={home.win_pct} awayValue={away.win_pct} format="percent" />
      <ComparisonRow label="Points/Game" homeValue={home.points_per_game} awayValue={away.points_per_game} />
      <ComparisonRow label="Points Allowed" homeValue={home.points_allowed_per_game} awayValue={away.points_allowed_per_game} higherIsBetter={false} />
      <ComparisonRow label="EPA/Play" homeValue={home.epa_per_play} awayValue={away.epa_per_play} format="decimal" />
      <ComparisonRow label="Success Rate" homeValue={home.success_rate} awayValue={away.success_rate} format="percent" />
      <ComparisonRow label="Yards/Play" homeValue={home.yards_per_play} awayValue={away.yards_per_play} />
    </div>
  )
}
