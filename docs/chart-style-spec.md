# Chart Style Spec

**Ratified at Gate A (2026-07-22) by the design-reviewer; the DESIGN.md Charts section below is applied. Primitive location ruled final: `src/lib/charts/` (not `src/components/charts/`).**

**Status:** Binding for the chart-consistency sweep (tasks A1–D3). Every chart/visual
component converges on the rulings below — there are no sanctioned alternatives. The
"Proposed DESIGN.md Charts section" at the end is ratified and applied by the
design-reviewer at Gate A; until then DESIGN.md's current Charts section stands for
unrelated work, and this spec governs the sweep.

Canonical implementations referenced throughout: `src/components/team/TrajectoryChart.tsx`
(recipe), `src/components/team/PlaycallingProfile.tsx` (bars), `src/components/players/PercentileBars.tsx`
(mirrored hachure), `src/components/visualizations/FootballField.tsx` (a11y props),
`src/components/EmptyState.tsx`, `src/lib/charts/theme.ts`.

## 1. Canonical recipe (the only way to draw a chart)

Every rough-drawn chart follows the TrajectoryChart pattern, exactly:

1. **Static scaffold in JSX.** Grid lines, axis ticks, axis/quadrant labels, reference
   lines, and center rules are plain React-rendered SVG using `var(--token)` string refs
   (`stroke="var(--border)"`, `className="fill-[var(--text-muted)]"`). These are theme-safe
   natively and are never rough-drawn.
2. **One rough layer:** `<g ref={roughGroupRef} data-testid="rough-layer" />` placed after
   the scaffold and before interaction layers.
3. **`drawChart` as a `useCallback`** that: bails if `svgRef`/`roughGroupRef`/geometry are
   missing; clears with `while (group.firstChild) group.removeChild(group.firstChild)`;
   creates `const rc = rough.svg(svg)` locally; resolves every ink color once at the top via
   `resolveColor('var(--…)')` from `src/lib/charts/theme.ts`; appends rough elements to the
   group. Geometry (scales, points) is computed in a separate `useMemo`, never inside
   `drawChart`.
4. **Wiring:** `useEffect(() => { drawChart() }, [drawChart])` then `useChartTheme(drawChart)`.
   Nothing else may trigger or skip redraws.
5. **Interaction layers** (transparent `<rect>`/`<circle>` hit targets) render after the
   rough group, `fill="transparent"`, and drive React hover/focus state.

**`useRoughSvg` is deprecated effective immediately.** It caches a `RoughSVG` in state with
no child-clearing and no theme-redraw path — every remaining consumer migrates to the recipe
above during the sweep, and `src/hooks/useRoughSvg.ts` is deleted in task D3. No new imports.

## 2. Frame contract — `ChartFrame`

Every chart renders inside `ChartFrame` (`src/lib/charts/ChartFrame.tsx`, new):

- Shell: `bg-[var(--bg-surface)] border-[1.5px] border-[var(--border)] rounded-lg p-4`
  (`rounded-lg` resolves to the editorial 3px — do not inline radii).
- Optional `title` slot rendered as `font-headline text-lg text-[var(--text-primary)] mb-3`.
- A11y follows FootballField exactly: `decorative?: boolean` → `aria-hidden` on the SVG;
  otherwise `role="img"` + required data-describing `ariaLabel` on the SVG. `ChartFrame`
  passes these to its child via render-prop or the chart applies them itself — the SVG,
  not the frame div, carries the role/label.
- Built-in empty slot: when the chart's null-guard predicate (§5) fails, `ChartFrame`
  renders `EmptyState` inside the shell instead of children.

Charts never hand-roll their own `bg-…/border/rounded/p-4` wrapper again; the existing
per-chart wrappers (TrajectoryChart, PlaycallingProfile) migrate into `ChartFrame`.

## 3. Tooltip contract — `ChartTooltip`

The **only** tooltip mechanism is: in-SVG crosshair/selection indicator + a
**reserved-height panel below the SVG**, inside the frame. Retired on sight: floating
`position: fixed` panels (DownDistanceHeatmap), cursor-following `position: absolute` +
`shadow-lg` panels (ScatterPlot), and tooltips drawn as SVG text.

`ChartTooltip` (new primitive) markup, exactly:

- Container: `mt-2 p-3 bg-[var(--bg-surface)] border-[1.5px] border-[var(--border)] rounded-lg text-sm`,
  always rendered with a `min-h` sized to its densest row count (no layout jump). When
  nothing is hovered/focused it shows one muted prompt line
  (`text-[var(--text-muted)]`, e.g. "Hover a season for details").
- Header: `font-headline text-base text-[var(--text-primary)] mb-2`.
- Rows: `flex items-center gap-2` — swatch `<span class="w-3 h-0.5">` (solid token
  background, or the dashed `repeating-linear-gradient` treatment for dashed series),
  label `text-[var(--text-secondary)]`, value `text-[var(--text-primary)] font-medium tabular-nums`.
  Muted caption rows (percentile context) use `text-[var(--text-muted)]` with an empty
  `w-3` spacer swatch.
- In-SVG indicator: line/area charts draw the TrajectoryChart crosshair
  (`stroke="var(--text-muted)" strokeDasharray="4 2" opacity={0.6}`); bar/row charts draw
  the PlaycallingProfile row highlight (`fill="var(--bg-surface-alt)"` behind the rough layer).

**Dense surfaces rule (scatter points, heat cells):** hover *and* keyboard focus select one
point/cell; the selection indicator is a rough accent ring (`rc.circle`, `var(--accent)`
ink) around a point or a `2px var(--accent)` outline on a cell, and the details render in
the same panel-below. Never a floating panel near the cursor.

## 4. Legend contract — `ChartLegend`

Legends are **HTML, outside the SVG**, above or below it inside the frame — default below:
`flex items-center justify-center gap-6 mt-3 pt-2 border-t border-[var(--border)]`. Items:
swatch `<span class="w-4 h-0.5">` (same solid/dashed vocabulary as tooltip swatches; hachure
series use a `w-3 h-3` rough-look block only if drawn as HTML background, never SVG) +
`text-xs text-[var(--text-secondary)]` label.

- **Interactive variant (opt-in):** items are `<button aria-pressed>` toggling series
  visibility, hidden state = `opacity-40` on the item (TrajectoryChart's `visibleLines`).
- Retired: in-SVG legends (PercentileBars' `<text>` names + rough swatch rects,
  WinProbabilityChart's `<rect>` chips), and any `font-mono`/monospace legend text.
  PercentileBars' player names move into an HTML legend above the SVG.

## 5. Empty-state contract

Every chart defines an explicit null-guard predicate (e.g. `rows.length === 0`,
`!chartGeometry`) evaluated before drawing. When it fails, the chart renders `EmptyState`
**inside `ChartFrame`** — icon `weight="thin"`, one-line DESIGN.md-voice title, optional
description with an em-dash pivot ("Historical data publishes after a team's first FBS
season."). Defects, fixed on sight during the sweep: bare strings in a div
(TrajectoryChart's current fallback), `return null` without a frame, frameless `EmptyState`
(PercentileBars), and fake zero-data renders — PercentileRadar's zero-polygon draws a shape
from absent data and is a defect, not an empty state.

## 6. Color contract

- **All rough ink resolves through `resolveColor`** at the top of `drawChart`. No exceptions.
- **Team brand colors** pass through `resolveColor` (concrete hex passes through unchanged
  by design) and are applied **only inside rough draw calls**. They are never assigned to
  native SVG attributes (`fill={homeColor}` on paths/rects/text — WinProbabilityChart's
  current pattern) because that bypasses the theme-redraw path and the single ink pipeline.
  Team-colored text labels become HTML (legend/tooltip) or use `--text-primary`.
- **Hex-to-token replacements** (verified against `globals.css`):
  `#333333` → `var(--text-primary)`; `#666666` and `#999`/`#999999` → `var(--text-muted)`;
  `#fff`/`#ffffff` as text-on-ink → `var(--bg-surface)`; `#6B635A` → `var(--text-muted)`
  when used as ink (text/stroke/axis — it is light-mode `--text-muted` and must flip in
  dark) and `var(--color-neutral)` only when used as a neutral *series/category* color
  (the theme-invariant semantic token shares the same hex). `rgba(255,255,255,…)` strokes
  (ScatterPlot point rims) → `var(--bg-surface)` + `opacity`.
- **Fallback ink** for missing team colors: `var(--text-primary)` (home) and
  `var(--text-muted)` (away) — replaces WinProbabilityChart's `#333333`/`#666666`.
- **Native large-area fills retire.** WinProbabilityChart's advantage bands become rough
  hachure polygons (`fillStyle: 'hachure'`, `fillWeight: 0.8`, `hachureGap: 8`, team ink,
  drawn in `drawChart`). Static token-var fills (`fill="var(--bg-surface-alt)"`) remain
  legal only for scaffold elements (row highlights, gutters), never for data marks.
  Solid low-opacity area fills under a line follow TrajectoryChart (`fillStyle: 'solid'`,
  element `opacity` 0.1, `roughness: 0`).

## 7. Raster exemption

Team logos and any raster imagery stay native — SVG `<image>` or `next/image` — and are
**never** roughified, filtered, or redrawn by roughjs. Emphasis around raster content is
drawn rough: a hover/highlight ring is `rc.circle` in `var(--accent)` ink (seeded, §9),
replacing ScatterPlot's `filter: url(#glow)` drop-shadow and `animate-pulse` dashed ring —
both retire, as does any CSS/SVG-filter glow anywhere. Transparent interaction hit-targets
(§1.5) are likewise exempt from rough drawing.

## 8. Heat ramp

Five tokens, `--heat-1` (worst) → `--heat-5` (best), declared in `globals.css` `:root`,
`[data-theme="light"]`, `[data-theme="dark"]`, and the `prefers-color-scheme: dark` block
(all four, like every other flipping token — the explicit light block re-declares the full
palette). Values are tints of the existing semantic family
(`--color-negative` #A65A5A, `--color-neutral` #6B635A, `--color-positive` #4A7A5C) mixed
over the mode's `--bg-surface` (#FFFFFF light, #252019 dark) so `--text-primary` stays
readable on every cell:

| Token | Light | Dark | Derivation |
|---|---|---|---|
| `--heat-1` | `#D7B5B5` | `#523430` | negative @ 45% / 35% |
| `--heat-2` | `#E9D6D6` | `#3F2C26` | negative @ 25% / 20% |
| `--heat-3` | `#E1E0DE` | `#332D26` | neutral @ 20% / 20% |
| `--heat-4` | `#D2DED6` | `#2C3226` | positive @ 25% / 20% |
| `--heat-5` | `#AEC3B6` | `#324030` | positive @ 45% / 35% |

- **Helper:** `resolveHeatColor(level: 1 | 2 | 3 | 4 | 5): string` added to
  `src/lib/charts/theme.ts`, returning `resolveColor(`var(--heat-${level})`)` — for rough
  ink only. HTML cells use `var(--heat-N)` directly (CSS handles theme flips; no JS).
- **Bucket mappings (exact):** DownDistanceHeatmap keeps its side-normalized thresholds and
  is the behavioral reference (defense inverts the rate before bucketing): rate ≥ .55 →
  heat-5, ≥ .45 → heat-4, ≥ .35 → heat-3, else heat-1. GameDownDistance and
  GameFieldPosition replace `bg-green/yellow/red-*` + `dark:` classes with: ≥ .60 → heat-5,
  ≥ .40 → heat-3, else heat-1. No-data cells are `var(--bg-surface-alt)` with an em dash.
  DownDistanceHeatmap's full-saturation semantic-token cell backgrounds retire in favor of
  these tints; the saturated tokens remain for strokes, text deltas, and legend swatches.

## 9. Sizing, seeds, roughness

- **Default viewBox:** 700 × 350 with `PADDING = { top: 30, right: 30, bottom: 50, left: 60 }`
  (TrajectoryChart's). Charts with intrinsic row counts (bar rows, heat grids) compute
  height from `rows.length` but keep the 700 width and left/right padding convention.
  > **Gate B ruling (2026-07-22):** 700 × 350 is a *default*, not a mandate. Heights may
  > vary with a chart's information density (e.g. EloHistory 300, AdjustedEpa 320,
  > LineMovement/AccuracyTrend 280) and secondary-surface charts may proportionally
  > tighten padding; both are conformant as long as the 700 width, `w-full h-auto`
  > responsiveness, and the left-gutter/bottom-gutter axis conventions hold. Padding
  > beyond the default in one direction (e.g. WinProbabilityChart's wider right gutter
  > for edge labels) requires a code comment naming the reason, same as rough-value
  > deviations. Do not churn existing bespoke heights back to 350.
- **Responsive:** `className="w-full h-auto"` on the SVG. No fixed pixel width/height attrs.
- **Stable wobble:** every chart declares `const ROUGH_SEED = <positive int>` (unique-ish
  per component) and passes `seed: ROUGH_SEED` in **every** rough options object, so theme
  flips and re-renders redraw identical strokes instead of shimmering.
- **Default rough values:** primary series `strokeWidth: 3, roughness: 1.0, bowing: 0.4`;
  secondary `2 / 0.7 / 0.3`; tertiary/context `1.5 / 0.5 / 0.2` (TrajectoryChart's
  hierarchy). Bars: `strokeWidth: 1.5, roughness: 1.1, bowing: 0.5, hachureGap: 5,
  fillWeight: 1`. Deviation requires a code comment naming the reason.

## 10. Primitive API sketches (`src/lib/charts/`)

> Gate A ruling: primitives live in `src/lib/charts/` — charts infrastructure (`theme.ts`)
> already lived there. All `src/components/charts/` references in this spec read as
> `src/lib/charts/`.

```tsx
// ChartFrame.tsx
interface ChartFrameProps {
  title?: string                    // font-headline slot
  ariaLabel?: string                // required unless decorative
  decorative?: boolean              // FootballField pattern → aria-hidden
  empty?: boolean                   // null-guard predicate result
  emptyState?: ComponentProps<typeof EmptyState>  // required when empty can be true
  className?: string
  children: ReactNode               // the <svg> + ChartTooltip + ChartLegend
}

// ChartTooltip.tsx — reserved-height panel below the SVG (§3)
interface ChartTooltipRow { swatch?: 'solid' | 'dashed' | 'none'; color?: string /* var(--…) */;
  label: string; value?: string; muted?: boolean }
interface ChartTooltipProps { header?: string; rows: ChartTooltipRow[];
  prompt: string /* shown when idle */; minRows: number /* reserves height */ }

// ChartLegend.tsx — HTML swatch legend (§4)
interface ChartLegendItem { key: string; label: string; swatch: 'solid' | 'dashed' | 'hachure';
  color: string /* var(--…) or resolved team hex */ }
interface ChartLegendProps { items: ChartLegendItem[]; position?: 'above' | 'below' /* default below */;
  interactive?: { visible: Record<string, boolean>; onToggle: (key: string) => void } }

// axes helpers (src/lib/charts/axes.tsx) — render scaffold, never rough
gridLinesY(ticks, layout) / axisLabelsY(ticks, format, layout) / axisLabelsX(...)
// all strokes var(--border), text fill-[var(--text-muted)] text-xs

// series helpers (src/lib/charts/series.ts) — called inside drawChart only
inkFor(role: 'run' | 'pass' | 'positive' | 'negative' | 'neutral'): string   // resolveColor wrapper
teamInk(hex: string | null, fallback: 'primary' | 'muted'): string           // pass-through + §6 fallback
pairedBarOptions(color: string, side: 'left' | 'right', seed: number)        // hachureAngle -41 / +41:
// mirrored series ALWAYS use the paired ±41° hachure rule (PercentileBars/PlaycallingProfile)
// so color is never the only channel separating sides.
```

The chart-engineer implements these primitives verbatim in task B1; migrations (tasks B2+)
may not fork or wrap them with per-chart styling.

---

## Proposed DESIGN.md Charts section

> Replaces "## Charts (roughjs aesthetic)" in DESIGN.md. Ratified at Gate A by the
> design-reviewer; do not apply before ratification.

```markdown
## Charts (roughjs aesthetic)

- **One recipe** (`docs/chart-style-spec.md` is binding): D3/manual scales in `useMemo`,
  a static React-rendered SVG scaffold (grids/axes/labels via `var(--token)` refs), one
  `<g ref={roughGroupRef}>` rough layer, and a `drawChart` `useCallback` that clears the
  group and draws with `rough.svg` — wired via `useEffect(drawChart)` + `useChartTheme(drawChart)`.
  `useRoughSvg` is deleted; never reintroduce it.
- **Color resolution:** roughjs bakes concrete colors at draw time, so all rough ink goes
  through `resolveColor` in `src/lib/charts/theme.ts` — including team brand hex, which
  passes through unchanged but is applied only inside rough draw calls, never native SVG
  attrs. No raw hex in charts; missing team colors fall back to `--text-primary` (home) /
  `--text-muted` (away).
- **Shared primitives** (`src/lib/charts/`): every chart sits in `ChartFrame`
  (surface + 1.5px border + 3px radius + p-4, title slot, `role="img"`/`ariaLabel`/
  `decorative` props, built-in `EmptyState` slot); details render in `ChartTooltip` — the
  reserved-height panel below the SVG with an in-SVG crosshair/row-highlight/accent-ring
  indicator (floating, cursor-following, and SVG-drawn tooltips are defects); series keys
  render in the HTML `ChartLegend` (opt-in toggle variant), never inside the SVG.
- **Series semantics:** run = `--color-run`, pass = `--color-pass`, good/bad deltas =
  `--color-positive`/`--color-negative`. Paired/mirrored series always use the ±41°
  hachure rule so hue is never the only separating channel.
- **Heat surfaces** use the five `--heat-1`…`--heat-5` tokens (light+dark values in
  `globals.css`) — HTML cells via `var(--heat-N)` directly, rough ink via
  `resolveHeatColor(level)`. Never raw Tailwind color classes or `dark:` variants.
- **Stable wobble:** every chart passes a fixed `seed` in all rough options
  (default hierarchy: primary 3px/1.0 roughness, secondary 2px/0.7, tertiary 1.5px/0.5).
  Default canvas 700×350, `PADDING {30, 30, 50, 60}`, SVG `w-full h-auto`.
- **Raster exemption:** team logos stay native `<image>`/`next/image`, never roughified;
  emphasis near raster is a rough `rc.circle` accent ring — no glow filters, no pulse
  animations. Transparent hit-target layers are likewise not rough-drawn.
- **Chart internals never use shadcn components or bridge utilities** — they consume
  editorial tokens directly. shadcn is chrome (controls, tables, dialogs), not data ink.
- **Empty charts** render `EmptyState` inside `ChartFrame` behind an explicit null-guard
  predicate — never bare strings, bare `null`, or fake zero-data marks.
```
