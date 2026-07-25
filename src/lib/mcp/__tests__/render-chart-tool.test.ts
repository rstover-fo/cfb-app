/**
 * Unit tests for the render_chart MCP tool (src/lib/mcp/tools.ts), phase 2.3.
 *
 * Unlike every other tool test in this directory, nothing here mocks the
 * charts signing module (src/lib/charts/server/signing.ts) -- the whole
 * point of render_chart is to be the producer half of a signing scheme whose
 * consumer (verifyChartSignature, used by src/app/api/chart/[chart]/route.ts)
 * lives in that same file. The most important assertion in this file feeds a
 * URL minted by renderChartTool through the REAL verifyChartSignature and
 * checks it passes: that single round trip is what stops the producer
 * (this tool) and the consumer (the route) from ever silently drifting apart
 * in production.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { verifyChartSignature } from '@/lib/charts/server/signing'
import { renderChartTool } from '../tools'

const ORIGINAL_SECRET = process.env.CHART_SIGNING_SECRET
const ORIGINAL_BASE = process.env.CHART_BASE_URL
const ORIGINAL_VERCEL = process.env.VERCEL_PROJECT_PRODUCTION_URL

const SECRET = 'chart-signing-secret-for-tests'

beforeEach(() => {
  process.env.CHART_SIGNING_SECRET = SECRET
  process.env.CHART_BASE_URL = 'https://charts.example.com'
})

afterEach(() => {
  restore('CHART_SIGNING_SECRET', ORIGINAL_SECRET)
  restore('CHART_BASE_URL', ORIGINAL_BASE)
  restore('VERCEL_PROJECT_PRODUCTION_URL', ORIGINAL_VERCEL)
})

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

describe('renderChartTool', () => {
  it('returns a chart-renderer envelope whose URL is absolute and carries a v1 signature', async () => {
    const parsed = JSON.parse(await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma', season: 2026 }))

    expect(parsed._source).toBe('chart-renderer')
    expect(parsed.chart).toBe('team-playcalling')
    expect(parsed.url).toMatch(/^https:\/\/charts\.example\.com\/api\/chart\/team-playcalling\.png\?/)
    expect(parsed.url).toContain('sig=v1.')
    expect(typeof parsed.alt).toBe('string')
    expect(parsed.alt).toContain('Oklahoma')
    expect(typeof parsed.width).toBe('number')
    expect(typeof parsed.height).toBe('number')
    expect(typeof parsed.usage).toBe('string')
  })

  it('produces a URL that the real verifyChartSignature accepts (producer/consumer round trip)', async () => {
    const parsed = JSON.parse(await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma', season: 2026 }))

    const url = new URL(parsed.url)
    const result = verifyChartSignature('team-playcalling', url.searchParams)

    expect(result).toEqual({ ok: true, status: 200 })
  })

  it('defaults season to CURRENT_SEASON when omitted', async () => {
    const parsed = JSON.parse(await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma' }))

    const url = new URL(parsed.url)
    expect(url.searchParams.get('season')).toBe(String(2025))
  })

  it('defaults mode to light when omitted', async () => {
    const parsed = JSON.parse(await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma' }))

    const url = new URL(parsed.url)
    expect(url.searchParams.get('mode')).toBe('light')
  })

  it('forwards an explicit mode', async () => {
    const parsed = JSON.parse(
      await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma', season: 2026, mode: 'dark' })
    )

    const url = new URL(parsed.url)
    expect(url.searchParams.get('mode')).toBe('dark')
  })

  it('fails verification when a param on the produced URL is tampered with after the fact', async () => {
    const parsed = JSON.parse(await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma', season: 2026 }))

    const url = new URL(parsed.url)
    url.searchParams.set('team', 'Texas')
    const result = verifyChartSignature('team-playcalling', url.searchParams)

    expect(result.ok).toBe(false)
  })

  it('returns a friendly plain string instead of throwing when CHART_SIGNING_SECRET is unset', async () => {
    delete process.env.CHART_SIGNING_SECRET

    const text = await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma', season: 2026 })

    expect(text).toBe('Chart rendering is not configured on this deployment. Answer in text instead.')
  })

  it('returns the same friendly string instead of throwing when no chart base URL is resolvable', async () => {
    delete process.env.CHART_BASE_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL

    const text = await renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma', season: 2026 })

    expect(text).toBe('Chart rendering is not configured on this deployment. Answer in text instead.')
  })

  it('never throws: an unset secret resolves to a string, not a rejection', async () => {
    delete process.env.CHART_SIGNING_SECRET

    await expect(renderChartTool({ chart: 'team-playcalling', team: 'Oklahoma' })).resolves.toEqual(
      expect.any(String)
    )
  })
})
