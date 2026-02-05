'use client'

import { TeamStyleProfile as StyleData } from '@/lib/types/database'
import { useCountUp } from '@/hooks/useCountUp'

interface StyleProfileProps {
  style: StyleData
}

function IdentityBadge({ identity }: { identity: string }) {
  const labels: Record<string, string> = {
    run_heavy: 'Run Heavy',
    balanced: 'Balanced',
    pass_heavy: 'Pass Heavy',
  }

  return (
    <span className="px-3 py-1.5 bg-[var(--bg-surface-alt)] border border-[var(--border)] rounded text-sm text-[var(--text-secondary)]">
      {labels[identity] || identity}
    </span>
  )
}

function TempoBadge({ tempo }: { tempo: string }) {
  const labels: Record<string, string> = {
    up_tempo: 'Up Tempo',
    balanced: 'Balanced Tempo',
    slow: 'Slow Tempo',
  }

  return (
    <span className="px-3 py-1.5 bg-[var(--bg-surface-alt)] border border-[var(--border)] rounded text-sm text-[var(--text-secondary)]">
      {labels[tempo] || tempo}
    </span>
  )
}

function AnimatedValue({ value, decimals = 3 }: { value: number | null; decimals?: number }) {
  const displayValue = useCountUp(value || 0, { decimals, duration: 600 })

  if (value === null || value === undefined) {
    return <span className="text-[var(--text-muted)]">N/A</span>
  }

  const colorClass = value > 0
    ? 'text-[var(--color-positive)]'
    : value < 0
    ? 'text-[var(--color-negative)]'
    : 'text-[var(--text-primary)]'

  return <span className={colorClass}>{displayValue}</span>
}

export function StyleProfile({ style }: StyleProfileProps) {
  const runPercent = Math.round((style.run_rate ?? 0) * 100)
  const passPercent = 100 - runPercent  // Ensure bar always fills to 100%

  return (
    <div className="card p-6">
      {/* Badges Row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <IdentityBadge identity={style.offensive_identity ?? 'balanced'} />
        <TempoBadge tempo={style.tempo_category ?? 'balanced'} />
        <span className="text-sm text-[var(--text-muted)]">
          {(style.plays_per_game ?? 0).toFixed(1)} plays/game
        </span>
      </div>

      {/* Run/Pass Balance Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-[var(--text-secondary)]">Run {runPercent}%</span>
          <span className="text-[var(--text-secondary)]">Pass {passPercent}%</span>
        </div>
        <div className="h-3 rounded overflow-hidden flex border border-[var(--border)]">
          <div
            className="transition-all duration-500 ease-out"
            style={{
              width: `${runPercent}%`,
              backgroundColor: 'var(--color-run)'
            }}
            role="img"
            aria-label={`Run rate: ${runPercent}%`}
          />
          <div
            className="transition-all duration-500 ease-out"
            style={{
              width: `${passPercent}%`,
              backgroundColor: 'var(--color-pass)'
            }}
            role="img"
            aria-label={`Pass rate: ${passPercent}%`}
          />
        </div>
      </div>

      {/* EPA Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Rushing Column */}
        <div className="border-l-2 border-[var(--color-run)] pl-4">
          <h4 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-4">Rushing</h4>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-[var(--text-muted)]">Offense EPA</p>
              <p className="font-headline text-2xl">
                <AnimatedValue value={style.epa_rushing} />
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Defense EPA</p>
              <p className="font-headline text-2xl">
                <AnimatedValue value={style.def_epa_vs_run} />
              </p>
            </div>
          </div>
        </div>

        {/* Passing Column */}
        <div className="border-l-2 border-[var(--color-pass)] pl-4">
          <h4 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-4">Passing</h4>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-[var(--text-muted)]">Offense EPA</p>
              <p className="font-headline text-2xl">
                <AnimatedValue value={style.epa_passing} />
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Defense EPA</p>
              <p className="font-headline text-2xl">
                <AnimatedValue value={style.def_epa_vs_pass} />
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
