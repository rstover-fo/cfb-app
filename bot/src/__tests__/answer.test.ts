import { describe, it, expect } from 'vitest'
import { MessageFlags } from 'discord.js'
import { buildAnswerPayloads } from '../render/answer.js'
import type { ChartInfo } from '../claude.js'

const CHART: ChartInfo = {
  url: 'https://example.com/api/chart/team-playcalling.png?mode=light&season=2025&team=Oklahoma&sig=v1.abc123',
  alt: 'Oklahoma playcalling chart',
}

describe('buildAnswerPayloads with no chart', () => {
  it('produces payloads byte-identical to the no-charts-option call (charts is an additive, opt-in field)', () => {
    const text = 'Ohio State is #1.'
    const withoutOpt = buildAnswerPayloads(text, { accentColor: 0x3b6ea5 })
    const withEmptyCharts = buildAnswerPayloads(text, { accentColor: 0x3b6ea5, charts: [] })

    expect(withEmptyCharts.map(p => p.components[0]!.toJSON())).toEqual(
      withoutOpt.map(p => p.components[0]!.toJSON())
    )
    expect(withoutOpt).toHaveLength(1)
    expect(withoutOpt[0]!.components[0]!.toJSON()).toEqual({
      type: 17,
      accent_color: 0x3b6ea5,
      components: [{ type: 10, content: 'Ohio State is #1.' }],
    })
    expect(withoutOpt[0]!.flags).toBe(MessageFlags.IsComponentsV2)
  })
})

describe('buildAnswerPayloads with a chart', () => {
  it('attaches a MediaGallery to the first payload and strips the URL from the text', () => {
    const text = `Oklahoma leans run-heavy on early downs.\n\n${CHART.url}\n\nThat's the headline number.`
    const payloads = buildAnswerPayloads(text, { charts: [CHART] })

    expect(payloads).toHaveLength(1)
    const json = payloads[0]!.components[0]!.toJSON() as unknown as { components: Record<string, unknown>[] }
    expect(json.components).toEqual([
      { type: 10, content: "Oklahoma leans run-heavy on early downs.\n\nThat's the headline number." },
      { type: 12, items: [{ media: { url: CHART.url }, description: CHART.alt }] },
    ])
  })

  it('strips the URL even when it lands on the same line as prose', () => {
    const text = `Check out this chart: ${CHART.url} for the full breakdown.`
    const payloads = buildAnswerPayloads(text, { charts: [CHART] })

    const json = payloads[0]!.components[0]!.toJSON() as unknown as { components: Record<string, unknown>[] }
    expect(json.components[0]).toEqual({ type: 10, content: 'Check out this chart:  for the full breakdown.' })
  })

  it('does not leave orphaned blank lines after stripping a URL that had its own paragraph', () => {
    const text = `Line one.\n\n${CHART.url}\n\nLine two.`
    const payloads = buildAnswerPayloads(text, { charts: [CHART] })

    const json = payloads[0]!.components[0]!.toJSON() as unknown as { components: Record<string, unknown>[] }
    expect(json.components[0]).toEqual({ type: 10, content: 'Line one.\n\nLine two.' })
  })

  it('strips only URLs that were actually extracted -- an unextracted chart-shaped URL survives as a link', () => {
    const otherUrl = 'https://example.com/api/chart/team-defense.png?sig=v1.def456'
    const text = `Here is the chart: ${CHART.url}\n\nAlso see ${otherUrl} for defense.`
    const payloads = buildAnswerPayloads(text, { charts: [CHART] })

    const json = payloads[0]!.components[0]!.toJSON() as unknown as { components: Record<string, unknown>[] }
    expect(json.components[0]).toEqual({
      type: 10,
      content: `Here is the chart:\n\nAlso see ${otherUrl} for defense.`,
    })
  })

  it('puts the gallery only on the first payload when the answer splits into multiple chunks', () => {
    // Sized against the 3800-char CHUNK_MAX (src/format.ts) the same way the
    // ask/mention long-answer tests are: two paragraphs that together exceed
    // the cap so splitMessage produces exactly two chunks.
    const longText = `${'a'.repeat(2000)}\n\n${CHART.url}\n\n${'b'.repeat(3000)}`
    const payloads = buildAnswerPayloads(longText, { charts: [CHART] })

    expect(payloads).toHaveLength(2)
    const firstJson = payloads[0]!.components[0]!.toJSON() as unknown as { components: Record<string, unknown>[] }
    const secondJson = payloads[1]!.components[0]!.toJSON() as unknown as { components: Record<string, unknown>[] }
    expect(firstJson.components.some(c => c.type === 12)).toBe(true)
    expect(secondJson.components.some(c => c.type === 12)).toBe(false)
  })
})
