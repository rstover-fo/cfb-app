'use client'

import type { ComponentProps, ReactNode } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

/**
 * A11y props for the chart's `<svg>` element, following the FootballField
 * pattern (docs/chart-style-spec.md §2): decorative charts are hidden from
 * assistive tech; meaningful charts announce as a labeled image. The SVG --
 * not the frame div -- carries the role/label, so `ChartFrame` hands these
 * to its child via the render-prop form of `children`.
 */
export type ChartSvgA11yProps =
  | { 'aria-hidden': true }
  | { role: 'img'; 'aria-label': string }

export interface ChartFrameProps {
  /** Optional headline slot rendered above the chart. */
  title?: string
  /** Data-describing label for the SVG. Required unless `decorative`. */
  ariaLabel?: string
  /** Purely decorative duplicate of data available elsewhere -> aria-hidden. */
  decorative?: boolean
  /** Result of the chart's null-guard predicate (spec §5). */
  empty?: boolean
  /** EmptyState props, rendered inside the shell when `empty`. Required when `empty` can be true. */
  emptyState?: ComponentProps<typeof EmptyState>
  className?: string
  /**
   * The `<svg>` + ChartTooltip + ChartLegend. The function form receives the
   * SVG a11y props to spread onto the `<svg>`; the plain form is for charts
   * that apply role/aria-label themselves.
   */
  children: ReactNode | ((a11y: ChartSvgA11yProps) => ReactNode)
}

/**
 * The one chart shell (docs/chart-style-spec.md §2): editorial surface,
 * 1.5px border, 3px radius (`rounded-lg` -- never inline radii), `p-4`.
 * Charts never hand-roll this wrapper.
 */
export function ChartFrame({
  title,
  ariaLabel,
  decorative = false,
  empty = false,
  emptyState,
  className,
  children,
}: ChartFrameProps) {
  // `ariaLabel` is required unless `decorative` (spec §2); if a chart omits
  // it anyway, fall back to the title rather than an empty label.
  const a11y: ChartSvgA11yProps = decorative
    ? { 'aria-hidden': true }
    : { role: 'img', 'aria-label': ariaLabel ?? title ?? '' }

  return (
    <div
      className={cn(
        'bg-[var(--bg-surface)] border-[1.5px] border-[var(--border)] rounded-lg p-4',
        className,
      )}
    >
      {title && (
        <h3 className="font-headline text-lg text-[var(--text-primary)] mb-3">{title}</h3>
      )}
      {empty && emptyState ? (
        <EmptyState {...emptyState} />
      ) : typeof children === 'function' ? (
        children(a11y)
      ) : (
        children
      )}
    </div>
  )
}
