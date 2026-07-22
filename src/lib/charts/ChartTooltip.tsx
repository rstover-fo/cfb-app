'use client'

import type { CSSProperties } from 'react'

export type SwatchKind = 'solid' | 'dashed'

/**
 * Shared swatch treatment for tooltip and legend rows: solid token
 * background, or the house dashed `repeating-linear-gradient` for dashed
 * series (docs/chart-style-spec.md §3-4). `color` is a `var(--…)` reference
 * or an already-resolved team hex -- CSS handles theme flips.
 */
export function swatchBackground(kind: SwatchKind, color: string): CSSProperties {
  if (kind === 'dashed') {
    return {
      backgroundImage: `repeating-linear-gradient(90deg, ${color} 0, ${color} 4px, transparent 4px, transparent 6px)`,
    }
  }
  return { backgroundColor: color }
}

export interface ChartTooltipRow {
  /** Defaults to 'solid' when `color` is set; muted caption rows always get the empty spacer. */
  swatch?: 'solid' | 'dashed' | 'none'
  /** `var(--…)` reference or resolved team hex. */
  color?: string
  label: string
  value?: string
  /** Muted caption row (e.g. percentile context): muted text + spacer swatch. */
  muted?: boolean
}

export interface ChartTooltipProps {
  /** Headline for the hovered/focused selection (e.g. the season or week). */
  header?: string
  /** Detail rows for the current selection; empty = idle, shows `prompt`. */
  rows: ChartTooltipRow[]
  /** Muted one-liner shown when nothing is hovered/focused. */
  prompt: string
  /** Densest row count the panel can show -- reserves height so there is no layout jump. */
  minRows: number
}

/**
 * The only tooltip mechanism (docs/chart-style-spec.md §3): a
 * reserved-height panel below the SVG, inside the frame. Pair with an
 * in-SVG crosshair / row-highlight / accent-ring selection indicator.
 * Never floating, never cursor-following, never SVG text.
 */
export function ChartTooltip({ header, rows, prompt, minRows }: ChartTooltipProps) {
  // Reserved height = p-3 (2 x 0.75rem) + header line (text-base 1.5rem +
  // mb-2 0.5rem) + minRows rows (text-sm 1.25rem each + space-y-1 gaps).
  const minHeight = `${1.5 + 2 + minRows * 1.25 + Math.max(0, minRows - 1) * 0.25}rem`

  return (
    <div
      data-testid="chart-tooltip"
      className="mt-2 p-3 bg-[var(--bg-surface)] border-[1.5px] border-[var(--border)] rounded-lg text-sm"
      style={{ minHeight }}
    >
      {rows.length === 0 ? (
        <p className="text-[var(--text-muted)]">{prompt}</p>
      ) : (
        <>
          {header && (
            <p className="font-headline text-base text-[var(--text-primary)] mb-2">{header}</p>
          )}
          <div className="space-y-1">
            {rows.map((row, i) => {
              const swatch = row.muted
                ? 'none'
                : (row.swatch ?? (row.color ? 'solid' : 'none'))
              return (
                <p key={`${row.label}-${i}`} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="w-3 h-0.5 shrink-0"
                    style={
                      swatch !== 'none' && row.color
                        ? swatchBackground(swatch, row.color)
                        : undefined
                    }
                  />
                  <span className={row.muted ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}>
                    {row.label}
                  </span>
                  {row.value !== undefined && (
                    <span
                      className={
                        row.muted
                          ? 'text-[var(--text-muted)] tabular-nums'
                          : 'text-[var(--text-primary)] font-medium tabular-nums'
                      }
                    >
                      {row.value}
                    </span>
                  )}
                </p>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
