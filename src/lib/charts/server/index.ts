/**
 * Server-side chart rendering -- the entry point the chart image route
 * (phase 2.2) and the `render_chart` MCP tool (phase 2.3) wrap.
 *
 * Typical use from a route handler:
 *
 * ```ts
 * const profile = await getPlaycallingProfile(team, season)
 * const png = await (profile
 *   ? renderChartPng({ chart: 'team-playcalling', profile }, { theme })
 *   : renderChartPng({ chart: 'empty', title: 'No playcalling profile yet',
 *                      message: `Nothing charted for ${team} in ${season}.` }, { theme }))
 * ```
 *
 * Everything here is pure given its input: data fetching belongs to the caller,
 * and roughjs runs seeded, so a given spec always rasterizes to the same bytes.
 *
 * Importing this module pulls in the native `@resvg/resvg-js` binary. Code that
 * only needs markup (tests, an SVG response) should import `./svg` directly.
 */
export {
  renderChartSvg,
  isChartId,
  CHART_IDS,
  type ChartId,
  type ChartSpec,
  type ChartRenderOptions,
} from './svg'

export {
  renderChartPng,
  rasterizeChartSvg,
  DEFAULT_PNG_SCALE,
  type ChartPngOptions,
} from './png'

export { CHART_FONT_DIR, chartFontFiles, assertChartFontsPresent } from './fonts'

export type { ChartThemeName, ChartInk } from '../tokens'
export { literalInk, VAR_INK } from '../tokens'
