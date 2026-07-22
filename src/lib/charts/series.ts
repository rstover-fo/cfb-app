'use client'

/**
 * Series ink helpers (docs/chart-style-spec.md §6, §10). Called inside
 * `drawChart` only -- these resolve to concrete color strings that roughjs
 * bakes in at draw time, so consumers must redraw via `useChartTheme`.
 */
import type { Options } from 'roughjs/bin/core'
import { resolveColor } from './theme'

export type SeriesRole = 'run' | 'pass' | 'positive' | 'negative' | 'neutral'

/**
 * Semantic series/category ink map.
 *
 * The #6B635A split rule (spec §6): that hex is shared by light-mode
 * `--text-muted` and the theme-invariant `--color-neutral`. As a neutral
 * *series/category* color it is `--color-neutral` -- that is what
 * `inkFor('neutral')` returns. As text/stroke/axis ink it is `--text-muted`
 * (it must flip in dark mode) -- resolve that via
 * `resolveColor(CHART_INK.muted)`, never through this map.
 */
const ROLE_TOKENS: Record<SeriesRole, string> = {
  run: 'var(--color-run)',
  pass: 'var(--color-pass)',
  positive: 'var(--color-positive)',
  negative: 'var(--color-negative)',
  neutral: 'var(--color-neutral)',
}

export function inkFor(role: SeriesRole): string {
  return resolveColor(ROLE_TOKENS[role])
}

/**
 * Team brand ink: an already-resolved hex passes through `resolveColor`
 * unchanged by design; missing team colors fall back to `--text-primary`
 * (home) / `--text-muted` (away) per spec §6. Apply the result only inside
 * rough draw calls, never to native SVG attributes.
 */
export function teamInk(hex: string | null, fallback: 'primary' | 'muted'): string {
  if (hex) return resolveColor(hex)
  return resolveColor(fallback === 'primary' ? 'var(--text-primary)' : 'var(--text-muted)')
}

/**
 * Rough options for one side of a paired/mirrored bar series
 * (PercentileBars / PlaycallingProfile layout). Mirrored series ALWAYS use
 * the paired ±41° hachure rule -- left leans -41°, right +41° -- so color
 * is never the only channel separating sides. Bar defaults per spec §9.
 */
export function pairedBarOptions(color: string, side: 'left' | 'right', seed: number): Options {
  return {
    fill: color,
    stroke: color,
    fillStyle: 'hachure',
    hachureAngle: side === 'left' ? -41 : 41,
    hachureGap: 5,
    fillWeight: 1,
    strokeWidth: 1.5,
    roughness: 1.1,
    bowing: 0.5,
    seed,
  }
}
