import { describe, it, expect } from 'vitest'
import { formatRelativeDays } from '../utils'

describe('formatRelativeDays', () => {
  it('renders sub-30-minute freshness as "just now"', () => {
    expect(formatRelativeDays(0)).toBe('just now')
    expect(formatRelativeDays(0.01)).toBe('just now')
  })

  it('renders sub-day freshness in whole hours', () => {
    expect(formatRelativeDays(0.125)).toBe('3h ago')
    expect(formatRelativeDays(0.5)).toBe('12h ago')
  })

  it('renders day-or-more freshness in whole days', () => {
    expect(formatRelativeDays(1)).toBe('1d ago')
    expect(formatRelativeDays(2.6)).toBe('3d ago')
  })

  it('clamps negative input (clock skew) to non-negative', () => {
    expect(formatRelativeDays(-1)).toBe('just now')
  })
})
