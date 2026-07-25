/**
 * The raster half of the server chart renderer: resvg-safe SVG in, PNG out.
 *
 * Kept apart from `./svg` because importing this pulls in the native
 * `@resvg/resvg-js` binary (declared in `serverExternalPackages`) and the
 * filesystem, neither of which the pure SVG path needs.
 */
import { Resvg } from '@resvg/resvg-js'
import { CHART_WIDTH } from '../presets'
import { assertChartFontsPresent, chartFontOptions } from './fonts'
import { renderChartSvg, type ChartRenderOptions, type ChartSpec } from './svg'

/**
 * Device-pixel multiplier. Discord renders attachments at roughly half their
 * pixel width on high-DPI displays, so 2x is what keeps the hand-drawn strokes
 * and 10px percentile captions from turning to mush.
 */
export const DEFAULT_PNG_SCALE = 2

export interface ChartPngOptions extends ChartRenderOptions {
  /** Multiplier on the 700-unit viewBox width. Defaults to 2. */
  scale?: number
}

/**
 * Rasterizes already-rendered SVG markup.
 *
 * `fitTo` scales by width; the height follows the viewBox aspect ratio, which
 * matters because chart height varies with row count.
 */
export function rasterizeChartSvg(svg: string, scale: number = DEFAULT_PNG_SCALE): Buffer {
  assertChartFontsPresent()

  const resvg = new Resvg(svg, {
    font: chartFontOptions(),
    fitTo: { mode: 'width', value: Math.round(CHART_WIDTH * scale) },
  })

  return resvg.render().asPng()
}

/**
 * Convenience: spec straight to PNG bytes. What the image route calls.
 *
 * Async because `renderChartSvg` is (React's server-condition build only ships
 * the streaming renderer -- see ./svg). Rasterization itself stays synchronous.
 */
export async function renderChartPng(spec: ChartSpec, options: ChartPngOptions = {}): Promise<Buffer> {
  return rasterizeChartSvg(await renderChartSvg(spec, options), options.scale ?? DEFAULT_PNG_SCALE)
}
