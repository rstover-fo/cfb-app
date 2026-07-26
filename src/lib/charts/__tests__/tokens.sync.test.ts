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
import { CHART_TOKENS, CHART_TOKEN_NAMES, CHART_FONT_FAMILY, VAR_INK, fontFamilyOf, literalInk } from '../tokens'

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

/**
 * WCAG 2.x relative luminance, then the 1.4.11 contrast ratio. Inlined rather
 * than pulled from a dependency so the numbers the design gate was given are
 * reproducible from this repo alone.
 */
function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const channel = (v: number): number => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('categorical series ramp contrast', () => {
  // Both card surfaces a chart can land on. The ramp exists because the
  // theme-invariant `--color-*` set could not clear the dark one: `--color-pass`
  // measured 2.46:1 there, which is why a peer series receded in dark mode.
  const SURFACES = { light: '#FFFFFF', dark: '#252019' } as const
  const SERIES = ['--series-1', '--series-2', '--series-3', '--series-4'] as const

  it('sanity-checks the ratio helper against known pairs', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
    // The measurement that made the ramp blocking in the first place.
    expect(contrastRatio('#5C5A7A', SURFACES.dark)).toBeCloseTo(2.46, 2)
  })

  for (const mode of ['light', 'dark'] as const) {
    for (const token of SERIES) {
      // Every value clears 3:1 against BOTH surfaces, not just its own mode's.
      // A chart rendered light and viewed on a dark page (or vice versa via a
      // stale cached PNG) then still meets 1.4.11 for non-text.
      it.each(Object.entries(SURFACES))(`${mode} ${token} clears 3:1 on the %s surface`, (_name, surface) => {
        expect(contrastRatio(CHART_TOKENS[mode][token], surface)).toBeGreaterThanOrEqual(3)
      })
    }
  }

  it('keeps --series-1 on the --color-run hue so the signature accent leads', () => {
    const hueOf = (hex: string): number => {
      const n = parseInt(hex.slice(1), 16)
      const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
      const [mx, mn] = [Math.max(r, g, b), Math.min(r, g, b)]
      const d = mx - mn
      if (d === 0) return 0
      const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
      return (h + 360) % 360
    }
    const runHue = hueOf(CHART_TOKENS.light['--color-run'])
    for (const mode of ['light', 'dark'] as const) {
      expect(Math.abs(hueOf(CHART_TOKENS[mode]['--series-1']) - runHue)).toBeLessThan(4)
    }
  })

  it('varies the ramp per mode -- a single set cannot serve both surfaces well', () => {
    for (const token of SERIES) {
      expect(CHART_TOKENS.dark[token]).not.toBe(CHART_TOKENS.light[token])
    }
  })
})

describe('crest paper', () => {
  // The backing laid under a team crest in dark mode. A crest is an input we do
  // not control -- ESPN draws them for a white page -- so the fix is to give it
  // the page it was drawn for rather than to restyle artwork we may not touch
  // (spec §7). Guarded here rather than only in the scatter's tests because the
  // value is a cross-mode token read, and that is this file's subject.
  const dark = literalInk('dark')

  it('is the light card\'s own surface, not a colour invented for the purpose', () => {
    expect(dark.crestPaper).toBe(CHART_TOKENS.light['--bg-surface'])
    expect(dark.crestPaper).not.toBe(CHART_TOKENS.dark['--bg-surface'])
  })

  it('clears the dark card by the margin the treatment was ruled on', () => {
    expect(contrastRatio(dark.crestPaper!, CHART_TOKENS.dark['--bg-surface'])).toBeCloseTo(16.16, 2)
  })

  it('exists because opacity could not reach the problem', () => {
    // The measurements that made this blocking: at FULL opacity, on the dark
    // card, these crests are not visible at all. Raising `FIELD_OPACITY` moves
    // Penn State from 1.03 to 1.02 -- there is nothing for a dial to do here.
    // On the light card -- and so, now, on the paper -- the same crests run
    // 6.75:1 to 21:1.
    const CRESTS = {
      'Ole Miss navy': '#14213D',
      'Penn State navy': '#041E42',
      'Iowa black': '#000000',
      'Ohio State scarlet': '#BB0000',
    }
    for (const crest of Object.values(CRESTS)) {
      expect(contrastRatio(crest, CHART_TOKENS.dark['--bg-surface'])).toBeLessThan(3)
      expect(contrastRatio(crest, dark.crestPaper!)).toBeGreaterThan(6)
    }
  })

  it('draws nothing in light, where the crest is already on white', () => {
    // A disc on the light card buys nothing and reads as a bubble chart, which
    // in a shape that encodes position and size is a claim it must not make.
    expect(literalInk('light').crestPaper).toBeNull()
    // The browser ink cannot express "the other mode's value" through a
    // `var()` at all -- see the field's doc comment.
    expect(VAR_INK.crestPaper).toBeNull()
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
