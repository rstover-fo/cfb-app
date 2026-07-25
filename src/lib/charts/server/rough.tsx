/**
 * Server-side roughjs: hand-drawn geometry as React `<path>` elements.
 *
 * The client recipe calls `rough.svg(svgEl)` and appends real DOM nodes into a
 * `<g>`. There is no DOM here, so we drive `rough.generator()` instead and turn
 * each `Drawable` into `PathInfo[]` via `generator.toPaths()`. The emitted
 * attributes mirror `RoughSVG.draw()` exactly (stroke / stroke-width / fill,
 * plus `fill-rule="evenodd"` on filled curves and polygons), so the two worlds
 * produce the same picture.
 *
 * Determinism: every options object must carry `seed` (spec §9). With a fixed
 * seed the generator's output is byte-identical across instances and processes,
 * which is what makes the SVG snapshot tests meaningful.
 */
import type { ReactNode } from 'react'
import rough from 'roughjs'
import type { Drawable, Options } from 'roughjs/bin/core'
import type { RoughGenerator } from 'roughjs/bin/generator'

/** roughjs's own "no paint" sentinel -- a legal SVG paint value. */
const NONE = 'none'

export function createRoughGenerator(): RoughGenerator {
  return rough.generator()
}

interface RoughShapeProps {
  generator: RoughGenerator
  drawable: Drawable
  /** Element-level opacity, e.g. TrajectoryChart's 0.1 area fills. */
  opacity?: number
}

/** Renders one roughjs `Drawable` as the `<path>` elements it decomposes into. */
export function RoughShape({ generator, drawable, opacity }: RoughShapeProps): ReactNode {
  const evenOdd = drawable.shape === 'curve' || drawable.shape === 'polygon'

  return (
    <>
      {generator.toPaths(drawable).map((p, i) => {
        const fill = p.fill || NONE
        return (
          <path
            key={i}
            d={p.d}
            stroke={p.stroke || NONE}
            strokeWidth={p.strokeWidth}
            fill={fill}
            fillRule={evenOdd && fill !== NONE ? 'evenodd' : undefined}
            opacity={opacity}
          />
        )
      })}
    </>
  )
}

/**
 * Convenience wrappers so call sites read like the client's `rc.rectangle(...)`
 * rather than a two-step generate-then-render. Each returns a ready `ReactNode`.
 */
export function roughRect(
  generator: RoughGenerator,
  x: number,
  y: number,
  width: number,
  height: number,
  options: Options,
  key?: string,
): ReactNode {
  return <RoughShape key={key} generator={generator} drawable={generator.rectangle(x, y, width, height, options)} />
}

export function roughLine(
  generator: RoughGenerator,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options: Options,
  key?: string,
): ReactNode {
  return <RoughShape key={key} generator={generator} drawable={generator.line(x1, y1, x2, y2, options)} />
}
