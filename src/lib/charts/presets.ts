/**
 * Shared roughjs draw options and canvas geometry (docs/chart-style-spec.md §9).
 *
 * Imported by BOTH the client charts and the server-side renderer so the
 * numbers behind the house hand-drawn look exist in exactly one place. Must
 * stay DOM-free and free of `'use client'`: a server module that imports a
 * client-boundary module gets a client *reference*, not the function.
 */
import type { Options } from 'roughjs/bin/core'

/** Default canvas (spec §9). Height is a default, not a mandate; width is. */
export const CHART_WIDTH = 700
export const CHART_HEIGHT = 350

/** TrajectoryChart's padding -- the left-gutter/bottom-gutter axis convention. */
export const CHART_PADDING = { top: 30, right: 30, bottom: 50, left: 60 } as const

/**
 * Stable wobble (spec §9): passed as `seed` in every rough options object so
 * theme flips, re-renders, and re-rasterizations reproduce identical strokes.
 * Server rendering leans on this harder than the client does -- it is what
 * makes the emitted SVG snapshot-stable.
 */
export const ROUGH_SEED = 41

/** Primary series weights (spec §9). */
export const ROUGH_PRIMARY = { strokeWidth: 3, roughness: 1.0, bowing: 0.4 } as const
/** Secondary series weights (spec §9). */
export const ROUGH_SECONDARY = { strokeWidth: 2, roughness: 0.7, bowing: 0.3 } as const
/** Tertiary/context weights (spec §9) -- rules, annotations, dimmed series. */
export const ROUGH_TERTIARY = { strokeWidth: 1.5, roughness: 0.5, bowing: 0.2 } as const

/** Bar weights (spec §9). */
export const ROUGH_BAR = {
  strokeWidth: 1.5,
  roughness: 1.1,
  bowing: 0.5,
  hachureGap: 5,
  fillWeight: 1,
} as const

/**
 * The paired ±41° hachure rule (spec §10): mirrored series always lean apart,
 * so color is never the only channel separating the two sides.
 */
export const PAIRED_HACHURE_ANGLE = { left: -41, right: 41 } as const

/**
 * Rough options for one side of a paired/mirrored bar series
 * (PercentileBars / PlaycallingProfile layout).
 *
 * Re-exported from `src/lib/charts/series.ts` for existing client callers; it
 * lives here because it is pure and the server renderer needs it without
 * crossing the `'use client'` boundary.
 */
export function pairedBarOptions(color: string, side: 'left' | 'right', seed: number): Options {
  return {
    fill: color,
    stroke: color,
    fillStyle: 'hachure',
    hachureAngle: PAIRED_HACHURE_ANGLE[side],
    hachureGap: ROUGH_BAR.hachureGap,
    fillWeight: ROUGH_BAR.fillWeight,
    strokeWidth: ROUGH_BAR.strokeWidth,
    roughness: ROUGH_BAR.roughness,
    bowing: ROUGH_BAR.bowing,
    seed,
  }
}

/**
 * Font sizes, in px, matching the Tailwind classes the client scaffold uses.
 * resvg inherits nothing, so every server `<text>` states its size explicitly
 * and these keep the two worlds at the same scale.
 */
export const CHART_FONT_SIZE = {
  /** `text-[10px]` -- percentile captions. */
  caption: 10,
  /** footnote rules of thumb, between caption and xs. */
  footnote: 11,
  /** `text-xs` -- axis ticks, row labels, direct value labels. */
  xs: 12,
  /** `text-sm` -- tooltip/legend body. */
  sm: 14,
  /** `text-lg` -- ChartFrame title slot. */
  lg: 18,
} as const

/**
 * Vertical-centering factor. `dominant-baseline` support in resvg (usvg) is
 * partial, so server text centers on a line by shifting the baseline down by
 * `fontSize * TEXT_CENTER_DY_RATIO` instead of asking the renderer to do it.
 */
export const TEXT_CENTER_DY_RATIO = 0.35

/**
 * Baseline offset that vertically centers `fontSize` text on `y`. Rounded to
 * two decimals so float noise (12 * 0.35 = 4.199999999999999) stays out of the
 * emitted markup and the snapshots.
 */
export function centerDy(fontSize: number): number {
  return Math.round(fontSize * TEXT_CENTER_DY_RATIO * 100) / 100
}
