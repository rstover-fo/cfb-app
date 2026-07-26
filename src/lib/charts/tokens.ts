/**
 * DOM-free mirror of the design tokens declared in `src/app/globals.css`, plus
 * the `ChartInk` abstraction that lets one piece of render code serve both the
 * browser and the server.
 *
 * Why this file exists: `src/lib/charts/theme.ts` is `'use client'` and its
 * `resolveColor()` reads `getComputedStyle(document.documentElement)`. With no
 * `document` it returns `'#999'` -- it fails *silently grey* rather than
 * throwing, which is exactly the kind of bug that ships. Server-side chart
 * rendering therefore never touches `theme.ts`; it reads literal values from
 * here instead.
 *
 * The duplication is deliberate and is kept honest by
 * `src/lib/charts/__tests__/tokens.sync.test.ts`, which parses `globals.css`
 * and fails in BOTH directions: a drifted value here, or a new chart-relevant
 * token added to the CSS and not mirrored here.
 *
 * This module must stay free of `'use client'`, React, and any DOM access so
 * that both worlds can import it.
 */

export type ChartThemeName = 'light' | 'dark'

/**
 * Every chart-relevant custom property mirrored from `globals.css`. Anything
 * declared in the CSS and absent from this list must be listed in the test's
 * non-chart allowlist, or the sync test fails.
 */
export const CHART_TOKEN_NAMES = [
  '--bg-primary',
  '--bg-surface',
  '--bg-surface-alt',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--border',
  '--color-run',
  '--color-pass',
  '--color-positive',
  '--color-negative',
  '--color-neutral',
  '--color-field-goal',
  '--series-1',
  '--series-2',
  '--series-3',
  '--series-4',
  '--heat-1',
  '--heat-2',
  '--heat-3',
  '--heat-4',
  '--heat-5',
  '--field-green',
  '--field-endzone',
  '--field-line',
  '--accent',
  '--accent-hover',
  '--accent-foreground',
  '--font-headline',
  '--font-body',
] as const

export type ChartTokenName = (typeof CHART_TOKEN_NAMES)[number]

/**
 * Light mode -- mirrors the `:root` block of `globals.css` verbatim, including
 * hex letter-casing (the sync test compares exactly, so casing drift is caught
 * too).
 */
const LIGHT: Record<ChartTokenName, string> = {
  '--bg-primary': '#F5F0E8',
  '--bg-surface': '#FFFFFF',
  '--bg-surface-alt': '#EDE8DF',

  '--text-primary': '#1A1814',
  '--text-secondary': '#4A4740',
  '--text-muted': '#6B635A',

  '--border': '#D9D2C7',

  // Semantic series colors -- identical in both modes (spec §6).
  '--color-run': '#C47A5A',
  '--color-pass': '#5C5A7A',
  '--color-positive': '#4A7A5C',
  '--color-negative': '#A65A5A',
  '--color-neutral': '#6B635A',
  '--color-field-goal': '#5A7AC4',

  // Categorical series ramp -- valence-free, and per-mode rather than
  // theme-invariant so both the light card and #252019 clear 3:1 (see the
  // globals.css comment for the measured numbers).
  '--series-1': '#BF714F',
  '--series-2': '#556CBA',
  '--series-3': '#B16498',
  '--series-4': '#378287',

  '--heat-1': '#D7B5B5',
  '--heat-2': '#E9D6D6',
  '--heat-3': '#E1E0DE',
  '--heat-4': '#D2DED6',
  '--heat-5': '#AEC3B6',

  '--field-green': '#2d5a27',
  '--field-endzone': '#1e3d1a',
  '--field-line': '#ffffff',

  '--accent': '#C47A5A',
  '--accent-hover': '#B06A4A',
  '--accent-foreground': '#FAF7F2',

  '--font-headline': "'Libre Baskerville', Georgia, serif",
  '--font-body': "'DM Sans', system-ui, sans-serif",
}

/**
 * Dark mode -- mirrors the `[data-theme="dark"]` block, which only *overrides*
 * a subset; everything else cascades from `:root`. Spreading LIGHT models that
 * cascade, and the sync test asserts each un-overridden token really is absent
 * from the dark CSS block (so a future dark-mode override can't silently
 * diverge from this mirror).
 */
const DARK: Record<ChartTokenName, string> = {
  ...LIGHT,

  '--bg-primary': '#1A1814',
  '--bg-surface': '#252019',
  '--bg-surface-alt': '#302920',

  '--text-primary': '#F5F0E8',
  '--text-secondary': '#C9C2B7',
  '--text-muted': '#8A847A',

  '--border': '#3D362E',

  '--series-1': '#C47C5C',
  '--series-2': '#5F76BE',
  '--series-3': '#B76F9F',
  '--series-4': '#3B8C91',

  '--heat-1': '#523430',
  '--heat-2': '#3F2C26',
  '--heat-3': '#332D26',
  '--heat-4': '#2C3226',
  '--heat-5': '#324030',

  '--field-green': '#1e4a1a',
  '--field-endzone': '#153012',
  '--field-line': '#cccccc',

  '--accent': '#D08A6A',
  '--accent-hover': '#E09A7A',
  '--accent-foreground': '#1A1814',
}

export const CHART_TOKENS: Record<ChartThemeName, Record<ChartTokenName, string>> = {
  light: LIGHT,
  dark: DARK,
}

/**
 * First family name in a CSS font stack, unquoted.
 *
 * The browser can be handed the whole `'Libre Baskerville', Georgia, serif`
 * stack and will walk it. resvg is handed a fixed set of font files and no
 * system fonts at all, so it gets the one family that is actually loaded --
 * and it must match the TTF `name` table exactly. `fontFamilyOf` derives that
 * from the same token value the browser uses, so the two can never drift.
 */
export function fontFamilyOf(stack: string): string {
  const first = stack.split(',')[0].trim()
  return first.replace(/^['"]|['"]$/g, '')
}

/**
 * Concrete family names the server renderer draws with. These must equal the
 * `name`-table family of the vendored TTFs in `src/lib/charts/fonts/`.
 */
export const CHART_FONT_FAMILY = {
  headline: fontFamilyOf(LIGHT['--font-headline']),
  body: fontFamilyOf(LIGHT['--font-body']),
} as const

/**
 * The ink a chart draws with.
 *
 * The whole point of the abstraction: the browser passes an ink whose fields
 * are `'var(--text-muted)'` strings (CSS resolves them, so theme flips are
 * free); the server passes one whose fields are `'#6B635A'` (resvg understands
 * no custom properties, and roughjs bakes colors into path attributes anyway).
 * The render code in between is identical.
 */
export interface ChartInk {
  bgPrimary: string
  bgSurface: string
  bgSurfaceAlt: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  border: string
  accent: string
  accentHover: string
  accentForeground: string
  run: string
  pass: string
  positive: string
  negative: string
  neutral: string
  fieldGoal: string
  /**
   * `--series-1` .. `--series-4`, index 0..3. The categorical ramp: use this
   * -- never the semantic `run`/`positive`/... fields -- when the colors
   * separate N peer entities rather than encoding meaning.
   */
  series: readonly [string, string, string, string]
  /** `--heat-1` (worst) .. `--heat-5` (best), index 0..4. */
  heat: readonly [string, string, string, string, string]
  /**
   * Backing to lay under a team crest before drawing it, or `null` for "draw
   * the crest straight onto the card".
   *
   * Dark mode only, and it is the LIGHT theme's `--bg-surface` -- the one place
   * in this file where a value is deliberately read from the other mode.
   *
   * A crest is an input we do not control and cannot restyle: ESPN draws them
   * for a white page, and spec §7 exempts raster imagery from being recoloured
   * anyway. Measured against the dark card's `#252019` at full opacity, a third
   * of a top-25 field is simply not there -- Ole Miss 1.01:1, Penn State
   * 1.03:1, Texas A&M 1.03:1, Iowa 1.30:1, Alabama 2.04:1, Ohio State 2.40:1.
   * The same crests on the light card run 6.75:1 to 21:1. Opacity is not the
   * lever (raising it moves Penn State from 1.03 to 1.02), and neither is a
   * halo or a stroke: both outline a solid navy blob and leave its interior --
   * which is the whole problem -- untouched. Giving the crest its own paper is
   * the only treatment that reaches the inside of the mark: `#FFFFFF` is
   * 16.16:1 on the dark card, and every crest lands back at exactly the
   * legibility it has in light mode, because it is sitting on exactly the same
   * colour.
   *
   * `null` in light, where the crest is already on white: a disc there buys
   * nothing and turns a scatter into a bubble chart. Per-mode divergence for
   * the same class of reason `--series-1..4` diverge -- one value cannot serve
   * both surfaces.
   *
   * `null` for `VAR_INK` too, and that is a real limit rather than an
   * oversight: a `var()` reference resolves to whatever the live page's mode
   * says, so the browser ink cannot express "the other mode's value" at all. No
   * client chart draws crests today; the first one that does needs a concrete
   * per-mode ink, which is what `useChartTheme`/`resolveColor` already hand the
   * roughjs recipe.
   */
  crestPaper: string | null
  fontHeadline: string
  fontBody: string
}

function inkFrom(lookup: (token: ChartTokenName) => string): ChartInk {
  return {
    bgPrimary: lookup('--bg-primary'),
    bgSurface: lookup('--bg-surface'),
    bgSurfaceAlt: lookup('--bg-surface-alt'),
    textPrimary: lookup('--text-primary'),
    textSecondary: lookup('--text-secondary'),
    textMuted: lookup('--text-muted'),
    border: lookup('--border'),
    accent: lookup('--accent'),
    accentHover: lookup('--accent-hover'),
    accentForeground: lookup('--accent-foreground'),
    run: lookup('--color-run'),
    pass: lookup('--color-pass'),
    positive: lookup('--color-positive'),
    negative: lookup('--color-negative'),
    neutral: lookup('--color-neutral'),
    fieldGoal: lookup('--color-field-goal'),
    series: [lookup('--series-1'), lookup('--series-2'), lookup('--series-3'), lookup('--series-4')],
    heat: [
      lookup('--heat-1'),
      lookup('--heat-2'),
      lookup('--heat-3'),
      lookup('--heat-4'),
      lookup('--heat-5'),
    ],
    // No backing by default -- only the dark literal ink opts in, below.
    crestPaper: null,
    fontHeadline: lookup('--font-headline'),
    fontBody: lookup('--font-body'),
  }
}

/**
 * Browser ink: every field is a `var(--token)` reference. Safe for the static
 * React SVG scaffold and HTML surfaces -- CSS handles theme flips with no JS.
 * Not usable as roughjs ink (roughjs needs a concrete color); resolve those
 * through `resolveColor`/`inkFor` as the client recipe already does.
 */
export const VAR_INK: ChartInk = inkFrom(token => `var(${token})`)

/**
 * Server ink: every field is a literal color/font-stack for the requested
 * theme. Safe for both the scaffold and roughjs, and the only ink that survives
 * resvg (SVG 1.1 static -- no custom properties, no stylesheets).
 */
export function literalInk(theme: ChartThemeName = 'light'): ChartInk {
  const tokens = CHART_TOKENS[theme]
  const ink = inkFrom(token => tokens[token])
  // Colors become literal; so do fonts. resvg is given exactly two font files
  // and no system fonts, so a stack with fallbacks would be a lie -- hand it
  // the single family that is actually loaded (see `fontFamilyOf`).
  return {
    ...ink,
    // Read from LIGHT on purpose, in the dark ink -- see `ChartInk.crestPaper`.
    // A token read, not a new colour: it is the light card's own surface.
    crestPaper: theme === 'dark' ? LIGHT['--bg-surface'] : null,
    fontHeadline: CHART_FONT_FAMILY.headline,
    fontBody: CHART_FONT_FAMILY.body,
  }
}
