// @vitest-environment node
/**
 * The one rasterization test. Everything else asserts on SVG strings, because
 * PNG byte goldens go flaky across resvg bumps, font hinting, and
 * macOS-dev vs Linux-CI. This file therefore checks only properties that are
 * stable and meaningful: it is a real PNG, at the dimensions we asked for, big
 * enough to contain actual drawn content, and rendered with the *right fonts*.
 *
 * That last point is the reason this file exists at all. `@resvg/resvg-js`
 * 2.6.2 has no `fontBuffers` option -- passing one is silently ignored, every
 * glyph falls back, and a test that only checks "a PNG came out" passes
 * happily while the typography is completely wrong. The font assertions below
 * are the ones that would have caught it.
 */
import { describe, it, expect } from 'vitest'
import { Resvg } from '@resvg/resvg-js'
import { PLAYCALLING_PROFILE } from '@/lib/fixtures/gallery/team'
import {
  CLEMSON_SP_DEFENSE,
  OKLAHOMA_SP_DEFENSE,
  SP_DEFENSE_2025,
} from '@/lib/queries/__tests__/fixtures/teamMetric'
import { renderChartSvg, type ChartSpec } from '../svg'
import { renderChartPng, DEFAULT_PNG_SCALE } from '../png'
import { chartFontFiles, chartFontOptions, assertChartFontsPresent } from '../fonts'
import { CHART_FONT_FAMILY } from '../../tokens'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Reads width/height out of the IHDR chunk, which always comes first. */
function readIhdr(png: Buffer): { width: number; height: number } {
  expect(png.subarray(0, 8).equals(PNG_MAGIC), 'not a PNG').toBe(true)
  expect(png.subarray(12, 16).toString('ascii'), 'first chunk is not IHDR').toBe('IHDR')
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

function viewBoxSize(svg: string): { width: number; height: number } {
  const m = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/)
  if (!m) throw new Error('no viewBox')
  return { width: Number(m[1]), height: Number(m[2]) }
}

const chartSpec = { chart: 'team-playcalling', profile: PLAYCALLING_PROFILE } as const

describe('renderChartPng', () => {
  it('produces a real PNG at 2x the viewBox, sized like a drawn chart', async () => {
    const png = await renderChartPng(chartSpec)
    const box = viewBoxSize(await renderChartSvg(chartSpec))

    const { width, height } = readIhdr(png)
    expect(width).toBe(box.width * DEFAULT_PNG_SCALE)
    expect(height).toBe(box.height * DEFAULT_PNG_SCALE)

    // A band, not a golden: below this is a blank or glyph-less canvas, above
    // it is a runaway. The real output sits comfortably in the middle.
    expect(png.byteLength).toBeGreaterThan(5_000)
    expect(png.byteLength).toBeLessThan(500_000)
  })

  it('honours an explicit scale', async () => {
    const { width } = readIhdr(await renderChartPng(chartSpec, { scale: 1 }))
    expect(width).toBe(700)
  })

  it('renders the dark palette to a different image', async () => {
    const light = await renderChartPng(chartSpec, { theme: 'light' })
    const dark = await renderChartPng(chartSpec, { theme: 'dark' })
    expect(readIhdr(light)).toEqual(readIhdr(dark))
    expect(light.equals(dark)).toBe(false)
  })

  it('rasterizes the trend chart at its own dynamic height', async () => {
    // The one rasterization check for the generative chart: real PNG, at the
    // dimensions its spec implies. Everything else about this chart is
    // asserted on the SVG, where a diff is reviewable -- see
    // ./teamMetricTrend.test.tsx.
    const trendSpec: ChartSpec = {
      chart: 'team-metric-trend',
      trend: {
        metric: 'sp_defense',
        from: 2015,
        to: 2025,
        series: [OKLAHOMA_SP_DEFENSE, CLEMSON_SP_DEFENSE],
        annotations: [{ season: 2022, label: 'Venables hired' }],
      },
    }

    const png = await renderChartPng(trendSpec)
    const box = viewBoxSize(await renderChartSvg(trendSpec))

    const { width, height } = readIhdr(png)
    expect(width).toBe(700 * DEFAULT_PNG_SCALE)
    expect(height).toBe(box.height * DEFAULT_PNG_SCALE)
    // Taller than the default canvas: a legend row plus the annotation band.
    expect(box.height).toBeGreaterThan(350)

    expect(png.byteLength).toBeGreaterThan(5_000)
    expect(png.byteLength).toBeLessThan(500_000)
  })

  it('rasterizes the bars chart at its own dynamic height', async () => {
    // One rasterization check per SHAPE, same rationale as the trend one above:
    // everything else about this chart is asserted on the SVG, where a diff is
    // reviewable -- see ./teamMetricBars.test.tsx.
    const barsSpec: ChartSpec = {
      chart: 'team-metric-bars',
      bars: { metric: 'sp_defense', season: 2025, series: SP_DEFENSE_2025 },
    }

    const png = await renderChartPng(barsSpec)
    const box = viewBoxSize(await renderChartSvg(barsSpec))

    const { width, height } = readIhdr(png)
    expect(width).toBe(700 * DEFAULT_PNG_SCALE)
    expect(height).toBe(box.height * DEFAULT_PNG_SCALE)
    // Four rows, so shorter than the default canvas rather than taller: height
    // follows the row count (spec §9 Gate B).
    expect(box.height).toBeLessThan(400)

    expect(png.byteLength).toBeGreaterThan(5_000)
    expect(png.byteLength).toBeLessThan(500_000)
  })

  it('rasterizes the empty card', async () => {
    const png = await renderChartPng({ chart: 'empty', title: 'No playcalling profile yet', message: 'Nothing charted yet.' })
    const { width, height } = readIhdr(png)
    expect(width).toBe(1400)
    expect(height).toBe(400)
    expect(png.byteLength).toBeGreaterThan(5_000)
  })
})

describe('fonts', () => {
  /** Rasterizes one line of text in `family`, at a fixed size, on white. */
  function textPng(family: string, font: Record<string, unknown>): Buffer {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="60" viewBox="0 0 400 60">' +
      '<rect x="0" y="0" width="400" height="60" fill="#ffffff"/>' +
      `<text x="8" y="40" fill="#000000" font-family="${family}" font-size="28">San José State A&amp;M</text>` +
      '</svg>'
    return new Resvg(svg, { font: font as never }).render().asPng()
  }

  it('has every vendored TTF on disk', () => {
    expect(() => assertChartFontsPresent()).not.toThrow()
    expect(chartFontFiles()).toHaveLength(4)
  })

  it('actually draws glyphs -- text is not silently falling back to nothing', () => {
    // With no fonts loaded at all, resvg still emits a valid PNG; it is just
    // blank. That is exactly the failure mode a "did a PNG come out?" test
    // cannot see, so compare against it directly.
    const drawn = textPng(CHART_FONT_FAMILY.body, chartFontOptions())
    const blank = textPng(CHART_FONT_FAMILY.body, { loadSystemFonts: false })
    expect(drawn.byteLength).toBeGreaterThan(blank.byteLength * 5)
  })

  it('resolves the headline and body families to genuinely different faces', () => {
    // If `fontFiles` were ignored (or both families fell back to one default),
    // these two renders would be byte-identical. That equality is the tell.
    const headline = textPng(CHART_FONT_FAMILY.headline, chartFontOptions())
    const body = textPng(CHART_FONT_FAMILY.body, chartFontOptions())
    expect(headline.equals(body)).toBe(false)
    expect(headline.byteLength).toBeGreaterThan(1_000)
    expect(body.byteLength).toBeGreaterThan(1_000)
  })

  it('renders accented glyphs from the vendored faces', () => {
    // Guards against a subset font sneaking in: "José" must differ from the
    // same string with the accent stripped.
    const accented = textPng(CHART_FONT_FAMILY.body, chartFontOptions())
    const plain = new Resvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="60" viewBox="0 0 400 60">' +
        '<rect x="0" y="0" width="400" height="60" fill="#ffffff"/>' +
        `<text x="8" y="40" fill="#000000" font-family="${CHART_FONT_FAMILY.body}" font-size="28">San Jose State A&amp;M</text>` +
        '</svg>',
      { font: chartFontOptions() as never },
    )
      .render()
      .asPng()
    expect(accented.equals(plain)).toBe(false)
  })
})
