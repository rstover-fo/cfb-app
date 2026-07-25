/**
 * Vendored typefaces for server-side rasterization.
 *
 * Why the fonts are checked into the repo at all: `next/font/google` fetches
 * Libre Baskerville and DM Sans into `.next/` at build time under hashed
 * filenames, which is not a stable import target for server code. The two
 * families are OFL-licensed, so the TTFs live in `./fonts` alongside their
 * license files and are handed to resvg directly.
 *
 * Why `loadSystemFonts: false`: Lambda has essentially no system fonts, so
 * relying on them means "correct locally, wrong in production". Worse, system
 * fonts make output non-deterministic across machines, which would defeat
 * caching and make any rendered-output test machine-dependent.
 *
 * **`fontFiles` takes PATHS, not buffers.** `@resvg/resvg-js` 2.6.2 has no
 * `fontBuffers` option; passing one is silently ignored and every glyph falls
 * back, which looks plausible and is completely wrong. That is why
 * `outputFileTracingIncludes` in `next.config.ts` is mandatory rather than a
 * nice-to-have: the TTFs must physically exist next to the deployed function,
 * because `path.join(process.cwd(), ...)` is invisible to Next's file tracer.
 */
import path from 'node:path'
import fs from 'node:fs'
import { CHART_FONT_FAMILY } from '../tokens'

/**
 * Resolved once at module scope. `process.cwd()` is the project root in
 * `next dev` and the function root in a serverless bundle; traced files keep
 * their project-relative layout, so the same join works in both.
 */
export const CHART_FONT_DIR = path.join(process.cwd(), 'src', 'lib', 'charts', 'fonts')

/**
 * The four faces the charts draw with. Static instances, not variable fonts:
 * resvg picks a face by family + weight from the loaded set, so each weight
 * needs its own file.
 */
export const CHART_FONT_FILENAMES = [
  'LibreBaskerville-Regular.ttf',
  'LibreBaskerville-Bold.ttf',
  'DMSans-Regular.ttf',
  'DMSans-Medium.ttf',
] as const

export function chartFontFiles(): string[] {
  return CHART_FONT_FILENAMES.map(name => path.join(CHART_FONT_DIR, name))
}

/**
 * Font options for `new Resvg(svg, { font })`.
 *
 * `defaultFontFamily` is a plain string in 2.6.2 (not an object) and only
 * matters for text that names no family. Every `<text>` this renderer emits
 * carries an explicit `font-family`, so this is a backstop, not the mechanism.
 */
export function chartFontOptions() {
  return {
    loadSystemFonts: false,
    fontFiles: chartFontFiles(),
    defaultFontFamily: CHART_FONT_FAMILY.body,
    serifFamily: CHART_FONT_FAMILY.headline,
    sansSerifFamily: CHART_FONT_FAMILY.body,
  }
}

/**
 * Throws if a vendored TTF is missing. Cheap, and it converts the classic
 * "works in `next dev`, renders blank in production" tracing failure into a
 * loud error naming the missing file.
 */
export function assertChartFontsPresent(): void {
  const missing = chartFontFiles().filter(file => !fs.existsSync(file))
  if (missing.length > 0) {
    throw new Error(
      `Chart fonts missing at ${CHART_FONT_DIR}: ${missing.map(m => path.basename(m)).join(', ')}. ` +
        'Check `outputFileTracingIncludes` in next.config.ts -- the TTFs must be traced into the deployed function.',
    )
  }
}
