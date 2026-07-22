import { describe, it, expect, afterEach } from 'vitest'
import { inkFor, teamInk, pairedBarOptions } from '../series'

afterEach(() => {
  document.documentElement.removeAttribute('style')
})

describe('inkFor', () => {
  it('maps each semantic role to its --color-* token', () => {
    document.documentElement.style.setProperty('--color-run', '#C47A5A')
    document.documentElement.style.setProperty('--color-pass', '#5C5A7A')
    document.documentElement.style.setProperty('--color-positive', '#4A7A5C')
    document.documentElement.style.setProperty('--color-negative', '#A65A5A')

    expect(inkFor('run')).toBe('#C47A5A')
    expect(inkFor('pass')).toBe('#5C5A7A')
    expect(inkFor('positive')).toBe('#4A7A5C')
    expect(inkFor('negative')).toBe('#A65A5A')
  })

  it('resolves neutral through --color-neutral, not --text-muted (the #6B635A split rule)', () => {
    // Same hex in light mode, but different tokens: neutral series ink is
    // theme-invariant while --text-muted flips in dark mode.
    document.documentElement.style.setProperty('--color-neutral', '#6B635A')
    document.documentElement.style.setProperty('--text-muted', '#8A847A')

    expect(inkFor('neutral')).toBe('#6B635A')
  })
})

describe('teamInk', () => {
  it('passes an already-resolved team hex through unchanged', () => {
    expect(teamInk('#841617', 'primary')).toBe('#841617')
  })

  it('falls back to --text-primary (home) and --text-muted (away) when the hex is missing', () => {
    document.documentElement.style.setProperty('--text-primary', '#1A1814')
    document.documentElement.style.setProperty('--text-muted', '#6B635A')

    expect(teamInk(null, 'primary')).toBe('#1A1814')
    expect(teamInk(null, 'muted')).toBe('#6B635A')
  })
})

describe('pairedBarOptions', () => {
  it('mirrors the hachure angle at ±41° by side', () => {
    expect(pairedBarOptions('#C47A5A', 'left', 7).hachureAngle).toBe(-41)
    expect(pairedBarOptions('#C47A5A', 'right', 7).hachureAngle).toBe(41)
  })

  it('carries the seed and the spec §9 bar defaults', () => {
    const options = pairedBarOptions('#5C5A7A', 'right', 42)

    expect(options).toMatchObject({
      fill: '#5C5A7A',
      stroke: '#5C5A7A',
      fillStyle: 'hachure',
      hachureGap: 5,
      fillWeight: 1,
      strokeWidth: 1.5,
      roughness: 1.1,
      bowing: 0.5,
      seed: 42,
    })
  })
})
