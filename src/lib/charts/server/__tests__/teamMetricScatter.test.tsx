/**
 * SVG-level tests for `team-metric-scatter`, the third `team-metric-*` shape.
 *
 * Same strategy as its two siblings: nothing touches Supabase, snapshots are of
 * SVG strings rather than PNG bytes, and `expectResvgSafe` runs over every
 * variant in both themes.
 *
 * Two things are specific to this shape and carry most of the weight here.
 *
 * **Nothing fetches.** Logos arrive as fixture `data:` URIs, exactly as they
 * arrive from the route in production. `expectResvgSafe` now fails any `<image>`
 * whose href is not a `data:` URI, because resvg fetches nothing and a remote
 * href renders as a hole rather than an error.
 *
 * **Top-right is best, always.** The assertions below check the claim printed
 * on the card against the geometry actually emitted. A note reading "top-right
 * is best" over an axis that ran the other way would be the worst bug this
 * chart could have, and it is not one a snapshot makes obvious.
 */
import { describe, it, expect } from 'vitest'
import {
  FIXTURE_LOGO_A,
  OUTSIDE_FIELD_2025,
  SP_FIELD_2025,
  UNRANKED_FIELD_2025,
} from '@/lib/queries/__tests__/fixtures/teamMetric'
import { literalInk } from '../../tokens'
import { METRIC_IDS } from '../../metrics'
import { renderChartSvg, type ChartSpec } from '../svg'
import { teamMetricScatterHeight, type ScatterMark, type TeamMetricScatter } from '../teamMetricScatter'
import { METRIC_EMPTY_HEIGHT } from '../metricCard'
import { expectResvgSafe, elideHeavyAttributes, cheapHash } from './resvgSafe'

type ScatterSpec = Extract<ChartSpec, { chart: 'team-metric-scatter' }>

function spec(scatter: Partial<TeamMetricScatter> = {}): ScatterSpec {
  return {
    chart: 'team-metric-scatter',
    scatter: {
      x: 'sp_offense',
      y: 'sp_defense',
      season: 2025,
      rankBy: 'sp_rating',
      fieldSize: 25,
      marks: SP_FIELD_2025,
      highlight: ['Oklahoma', 'Texas'],
      ...scatter,
    },
  }
}

/** The request this shape was built for: offense vs defense, OU and Texas. */
const MIXED = spec()
/** The same, with a logo on every mark -- for the position assertions. */
const ALL_LOGOS = spec({ marks: SP_FIELD_2025.map(mark => ({ ...mark, logo: mark.logo ?? FIXTURE_LOGO_A })) })
/** Both metrics higher-is-better -- neither axis reverses. */
const BOTH_HIGHER = spec({ x: 'ppg', y: 'epa_per_play' })
/** Both lower-is-better -- both axes reverse. */
const BOTH_LOWER = spec({ x: 'opp_ppg', y: 'losses' })
/** A rank on one axis, which reverses for a different reason. */
const WITH_RANK = spec({ x: 'sp_offense', y: 'sp_rank' })
/** A named team that missed the field entirely. */
const OUTSIDE = spec({ marks: [...SP_FIELD_2025, OUTSIDE_FIELD_2025], highlight: ['Oklahoma', 'Purdue'] })
/** A named team the ranking metric published nothing for. */
const UNRANKED = spec({ marks: [...SP_FIELD_2025, UNRANKED_FIELD_2025], highlight: ['Sam Houston'] })
/** No team named at all -- the field is the whole subject. */
const NO_HIGHLIGHT = spec({ highlight: [] })
/** No logo resolved for anyone: every mark is the rough fallback. */
const NO_LOGOS = spec({ marks: SP_FIELD_2025.map(mark => ({ ...mark, logo: null })) })
/** Nothing to draw. */
const NO_DATA = spec({ marks: [], highlight: ['Nobody State', 'Nowhere Tech'] })

describe('team-metric-scatter — resvg safety', () => {
  const cases: Array<[string, ChartSpec]> = [
    ['the mixed-direction reference chart', MIXED],
    ['two higher-is-better metrics', BOTH_HIGHER],
    ['two lower-is-better metrics', BOTH_LOWER],
    ['a rank metric on one axis', WITH_RANK],
    ['a named team outside the field', OUTSIDE],
    ['a named team the ranking metric has nothing for', UNRANKED],
    ['four highlighted teams', spec({ highlight: ['Oklahoma', 'Texas', 'Georgia', 'Iowa'] })],
    ['no highlighted teams', NO_HIGHLIGHT],
    ['a field with no logos at all', NO_LOGOS],
    ['a highlighted team whose logo failed', spec({
      marks: SP_FIELD_2025.map(mark => (mark.team === 'Oklahoma' ? { ...mark, logo: null } : mark)),
    })],
    ['nothing to draw', NO_DATA],
    ['a named team with no data', spec({ highlight: ['Oklahoma', 'Nobody State'] })],
  ]

  for (const [name, chartSpec] of cases) {
    it(`emits resvg-safe markup for ${name}`, async () => {
      expectResvgSafe(await renderChartSvg(chartSpec))
    })

    it(`emits resvg-safe markup for ${name} in dark mode`, async () => {
      expectResvgSafe(await renderChartSvg(chartSpec, { theme: 'dark' }))
    })
  }

  it('emits resvg-safe markup for every metric in the enum, on both axes', async () => {
    // A metric whose formatter emitted something odd would only show up here,
    // and this shape formats two axes rather than one.
    for (const metric of METRIC_IDS) {
      const other = metric === 'sp_rating' ? 'wins' : 'sp_rating'
      expectResvgSafe(await renderChartSvg(spec({ x: metric, y: other })))
      expectResvgSafe(await renderChartSvg(spec({ x: other, y: metric })))
    }
  })
})

describe('team-metric-scatter — the renderer stays pure', () => {
  it('draws every logo from the document, never from a URL', async () => {
    // resvg fetches nothing, so a remote href is a hole rather than an error.
    // `expectResvgSafe` enforces this too; asserted directly as well because it
    // is the whole architectural point of resolving logos up in the route.
    const svg = await renderChartSvg(MIXED)
    const hrefs = [...svg.matchAll(/<image\b[^>]*\shref="([^"]*)"/g)].map(match => match[1])

    expect(hrefs).toHaveLength(24) // 25 marks, one of which has no logo row
    expect(hrefs.every(href => href.startsWith('data:image/'))).toBe(true)
    expect(svg).not.toMatch(/href="https?:/)
  })

  it('is byte-identical across renders (seeded roughjs, no clock, no fetch)', async () => {
    expect(await renderChartSvg(MIXED)).toBe(await renderChartSvg(MIXED))
  })

  it('pins the full-byte output for the reference chart', async () => {
    expect(cheapHash(await renderChartSvg(MIXED))).toMatchInlineSnapshot(`"b4034d79"`)
  })

  it('matches the reviewable structural snapshot', async () => {
    // Path geometry AND base64 payloads are digested: 25 inlined logos would
    // otherwise bury every coordinate, colour and font this snapshot exists to
    // show. A swapped or missing logo still changes the digest.
    expect(elideHeavyAttributes(await renderChartSvg(MIXED))).toMatchSnapshot()
  })

  it('matches the empty-state snapshot in full', async () => {
    expect(await renderChartSvg(NO_DATA)).toMatchSnapshot()
  })
})

describe('team-metric-scatter — top-right is always best', () => {
  it('runs a higher-is-better axis low to high, left to right and bottom to top', async () => {
    const { x, y } = await axes(BOTH_HIGHER)
    expect(ascending(x.map(tick => tick.pos))).toBe(true)
    // y grows downward in SVG, so "better is up" means the coordinate falls as
    // the value rises.
    expect(ascending(y.map(tick => -tick.pos))).toBe(true)
  })

  it('reverses a lower-is-better axis so the better number still sits right and up', async () => {
    const { x, y } = await axes(BOTH_LOWER)
    expect(ascending(x.map(tick => -tick.pos))).toBe(true)
    expect(ascending(y.map(tick => tick.pos))).toBe(true)
  })

  it('reverses only the reversed axis on a mixed pair', async () => {
    // The reference case, and the one a per-axis bug would hide in: offense is
    // higher-is-better, defense is lower-is-better, so exactly one flips.
    const { x, y } = await axes(MIXED)
    expect(ascending(x.map(tick => tick.pos))).toBe(true)
    expect(ascending(y.map(tick => tick.pos))).toBe(true)
  })

  it('reverses a rank axis, so rank 1 sits at the top', async () => {
    const { y } = await axes(WITH_RANK)
    expect(y[0].value).toBeLessThan(y[y.length - 1].value)
    expect(y[0].pos).toBeLessThan(y[y.length - 1].pos)
  })

  it('puts the team that is best on both metrics nearest the top-right corner', async () => {
    // The claim on the card, checked against the emitted geometry rather than
    // against the code that produced it. Ohio State owns the best 2025 SP+
    // defense; North Texas owns the best offense and the worst defense.
    const marks = await markPositions(ALL_LOGOS)
    const ohioState = marks.get('Ohio State')!
    const northTexas = marks.get('North Texas')!
    const oklahoma = marks.get('Oklahoma')!

    expect(ohioState.y).toBeLessThan(northTexas.y)
    expect(ohioState.y).toBeLessThan(oklahoma.y)
    // And better offense really is further right, on the axis that did not flip.
    expect(northTexas.x).toBeGreaterThan(oklahoma.x)
  })

  it('states the reversal twice and only twice, because a PNG has no hover', async () => {
    const svg = await renderChartSvg(MIXED)
    // The note names the corner...
    expect(svg).toContain('Top-right is best')
    // ...and the axis caption names which axis paid for it, and why.
    expect(svg).toContain('SP+ defense rating (reversed — lower is better)')
    // A third statement was a corner caption in the band above the plot. It
    // restated the note's leading clause from somewhere that is not the
    // corner, and did not parse without the note. Design review, Gate E second
    // pass: dropped. Guard it, so it does not drift back in.
    expect(svg).not.toContain('best in both')
  })

  it('says which axis reversed, and says nothing when neither did', async () => {
    expect(await renderChartSvg(MIXED)).toContain('the vertical axis is reversed')
    expect(await renderChartSvg(spec({ x: 'sp_defense', y: 'sp_offense' }))).toContain(
      'the horizontal axis is reversed',
    )
    expect(await renderChartSvg(BOTH_LOWER)).toContain('both axes are reversed')

    const neither = await renderChartSvg(BOTH_HIGHER)
    expect(neither).toContain('both axes run low to high')
    expect(neither).not.toContain('reversed')
  })

  it("explains a rank axis in the rank's own terms", async () => {
    expect(await renderChartSvg(WITH_RANK)).toContain('SP+ rank (reversed — rank 1 is best)')
  })

  it('never borrows the bars chart\'s treatment, which cannot apply here', async () => {
    const svg = await renderChartSvg(MIXED)
    expect(svg).not.toContain('ranked best first')
    expect(svg).not.toContain('bar is the strongest team')
  })
})

describe('team-metric-scatter — the crowd', () => {
  it('draws the whole field, and labels only the highlighted teams', async () => {
    // 25 labels is the thing this shape exists to avoid. The field is context;
    // a reader who wants a particular crest can still find it.
    const svg = await renderChartSvg(ALL_LOGOS)
    expect(imageBoxes(svg)).toHaveLength(SP_FIELD_2025.length)
    expect(plotLabels(svg)).toEqual(['Oklahoma', 'Texas'])
  })

  it('mutes the field with opacity and size, not with a colour of its own', async () => {
    // Spec §6 bans inventing a colour, and a logo carries its school's own --
    // so "this is context" is said with opacity, size and the absent ring.
    const svg = await renderChartSvg(MIXED)
    const images = [...svg.matchAll(/<image\b[^>]*>/g)].map(match => match[0])
    const muted = images.filter(tag => tag.includes('opacity='))
    const full = images.filter(tag => !tag.includes('opacity='))

    expect(muted).toHaveLength(22) // 23 field marks, one of which has no logo
    expect(full).toHaveLength(2) // the two highlighted teams
    expect(muted.every(tag => tag.includes('width="20"'))).toBe(true)
    expect(full.every(tag => tag.includes('width="30"'))).toBe(true)
  })

  it('draws a rough mark, never a hole, for a team with no logo', async () => {
    // Some teams have no logo row, and any fetch can fail. Either way the team
    // has to stay ON the chart: dropping it would quietly change what the
    // picture claims the field is.
    const svg = await renderChartSvg(NO_LOGOS)

    expect(svg).not.toContain('<image')
    expect(countPaths(svg)).toBeGreaterThan(countPaths(await renderChartSvg(MIXED)))
    expectResvgSafe(svg)
  })

  it('never mutes the fallback mark, which is our ink and has a contrast floor', async () => {
    // FIELD_OPACITY exists to tone down somebody else's artwork. Applied to
    // `--text-muted` it lands at 2.6:1 on the dark card and 2.8:1 on the light
    // one -- under WCAG 1.4.11's 3:1 for a non-text mark, in BOTH modes. The
    // field's "this is context" signal is size, the absent ring and the absent
    // label; none of those is an opacity. Same class of finding as the ruled
    // `--color-pass` 2.46:1, so guard it the same way.
    for (const theme of ['light', 'dark'] as const) {
      const svg = await renderChartSvg(NO_LOGOS, { theme })
      expect(svg).not.toMatch(/opacity="0\.65"/)
    }
  })

  it('still rings and labels a highlighted team whose logo failed', async () => {
    const svg = await renderChartSvg(
      spec({ marks: SP_FIELD_2025.map(mark => (mark.team === 'Oklahoma' ? { ...mark, logo: null } : mark)) }),
    )
    expect(plotLabels(svg)).toEqual(['Oklahoma', 'Texas'])
    expect(imageBoxes(svg)).toHaveLength(23) // 25 marks, minus North Texas and Oklahoma
  })

  it('draws better-placed teams over worse ones where marks collide', async () => {
    // Overlap is resolved by draw order, never by moving a mark off its true
    // position -- later in the document paints later.
    const order = drawOrder(ALL_LOGOS.scatter).map(mark => mark.team)
    expect(order.indexOf('Indiana')).toBeGreaterThan(order.indexOf('Michigan'))
    expect(order.indexOf('Ohio State')).toBeGreaterThan(order.indexOf('Illinois'))
  })

  it('draws every highlighted team after the whole field, so nothing buries the subject', async () => {
    const order = drawOrder(MIXED.scatter).map(mark => mark.team)
    expect(order.slice(-2)).toEqual(['Oklahoma', 'Texas'])
  })

  it('keeps every mark clear of the plot frame', async () => {
    // A 30-unit logo centred on the domain's edge would hang over the axis rule
    // and into the tick labels -- and the extremes are what a reader came for.
    const marks = await markPositions(spec({ ...OUTSIDE.scatter, marks: OUTSIDE.scatter.marks.map(mark => ({ ...mark, logo: FIXTURE_LOGO_A })) }))
    for (const { x } of marks.values()) {
      expect(x).toBeGreaterThan(72 + 20)
      expect(x).toBeLessThan(656 - 20)
    }
  })

  it('caps the field at the size it was told, without dropping a named team', async () => {
    const capped = spec({ ...OUTSIDE.scatter, fieldSize: 5 })
    expect(drawOrder(capped.scatter)).toHaveLength(7) // best 5 of the field + Oklahoma + Purdue
    expect(drawOrder(capped.scatter).map(mark => mark.team)).toContain('Purdue')
  })
})

describe('team-metric-scatter — named teams outside the field', () => {
  it('draws a team that missed the cut, and says where it placed', async () => {
    // The reason `rankBy` unions rather than replaces: a team someone asked
    // about is the subject, whether it placed 3rd or 90th.
    expect(plotLabels(await renderChartSvg(OUTSIDE))).toEqual(['Oklahoma', 'Purdue  ·  #90'])
  })

  it('does not print a placing for a team inside the field', async () => {
    // Inside it, the position on the plot already says how the team is doing;
    // outside it, "why is this one here?" is the reader's first question.
    const svg = await renderChartSvg(MIXED)
    expect(svg).toContain('>Oklahoma<')
    expect(svg).not.toContain('·  #')
  })

  it('stretches the domain to hold it rather than drawing it off the card', async () => {
    const inside = await axes(MIXED)
    const outside = await axes(OUTSIDE)
    expect(Math.min(...outside.x.map(tick => tick.value))).toBeLessThan(
      Math.min(...inside.x.map(tick => tick.value)),
    )
  })

  it('says "unranked" rather than inventing a placing', async () => {
    expect(plotLabels(await renderChartSvg(UNRANKED))).toEqual(['Sam Houston  ·  unranked'])
  })

  it('does not let a named team displace a field team', async () => {
    const order = drawOrder(OUTSIDE.scatter).map(mark => mark.team)
    expect(order).toHaveLength(SP_FIELD_2025.length + 1)
    expect(order).toContain('Michigan') // 25th, and still drawn
  })
})

describe('team-metric-scatter — ink', () => {
  it('draws highlights in the categorical ramp, never the valence-carrying tokens', async () => {
    const svg = await renderChartSvg(MIXED)
    for (const semantic of ['#4A7A5C', '#A65A5A', '#5C5A7A']) expect(svg).not.toContain(semantic)
  })

  it('assigns ink by request order, so a team keeps its colour across shapes', async () => {
    const ink = literalInk('light')
    const svg = await renderChartSvg(MIXED)
    expect(svg).toContain(ink.series[0])
    expect(svg).toContain(ink.series[1])

    expect(await renderChartSvg(spec({ highlight: ['Texas', 'Oklahoma'] }))).not.toBe(svg)
  })

  it('swaps the ramp per mode instead of reusing one theme-invariant set', async () => {
    const light = await renderChartSvg(MIXED, { theme: 'light' })
    const dark = await renderChartSvg(MIXED, { theme: 'dark' })

    for (const token of literalInk('light').series.slice(0, 2)) {
      expect(light).toContain(token)
      expect(dark).not.toContain(token)
    }
    for (const token of literalInk('dark').series.slice(0, 2)) {
      expect(dark).toContain(token)
      expect(light).not.toContain(token)
    }
  })

  it('bakes literal dark-mode ink into the markup', async () => {
    const svg = await renderChartSvg(MIXED, { theme: 'dark' })
    expect(svg).toContain('#252019') // --bg-surface, dark
    expect(svg).toContain('#8A847A') // --text-muted, dark

    // No light ink leaks into dark -- with exactly ONE ruled exception, carved
    // out here rather than dropped. `ink.crestPaper` is the light card's
    // `--bg-surface` on purpose: a crest is artwork drawn for a white page, and
    // on `#252019` the navy ones measure 1.01:1. So the paper discs are removed
    // and the guard then runs over everything else -- a `#FFFFFF` anywhere but
    // under a crest is still a bug, and this is the assertion that says so.
    expect(withoutCrestPaper(svg)).not.toContain('#FFFFFF')
  })

  it('gives every crest paper to sit on, and only in dark mode', async () => {
    // The measured problem: at opacity 1.0 on the dark card, Ole Miss is
    // 1.01:1, Penn State 1.03:1, Iowa 1.30:1. Roughly a third of a top-25
    // field is not on the card at all, while the subtitle keeps claiming it is
    // -- which is what made this blocking rather than cosmetic.
    const dark = await renderChartSvg(MIXED, { theme: 'dark' })
    const light = await renderChartSvg(MIXED, { theme: 'light' })

    expect(crestPaper(dark)).toHaveLength(imageBoxes(dark).length)
    expect(crestPaper(dark)[0].fill).toBe('#FFFFFF')

    // Nothing added to the light card: a crest is already on white there, and
    // a disc would only turn a scatter into a bubble chart. The two white
    // circles light does emit are the highlight knockouts (r = 21), which
    // predate this treatment -- they are `--bg-surface`, which simply happens
    // to be the same value in light. No disc at either crest-paper radius.
    expect(circlesFilled(light, CREST_PAPER_FILL).map(disc => disc.r)).toEqual([21, 21])
  })

  it('sizes the paper to the crest box, not to a bubble a reader would measure', async () => {
    const discs = crestPaper(await renderChartSvg(MIXED, { theme: 'dark' }))
    const radii = [...new Set(discs.map(disc => disc.r))].sort((a, b) => a - b)
    expect(radii).toEqual([12, 17]) // the 20 and 30 crest boxes, plus 2 of air
  })

  it('lays the paper under its own crest, never over one', async () => {
    // Under the crest and above the gridlines. Asserted as document order,
    // because that IS the z-order in SVG: each disc must be the element
    // immediately before the image it backs.
    const dark = await renderChartSvg(MIXED, { theme: 'dark' })
    const marks = [...dark.matchAll(/<circle cx="[-\d.]+" cy="[-\d.]+" r="[\d.]+" fill="#FFFFFF"><\/circle>|<image\b/g)]
    expect(marks.map(match => (match[0].startsWith('<image') ? 'crest' : 'paper')).join(' ')).toBe(
      Array(imageBoxes(dark).length).fill('paper crest').join(' '),
    )
    // And the gridlines are all behind both.
    expect(dark.indexOf('<line')).toBeLessThan(dark.indexOf('fill="#FFFFFF"'))
  })

  it('does not move a single mark', async () => {
    // Position is the one thing a scatter has to be trusted on, so the disc is
    // centred on the same coordinates as the crest and changes no geometry.
    const dark = await renderChartSvg(MIXED, { theme: 'dark' })
    const light = await renderChartSvg(MIXED, { theme: 'light' })
    expect(imageBoxes(dark)).toEqual(imageBoxes(light))

    for (const disc of crestPaper(dark)) {
      expect(imageBoxes(dark)).toContainEqual({ x: disc.cx, y: disc.cy, size: disc.r === 12 ? 20 : 30 })
    }
  })

  it('backs a highlighted crest too, inside its knockout disc rather than instead of it', async () => {
    // The knockout stays `--bg-surface` -- its job is to BE the card and clear
    // the neighbours. In dark that is `#252019`, which left a highlighted navy
    // crest invisible inside a bright ring: cleared space, but nothing to print
    // on. Both discs, one inside the other.
    const dark = await renderChartSvg(MIXED, { theme: 'dark' })
    expect(circlesFilled(dark, '#252019')).toHaveLength(2) // one per highlighted team
    expect(circlesFilled(dark, '#252019').every(disc => disc.r === 21)).toBe(true)

    const inner = crestPaper(dark).filter(disc => disc.r === 17)
    expect(inner).toHaveLength(2)
    for (const disc of inner) {
      expect(circlesFilled(dark, '#252019')).toContainEqual({ cx: disc.cx, cy: disc.cy, r: 21, fill: '#252019' })
    }
  })

  it('keeps a highlighted label readable where it crosses a neighbour\'s paper', async () => {
    // A label sits BESIDE its mark and so lands on a neighbour in a crowded
    // field -- on the reference card "Texas" runs straight across BYU's disc.
    // That was fine while the thing behind it was the card; once the neighbour
    // is opaque white, near-white label text vanishes into it exactly as the
    // navy crests used to. So the label brings the card along: the same string,
    // stroked in `--bg-surface`, painted underneath it.
    const dark = await renderChartSvg(MIXED, { theme: 'dark' })
    const plates = [...dark.matchAll(/<text ([^>]*stroke="#252019"[^>]*)>([^<]+)<\/text>/g)]
    expect(plates.map(match => match[2])).toEqual(plotLabels(dark))

    // Placed exactly where the label is -- a plate off by a unit is a fringe.
    const inkedLabel = literalInk('dark').textPrimary
    for (const [, attrs, text] of plates) {
      const placement = attrs.match(/^x="[-\d.]+" y="[-\d.]+" text-anchor="\w+"/)![0]
      expect(dark).toContain(`<text ${placement} fill="${inkedLabel}" font-family="DM Sans" font-size="12">${text}</text>`)
    }

    // Nothing to clear on the light card, so nothing is drawn: the hazard is
    // paper that is not the card colour, and light has none.
    expect(await renderChartSvg(MIXED, { theme: 'light' })).not.toMatch(/<text[^>]*\sstroke=/)
  })

  it('never puts our own fallback mark on paper -- it does not have this problem', async () => {
    // `--text-muted` on the dark card is 4.4:1 at full strength. On white it
    // would be 3.0:1, so backing it would invert a contrast that is already
    // fine. The treatment is for artwork we did not draw and cannot restyle.
    const svg = await renderChartSvg(NO_LOGOS, { theme: 'dark' })
    expect(svg).not.toContain('<image')
    expect(crestPaper(svg)).toEqual([])
    expect(withoutCrestPaper(svg)).not.toContain('#FFFFFF')
  })

  it('inks a fallback field mark in --text-muted, not a fifth series colour', async () => {
    const ink = literalInk('light')
    const svg = await renderChartSvg(NO_LOGOS)
    expect(svg).toContain(`stroke="${ink.textMuted}"`)
    expect(svg).not.toContain(ink.series[2])
  })
})

describe('team-metric-scatter — canvas and chrome', () => {
  it('keeps the 700 width and grows the canvas with the legend', async () => {
    expect(await renderChartSvg(MIXED)).toContain(`viewBox="0 0 700 ${teamMetricScatterHeight(2)}"`)
    expect(await renderChartSvg(NO_HIGHLIGHT)).toContain(`viewBox="0 0 700 ${teamMetricScatterHeight(0)}"`)
    expect(teamMetricScatterHeight(4)).toBeGreaterThan(teamMetricScatterHeight(2))
    expect(teamMetricScatterHeight(2)).toBeGreaterThan(teamMetricScatterHeight(0))
  })

  it("shares the family's compact empty card rather than inventing its own", async () => {
    expect(await renderChartSvg(NO_DATA)).toContain(`viewBox="0 0 700 ${METRIC_EMPTY_HEIGHT}"`)
  })

  it('names both metrics, the season and how the field was chosen', async () => {
    const svg = await renderChartSvg(MIXED)
    expect(svg).toContain('SP+ defense rating vs SP+ offense rating')
    expect(svg).toContain('2025  ·  top 25 by SP+ overall rating')
  })

  it('keys only the highlighted teams -- the field is keyed by the subtitle', async () => {
    const svg = await renderChartSvg(MIXED)
    expect(occurrences(svg, '>Oklahoma<')).toBe(2) // legend row + plot label
    expect(occurrences(svg, '>Michigan<')).toBe(0)
  })

  it('drops the legend entirely when no team was named', async () => {
    const svg = await renderChartSvg(NO_HIGHLIGHT)
    expect(plotLabels(svg)).toEqual([])
    expect(svg).toContain('top 25 by SP+ overall rating')
  })

  it('names the teams it could not chart, and still draws the field', async () => {
    const svg = await renderChartSvg(spec({ highlight: ['Oklahoma', 'Nobody State'] }))
    expect(svg).toContain('No SP+ offensive rating and SP+ defensive rating pair on record for Nobody State.')
    expect(plotLabels(svg)).toEqual(['Oklahoma'])
  })

  it('explains itself when there is nothing at all to plot', async () => {
    expect(await renderChartSvg(NO_DATA)).toContain(
      'No SP+ offensive rating and SP+ defensive rating pair on record for Nobody State and Nowhere Tech in 2025.',
    )
  })

  it('highlights at most four teams -- the ramp is four wide -- and still draws the fifth', async () => {
    const five = spec({ highlight: ['Oklahoma', 'Texas', 'Georgia', 'Iowa', 'Michigan'] })
    const svg = await renderChartSvg(five)
    expect(plotLabels(svg)).toHaveLength(4)
    // Demoted to the field rather than dropped: it is still one of the top 25.
    expect(imageBoxes(svg)).toHaveLength(24)
  })

  it('escapes XML-hostile team names instead of producing invalid markup', async () => {
    const svg = await renderChartSvg(
      spec({
        marks: [{ team: 'Texas A&M <Aggies>', x: 30, y: 12, placing: 1, logo: FIXTURE_LOGO_A }],
        highlight: ['Texas A&M <Aggies>'],
      }),
    )
    expect(svg).toContain('Texas A&amp;M &lt;Aggies&gt;')
    expect(svg).not.toContain('A&M <Aggies>')
    expectResvgSafe(svg)
  })

  it('survives a field where every team shares one coordinate', async () => {
    const flat: ScatterMark[] = [
      { team: 'Oklahoma', x: 30, y: 12, placing: 1, logo: null },
      { team: 'Texas', x: 30, y: 12, placing: 2, logo: null },
    ]
    expectResvgSafe(await renderChartSvg(spec({ marks: flat, highlight: ['Oklahoma'] })))
  })

  it('survives a single mark', async () => {
    expectResvgSafe(await renderChartSvg(spec({ marks: [SP_FIELD_2025[0]], highlight: [] })))
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ascending(values: number[]): boolean {
  return values.every((value, i) => i === 0 || value > values[i - 1])
}

function countPaths(svg: string): number {
  return [...svg.matchAll(/<path\b/g)].length
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/**
 * The order marks are emitted in, mirroring the renderer's documented rule:
 * the field worst-placing-first (so better teams paint over worse), then the
 * highlighted teams in request order.
 *
 * Restated here rather than exported from the renderer on purpose -- a change
 * to the draw order should fail these tests rather than silently travel through
 * a shared helper.
 */
function drawOrder(scatter: TeamMetricScatter): ScatterMark[] {
  const byTeam = new Map(scatter.marks.map(mark => [mark.team, mark]))
  const highlighted = scatter.highlight
    .map(team => byTeam.get(team))
    .filter((mark): mark is ScatterMark => mark !== undefined)
    .slice(0, 4)
  const named = new Set(highlighted.map(mark => mark.team))
  const field = scatter.marks
    .filter(mark => !named.has(mark.team))
    .sort((a, b) => (b.placing ?? Infinity) - (a.placing ?? Infinity) || a.team.localeCompare(b.team))
    .slice(-scatter.fieldSize)
  return [...field, ...highlighted]
}

/**
 * Every `<circle>` painted with `fill`, in document order.
 *
 * Written against the emitted attribute order rather than parsed, like the
 * other helpers here: if the renderer stops emitting these it should fail
 * loudly rather than quietly match nothing.
 */
function circlesFilled(svg: string, fill: string): Array<{ cx: number; cy: number; r: number; fill: string }> {
  return [...svg.matchAll(circlePattern(fill))].map(match => ({
    cx: Number(match[1]),
    cy: Number(match[2]),
    r: Number(match[3]),
    fill,
  }))
}

/**
 * The paper discs laid under crests -- `ink.crestPaper`, dark mode only.
 *
 * Dark markup only: in light, `--bg-surface` is this same `#FFFFFF`, so the
 * highlight knockout discs would be indistinguishable from paper by fill. That
 * ambiguity is exactly why light draws no paper at all, and why the light-side
 * assertions above go by radius instead.
 */
function crestPaper(svg: string): Array<{ cx: number; cy: number; r: number; fill: string }> {
  return circlesFilled(svg, CREST_PAPER_FILL)
}

/**
 * The same markup with the crest paper removed, so the "no light ink in dark"
 * guard can run over everything else. A deliberate carve-out for one ruled
 * treatment, not a blanket exemption -- see the dark-ink test.
 */
function withoutCrestPaper(svg: string): string {
  return svg.replace(circlePattern(CREST_PAPER_FILL), '')
}

/** One filled `<circle>`, as the renderer emits it (never self-closing). */
function circlePattern(fill: string): RegExp {
  return new RegExp(`<circle cx="([-\\d.]+)" cy="([-\\d.]+)" r="([\\d.]+)" fill="${fill}"></circle>`, 'g')
}

/** The light card's `--bg-surface`, which is what the paper is (`tokens.ts`). */
const CREST_PAPER_FILL = literalInk('light').bgSurface

/** Every `<image>` box in document order. */
function imageBoxes(svg: string): Array<{ x: number; y: number; size: number }> {
  return [...svg.matchAll(/<image href="[^"]*" x="([-\d.]+)" y="([-\d.]+)" width="(\d+)"/g)].map(match => ({
    x: Number(match[1]) + Number(match[3]) / 2,
    y: Number(match[2]) + Number(match[3]) / 2,
    size: Number(match[3]),
  }))
}

/**
 * Mark centres by team. Only logo marks are addressable in the markup, so pass
 * a spec whose marks all carry one.
 */
async function markPositions(chartSpec: ScatterSpec): Promise<Map<string, { x: number; y: number }>> {
  const svg = await renderChartSvg(chartSpec)
  const boxes = imageBoxes(svg)
  const withLogos = drawOrder(chartSpec.scatter).filter(mark => mark.logo)

  expect(boxes, 'every mark in this spec should have carried a logo').toHaveLength(withLogos.length)
  return new Map(withLogos.map((mark, index) => [mark.team, boxes[index]]))
}

/** Axis ticks with the canvas coordinate each was drawn at, value-ascending. */
async function axes(
  chartSpec: ChartSpec,
): Promise<{ x: Array<{ value: number; pos: number }>; y: Array<{ value: number; pos: number }> }> {
  const svg = await renderChartSvg(chartSpec)

  // x ticks are the numeric `text-anchor="middle"` labels (the axis caption is
  // the only other one, and it is not a number); y ticks are the labels in the
  // left gutter, at x = PLOT_LEFT - 10.
  const x = [...svg.matchAll(/<text x="([\d.]+)" y="[\d.]+" text-anchor="middle"[^>]*>([-\d.]+)<\/text>/g)].map(
    match => ({ pos: Number(match[1]), value: Number(match[2]) }),
  )
  const y = [...svg.matchAll(/<text x="62" y="([\d.]+)" text-anchor="end"[^>]*>([-\d.]+)<\/text>/g)].map(match => ({
    pos: Number(match[1]),
    value: Number(match[2]),
  }))
  return { x: x.sort((a, b) => a.value - b.value), y: y.sort((a, b) => a.value - b.value) }
}

/**
 * Labels drawn beside a mark -- i.e. highlighted teams only. Identified by
 * their ink: `--text-primary` on a start/end-anchored label is unique to them.
 */
function plotLabels(svg: string): string[] {
  const inks = [literalInk('light').textPrimary, literalInk('dark').textPrimary]
  return [
    ...svg.matchAll(
      /<text x="[-\d.]+" y="[-\d.]+" text-anchor="(?:start|end)" fill="([^"]+)"[^>]*>([^<]+)<\/text>/g,
    ),
  ]
    .filter(match => inks.includes(match[1]))
    .map(match => match[2].replaceAll('&amp;', '&'))
}
