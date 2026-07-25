import { beforeEach, describe, expect, it } from 'vitest'
import {
  CHART_RATE_LIMIT,
  CHART_RATE_WINDOW_MS,
  checkChartRateLimit,
  rateLimitKey,
  resetChartRateLimit,
} from '../rateLimit'

beforeEach(() => {
  resetChartRateLimit()
})

describe('checkChartRateLimit', () => {
  it('allows requests up to the limit', () => {
    const now = 1_000_000
    for (let i = 0; i < CHART_RATE_LIMIT; i++) {
      expect(checkChartRateLimit('1.2.3.4', now).ok).toBe(true)
    }
  })

  it('refuses the request past the limit and reports a retry delay', () => {
    const now = 1_000_000
    for (let i = 0; i < CHART_RATE_LIMIT; i++) checkChartRateLimit('1.2.3.4', now)

    const result = checkChartRateLimit('1.2.3.4', now)
    expect(result.ok).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('keeps separate buckets per key', () => {
    const now = 1_000_000
    for (let i = 0; i < CHART_RATE_LIMIT; i++) checkChartRateLimit('1.2.3.4', now)

    expect(checkChartRateLimit('1.2.3.4', now).ok).toBe(false)
    expect(checkChartRateLimit('5.6.7.8', now).ok).toBe(true)
  })

  it('resets once the window rolls over', () => {
    const now = 1_000_000
    for (let i = 0; i < CHART_RATE_LIMIT; i++) checkChartRateLimit('1.2.3.4', now)
    expect(checkChartRateLimit('1.2.3.4', now).ok).toBe(false)

    expect(checkChartRateLimit('1.2.3.4', now + CHART_RATE_WINDOW_MS + 1).ok).toBe(true)
  })
})

describe('rateLimitKey', () => {
  it('uses the first x-forwarded-for entry', () => {
    const request = new Request('https://example.com/api/chart/x.png', {
      headers: { 'x-forwarded-for': '203.0.113.5, 70.41.3.18' },
    })
    expect(rateLimitKey(request)).toBe('203.0.113.5')
  })

  it('falls back to x-real-ip', () => {
    const request = new Request('https://example.com/api/chart/x.png', {
      headers: { 'x-real-ip': '198.51.100.7' },
    })
    expect(rateLimitKey(request)).toBe('198.51.100.7')
  })

  it('collapses header-less callers into one shared bucket rather than skipping the limit', () => {
    expect(rateLimitKey(new Request('https://example.com/api/chart/x.png'))).toBe('unknown')
  })
})
