/**
 * Drift guard for `src/lib/charts/tokens.ts`.
 *
 * `tokens.ts` duplicates design-token values that `globals.css` owns. That
 * duplication is only acceptable because this test makes it impossible to
 * forget, so it deliberately fails in BOTH directions:
 *
 * 1. A mirrored value drifts from the CSS.
 * 2. A new chart-relevant token is added to the CSS and *not* mirrored --
 *    caught via an explicit allowlist of the tokens charts legitimately ignore
 *    (shadcn bridge aliases, shadows, radii).
 *
 * Plus two hygiene checks that keep the allowlist from rotting into a
 * catch-all: every allowlisted name must actually exist in the CSS, and every
 * dark-mode value must either be declared in the dark block or provably
 * inherit from `:root`.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CHART_TOKENS, CHART_TOKEN_NAMES, CHART_FONT_FAMILY, fontFamilyOf } from '../tokens'

const CSS_PATH = path.join(process.cwd(), 'src', 'app', 'globals.css')
const css = fs.readFileSync(CSS_PATH, 'utf8')

/**
 * Tokens declared in `globals.css` that charts have no business mirroring.
 * Adding a name here is a deliberate statement that no chart will ever draw
 * with it -- if a chart needs it, mirror it in `tokens.ts` instead.
 */
const NON_CHART_TOKENS = new Set([
  // Effects and metrics, not ink.
  '--shadow-soft',
  '--shadow-hover',
  '--paper-opacity',
  '--radius',
  // shadcn/ui token bridge -- pure aliases onto the editorial tokens above,
  // consumed by shadcn components (framing), never by chart internals.
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--accent-shadcn',
  '--accent-shadcn-foreground',
  '--muted',
  '--muted-foreground',
  '--destructive',
  '--destructive-foreground',
  '--input',
  '--ring',
])

/**
 * Extracts one top-level rule block's custom-property declarations.
 *
 * The `:root` pattern is anchored at column 0 so it cannot accidentally match
 * the indented `:root:not([data-theme])` inside the `prefers-color-scheme`
 * media query, which declares an overlapping set for a different purpose.
 */
function parseBlock(selectorPattern: RegExp): Record<string, string> {
  const match = css.match(selectorPattern)
  if (!match) throw new Error(`globals.css: no block matched ${selectorPattern}`)

  const body = match[1].replace(/\/\*[\s\S]*?\*\//g, '')
  const declarations: Record<string, string> = {}
  for (const decl of body.split(';')) {
    // Trimmed first so the value pattern needs no dotAll flag (tsconfig
    // targets ES2017, which predates it).
    const m = decl.trim().match(/^(--[\w-]+)\s*:\s*([\s\S]+)$/)
    if (m) declarations[m[1]] = m[2].trim()
  }
  return declarations
}

const cssLight = parseBlock(/^:root\s*\{([\s\S]*?)^\}/m)
const cssDark = parseBlock(/^\[data-theme="dark"\]\s*\{([\s\S]*?)^\}/m)

describe('globals.css parsing', () => {
  it('finds a plausible number of declarations in each block', () => {
    // Sanity floor: if the regexes ever silently match an empty block, every
    // other assertion in this file would vacuously pass.
    expect(Object.keys(cssLight).length).toBeGreaterThan(30)
    expect(Object.keys(cssDark).length).toBeGreaterThan(15)
    expect(cssLight['--text-muted']).toBe('#6B635A')
    expect(cssDark['--text-muted']).toBe('#8A847A')
  })
})

describe('tokens.ts mirrors globals.css :root (light)', () => {
  it.each(CHART_TOKEN_NAMES)('%s matches the CSS value exactly', token => {
    expect(cssLight[token], `${token} is not declared in the :root block`).toBeDefined()
    expect(CHART_TOKENS.light[token]).toBe(cssLight[token])
  })
})

describe('tokens.ts mirrors globals.css [data-theme="dark"]', () => {
  it.each(CHART_TOKEN_NAMES)('%s matches its dark value', token => {
    const overridden = cssDark[token]
    if (overridden !== undefined) {
      expect(CHART_TOKENS.dark[token]).toBe(overridden)
    } else {
      // Not overridden in the dark block, so it cascades from :root. The dark
      // mirror must model that cascade rather than pinning a stale value.
      expect(CHART_TOKENS.dark[token]).toBe(CHART_TOKENS.light[token])
    }
  })
})

describe('no chart-relevant token is missing from tokens.ts', () => {
  const mirrored = new Set<string>(CHART_TOKEN_NAMES)

  it('every :root token is either mirrored or explicitly non-chart', () => {
    const unaccounted = Object.keys(cssLight).filter(t => !mirrored.has(t) && !NON_CHART_TOKENS.has(t))
    expect(
      unaccounted,
      'New token(s) in globals.css :root. Mirror them in src/lib/charts/tokens.ts, ' +
        'or add them to NON_CHART_TOKENS if no chart will ever draw with them.',
    ).toEqual([])
  })

  it('every [data-theme="dark"] token is either mirrored or explicitly non-chart', () => {
    const unaccounted = Object.keys(cssDark).filter(t => !mirrored.has(t) && !NON_CHART_TOKENS.has(t))
    expect(unaccounted).toEqual([])
  })

  it('keeps the allowlist honest -- every entry still exists in the CSS', () => {
    const stale = [...NON_CHART_TOKENS].filter(t => cssLight[t] === undefined && cssDark[t] === undefined)
    expect(stale, 'NON_CHART_TOKENS names token(s) that no longer exist in globals.css').toEqual([])
  })

  it('never allowlists a token it also mirrors', () => {
    const both = [...NON_CHART_TOKENS].filter(t => mirrored.has(t))
    expect(both).toEqual([])
  })
})

describe('font families', () => {
  it('derives the resvg family name from the same token the browser uses', () => {
    expect(fontFamilyOf("'Libre Baskerville', Georgia, serif")).toBe('Libre Baskerville')
    expect(fontFamilyOf('system-ui, sans-serif')).toBe('system-ui')
    expect(CHART_FONT_FAMILY.headline).toBe('Libre Baskerville')
    expect(CHART_FONT_FAMILY.body).toBe('DM Sans')
  })
})
