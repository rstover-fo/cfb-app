/**
 * Domain tests for `src/lib/charts/metricScale.ts`.
 *
 * The first block is the `team-metric-trend` y-domain suite, moved here intact
 * when the scale was lifted out of the trend renderer -- same cases, same
 * reasoning, only the call signature changed from a positional `isRank`
 * boolean to the options object a second shape needed. The second block covers
 * the zero-anchored bar variant.
 */
import { describe, it, expect } from 'vitest'
import { niceScale } from '../metricScale'

describe('niceScale — line domain (team-metric-trend)', () => {
  it('keeps an extreme off the frame rule when it is already a nice number', () => {
    // 4 and 12 wins are both nice numbers, so floor/ceil are identities and the
    // markers would sit exactly on plotBottom/plotTop, bisected by the 1.5px
    // frame. One step of air on each side is the fix.
    const scale = niceScale(4, 12)
    expect(scale.lo).toBeLessThan(4)
    expect(scale.hi).toBeGreaterThan(12)
  })

  it('leaves an already-interior extreme alone', () => {
    // 12.9 and 31.4 are not on the grid, so nice-rounding already gave them
    // room and no further padding is spent.
    const scale = niceScale(12.9, 31.4)
    expect(scale.lo).toBeLessThan(12.9)
    expect(scale.hi).toBeGreaterThan(31.4)
    expect(scale.lo).toBe(10)
    expect(scale.hi).toBe(35)
  })

  it('still floors a rank axis at 1 rather than padding into ranks that do not exist', () => {
    expect(niceScale(1, 60, { isRank: true }).lo).toBe(1)
    expect(niceScale(10, 60, { isRank: true }).lo).toBe(1)
  })

  it('pads below zero for air but never labels a negative count', () => {
    // A winless season (wins min 0) or an undefeated one (losses min 0) hits
    // this. The domain still drops below zero so the 0-value marker keeps
    // clear of the frame rule -- but "-5 wins" is not a thing, so the labels
    // floor at zero. Domain and labels are deliberately allowed to disagree.
    const wins = niceScale(0, 12)
    expect(wins.lo).toBeLessThan(0)
    expect(Math.min(...wins.ticks)).toBe(0)
    expect(wins.ticks.every(tick => tick >= 0)).toBe(true)

    const losses = niceScale(0, 8)
    expect(losses.lo).toBeLessThan(0)
    expect(Math.min(...losses.ticks)).toBe(0)

    // A range that never approaches zero is untouched by this.
    expect(niceScale(6, 12).ticks.every(tick => tick > 0)).toBe(true)
  })

  it('keeps its ticks inside the padded domain', () => {
    for (const [min, max] of [[4, 12], [0, 1], [12.9, 31.4], [1, 60]] as const) {
      const scale = niceScale(min, max)
      for (const tick of scale.ticks) {
        expect(tick).toBeGreaterThanOrEqual(scale.lo)
        expect(tick).toBeLessThanOrEqual(scale.hi)
      }
    }
  })

  it('survives a flat range without dividing by zero', () => {
    const scale = niceScale(8, 8)
    expect(scale.hi).toBeGreaterThan(scale.lo)
    expect(scale.ticks.length).toBeGreaterThan(0)
  })
})

describe('niceScale — bar domain (team-metric-bars)', () => {
  it('anchors at zero so bar lengths stay comparable', () => {
    // The whole reason bars and lines cannot share one domain: 12.9 next to
    // 18.9 on a line domain starting at 10 draws one bar three times the
    // other. Zero-anchored, the ratio the reader sees is the real one.
    const scale = niceScale(12.9, 18.9, { anchorZero: true })
    expect(scale.lo).toBe(0)
    expect(scale.hi).toBeGreaterThanOrEqual(18.9)

    const line = niceScale(12.9, 18.9)
    expect(line.lo).toBeGreaterThan(0)
  })

  it('never pads the baseline away from zero, even for an all-nice extreme', () => {
    // The line branch buys a marker clear of the frame with one step of air.
    // A bar cannot: moving `lo` is the exact distortion this branch prevents.
    const scale = niceScale(4, 12, { anchorZero: true })
    expect(scale.lo).toBe(0)
    expect(scale.ticks[0]).toBe(0)
  })

  it('keeps zero in the domain when every value is negative', () => {
    const scale = niceScale(-8.4, -1.2, { anchorZero: true })
    expect(scale.lo).toBeLessThan(-8.4)
    expect(scale.hi).toBe(0)
  })

  it('spans both sides for a metric that genuinely goes both ways', () => {
    // Average scoring margin: some bars point left, some right.
    const scale = niceScale(-6.3, 14.8, { anchorZero: true })
    expect(scale.lo).toBeLessThanOrEqual(-6.3)
    expect(scale.hi).toBeGreaterThanOrEqual(14.8)
    expect(scale.ticks).toContain(0)
  })

  it('keeps the zero baseline but never labels a rank 0', () => {
    const scale = niceScale(2, 34, { isRank: true, anchorZero: true })
    expect(scale.lo).toBe(0)
    expect(scale.ticks).not.toContain(0)
    expect(Math.min(...scale.ticks)).toBeGreaterThan(0)
  })

  it('still produces a drawable axis when every value is zero', () => {
    const scale = niceScale(0, 0, { anchorZero: true })
    expect(scale.hi).toBeGreaterThan(scale.lo)
    expect(scale.ticks.length).toBeGreaterThan(0)
  })

  it('keeps its ticks inside the domain', () => {
    const cases = [
      [4, 12],
      [12.9, 18.9],
      [-6.3, 14.8],
      [2, 34],
      [0, 1],
    ] as const
    for (const [min, max] of cases) {
      const scale = niceScale(min, max, { anchorZero: true })
      for (const tick of scale.ticks) {
        expect(tick).toBeGreaterThanOrEqual(scale.lo)
        expect(tick).toBeLessThanOrEqual(scale.hi)
      }
    }
  })
})
