'use client'

import { useRef, useEffect, useCallback, useMemo } from 'react'
import rough from 'roughjs'
import { ChartBarHorizontal } from '@phosphor-icons/react'
import { EmptyState } from '@/components/EmptyState'
import { resolveColor, useChartTheme } from '@/lib/charts/theme'
import { formatOrdinal } from '@/lib/utils'
import type { PlayerComparisonRow } from '@/app/players/actions'

// ---------------------------------------------------------------------------
// PercentileBars -- mirrored horizontal percentile bars ("tornado" layout).
//
// One row per position-relevant stat: player 1's percentile bar extends left
// and player 2's extends right from a shared center gutter that carries the
// stat name. Bar length encodes the position-group percentile (0-1 fraction
// from api.player_comparison); raw stat values annotate the bar tips, and a
// dashed 50th-percentile tick on each side gives the "league median" anchor.
// Rough hachure fills follow the house hand-drawn recipe, with opposite
// hachure angles per player so the two sides stay distinguishable beyond
// color alone.
// ---------------------------------------------------------------------------

type StatKey =
  | 'pass_yds' | 'pass_td' | 'pass_pct'
  | 'rush_yds' | 'rush_td' | 'rush_ypc'
  | 'rec_yds' | 'rec_td'
  | 'tackles' | 'sacks' | 'tfl'
  | 'ppa_avg'

interface StatDef {
  key: StatKey
  label: string
  pctlKey: keyof PlayerComparisonRow
  format: (v: number) => string
}

const count = (v: number) => Math.round(v).toLocaleString('en-US')
const oneDecimal = (v: number) => v.toFixed(1)
const percent = (v: number) => `${(v * 100).toFixed(1)}%`
// PPA/play follows the house EPA-per-play precision: signed, three decimals.
const signedPpa = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}`

/** Canonical display order for every comparable stat. */
const STAT_DEFS: StatDef[] = [
  { key: 'pass_yds', label: 'Pass Yds', pctlKey: 'pass_yds_pctl', format: count },
  { key: 'pass_td', label: 'Pass TD', pctlKey: 'pass_td_pctl', format: count },
  { key: 'pass_pct', label: 'Comp %', pctlKey: 'pass_pct_pctl', format: percent },
  { key: 'rush_yds', label: 'Rush Yds', pctlKey: 'rush_yds_pctl', format: count },
  { key: 'rush_td', label: 'Rush TD', pctlKey: 'rush_td_pctl', format: count },
  { key: 'rush_ypc', label: 'Rush YPC', pctlKey: 'rush_ypc_pctl', format: oneDecimal },
  { key: 'rec_yds', label: 'Rec Yds', pctlKey: 'rec_yds_pctl', format: count },
  { key: 'rec_td', label: 'Rec TD', pctlKey: 'rec_td_pctl', format: count },
  { key: 'tackles', label: 'Tackles', pctlKey: 'tackles_pctl', format: count },
  { key: 'sacks', label: 'Sacks', pctlKey: 'sacks_pctl', format: oneDecimal },
  { key: 'tfl', label: 'TFL', pctlKey: 'tfl_pctl', format: oneDecimal },
  { key: 'ppa_avg', label: 'PPA/Play', pctlKey: 'ppa_avg_pctl', format: signedPpa },
]

// Position-group relevance: QB gets the passing set, RB rushing + receiving,
// WR/TE receiving, defenders the havoc set; ppa_avg rides along for every
// group (it is null-skipped per row when uncharted, e.g. most defenders).
const STAT_SETS: Record<string, StatKey[]> = {
  QB: ['pass_yds', 'pass_td', 'pass_pct', 'ppa_avg'],
  RB: ['rush_yds', 'rush_td', 'rush_ypc', 'rec_yds', 'rec_td', 'ppa_avg'],
  WR: ['rec_yds', 'rec_td', 'ppa_avg'],
  TE: ['rec_yds', 'rec_td', 'ppa_avg'],
  DEF: ['tackles', 'sacks', 'tfl', 'ppa_avg'],
}

// Cross-position stats with broad coverage, for players whose group is
// unknown (mirrors PercentileRadar's DEFAULT axes).
const DEFAULT_SET: StatKey[] = ['pass_yds', 'rush_yds', 'rec_yds', 'tackles', 'ppa_avg']

// Same defensive alias set PercentileRadar uses for raw position fallbacks.
const DEFENSE_POSITIONS = new Set([
  'DL', 'DE', 'DT', 'NT', 'LB', 'ILB', 'OLB', 'MLB',
  'DB', 'CB', 'S', 'FS', 'SS', 'EDGE',
])

function statSetFor(positionGroup: string | null, position: string | null): StatKey[] {
  for (const candidate of [positionGroup, position]) {
    if (!candidate) continue
    const upper = candidate.toUpperCase()
    if (STAT_SETS[upper]) return STAT_SETS[upper]
    if (DEFENSE_POSITIONS.has(upper)) return STAT_SETS.DEF
  }
  return DEFAULT_SET
}

interface BarRow {
  def: StatDef
  p1Pctl: number | null
  p2Pctl: number | null
  p1Value: string | null
  p2Value: string | null
}

function buildRows(player1: PlayerComparisonRow, player2: PlayerComparisonRow): BarRow[] {
  // A mixed pairing (e.g. QB vs RB) shows the union of both relevance sets,
  // in canonical order -- null handling below turns the off-position side
  // into a single-sided bar with a muted "no data" note.
  const set1 = new Set(statSetFor(player1.position_group, player1.position))
  const set2 = new Set(statSetFor(player2.position_group, player2.position))

  const rows: BarRow[] = []
  for (const def of STAT_DEFS) {
    if (!set1.has(def.key) && !set2.has(def.key)) continue

    const p1Pctl = player1[def.pctlKey] as number | null
    const p2Pctl = player2[def.pctlKey] as number | null
    // A stat neither player has a percentile for says nothing -- skip the row.
    if (p1Pctl == null && p2Pctl == null) continue

    const p1Raw = player1[def.key] as number | null
    const p2Raw = player2[def.key] as number | null
    rows.push({
      def,
      p1Pctl,
      p2Pctl,
      p1Value: p1Raw != null ? def.format(p1Raw) : null,
      p2Value: p2Raw != null ? def.format(p2Raw) : null,
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const WIDTH = 800
const LEGEND_H = 36
const ROW_H = 48
const FOOTER_H = 26
const CENTER = WIDTH / 2
const GUTTER_HALF = 64 // half-width of the center stat-label gutter
const EDGE_PAD = 96 // room outside the bars for tip labels
const BAR_MAX = CENTER - GUTTER_HALF - EDGE_PAD // full-scale (100th pctl) bar length
const BAR_H = 16

const LEFT_EDGE = CENTER - GUTTER_HALF
const RIGHT_EDGE = CENTER + GUTTER_HALF

function barLength(pctl: number): number {
  // Floor at 2px so a 0th-percentile season still leaves a visible mark.
  return Math.max(2, pctl * BAR_MAX)
}

interface PercentileBarsProps {
  player1: PlayerComparisonRow
  player2: PlayerComparisonRow
}

export function PercentileBars({ player1, player2 }: PercentileBarsProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)

  const rows = useMemo(() => buildRows(player1, player2), [player1, player2])

  const height = LEGEND_H + rows.length * ROW_H + FOOTER_H

  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const p1Color = resolveColor('var(--color-run)')
    const p2Color = resolveColor('var(--color-pass)')

    const barOptions = (color: string, hachureAngle: number) => ({
      stroke: color,
      strokeWidth: 1.2,
      fill: color,
      fillStyle: 'hachure' as const,
      hachureAngle,
      hachureGap: 4,
      roughness: 1.2,
      bowing: 0.6,
    })

    // Legend swatches beside the player names.
    group.appendChild(rc.rectangle(8, 10, 12, 12, barOptions(p1Color, -41)))
    group.appendChild(rc.rectangle(WIDTH - 20, 10, 12, 12, barOptions(p2Color, 41)))

    rows.forEach((row, i) => {
      const midY = LEGEND_H + i * ROW_H + ROW_H / 2
      const barY = midY - BAR_H / 2

      if (row.p1Pctl != null) {
        const len = barLength(row.p1Pctl)
        group.appendChild(
          rc.rectangle(LEFT_EDGE - len, barY, len, BAR_H, barOptions(p1Color, -41))
        )
      }
      if (row.p2Pctl != null) {
        const len = barLength(row.p2Pctl)
        group.appendChild(
          rc.rectangle(RIGHT_EDGE, barY, len, BAR_H, barOptions(p2Color, 41))
        )
      }
    })
  }, [rows])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  useChartTheme(drawChart)

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ChartBarHorizontal}
        title="No percentile data for this pairing"
        description="Percentiles publish once a player has a charted stat season — try another season or pairing."
      />
    )
  }

  const ordinal = (pctl: number) => `${formatOrdinal(Math.round(pctl * 100))} pctl`

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="w-full"
      role="img"
      aria-label={`Mirrored percentile bars comparing ${player1.name} (left) and ${player2.name} (right) across ${rows.length} stats, relative to their position groups`}
    >
      {/* Legend: player names beside the rough swatches drawn at the top corners */}
      <text
        x={26}
        y={20}
        fill="var(--color-run)"
        fontSize={12}
        fontWeight={500}
        fontFamily="var(--font-body)"
      >
        {player1.name}
      </text>
      <text
        x={WIDTH - 26}
        y={20}
        fill="var(--color-pass)"
        fontSize={12}
        fontWeight={500}
        fontFamily="var(--font-body)"
        textAnchor="end"
      >
        {player2.name}
      </text>

      {/* Center gutter rules */}
      <line
        x1={LEFT_EDGE}
        y1={LEGEND_H}
        x2={LEFT_EDGE}
        y2={height - FOOTER_H}
        stroke="var(--border)"
        strokeWidth={1}
      />
      <line
        x1={RIGHT_EDGE}
        y1={LEGEND_H}
        x2={RIGHT_EDGE}
        y2={height - FOOTER_H}
        stroke="var(--border)"
        strokeWidth={1}
      />

      {rows.map((row, i) => {
        const midY = LEGEND_H + i * ROW_H + ROW_H / 2
        const tickHalf = BAR_H / 2 + 5

        return (
          <g key={row.def.key} data-testid={`pctl-row-${row.def.key}`}>
            {/* Stat name in the shared center gutter */}
            <text
              x={CENTER}
              y={midY + 3}
              fill="var(--text-secondary)"
              fontSize={10}
              letterSpacing="0.08em"
              fontFamily="var(--font-body)"
              textAnchor="middle"
            >
              {row.def.label.toUpperCase()}
            </text>

            {/* 50th percentile ticks */}
            <line
              x1={LEFT_EDGE - BAR_MAX / 2}
              y1={midY - tickHalf}
              x2={LEFT_EDGE - BAR_MAX / 2}
              y2={midY + tickHalf}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <line
              x1={RIGHT_EDGE + BAR_MAX / 2}
              y1={midY - tickHalf}
              x2={RIGHT_EDGE + BAR_MAX / 2}
              y2={midY + tickHalf}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />

            {/* Player 1 (left) tip labels, or a muted no-data note */}
            {row.p1Pctl != null ? (
              <g>
                <text
                  x={LEFT_EDGE - barLength(row.p1Pctl) - 8}
                  y={midY - 1}
                  fill="var(--text-primary)"
                  fontSize={11}
                  fontFamily="var(--font-body)"
                  textAnchor="end"
                  className="tabular-nums"
                >
                  {row.p1Value ?? '—'}
                </text>
                <text
                  x={LEFT_EDGE - barLength(row.p1Pctl) - 8}
                  y={midY + 11}
                  fill="var(--text-muted)"
                  fontSize={9}
                  fontFamily="var(--font-body)"
                  textAnchor="end"
                  className="tabular-nums"
                >
                  {ordinal(row.p1Pctl)}
                </text>
              </g>
            ) : (
              <text
                x={LEFT_EDGE - 8}
                y={midY + 3}
                fill="var(--text-muted)"
                fontSize={10}
                fontFamily="var(--font-body)"
                textAnchor="end"
              >
                no data
              </text>
            )}

            {/* Player 2 (right) tip labels, or a muted no-data note */}
            {row.p2Pctl != null ? (
              <g>
                <text
                  x={RIGHT_EDGE + barLength(row.p2Pctl) + 8}
                  y={midY - 1}
                  fill="var(--text-primary)"
                  fontSize={11}
                  fontFamily="var(--font-body)"
                  className="tabular-nums"
                >
                  {row.p2Value ?? '—'}
                </text>
                <text
                  x={RIGHT_EDGE + barLength(row.p2Pctl) + 8}
                  y={midY + 11}
                  fill="var(--text-muted)"
                  fontSize={9}
                  fontFamily="var(--font-body)"
                  className="tabular-nums"
                >
                  {ordinal(row.p2Pctl)}
                </text>
              </g>
            ) : (
              <text
                x={RIGHT_EDGE + 8}
                y={midY + 3}
                fill="var(--text-muted)"
                fontSize={10}
                fontFamily="var(--font-body)"
              >
                no data
              </text>
            )}
          </g>
        )
      })}

      {/* Footer: 50th percentile captions under the ticks */}
      <text
        x={LEFT_EDGE - BAR_MAX / 2}
        y={height - 9}
        fill="var(--text-muted)"
        fontSize={9}
        fontFamily="var(--font-body)"
        textAnchor="middle"
        className="tabular-nums"
      >
        50th pctl
      </text>
      <text
        x={RIGHT_EDGE + BAR_MAX / 2}
        y={height - 9}
        fill="var(--text-muted)"
        fontSize={9}
        fontFamily="var(--font-body)"
        textAnchor="middle"
        className="tabular-nums"
      >
        50th pctl
      </text>

      {/* roughjs bars render into this group */}
      <g ref={roughGroupRef} data-testid="rough-layer" />
    </svg>
  )
}
