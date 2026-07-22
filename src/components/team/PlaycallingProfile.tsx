'use client'

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { Strategy } from '@phosphor-icons/react'
import rough from 'roughjs'
import { resolveColor, useChartTheme } from '@/lib/charts/theme'
import { EmptyState } from '@/components/EmptyState'
import type { PlaycallingProfile as PlaycallingProfileData } from '@/lib/queries/playcalling'

interface PlaycallingProfileProps {
  profile: PlaycallingProfileData | null
}

const WIDTH = 700
const MARGIN = { top: 34, right: 16, left: 148, bottom: 8 }
const ROW_HEIGHT = 48
const BAR_HEIGHT = 16
/** Space reserved inside each half of the plot for the % direct labels. */
const LABEL_GUTTER = 36

const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const CENTER_X = MARGIN.left + PLOT_WIDTH / 2
const HALF_WIDTH = PLOT_WIDTH / 2 - LABEL_GUTTER

/** "72" -> "72nd", handling the 11th/12th/13th exceptions. */
function ordinal(n: number): string {
  const rem = n % 100
  if (rem >= 11 && rem <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

function sharePct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

function pct1(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function signed3(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(3)
}

interface SituationRow {
  key: string
  label: string
  /** Run share of plays in this situation, 0..1. */
  runRate: number
  /** FBS percentile of the tendency, 0..1, with the direction it ranks. */
  pctl: { value: number; lean: 'run-heavy' | 'pass-heavy' } | null
  /** Extra stat lines surfaced in the hover tooltip. */
  extras: { label: string; value: string }[]
}

function buildRows(profile: PlaycallingProfileData): SituationRow[] {
  const candidates: (Omit<SituationRow, 'runRate'> & { runRate: number | null })[] = [
    {
      key: 'overall',
      label: 'Overall',
      runRate: profile.overall_run_rate,
      pctl: profile.overall_run_rate_pctl !== null
        ? { value: profile.overall_run_rate_pctl, lean: 'run-heavy' }
        : null,
      extras: [
        ...(profile.overall_success_rate !== null
          ? [{ label: 'Success rate', value: pct1(profile.overall_success_rate) }] : []),
        ...(profile.overall_avg_epa !== null
          ? [{ label: 'EPA/play', value: signed3(profile.overall_avg_epa) }] : []),
      ],
    },
    {
      key: 'early',
      label: 'Early downs',
      runRate: profile.early_down_run_rate,
      pctl: profile.early_down_run_rate_pctl !== null
        ? { value: profile.early_down_run_rate_pctl, lean: 'run-heavy' }
        : null,
      extras: [],
    },
    {
      key: 'third',
      label: 'Third down',
      // The view publishes third down as a pass rate; the bar reads run-left,
      // pass-right, so invert to the run share.
      runRate: profile.third_down_pass_rate !== null ? 1 - profile.third_down_pass_rate : null,
      pctl: profile.third_down_pass_rate_pctl !== null
        ? { value: profile.third_down_pass_rate_pctl, lean: 'pass-heavy' }
        : null,
      extras: profile.third_down_success_rate !== null
        ? [{ label: 'Success rate', value: pct1(profile.third_down_success_rate) }] : [],
    },
    {
      key: 'redzone',
      label: 'Red zone',
      runRate: profile.red_zone_run_rate,
      pctl: null,
      extras: profile.red_zone_success_rate !== null
        ? [{ label: 'Success rate', value: pct1(profile.red_zone_success_rate) }] : [],
    },
    { key: 'leading', label: 'Leading', runRate: profile.leading_run_rate, pctl: null, extras: [] },
    { key: 'trailing', label: 'Trailing', runRate: profile.trailing_run_rate, pctl: null, extras: [] },
  ]

  return candidates.filter((r): r is SituationRow => r.runRate !== null)
}

/**
 * The team's situational playcalling identity: diverging hand-drawn bars per
 * situation — run share extending left, pass share extending right — around a
 * center axis at the even run–pass split. The view only publishes FBS
 * *percentiles* (not the median rates themselves), so FBS-relative position is
 * annotated per row as a percentile caption rather than a shifted axis.
 */
export function PlaycallingProfile({ profile }: PlaycallingProfileProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)

  const rows = useMemo(() => (profile ? buildRows(profile) : []), [profile])

  const height = MARGIN.top + rows.length * ROW_HEIGHT + MARGIN.bottom

  const rowTop = useCallback((i: number) => MARGIN.top + i * ROW_HEIGHT, [])

  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || rows.length === 0) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const runColor = resolveColor('var(--color-run)')
    const passColor = resolveColor('var(--color-pass)')

    rows.forEach((row, i) => {
      const y = rowTop(i) + (ROW_HEIGHT - BAR_HEIGHT) / 2
      const runWidth = row.runRate * HALF_WIDTH
      const passWidth = (1 - row.runRate) * HALF_WIDTH

      // Run share, extending left from the center axis. Opposing hachure
      // angles give the two series a non-color distinction (CVD/print).
      if (runWidth > 0) {
        group.appendChild(rc.rectangle(CENTER_X - runWidth, y, runWidth, BAR_HEIGHT, {
          fill: runColor,
          fillStyle: 'hachure',
          hachureAngle: -41,
          hachureGap: 5,
          fillWeight: 1,
          stroke: runColor,
          strokeWidth: 1.5,
          roughness: 1.1,
          bowing: 0.5,
        }))
      }

      // Pass share, extending right.
      if (passWidth > 0) {
        group.appendChild(rc.rectangle(CENTER_X, y, passWidth, BAR_HEIGHT, {
          fill: passColor,
          fillStyle: 'hachure',
          hachureAngle: 41,
          hachureGap: 5,
          fillWeight: 1,
          stroke: passColor,
          strokeWidth: 1.5,
          roughness: 1.1,
          bowing: 0.5,
        }))
      }
    })
  }, [rows, rowTop])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  if (!profile) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg">
        <EmptyState
          icon={Strategy}
          title="No playcalling profile yet"
          description="Playcalling profile publishes after enough plays are charted."
        />
      </div>
    )
  }

  const hoveredRow = hoveredIndex !== null ? rows[hoveredIndex] : null

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Run versus pass share by situation for ${profile.team}, ${profile.season} season`}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {/* Column headers with series swatches */}
        <text x={CENTER_X - 32} y={16} textAnchor="end" className="fill-[var(--text-muted)] text-[10px] uppercase tracking-wider">
          Run
        </text>
        <rect x={CENTER_X - 28} y={10} width={12} height={4} fill="var(--color-run)" />
        <rect x={CENTER_X + 16} y={10} width={12} height={4} fill="var(--color-pass)" />
        <text x={CENTER_X + 32} y={16} textAnchor="start" className="fill-[var(--text-muted)] text-[10px] uppercase tracking-wider">
          Pass
        </text>

        {/* Hover row highlight (behind the rough-drawn bars) */}
        {hoveredIndex !== null && (
          <rect
            x={8}
            y={rowTop(hoveredIndex)}
            width={WIDTH - 16}
            height={ROW_HEIGHT}
            fill="var(--bg-surface-alt)"
            rx={2}
          />
        )}

        {/* Center axis: the even run–pass split */}
        <line
          x1={CENTER_X}
          y1={MARGIN.top - 6}
          x2={CENTER_X}
          y2={height - MARGIN.bottom}
          stroke="var(--border)"
          strokeWidth={1.5}
        />

        {/* Per-row labels and direct % labels */}
        {rows.map((row, i) => {
          const barY = rowTop(i) + (ROW_HEIGHT - BAR_HEIGHT) / 2
          const barMidY = barY + BAR_HEIGHT / 2
          const runWidth = row.runRate * HALF_WIDTH
          const passWidth = (1 - row.runRate) * HALF_WIDTH
          return (
            <g key={row.key}>
              {/* Situation label (+ percentile caption when published) */}
              <text
                x={MARGIN.left - 12}
                y={row.pctl ? barMidY - 2 : barMidY}
                textAnchor="end"
                dominantBaseline={row.pctl ? 'auto' : 'middle'}
                className="fill-[var(--text-secondary)] text-xs"
              >
                {row.label}
              </text>
              {row.pctl && (
                <text
                  x={MARGIN.left - 12}
                  y={barMidY + 12}
                  textAnchor="end"
                  className="fill-[var(--text-muted)] text-[10px]"
                >
                  {`${ordinal(Math.round(row.pctl.value * 100))} pctl ${row.pctl.lean}`}
                </text>
              )}
              {/* Direct labels at the bar ends */}
              <text
                x={CENTER_X - runWidth - 6}
                y={barMidY}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-[var(--text-secondary)] text-xs tabular-nums"
              >
                {sharePct(row.runRate)}
              </text>
              <text
                x={CENTER_X + passWidth + 6}
                y={barMidY}
                textAnchor="start"
                dominantBaseline="middle"
                className="fill-[var(--text-secondary)] text-xs tabular-nums"
              >
                {sharePct(1 - row.runRate)}
              </text>
            </g>
          )
        })}

        {/* Rough-drawn chart elements */}
        <g ref={roughGroupRef} />

        {/* Interactive hover areas */}
        {rows.map((row, i) => (
          <rect
            key={row.key}
            x={0}
            y={rowTop(i)}
            width={WIDTH}
            height={ROW_HEIGHT}
            fill="transparent"
            onMouseEnter={() => setHoveredIndex(i)}
          />
        ))}
      </svg>

      <p className="text-xs text-[var(--text-muted)] mt-2">
        Bars diverge from an even run–pass split. Percentile captions rank the tendency against all FBS teams.
      </p>

      {/* Tooltip */}
      {hoveredRow && (
        <div className="mt-2 p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm">
          <p className="font-headline text-base text-[var(--text-primary)] mb-2">{hoveredRow.label}</p>
          <div className="space-y-1">
            <p className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-[var(--color-run)]" />
              <span className="text-[var(--text-secondary)]">Run:</span>
              <span className="text-[var(--text-primary)] font-medium tabular-nums">{sharePct(hoveredRow.runRate)}</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-[var(--color-pass)]" />
              <span className="text-[var(--text-secondary)]">Pass:</span>
              <span className="text-[var(--text-primary)] font-medium tabular-nums">{sharePct(1 - hoveredRow.runRate)}</span>
            </p>
            {hoveredRow.extras.map(extra => (
              <p key={extra.label} className="flex items-center gap-2">
                <span className="w-3" />
                <span className="text-[var(--text-secondary)]">{extra.label}:</span>
                <span className="text-[var(--text-primary)] tabular-nums">{extra.value}</span>
              </p>
            ))}
            {hoveredRow.pctl && (
              <p className="flex items-center gap-2">
                <span className="w-3" />
                <span className="text-[var(--text-muted)]">
                  {`${ordinal(Math.round(hoveredRow.pctl.value * 100))} percentile ${hoveredRow.pctl.lean} in FBS`}
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Compact identity stat lines */}
      <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <p className="flex items-baseline gap-2">
          <span className="text-[var(--text-secondary)]">Run-rate delta (leading − trailing):</span>
          <span className="text-[var(--text-primary)] font-medium tabular-nums">
            {profile.run_rate_delta !== null
              ? `${profile.run_rate_delta >= 0 ? '+' : ''}${(profile.run_rate_delta * 100).toFixed(1)} pts`
              : '—'}
          </span>
          {profile.run_rate_delta_pctl !== null && (
            <span className="text-xs text-[var(--text-muted)]">
              {`${ordinal(Math.round(profile.run_rate_delta_pctl * 100))} pctl`}
            </span>
          )}
        </p>
        <p className="flex items-baseline gap-2">
          <span className="text-[var(--text-secondary)]">Pace:</span>
          <span className="text-[var(--text-primary)] font-medium tabular-nums">
            {profile.pace_plays_per_game !== null ? profile.pace_plays_per_game.toFixed(1) : '—'}
          </span>
          <span className="text-[var(--text-secondary)]">plays/game</span>
          {profile.pace_pctl !== null && (
            <span className="text-xs text-[var(--text-muted)]">
              {`${ordinal(Math.round(profile.pace_pctl * 100))} pctl`}
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
