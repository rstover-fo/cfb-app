'use client'

import { useRef, useMemo, useCallback, useEffect } from 'react'
import rough from 'roughjs'
import { resolveColor, useChartTheme } from '@/lib/charts/theme'
import type { PredictionAccuracyRow } from '@/lib/queries/predictions'
import { PREDICTION_MODEL_VERSIONS, DEFAULT_PREDICTION_MODEL } from '@/lib/queries/constants'

interface AccuracyTrendChartProps {
  rows: PredictionAccuracyRow[]
}

// Reference lines: a break-even bettor needs > 50% just to keep pace, and
// standard -110 juice raises that bar to ~52.4% to actually turn a profit.
const COIN_FLIP = 0.5
const BREAK_EVEN_MINUS_110 = 0.524

const MODEL_LABELS: Record<string, string> = {
  elo_v1: 'Elo (v1)',
  elo_epa_blend_v1: 'Elo + EPA blend (v1)',
}

// The blended model is the house's headline model, so it gets the signature
// accent; the pure-Elo baseline gets the secondary semantic color. Neither
// model actually concerns run/pass play-calling -- this just reuses the
// app's two-series semantic palette per the chart-engineer convention.
function modelColorVar(model: string): string {
  return model === DEFAULT_PREDICTION_MODEL ? 'var(--color-run)' : 'var(--color-pass)'
}

const WIDTH = 700
const HEIGHT = 280
const PADDING = { top: 24, right: 24, bottom: 40, left: 48 }
const CHART_WIDTH = WIDTH - PADDING.left - PADDING.right
const CHART_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom

export function AccuracyTrendChart({ rows }: AccuracyTrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const roughGroupRef = useRef<SVGGElement>(null)

  // Base (edge_threshold = 0) rows only -- the trend tracks each model's
  // season-over-season ATS hit rate, not edge-filtered high-conviction
  // subsets (those are a different question, covered by the accuracy table's
  // footnote rather than this chart).
  const baseRows = useMemo(
    () => rows.filter(r => r.edge_threshold === 0 && r.ats_hit_rate != null),
    [rows],
  )

  const chartGeometry = useMemo(() => {
    if (baseRows.length === 0) return null

    const seasons = Array.from(new Set(baseRows.map(r => r.season))).sort((a, b) => a - b)
    if (seasons.length === 0) return null

    const series = PREDICTION_MODEL_VERSIONS
      .map(model => ({
        model,
        points: baseRows
          .filter(r => r.model_version === model)
          .sort((a, b) => a.season - b.season)
          .map(r => ({ season: r.season, value: r.ats_hit_rate as number })),
      }))
      .filter(s => s.points.length > 0)

    if (series.length === 0) return null

    const values = [
      ...series.flatMap(s => s.points.map(p => p.value)),
      COIN_FLIP,
      BREAK_EVEN_MINUS_110,
    ]
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const valueRange = maxVal - minVal || 1
    const valuePadding = valueRange * 0.15

    const getX = (season: number) => {
      const idx = seasons.indexOf(season)
      return PADDING.left + (idx / (seasons.length - 1 || 1)) * CHART_WIDTH
    }
    const getY = (val: number) => {
      const normalized = (val - (minVal - valuePadding)) / (valueRange + valuePadding * 2)
      return PADDING.top + (1 - normalized) * CHART_HEIGHT
    }

    const seriesPoints = series.map(s => ({
      model: s.model,
      points: s.points.map(p => ({ x: getX(p.season), y: getY(p.value), season: p.season, value: p.value })),
    }))

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
      pct,
      val: maxVal + valuePadding - pct * (valueRange + valuePadding * 2),
    }))

    return { seasons, getX, getY, seriesPoints, yTicks }
  }, [baseRows])

  // Draw roughjs chart elements
  const drawChart = useCallback(() => {
    const svg = svgRef.current
    const group = roughGroupRef.current
    if (!svg || !group || !chartGeometry) return

    while (group.firstChild) group.removeChild(group.firstChild)

    const rc = rough.svg(svg)
    const surfaceColor = resolveColor('var(--bg-surface)')

    for (const s of chartGeometry.seriesPoints) {
      const color = resolveColor(modelColorVar(s.model))

      if (s.points.length >= 2) {
        const line = rc.linearPath(
          s.points.map(p => [p.x, p.y] as [number, number]),
          { stroke: color, strokeWidth: 3, roughness: 1.0, bowing: 0.4 },
        )
        group.appendChild(line)
      }

      for (const p of s.points) {
        group.appendChild(rc.circle(p.x, p.y, 9, {
          fill: surfaceColor, fillStyle: 'solid',
          stroke: color, strokeWidth: 2, roughness: 0.5,
        }))
      }
    }
  }, [chartGeometry])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Redraw on theme change
  useChartTheme(drawChart)

  if (!chartGeometry) return null

  const { seasons, getX, getY, yTicks, seriesPoints } = chartGeometry

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-4">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Against-the-spread hit rate by season, one line per prediction model, from ${seasons[0]} to ${seasons[seasons.length - 1]}, against a 50% coin-flip reference`}
      >
        {/* Horizontal grid lines */}
        {yTicks.map(({ pct }) => (
          <line
            key={pct}
            x1={PADDING.left}
            y1={PADDING.top + pct * CHART_HEIGHT}
            x2={WIDTH - PADDING.right}
            y2={PADDING.top + pct * CHART_HEIGHT}
            stroke="var(--border)"
            strokeWidth={1}
            opacity={0.4}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map(({ pct, val }) => (
          <text
            key={pct}
            x={PADDING.left - 8}
            y={PADDING.top + pct * CHART_HEIGHT}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-[var(--text-muted)] text-xs"
          >
            {`${Math.round(val * 100)}%`}
          </text>
        ))}

        {/* X-axis labels */}
        {seasons.map(season => (
          <text
            key={season}
            x={getX(season)}
            y={HEIGHT - 12}
            textAnchor="middle"
            className="fill-[var(--text-muted)] text-xs"
          >
            {season}
          </text>
        ))}

        {/* Coin-flip reference line (50%) */}
        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={getY(COIN_FLIP)}
          y2={getY(COIN_FLIP)}
          stroke="var(--text-muted)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          opacity={0.7}
        />
        <text
          x={WIDTH - PADDING.right}
          y={getY(COIN_FLIP) - 6}
          textAnchor="end"
          className="fill-[var(--text-muted)] text-[10px]"
        >
          Coin flip (50%)
        </text>

        {/* Break-even reference line (-110 juice) */}
        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={getY(BREAK_EVEN_MINUS_110)}
          y2={getY(BREAK_EVEN_MINUS_110)}
          stroke="var(--text-muted)"
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.45}
        />
        <text
          x={WIDTH - PADDING.right}
          y={getY(BREAK_EVEN_MINUS_110) - 6}
          textAnchor="end"
          className="fill-[var(--text-muted)] text-[10px]"
          opacity={0.7}
        >
          Break-even at -110 (52.4%)
        </text>

        {/* Rough-drawn chart elements */}
        <g ref={roughGroupRef} />
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-3 pt-2 border-t border-[var(--border)]">
        {seriesPoints.map(s => (
          <span key={s.model} className="flex items-center gap-2 text-xs">
            <span className="w-4 h-0.5" style={{ backgroundColor: modelColorVar(s.model) }} />
            <span className="text-[var(--text-secondary)]">{MODEL_LABELS[s.model] ?? s.model}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
