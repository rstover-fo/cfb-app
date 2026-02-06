import Link from 'next/link'
import Image from 'next/image'
import { TrendUp, TrendDown, ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { getTopMovers, type Mover } from '@/lib/queries/dashboard'
import { teamNameToSlug } from '@/lib/utils'
import { CURRENT_SEASON } from '@/lib/queries/constants'

function MoverRow({ mover, index }: { mover: Mover; index: number }) {
  const isRiser = mover.direction === 'up'
  const Icon = isRiser ? TrendUp : TrendDown
  const colorClass = isRiser ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'
  const bgClass = isRiser ? 'bg-[var(--color-positive)]/10' : 'bg-[var(--color-negative)]/10'

  return (
    <Link
      href={`/teams/${teamNameToSlug(mover.team)}`}
      className="flex items-center gap-3 py-2 px-1 -mx-1 rounded hover:bg-[var(--bg-surface-alt)] transition-colors"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Team logo */}
      {mover.logo ? (
        <Image
          src={mover.logo}
          alt={mover.team}
          width={24}
          height={24}
          className="w-6 h-6 object-contain"
        />
      ) : (
        <div
          className="w-6 h-6 rounded-full"
          style={{ backgroundColor: mover.color || 'var(--bg-surface-alt)' }}
        />
      )}

      {/* Team name */}
      <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
        {mover.team}
      </span>

      {/* Current EPA */}
      <span className="text-xs text-[var(--text-muted)] tabular-nums">
        {mover.currentEpa > 0 ? '+' : ''}{mover.currentEpa.toFixed(2)}
      </span>

      {/* Delta badge */}
      <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colorClass} ${bgClass}`}>
        <Icon size={12} weight="bold" />
        {mover.epaDelta > 0 ? '+' : ''}{mover.epaDelta.toFixed(2)}
      </span>
    </Link>
  )
}

export async function TopMoversWidget() {
  const { risers, fallers } = await getTopMovers(CURRENT_SEASON)

  const hasData = risers.length > 0 || fallers.length > 0

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-medium text-[var(--text-muted)]">Top Movers</h2>
        <Link
          href="/analytics"
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          View All
          <ArrowRight size={12} weight="thin" />
        </Link>
      </div>

      {hasData ? (
        <div className="grid grid-cols-2 gap-4">
          {/* Risers column */}
          <div>
            <p className="text-xs text-[var(--color-positive)] font-medium mb-2 flex items-center gap-1">
              <TrendUp size={12} weight="bold" />
              Risers
            </p>
            <div className="space-y-1">
              {risers.map((mover, i) => (
                <MoverRow key={mover.team} mover={mover} index={i} />
              ))}
            </div>
          </div>

          {/* Fallers column */}
          <div>
            <p className="text-xs text-[var(--color-negative)] font-medium mb-2 flex items-center gap-1">
              <TrendDown size={12} weight="bold" />
              Fallers
            </p>
            <div className="space-y-1">
              {fallers.map((mover, i) => (
                <MoverRow key={mover.team} mover={mover} index={i + 3} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          No movement data available
        </div>
      )}
    </div>
  )
}
