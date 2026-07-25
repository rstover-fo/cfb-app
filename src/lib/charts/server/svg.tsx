/**
 * The SVG half of the server chart renderer: a chart spec in, resvg-safe SVG
 * markup out.
 *
 * Deliberately free of `@resvg/resvg-js`, `node:fs` and `node:path` so it can
 * be imported and asserted on in a plain jsdom test. Rasterization lives in
 * `./png`; `./index` re-exports both for the route (phase 2.2) to wrap.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import type { PlaycallingProfile } from '@/lib/queries/playcalling'
import { literalInk, type ChartThemeName } from '../tokens'
import { EmptyCard } from './emptyCard'
import { TeamPlaycallingChart } from './teamPlaycalling'

/** Charts this renderer can produce. Phase 2.1 ships exactly one. */
export const CHART_IDS = ['team-playcalling'] as const
export type ChartId = (typeof CHART_IDS)[number]

export function isChartId(value: string): value is ChartId {
  return (CHART_IDS as readonly string[]).includes(value)
}

/**
 * What to draw. A discriminated union rather than an id + loose bag so the
 * route cannot ask for a chart without the data it needs, and so adding a
 * second chart is a compile error everywhere it must be handled.
 */
export type ChartSpec =
  | { chart: 'team-playcalling'; profile: PlaycallingProfile }
  | { chart: 'empty'; title: string; message?: string }

export interface ChartRenderOptions {
  /** Palette to render in. Defaults to light -- the site's default mode. */
  theme?: ChartThemeName
}

/**
 * Renders a chart spec to standalone SVG markup.
 *
 * Pure: no I/O, no fetching, no clock, no randomness beyond roughjs's seeded
 * wobble. The same spec always yields the same bytes, which is what lets the
 * route cache aggressively and what makes the snapshot tests trustworthy.
 */
export function renderChartSvg(spec: ChartSpec, options: ChartRenderOptions = {}): string {
  const ink = literalInk(options.theme ?? 'light')

  switch (spec.chart) {
    case 'team-playcalling':
      return renderToStaticMarkup(<TeamPlaycallingChart profile={spec.profile} ink={ink} />)
    case 'empty':
      return renderToStaticMarkup(<EmptyCard title={spec.title} message={spec.message} ink={ink} />)
  }
}
