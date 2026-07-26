/**
 * SVG-level tests for the server chart renderer.
 *
 * Following the `src/lib/mcp/__tests__/` convention, nothing here touches
 * Supabase: the renderer is pure by contract (data in, markup out), so the
 * query layer is represented by its own fixtures and the module only imports
 * `PlaycallingProfile` as a *type*, which erases at compile time. A test that
 * needed a Supabase mock would itself be evidence the renderer had grown a
 * fetch it should not have.
 *
 * Snapshots are of the SVG string, never PNG bytes -- byte goldens go flaky
 * across resvg bumps, font hinting, and macOS-dev vs Linux-CI. roughjs runs
 * seeded, so the SVG is deterministic.
 */
import { describe, it, expect } from 'vitest'
import { createPlaycallingProfileRow } from '@/lib/queries/__tests__/fixtures/playcalling'
import { PLAYCALLING_PROFILE } from '@/lib/fixtures/gallery/team'
import { renderChartSvg, isChartId, CHART_IDS } from '../svg'
import { teamPlaycallingHeight } from '../teamPlaycalling'
import { buildPlaycallingRows } from '../../playcallingRows'
import { literalInk, VAR_INK } from '../../tokens'
import { gridLinesY, axisLabelsY, axisLabelsX } from '../../axes'
import { renderToStaticMarkup } from 'react-dom/server'
import { expectResvgSafe, elidePathData, cheapHash } from './resvgSafe'

const profile = PLAYCALLING_PROFILE
const chartSpec = { chart: 'team-playcalling', profile } as const
const emptySpec = {
  chart: 'empty',
  title: 'No playcalling profile yet',
  message: 'Nothing charted for Oklahoma in 2019 — try a more recent season.',
} as const

describe('renderChartSvg — resvg safety', () => {
  it('emits resvg-safe markup for the chart', async () => {
    expectResvgSafe(await renderChartSvg(chartSpec))
  })

  it('emits resvg-safe markup for the chart in dark mode', async () => {
    expectResvgSafe(await renderChartSvg(chartSpec, { theme: 'dark' }))
  })

  it('emits resvg-safe markup for the empty card', async () => {
    expectResvgSafe(await renderChartSvg(emptySpec))
  })

  it('emits resvg-safe markup for an empty card with no message', async () => {
    expectResvgSafe(await renderChartSvg({ chart: 'empty', title: 'No data' }))
  })
})

describe('renderChartSvg — determinism', () => {
  it('is byte-identical across renders (seeded roughjs)', async () => {
    expect(await renderChartSvg(chartSpec)).toBe(await renderChartSvg(chartSpec))
  })

  it('pins the full-byte output', async () => {
    // A one-line guard on the exact bytes, including every path coordinate.
    // The reviewable form of the same output is the snapshot below.
    expect(cheapHash(await renderChartSvg(chartSpec))).toMatchInlineSnapshot(`"51d2cf58"`)
  })

  it('matches the reviewable structural snapshot', async () => {
    // Path geometry is digested so the diff stays readable: colors, fonts,
    // sizes and coordinates are all still visible and still asserted.
    expect(elidePathData(await renderChartSvg(chartSpec))).toMatchSnapshot()
  })

  it('matches the empty-card snapshot in full', async () => {
    expect(await renderChartSvg(emptySpec)).toMatchSnapshot()
  })
})

describe('renderChartSvg — theming', () => {
  it('bakes literal light-mode ink into the markup', async () => {
    const svg = await renderChartSvg(chartSpec, { theme: 'light' })
    expect(svg).toContain('#FFFFFF') // --bg-surface
    expect(svg).toContain('#6B635A') // --text-muted
    expect(svg).toContain('#C47A5A') // --color-run
  })

  it('bakes literal dark-mode ink into the markup', async () => {
    const svg = await renderChartSvg(chartSpec, { theme: 'dark' })
    expect(svg).toContain('#252019') // --bg-surface, dark
    expect(svg).toContain('#8A847A') // --text-muted, dark
    expect(svg).not.toContain('#FFFFFF')
  })

  it('keeps semantic series colors theme-invariant (spec §6)', async () => {
    for (const theme of ['light', 'dark'] as const) {
      const svg = await renderChartSvg(chartSpec, { theme })
      expect(svg).toContain('#C47A5A') // --color-run
      expect(svg).toContain('#5C5A7A') // --color-pass
    }
  })

  it('defaults to light', async () => {
    expect(await renderChartSvg(chartSpec)).toBe(await renderChartSvg(chartSpec, { theme: 'light' }))
  })
})

describe('renderChartSvg — content', () => {
  it('renders the team, season and every situation row', async () => {
    const svg = await renderChartSvg(chartSpec)
    expect(svg).toContain('playcalling')
    expect(svg).toContain(String(profile.season))
    for (const row of buildPlaycallingRows(profile)) {
      expect(svg).toContain(row.label)
    }
  })

  it('escapes XML-hostile team names instead of producing invalid markup', async () => {
    // A hand-built SVG string would emit a bare `&` here and yield a blank PNG.
    const svg = await renderChartSvg({
      chart: 'team-playcalling',
      profile: createPlaycallingProfileRow({ team: 'Texas A&M <Aggies>' }),
    })
    expect(svg).toContain('Texas A&amp;M &lt;Aggies&gt;')
    expect(svg).not.toContain('A&M <Aggies>')
    expectResvgSafe(svg)
  })

  it('drops situations the view did not publish, and sizes the canvas to fit', async () => {
    const sparse = createPlaycallingProfileRow({
      red_zone_run_rate: null,
      leading_run_rate: null,
      trailing_run_rate: null,
    })
    const rows = buildPlaycallingRows(sparse)
    expect(rows).toHaveLength(3)

    const svg = await renderChartSvg({ chart: 'team-playcalling', profile: sparse })
    expect(svg).not.toContain('Red zone')
    expect(svg).toContain(`viewBox="0 0 700 ${teamPlaycallingHeight(3)}"`)
    expectResvgSafe(svg)
  })

  it('renders a percentile caption only where the view publishes one', async () => {
    const svg = await renderChartSvg({
      chart: 'team-playcalling',
      profile: createPlaycallingProfileRow({ overall_run_rate_pctl: 0.55 }),
    })
    expect(svg).toContain('55th pctl run-heavy')
  })
})

describe('chart id helpers', () => {
  it('recognises the shipped charts and rejects anything else', () => {
    expect(CHART_IDS).toEqual(['team-playcalling', 'team-metric-trend', 'team-metric-bars'])
    expect(isChartId('team-playcalling')).toBe(true)
    expect(isChartId('team-metric-trend')).toBe(true)
    expect(isChartId('team-metric-bars')).toBe(true)
    expect(isChartId('team-trajectory')).toBe(false)
  })

  it('keeps one id per shape rather than a shape parameter', () => {
    // A signed chart URL is permanent by design -- Discord re-fetches it on
    // cache eviction, months later, with no auth header -- so a chart id is a
    // forever-API. Collapsing the family to `team-metric?shape=bars` would put
    // the shape inside a parameter space we might later want to reorganize,
    // and would take the shape out of the path a reader can see.
    expect(isChartId('team-metric')).toBe(false)
  })
})

describe('axes.tsx ink parameter', () => {
  const layout = { width: 700, height: 350, padding: { top: 30, right: 30, bottom: 50, left: 60 } }
  const yTicks = [{ pct: 0, val: 1 }, { pct: 1, val: 0 }]

  it('keeps existing browser behaviour when ink is omitted', () => {
    const markup = renderToStaticMarkup(
      <svg>
        {gridLinesY(yTicks, layout)}
        {axisLabelsY(yTicks, v => `${v}`, layout)}
        {axisLabelsX([{ x: 100, label: 2024 }], layout)}
      </svg>,
    )
    expect(markup).toContain('stroke="var(--border)"')
    expect(markup).toContain('class="fill-[var(--text-muted)] text-xs"')
    expect(markup).toContain('dominant-baseline="middle"')
  })

  it('emits resvg-safe scaffold when ink is supplied', () => {
    const ink = literalInk('light')
    const markup = renderToStaticMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 350">
        {gridLinesY(yTicks, layout, ink)}
        {axisLabelsY(yTicks, v => `${v}`, layout, ink)}
        {axisLabelsX([{ x: 100, label: 2024 }], layout, ink)}
      </svg>,
    )
    expect(markup).toContain('stroke="#D9D2C7"')
    expect(markup).toContain('font-family="DM Sans"')
    expect(markup).toContain('dy="4.2"') // 12px * 0.35, replacing dominant-baseline
    expectResvgSafe(markup)
  })
})

describe('ChartInk', () => {
  it('gives the browser var() references and the server literals', () => {
    expect(VAR_INK.textMuted).toBe('var(--text-muted)')
    expect(literalInk('light').textMuted).toBe('#6B635A')
    expect(literalInk('dark').textMuted).toBe('#8A847A')
  })

  it('gives the server a single font family, not a stack resvg cannot walk', () => {
    // The browser can fall back through `Georgia, serif`; resvg is handed two
    // font files and no system fonts, so a stack would be a lie.
    expect(VAR_INK.fontHeadline).toBe('var(--font-headline)')
    expect(literalInk('light').fontHeadline).toBe('Libre Baskerville')
    expect(literalInk('light').fontBody).toBe('DM Sans')
  })
})
