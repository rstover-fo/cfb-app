'use client'

import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { swatchBackground } from './ChartTooltip'

export interface ChartLegendItem {
  key: string
  label: string
  swatch: 'solid' | 'dashed' | 'hachure'
  /** `var(--…)` reference or resolved team hex. */
  color: string
}

export interface ChartLegendProps {
  items: ChartLegendItem[]
  /** Default 'below' (docs/chart-style-spec.md §4). */
  position?: 'above' | 'below'
  /** Opt-in toggle variant: items become aria-pressed buttons; hidden = opacity-40. */
  interactive?: {
    visible: Record<string, boolean>
    onToggle: (key: string) => void
  }
}

/**
 * Hachure series swatch: a small rough-look block drawn as an HTML
 * background (never SVG) -- thin diagonal strokes at the house 41° angle.
 */
function hachureSwatchStyle(color: string): CSSProperties {
  return {
    border: `1px solid ${color}`,
    backgroundImage: `repeating-linear-gradient(131deg, ${color} 0, ${color} 1px, transparent 1px, transparent 4px)`,
  }
}

function LegendSwatch({ item }: { item: ChartLegendItem }) {
  if (item.swatch === 'hachure') {
    return <span aria-hidden="true" className="w-3 h-3 shrink-0" style={hachureSwatchStyle(item.color)} />
  }
  return (
    <span
      aria-hidden="true"
      className="w-4 h-0.5 shrink-0"
      style={swatchBackground(item.swatch, item.color)}
    />
  )
}

/**
 * The one legend mechanism (docs/chart-style-spec.md §4): HTML, outside the
 * SVG, above or below it inside the frame. Series keys never render inside
 * the SVG.
 */
export function ChartLegend({ items, position = 'below', interactive }: ChartLegendProps) {
  // flex-wrap: legends are unordered clusters (DESIGN.md "Responsive rows") --
  // many-item legends wrap on narrow viewports instead of overflowing the frame.
  const containerClass =
    position === 'below'
      ? 'flex flex-wrap items-center justify-center gap-x-6 gap-y-1 mt-3 pt-2 border-t border-[var(--border)]'
      : 'flex flex-wrap items-center justify-center gap-x-6 gap-y-1 mb-3 pb-2 border-b border-[var(--border)]'

  return (
    <div className={containerClass}>
      {items.map(item => {
        const label = <span className="text-[var(--text-secondary)]">{item.label}</span>

        if (interactive) {
          const visible = interactive.visible[item.key] ?? true
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={visible}
              onClick={() => interactive.onToggle(item.key)}
              className={cn('flex items-center gap-2 text-xs transition-opacity', !visible && 'opacity-40')}
            >
              <LegendSwatch item={item} />
              {label}
            </button>
          )
        }

        return (
          <span key={item.key} className="flex items-center gap-2 text-xs">
            <LegendSwatch item={item} />
            {label}
          </span>
        )
      })}
    </div>
  )
}
