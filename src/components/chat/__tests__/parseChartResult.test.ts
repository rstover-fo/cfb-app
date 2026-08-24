import { describe, it, expect } from 'vitest'
import { parseChartResult } from '../parseChartResult'

describe('parseChartResult', () => {
  it('parses a valid https chart URL', () => {
    const output = JSON.stringify({
      url: 'https://cfb-app.example.com/api/chart/abc123.png',
      alt: 'EPA by team',
    })
    expect(parseChartResult(output)).toEqual({
      url: 'https://cfb-app.example.com/api/chart/abc123.png',
      alt: 'EPA by team',
    })
  })

  it('falls back to a generic alt when none is provided', () => {
    const output = JSON.stringify({ url: 'https://cfb-app.example.com/api/chart/abc123.png' })
    expect(parseChartResult(output)?.alt).toBe('Chart')
  })

  it('rejects non-string output', () => {
    expect(parseChartResult({ url: 'https://x/api/chart/a.png' })).toBeNull()
    expect(parseChartResult(undefined)).toBeNull()
    expect(parseChartResult(null)).toBeNull()
  })

  it('rejects malformed JSON', () => {
    expect(parseChartResult('not json')).toBeNull()
  })

  it('rejects a payload with no url field', () => {
    expect(parseChartResult(JSON.stringify({ alt: 'no url here' }))).toBeNull()
  })

  it('rejects a non-https URL', () => {
    const output = JSON.stringify({ url: 'http://cfb-app.example.com/api/chart/abc123.png' })
    expect(parseChartResult(output)).toBeNull()
  })

  it('rejects a URL outside /api/chart/', () => {
    const output = JSON.stringify({ url: 'https://cfb-app.example.com/api/other/abc123.png' })
    expect(parseChartResult(output)).toBeNull()
  })

  it('rejects a URL that does not end in .png', () => {
    const output = JSON.stringify({ url: 'https://cfb-app.example.com/api/chart/abc123.svg' })
    expect(parseChartResult(output)).toBeNull()
  })

  it('rejects an unparseable URL', () => {
    expect(parseChartResult(JSON.stringify({ url: 'not-a-url' }))).toBeNull()
  })
})
