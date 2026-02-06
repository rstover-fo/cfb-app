'use client'

import { useRef, useCallback, useEffect } from 'react'
import rough from 'roughjs'
import { TeamStyleProfile as StyleData } from '@/lib/types/database'
import { useCountUp } from '@/hooks/useCountUp'

interface StyleProfileProps {
  style: StyleData
}

const BAR_WIDTH = 400
const BAR_HEIGHT = 14
const BAR_SVG_HEIGHT = 18

function resolveColor(cssVar: string): string {
  if (typeof document === 'undefined') return '#999'
  const match = cssVar.match(/var\((.+)\)/)
  if (!match) return cssVar
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#999'
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
  const passPercent = 100 - runPercent

  const barSvgRef = useRef<SVGSVGElement>(null)
  const barGroupRef = useRef<SVGGElement>(null)

  const drawBar = useCallback(() => {
    const svg = barSvgRef.current
    const group = barGroupRef.current
    if (!svg || !group) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const runColor = resolveColor('var(--color-run)')
    const passColor = resolveColor('var(--color-pass)')

    const runWidth = (runPercent / 100) * BAR_WIDTH
    const passWidth = BAR_WIDTH - runWidth

    if (runWidth > 0) {
      group.appendChild(rc.rectangle(0, 2, runWidth, BAR_HEIGHT, {
        fill: runColor,
        fillStyle: 'solid',
        stroke: runColor,
        strokeWidth: 1,
        roughness: 1.0,
        bowing: 0.5,
      }))
    }

    if (passWidth > 0) {
      group.appendChild(rc.rectangle(runWidth, 2, passWidth, BAR_HEIGHT, {
        fill: passColor,
        fillStyle: 'solid',
        stroke: passColor,
        strokeWidth: 1,
        roughness: 1.0,
        bowing: 0.5,
      }))
    }
  }, [runPercent])

  useEffect(() => {
    drawBar()
  }, [drawBar])

  // Redraw on theme change
  useEffect(() => {
    const observer = new MutationObserver(() => {
      requestAnimationFrame(drawBar)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [drawBar])

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4">
      {/* Badges Row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <IdentityBadge identity={style.offensive_identity ?? 'balanced'} />
        <TempoBadge tempo={style.tempo_category ?? 'balanced'} />
        <span className="text-sm text-[var(--text-muted)]">
          {(style.plays_per_game ?? 0).toFixed(1)} plays/game
        </span>
      </div>

      {/* Run/Pass Balance Bar */}
      <div className="mb-5">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-[var(--text-secondary)]">Run {runPercent}%</span>
          <span className="text-[var(--text-secondary)]">Pass {passPercent}%</span>
        </div>
        <svg
          ref={barSvgRef}
          viewBox={`0 0 ${BAR_WIDTH} ${BAR_SVG_HEIGHT}`}
          className="w-full"
          role="img"
          aria-label={`Run ${runPercent}%, Pass ${passPercent}%`}
        >
          <g ref={barGroupRef} />
        </svg>
      </div>

      {/* EPA Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Rushing Column */}
        <div className="border-l-2 border-[var(--color-run)] pl-4">
          <h4 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3">Rushing</h4>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-[var(--text-muted)]">Offense EPA</p>
              <p className="font-headline text-xl tabular-nums">
                <AnimatedValue value={style.epa_rushing} />
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Defense EPA</p>
              <p className="font-headline text-xl tabular-nums">
                <AnimatedValue value={style.def_epa_vs_run} />
              </p>
            </div>
          </div>
        </div>

        {/* Passing Column */}
        <div className="border-l-2 border-[var(--color-pass)] pl-4">
          <h4 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-3">Passing</h4>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-[var(--text-muted)]">Offense EPA</p>
              <p className="font-headline text-xl tabular-nums">
                <AnimatedValue value={style.epa_passing} />
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Defense EPA</p>
              <p className="font-headline text-xl tabular-nums">
                <AnimatedValue value={style.def_epa_vs_pass} />
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
