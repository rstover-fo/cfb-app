/**
 * The outer SVG document and editorial card frame shared by every server-side
 * chart render.
 *
 * Constraints this file exists to enforce, all of them resvg (usvg) facts
 * rather than preferences:
 *
 * - resvg is an **SVG 1.1 static** renderer. No CSS custom properties, no
 *   `class`, no `<style>`, no external stylesheets. Every value is an inline
 *   presentation attribute, and every color arrives already literal via
 *   `ChartInk` from `src/lib/charts/tokens.ts`.
 * - The root `<svg>` must carry `xmlns` and `viewBox`.
 * - The canvas needs an explicit opaque background: a PNG posted to Discord has
 *   no page behind it, so the paper tone is painted, not inherited.
 *
 * Markup is produced with React + `renderToStaticMarkup` rather than string
 * concatenation, so attributes are typechecked and text is escaped -- a team
 * named `Texas A&M` interpolated into a hand-built string is an XML parse error
 * and yields a blank PNG.
 */
import type { ReactNode } from 'react'
import type { ChartInk } from '../tokens'

/** Margin between the SVG edge and the card, in viewBox units. */
export const OUTER_PAD = 10
/** Card inner padding -- mirrors ChartFrame's `p-4` at chart scale. */
export const CARD_PAD = 18
/** ChartFrame's `rounded-lg`, which resolves to the editorial 3px. */
export const CARD_RADIUS = 3
/** ChartFrame's `border-[1.5px]`. */
export const CARD_STROKE_WIDTH = 1.5

/** Geometry of the card and its content box for a given canvas size. */
export function cardGeometry(width: number, height: number) {
  const cardX = OUTER_PAD
  const cardY = OUTER_PAD
  const cardW = width - OUTER_PAD * 2
  const cardH = height - OUTER_PAD * 2
  return {
    cardX,
    cardY,
    cardW,
    cardH,
    contentX: cardX + CARD_PAD,
    contentY: cardY + CARD_PAD,
    contentW: cardW - CARD_PAD * 2,
    contentRight: cardX + cardW - CARD_PAD,
  }
}

interface ChartDocumentProps {
  width: number
  height: number
  ink: ChartInk
  /** Describes the data, per the FootballField a11y convention. */
  ariaLabel: string
  children: ReactNode
}

/**
 * Root `<svg>` plus the paper background and the card the chart sits on.
 * `role`/`aria-label` matter when the route serves the SVG directly; they are
 * inert (and harmless) on the way to a PNG.
 */
export function ChartDocument({ width, height, ink, ariaLabel, children }: ChartDocumentProps) {
  const g = cardGeometry(width, height)

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
    >
      <rect x={0} y={0} width={width} height={height} fill={ink.bgPrimary} />
      <rect
        x={g.cardX}
        y={g.cardY}
        width={g.cardW}
        height={g.cardH}
        rx={CARD_RADIUS}
        fill={ink.bgSurface}
        stroke={ink.border}
        strokeWidth={CARD_STROKE_WIDTH}
      />
      {children}
    </svg>
  )
}
