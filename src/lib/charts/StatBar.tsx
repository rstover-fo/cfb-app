import { cn } from '@/lib/utils'

/**
 * Semantic tone -> token map for `thresholdTone`. Matches the standard
 * good/meh/bad semantic family (DESIGN.md "Tokens" table), not any one
 * consumer's bespoke tiering.
 */
const TONE_COLOR: Record<'positive' | 'neutral' | 'negative', string> = {
  positive: 'var(--color-positive)',
  neutral: 'var(--color-neutral)',
  negative: 'var(--color-negative)',
}

export interface StatBarProps {
  /**
   * Fill amount, pre-normalized to a 0-100 percentage by the caller. This is
   * the one sanctioned contract: a 0-1 fraction becomes `value * 100`, and a
   * dueling/relative-to-max bar becomes `(raw / max) * 100`. StatBar does not
   * accept a 0-1 contract or attempt to guess which domain it was given.
   *
   * Clamped to [0, 100]. Does not accept `null` -- per DESIGN.md's null rule,
   * callers own the decision to skip rendering the bar (and typically the
   * whole row) and show the house `—` placeholder instead.
   */
  value: number
  /**
   * Which edge the fill grows from. `'ltr'` (default) grows left-to-right.
   * `'rtl'` grows right-to-left -- e.g. the "away" side of a mirrored/dueling
   * pair (GameRedZone) that should visually meet the other bar in the middle.
   */
  direction?: 'ltr' | 'rtl'
  /**
   * Solid fill color: a `var(--token)` reference, or a resolved team hex
   * passed straight through (team colors are plain CSS here, not rough ink --
   * this is card chrome, not a roughjs chart). Mutually exclusive with
   * `thresholdTone`; if both are omitted the fill defaults to
   * `var(--color-run)`.
   */
  color?: string
  /**
   * Semantic threshold coloring (positive/neutral/negative), for bars whose
   * fill communicates "good/meh/bad" rather than a single series identity.
   * Mutually exclusive with `color` -- `color` wins if both are passed.
   */
  thresholdTone?: 'positive' | 'neutral' | 'negative'
  /**
   * Accessible label for standalone bars whose fill isn't already described
   * by adjacent visible text. When set, the bar announces as
   * `role="img"` + this label. Omit (the default, and the common case --
   * every current consumer pairs the bar with a visible numeric value next
   * to it) to keep the bar `aria-hidden`.
   */
  ariaLabel?: string
  /** Extra classes on the track (e.g. a fixed width, `flex-1`). */
  className?: string
}

/**
 * The one CSS track/fill micro-bar (docs/chart-style-spec.md sweep, task D1).
 * This is card chrome, not a chart -- it is never rough-drawn and never
 * enters the roughjs recipe.
 */
export function StatBar({ value, direction = 'ltr', color, thresholdTone, ariaLabel, className }: StatBarProps) {
  const pct = Math.min(100, Math.max(0, value))
  const fillColor = color ?? (thresholdTone ? TONE_COLOR[thresholdTone] : 'var(--color-run)')

  return (
    <div
      className={cn(
        'h-2 bg-[var(--bg-surface-alt)] rounded-full overflow-hidden',
        direction === 'rtl' && 'flex justify-end',
        className,
      )}
      {...(ariaLabel ? { role: 'img' as const, 'aria-label': ariaLabel } : { 'aria-hidden': true as const })}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: fillColor }}
      />
    </div>
  )
}
