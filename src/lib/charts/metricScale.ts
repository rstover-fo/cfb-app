/**
 * The value-axis domain shared by every `team-metric-*` shape.
 *
 * One metric's numbers have to become a domain, a set of round tick values,
 * and enough air that a mark never lands on the frame rule -- and that
 * reasoning is identical whether the marks are line vertices or bar ends. Only
 * the *anchoring* differs, which is the one thing `NiceScaleOptions` states.
 *
 * DOM-free, React-free, roughjs-free: the client charts, the server renderers
 * and the tests all import it.
 */

/** Target tick count before nice-rounding. */
const TICK_TARGET = 5

/** Rounds away float accumulation so tick labels and snapshots stay stable. */
function tidy(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/** Classic "nice number" rounding (Heckbert): 1, 2, 5 or 10 x a power of ten. */
export function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range))
  const fraction = range / 10 ** exponent
  let nice: number
  if (round) nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10
  else nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * 10 ** exponent
}

export interface NiceScale {
  /** Domain floor -- what the plot's bottom/left edge means. */
  lo: number
  /** Domain ceiling -- what the plot's top/right edge means. */
  hi: number
  /** Round values to label. NOT always `lo..hi`: see the notes below. */
  ticks: number[]
}

export interface NiceScaleOptions {
  /** Rank metrics have no rank 0 and no negative side. */
  isRank?: boolean
  /**
   * Pin the domain to zero.
   *
   * This is the one genuinely shape-specific knob, and it is a knob rather
   * than a second function because everything either side of it is identical.
   *
   * A **bar** encodes value as length measured from a baseline, so the ratio
   * between two bars is part of what the reader sees. Move the baseline off
   * zero and that ratio becomes a lie -- 18.9 next to 12.9 on a domain
   * starting at 12 looks like seven times the number. Bars are therefore
   * always zero-anchored, and pay for it in resolution.
   *
   * A **line** encodes change, not magnitude: the shape between the points is
   * the message, and forcing zero into the domain on a metric that lives
   * between 8 and 30 flattens a decade of real movement into a hairline. So
   * lines pad to the data instead.
   */
  anchorZero?: boolean
}

/**
 * A domain and tick set for `[min, max]`.
 *
 * Two behaviours that look like bugs and are not:
 *
 * - `ticks` may start above `lo`. The domain is padded so a mark never sits on
 *   the frame rule, but the padding is a *layout* device and the labels are a
 *   *claim about the data*. Where the two disagree -- "-5 wins" -- the label
 *   loses. (A rank axis is the exception: there the domain itself stops at 1.
 *   See `rankScale`.)
 * - `lo`/`hi` are not symmetric about the data. Nice-rounding widens to the
 *   next round number in each direction independently.
 * - a rank axis steps by whole positions even when that means three ticks. See
 *   `rankAwareStep`.
 */
export function niceScale(min: number, max: number, options: NiceScaleOptions = {}): NiceScale {
  const { isRank = false, anchorZero = false } = options

  if (anchorZero) return zeroAnchoredScale(min, max, isRank)

  // A flat series (one season, or an unchanged value) has no range to divide;
  // give it a symmetric window so the line lands mid-plot instead of on an
  // edge or on a division by zero.
  if (!(max > min)) {
    const pad = Math.abs(max) * 0.1 || 1
    min -= pad
    max += pad
  }

  const step = rankAwareStep(niceNum((max - min) / (TICK_TARGET - 1), true), isRank)
  let lo = tidy(Math.floor(min / step) * step)
  let hi = tidy(Math.ceil(max / step) * step)

  // Nice-rounding widens the domain but never *pads* it: when the extreme is
  // already a nice number -- the normal case for an integer metric like wins,
  // and for every rank -- floor/ceil are identities and the domain edge lands
  // exactly on the data. The marker there is then centred on plotTop or
  // plotBottom and the 1.5px frame rule cuts it in half. So give a
  // coincident extreme one step of air, which is TrajectoryChart's
  // `valuePadding = valueRange * 0.1` arriving by the nice-number route
  // instead of a percentage (a percentage would knock the ticks off their
  // round values, which is the whole point of nice-rounding).
  if (min === lo) lo = tidy(lo - step)
  if (max === hi) hi = tidy(hi + step)

  if (isRank) return rankScale(lo, hi, step)

  // The padding above is unconditional, which is right for the plot box -- it
  // is what keeps a marker off the frame rule. It is wrong for the tick LABELS
  // when the metric cannot go negative: an undefeated season (0 losses) or a
  // winless one would otherwise put "-5" on a wins axis.
  //
  // So pad the domain but floor the labels at zero. The two are allowed to
  // disagree: `lo` still sits a step below, so the 0-value marker keeps its
  // air, while the axis stops saying something impossible. Clamping `lo`
  // itself instead would reinstate exactly the bisection the padding fixes.
  //
  // Detected from the DATA (`min >= 0`), not from a per-metric floor flag:
  // every metric here is non-negative in practice, and a real negative value
  // (were one ever added) would keep its negative ticks correctly.
  const ticks: number[] = []
  const tickStart = min >= 0 && lo < 0 ? 0 : lo
  for (let value = tickStart; value <= hi + step / 1e6; value += step) ticks.push(tidy(value))

  return { lo, hi, ticks }
}

/**
 * A rank axis's step, in whole positions.
 *
 * Rank is a count, and every rank metric's `format` renders it whole. But
 * `niceNum` divides the domain WIDTH, so a team that sat between #4 and #6 for
 * three seasons asks it for a step near 0.5 -- and 0.5 on an axis whose labels
 * are integers prints "4, 4, 5, 5, 6, 6, 7": every label doubled, and the
 * reader shown a precision the metric does not have. A team hovering around
 * one rank is ordinary, not an edge case, so a rank axis steps by at least one
 * position.
 *
 * Clamping at 1 is the whole rule because `niceNum` returns `1|2|5|10 x 10^n`:
 * every output at or above 1 is already an integer, and every output below it
 * (0.5, 0.2, 0.05) is a fraction of a rank that cannot be labelled. Fewer,
 * honest ticks -- `1, 2, 3` -- beat more ticks that lie.
 */
function rankAwareStep(step: number, isRank: boolean): number {
  return isRank ? Math.max(1, step) : step
}

/**
 * The rank variant of the line branch: the same padded domain, and the same
 * round grid, clipped at rank 1.
 *
 * Rank 0 does not exist, so neither the domain nor the labels may reach it.
 * When the padded domain would, it is clamped to 1 -- and unlike the
 * non-negative-metric case above, domain and labels are NOT allowed to
 * disagree here: the padding buys air below the best rank on the card, and
 * below a #1 season there is nothing to buy.
 *
 * A grid that steps over 1 (0, 10, 20 ... on a full-table axis) then gets 1
 * back as its first label, so the floor of the plot box is what the axis says
 * it is. A domain that never approaches 1 -- a team parked between #4 and #6 --
 * keeps its own floor and its own air; it must not be stretched down to a rank
 * nobody on the card held.
 *
 * The ticks are therefore ascending, integral, all at or above 1, and distinct
 * once `format` has rounded them -- the four properties the labels rest on.
 */
function rankScale(lo: number, hi: number, step: number): NiceScale {
  const ticks: number[] = []
  for (let value = lo; value <= hi + step / 1e6; value += step) {
    const tick = tidy(value)
    if (tick >= 1) ticks.push(tick)
  }

  if (lo < 1) {
    if (ticks[0] !== 1) ticks.unshift(1)
    return { lo: 1, hi, ticks }
  }
  return { lo, hi, ticks }
}

/**
 * The bar variant. Zero is in the domain by construction, and the "one step of
 * air" rule from the line branch is deliberately NOT applied:
 *
 * - at the baseline it is not available -- moving `lo` off zero is the exact
 *   distortion this branch exists to prevent;
 * - at the far end it is not wanted -- a bar reaching the last gridline is a
 *   normal, readable bar chart, and the direct value labels sit in a reserved
 *   gutter beyond the plot rather than on the frame.
 *
 * A metric with negative values (scoring margin, EPA) gets a two-sided domain
 * and the baseline lands in the middle of the plot, which is correct: those
 * bars genuinely point in two directions.
 */
function zeroAnchoredScale(min: number, max: number, isRank: boolean): NiceScale {
  const lowest = Math.min(min, 0)
  const highest = Math.max(max, 0)

  // An all-zero (or single-zero) set has no span to divide. Give it a unit
  // window so the axis still draws; the bars are legitimately zero-length.
  const span = highest - lowest || Math.abs(highest) * 0.1 || 1
  const step = niceNum(span / (TICK_TARGET - 1), true)

  const lo = tidy(Math.floor(lowest / step) * step)
  let hi = tidy(Math.ceil(highest / step) * step)
  if (hi === lo) hi = tidy(lo + step)

  const ticks: number[] = []
  for (let value = lo; value <= hi + step / 1e6; value += step) {
    const tick = tidy(value)
    // Same rule as the line branch, reached differently: the domain must keep
    // zero (it is the baseline every bar is measured from) but a rank axis
    // must not *claim* a rank 0. The baseline rule already marks the origin,
    // so dropping the label costs nothing.
    if (isRank && tick === 0) continue
    ticks.push(tick)
  }

  return { lo, hi, ticks }
}
