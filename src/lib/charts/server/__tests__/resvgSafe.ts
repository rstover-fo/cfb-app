/**
 * `expectResvgSafe` -- the assertion that catches everything which renders
 * perfectly in a browser and blank (or wrong) under resvg.
 *
 * resvg is an SVG 1.1 *static* renderer built on usvg. It resolves no CSS
 * custom properties, no `class` attributes, no `<style>` blocks and no external
 * stylesheets, it inherits no font metrics, and its `dominant-baseline` support
 * is partial. None of those failures raise -- they silently produce grey text,
 * unstyled shapes, or nothing at all. So the checks are structural and run over
 * every server-rendered target.
 *
 * Not named `*.test.ts` on purpose: this is a helper, not a suite.
 */
import { expect } from 'vitest'

/** Legal SVG paint for our renderer: a literal hex color, or explicit `none`. */
const PAINT = /^(#[0-9a-f]{3,8}|none)$/i

export function expectResvgSafe(svg: string): void {
  // --- Root element -------------------------------------------------------
  const root = svg.match(/^<svg\b[^>]*>/)
  expect(root, 'markup does not start with a root <svg> element').not.toBeNull()
  expect(root![0]).toContain('xmlns="http://www.w3.org/2000/svg"')
  expect(root![0]).toMatch(/viewBox="[^"]+"/)

  // --- Nothing that needs a CSS engine ------------------------------------
  expect(svg, 'CSS custom properties do not resolve under resvg').not.toMatch(/var\(--/)
  expect(svg, 'class attributes are not resolved -- there is no stylesheet').not.toMatch(/\sclass=/)
  expect(svg, 'className is a React prop and must never reach the markup').not.toMatch(/className/)
  expect(svg, '<style> blocks are not applied').not.toMatch(/<style\b/)
  expect(svg, 'external stylesheet references are not fetched').not.toMatch(/<\?xml-stylesheet/)

  // --- Partial-support attributes we refuse to depend on ------------------
  expect(
    svg,
    'dominant-baseline support is partial; center text with an explicit dy instead',
  ).not.toMatch(/dominant-baseline/)

  // --- Paint values -------------------------------------------------------
  // `\sfill="` deliberately does not match `fill-rule="`, and `\sstroke="`
  // does not match `stroke-width="`/`stroke-dasharray="`.
  for (const [, value] of svg.matchAll(/\sfill="([^"]*)"/g)) {
    expect(value, `fill="${value}" is not a literal color or none`).toMatch(PAINT)
  }
  for (const [, value] of svg.matchAll(/\sstroke="([^"]*)"/g)) {
    expect(value, `stroke="${value}" is not a literal color or none`).toMatch(PAINT)
  }

  // --- Raster is embedded, never referenced -------------------------------
  // resvg fetches nothing at all: no http(s), no file paths, no relative URLs.
  // An `<image>` pointing at one does not fail, it renders as a hole -- so the
  // bytes have to be in the document. (`renderChartSvg` is pure and could not
  // fetch them even if it wanted to; resolution happens in the route.)
  for (const [tag] of svg.matchAll(/<image\b[^>]*>/g)) {
    const href = tag.match(/\shref="([^"]*)"/)?.[1] ?? ''
    expect(href.slice(0, 5), `<image> href is not a data: URI -- resvg fetches nothing: ${href.slice(0, 60)}`).toBe(
      'data:',
    )
    // resvg gives an `<image>` no intrinsic size to fall back on.
    expect(tag, `<image> without an explicit size: ${elideDataUris(tag)}`).toMatch(/\swidth="[^"]+"/)
    expect(tag, `<image> without an explicit size: ${elideDataUris(tag)}`).toMatch(/\sheight="[^"]+"/)
  }

  // --- Text is fully self-describing --------------------------------------
  const texts = [...svg.matchAll(/<text\b[^>]*>/g)].map(m => m[0])
  expect(texts.length, 'no <text> elements found -- did the chart render at all?').toBeGreaterThan(0)
  for (const tag of texts) {
    expect(tag, `<text> without font-family: ${tag}`).toMatch(/font-family="[^"]+"/)
    expect(tag, `<text> without font-size: ${tag}`).toMatch(/font-size="[^"]+"/)
  }
}

/**
 * Collapses roughjs path geometry to a short digest so a snapshot stays
 * reviewable: every color, font, size and layout coordinate remains visible in
 * the diff, while the thousands of unreadable bezier coordinates become one
 * stable token that still changes if the geometry changes.
 */
export function elidePathData(svg: string): string {
  return svg.replace(/ d="([^"]*)"/g, (_full, d: string) => ` d="[${d.length}ch:${cheapHash(d)}]"`)
}

/**
 * The same treatment for inlined `data:` URIs.
 *
 * A scatter card carries ~25 base64 logos; left intact they are hundreds of
 * kilobytes of noise in a snapshot nobody can then read, and any real change
 * to the chart would be invisible in the diff. The media type and the payload's
 * length and digest survive, so a swapped, corrupted or missing logo still
 * fails the snapshot -- what is lost is only the ability to reconstruct the
 * bytes, which no reviewer wanted.
 */
export function elideDataUris(svg: string): string {
  return svg.replace(/"(data:[^"]*)"/g, (_full, uri: string) => {
    const comma = uri.indexOf(',')
    if (comma === -1) return `"${uri}"`
    const payload = uri.slice(comma + 1)
    return `"${uri.slice(0, comma + 1)}[${payload.length}ch:${cheapHash(payload)}]"`
  })
}

/** Both elisions, in the order a snapshot wants them. */
export function elideHeavyAttributes(svg: string): string {
  return elideDataUris(elidePathData(svg))
}

/** Small deterministic string hash (FNV-1a). Not security-relevant. */
export function cheapHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
