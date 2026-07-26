/**
 * The SVG half of the server chart renderer: a chart spec in, resvg-safe SVG
 * markup out.
 *
 * Deliberately free of `@resvg/resvg-js`, `node:fs` and `node:path` so it can
 * be imported and asserted on in a plain jsdom test. Rasterization lives in
 * `./png`; `./index` re-exports both for the route (phase 2.2) to wrap.
 *
 * ---------------------------------------------------------------------------
 * Why the streaming renderer, and why `react-dom/server.edge`
 * ---------------------------------------------------------------------------
 * `renderToStaticMarkup` was the obvious call here and it is not available.
 * App Route handlers -- including `src/app/api/chart/[chart]/route.ts`, the
 * only consumer of this module -- are bundled in React's **server** export
 * condition, where `react-dom/server` resolves to `server.react-server.js`.
 * That build exports exactly one renderer: `renderToReadableStream`. The
 * legacy sync entry points are not merely discouraged there, they do not
 * exist; Next additionally aliases `react-dom/server` in this layer to a shim
 * whose `renderToStaticMarkup` throws "do not use legacy react-dom/server
 * APIs" at request time. Importing it therefore compiles and then fails in
 * production, which is the worst of both worlds.
 *
 * `react-dom/server.edge` is the specifier that resolves to a real renderer in
 * this layer (Next maps it to its compiled Node build). The output is
 * byte-identical to what `renderToStaticMarkup` produced -- the snapshots in
 * ./__tests__/__snapshots__ are unchanged across this switch -- so the only
 * cost is that `renderChartSvg` is now async.
 */
import { renderToReadableStream } from 'react-dom/server.edge'
import type { ReactElement } from 'react'
import type { PlaycallingProfile } from '@/lib/queries/playcalling'
import { literalInk, type ChartThemeName } from '../tokens'
import { EmptyCard } from './emptyCard'
import { TeamPlaycallingChart } from './teamPlaycalling'
import { TeamMetricTrendChart, type TeamMetricTrend } from './teamMetricTrend'

/**
 * Charts this renderer can produce.
 *
 * Not one id per question -- `team-metric-trend` is a *primitive*: one metric
 * from a closed enum, up to four teams, any season range. Prefer widening a
 * primitive's parameters over adding an id.
 */
export const CHART_IDS = ['team-playcalling', 'team-metric-trend'] as const
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
  | { chart: 'team-metric-trend'; trend: TeamMetricTrend }
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
 * Async only because of the renderer it has to use -- see the module comment.
 */
export function renderChartSvg(spec: ChartSpec, options: ChartRenderOptions = {}): Promise<string> {
  const ink = literalInk(options.theme ?? 'light')

  switch (spec.chart) {
    case 'team-playcalling':
      return renderElement(<TeamPlaycallingChart profile={spec.profile} ink={ink} />)
    case 'team-metric-trend':
      return renderElement(<TeamMetricTrendChart trend={spec.trend} ink={ink} />)
    case 'empty':
      return renderElement(<EmptyCard title={spec.title} message={spec.message} ink={ink} />)
  }
}

/**
 * Drains React's streaming renderer to a complete string.
 *
 * The chart tree contains no Suspense boundary, so the whole document is the
 * shell and any render error rejects `renderToReadableStream` outright. The
 * explicit `onError` is belt-and-braces for that: without it React would log a
 * post-shell error and let a *truncated* SVG through, and truncated SVG is
 * exactly the input resvg turns into a plausible-looking wrong picture. Better
 * to throw and let the route serve its error card.
 */
async function renderElement(element: ReactElement): Promise<string> {
  let renderError: unknown = null

  const stream = await renderToReadableStream(element, {
    onError(error: unknown) {
      renderError ??= error
    },
  })

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let markup = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    markup += decoder.decode(value, { stream: true })
  }
  markup += decoder.decode()

  if (renderError) throw renderError
  return markup
}
