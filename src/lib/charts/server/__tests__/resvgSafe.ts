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

/** Small deterministic string hash (FNV-1a). Not security-relevant. */
export function cheapHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
