'use client'

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { Strategy } from '@phosphor-icons/react'
import rough from 'roughjs'
import { useChartTheme } from '@/lib/charts/theme'
import { inkFor, pairedBarOptions } from '@/lib/charts/series'
import { ChartFrame } from '@/lib/charts/ChartFrame'
import { ChartTooltip } from '@/lib/charts/ChartTooltip'
import type { ChartTooltipRow } from '@/lib/charts/ChartTooltip'
import { ChartLegend } from '@/lib/charts/ChartLegend'
import type { ChartLegendItem } from '@/lib/charts/ChartLegend'
import { formatOrdinal } from '@/lib/utils'
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

/** Stable wobble (spec §9): identical strokes across re-renders and theme flips. */
const ROUGH_SEED = 38
/** Reserves height for the densest row (Overall: run + pass + 2 extras + percentile). */
const TOOLTIP_MIN_ROWS = 5

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
    const runColor = inkFor('run')
    const passColor = inkFor('pass')

    rows.forEach((row, i) => {
      const y = rowTop(i) + (ROW_HEIGHT - BAR_HEIGHT) / 2
      const runWidth = row.runRate * HALF_WIDTH
      const passWidth = (1 - row.runRate) * HALF_WIDTH

      // Run share, extending left from the center axis; pass share,
      // extending right. Paired ±41° hachure so the sides read apart from
      // color alone (spec §10 pairedBarOptions).
      if (runWidth > 0) {
        group.appendChild(rc.rectangle(
          CENTER_X - runWidth, y, runWidth, BAR_HEIGHT,
          pairedBarOptions(runColor, 'left', ROUGH_SEED),
        ))
      }
      if (passWidth > 0) {
        group.appendChild(rc.rectangle(
          CENTER_X, y, passWidth, BAR_HEIGHT,
          pairedBarOptions(passColor, 'right', ROUGH_SEED),
        ))
      }
    })
  }, [rows, rowTop])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  const hoveredRow = hoveredIndex !== null ? rows[hoveredIndex] : null

  const tooltipRows: ChartTooltipRow[] = hoveredRow
    ? [
        { swatch: 'solid', color: 'var(--color-run)', label: 'Run:', value: sharePct(hoveredRow.runRate) },
        { swatch: 'solid', color: 'var(--color-pass)', label: 'Pass:', value: sharePct(1 - hoveredRow.runRate) },
        ...hoveredRow.extras.map(extra => ({
          swatch: 'none' as const, label: `${extra.label}:`, value: extra.value,
        })),
        ...(hoveredRow.pctl
          ? [{
              swatch: 'none' as const,
              muted: true,
              label: `${formatOrdinal(Math.round(hoveredRow.pctl.value * 100))} percentile ${hoveredRow.pctl.lean} in FBS`,
            }]
          : []),
      ]
    : []

  const legendItems: ChartLegendItem[] = [
    { key: 'run', label: 'Run', swatch: 'hachure', color: 'var(--color-run)' },
    { key: 'pass', label: 'Pass', swatch: 'hachure', color: 'var(--color-pass)' },
  ]

  return (
    <ChartFrame
      ariaLabel={profile ? `Run versus pass share by situation for ${profile.team}, ${profile.season} season` : undefined}
      empty={!profile}
      emptyState={{
        icon: Strategy,
        title: 'No playcalling profile yet',
        description: 'Playcalling profile publishes after enough plays are charted.',
      }}
    >
      {a11y => {
        const activeProfile = profile!

        return (
          <>
            <ChartLegend items={legendItems} position="above" />

            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${height}`}
              className="w-full h-auto"
              {...a11y}
              onMouseLeave={() => setHoveredIndex(null)}
            >
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
                        {`${formatOrdinal(Math.round(row.pctl.value * 100))} pctl ${row.pctl.lean}`}
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
              <g ref={roughGroupRef} data-testid="rough-layer" />

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

            <ChartTooltip
              header={hoveredRow?.label}
              rows={tooltipRows}
              prompt="Hover a situation for details"
              minRows={TOOLTIP_MIN_ROWS}
            />

            {/* Compact identity stat lines */}
            <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <p className="flex items-baseline gap-2">
                <span className="text-[var(--text-secondary)]">Run-rate delta (leading − trailing):</span>
                <span className="text-[var(--text-primary)] font-medium tabular-nums">
                  {activeProfile.run_rate_delta !== null
                    ? `${activeProfile.run_rate_delta >= 0 ? '+' : ''}${(activeProfile.run_rate_delta * 100).toFixed(1)} pts`
                    : '—'}
                </span>
                {activeProfile.run_rate_delta_pctl !== null && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {`${formatOrdinal(Math.round(activeProfile.run_rate_delta_pctl * 100))} pctl`}
                  </span>
                )}
              </p>
              <p className="flex items-baseline gap-2">
                <span className="text-[var(--text-secondary)]">Pace:</span>
                <span className="text-[var(--text-primary)] font-medium tabular-nums">
                  {activeProfile.pace_plays_per_game !== null ? activeProfile.pace_plays_per_game.toFixed(1) : '—'}
                </span>
                <span className="text-[var(--text-secondary)]">plays/game</span>
                {activeProfile.pace_pctl !== null && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {`${formatOrdinal(Math.round(activeProfile.pace_pctl * 100))} pctl`}
                  </span>
                )}
              </p>
            </div>
          </>
        )
      }}
    </ChartFrame>
  )
}
