/**
 * The empty-state render target: a framed headline plus one muted line, for
 * when a chart request has no data ("no playcalling profile for this team and
 * season"). The route needs something to return that is still a valid image,
 * and returning a blank canvas or a 404 gives the Discord bot nothing to say.
 *
 * Mirrors `src/components/EmptyState.tsx`'s voice -- short title, optional
 * supporting detail with an em-dash pivot -- without its Phosphor icon, which
 * would mean bundling icon paths for no real gain at PNG scale.
 */
import { CHART_FONT_SIZE, CHART_WIDTH, ROUGH_SEED, ROUGH_TERTIARY } from '../presets'
import type { ChartInk } from '../tokens'
import { ChartDocument } from './document'
import { RoughShape, createRoughGenerator } from './rough'

const WIDTH = CHART_WIDTH
const HEIGHT = 200

const TITLE_SIZE = 20

export interface EmptyCardProps {
  /** Short one-line explanation of why nothing is showing. */
  title: string
  /** Optional supporting detail, e.g. which team/season was asked for. */
  message?: string
  ink: ChartInk
}

export function EmptyCard({ title, message, ink }: EmptyCardProps) {
  const gen = createRoughGenerator()
  const centerX = WIDTH / 2
  const titleBaseline = HEIGHT / 2 - 6
  const ruleY = titleBaseline + 18

  return (
    <ChartDocument width={WIDTH} height={HEIGHT} ink={ink} ariaLabel={message ? `${title}. ${message}` : title}>
      <text
        x={centerX}
        y={titleBaseline}
        textAnchor="middle"
        fill={ink.textPrimary}
        fontFamily={ink.fontHeadline}
        fontSize={TITLE_SIZE}
      >
        {title}
      </text>

      {/* Short hand-drawn rule -- the one piece of house character an empty
          card gets, so it still reads as part of the same publication. */}
      <RoughShape
        generator={gen}
        drawable={gen.line(centerX - 42, ruleY, centerX + 42, ruleY, {
          stroke: ink.border,
          seed: ROUGH_SEED,
          ...ROUGH_TERTIARY,
        })}
      />

      {message && (
        <text
          x={centerX}
          y={ruleY + 26}
          textAnchor="middle"
          fill={ink.textMuted}
          fontFamily={ink.fontBody}
          fontSize={CHART_FONT_SIZE.sm}
        >
          {message}
        </text>
      )}
    </ChartDocument>
  )
}
