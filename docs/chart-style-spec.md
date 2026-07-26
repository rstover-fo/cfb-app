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
  > **Gate C ruling (2026-07-22) — dense multi-series emphasis (BumpsChart):** on a
  > surface with ~25 concurrent peer series, idle/dimmed series may drop to the
  > *tertiary* weights (with the standard naming comment) and the hovered series takes
  > the *primary* weights — hover emphasis is the hierarchy, not per-series rank.
  > Always-on per-point marks (idle dots) may likewise be dropped for density, provided
  > hover restores marked points on the emphasized series and isolated single-point
  > appearances (which would otherwise vanish entirely) keep a visible mark. Both
  > BumpsChart calls are ratified; this ruling extends to future surfaces of similar
  > density, not to charts with ≤ a handful of series.

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
interface ChartTooltipProps { header?: string;
  headerAdornment?: ReactNode /* Gate C: raster/icon before the header text */;
  rows: ChartTooltipRow[];
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

### Gate C amendments (2026-07-22) — ratified additions

- **`ChartTooltip.headerAdornment?: ReactNode`** — an optional raster/icon rendered
  inline *before* the header text (e.g. the hovered team's logo on the scatter
  explorer). It renders only when `header` is set and must fit the header line
  (~1.25rem square) so the panel's reserved height stays exact. This is the sanctioned
  place for raster imagery in the tooltip; it does not change the §3 panel-below
  contract, and it is never a substitute for the header text itself.
- **`RoughRadar` (`src/lib/charts/RoughRadar.tsx`) is a shared primitive.** The one
  radar: it replaced the four plain-SVG radars (RadarChart — deleted — plus
  OffenseRadar/DefenseRadar/PercentileRadar, now thin config modules). API shape:
  `axes: {key, label, format?}[]` (per-axis tooltip formatting, defaulting to ordinal
  "Nth percentile"), `series: {label, color?, values: (number|null)[], captions?}[]`
  capped at **2 drawn series** (series 1 takes the §9 primary weights + −41° hachure,
  series 2 secondary + +41°; extras are sliced off), `domainMax` defaulting to **100**
  — the contract is that consumers normalize values to `0..domainMax` upstream
  (percentiles by default; a custom max is the escape hatch for non-percentile
  domains, and ring labels scale with it) — plus ChartFrame passthrough
  (`title`/`subtitle`/`ariaLabel`/`decorative`/`empty`/`emptyState`) and
  `tooltipPrompt`. Canvas is a comment-justified square 400×400 (§9 Gate B). Use it
  for any multi-axis profile comparison of one entity (optionally vs. one comparator)
  on a shared normalized domain; do not hand-roll radial charts, and do not feed it
  more than two series — pick a different form instead.
- **`useChartTheme` now also observes `data-team-theme`** (alongside `class` and
  `data-theme`) on `document.documentElement`. Team-theme overlays rewrite the
  `--accent*` tokens some charts bake into rough ink (the §3/§7 accent selection
  rings), so flipping e.g. `[data-team-theme="ou"]` triggers the same
  requestAnimationFrame redraw as a light/dark flip.

### Gate D4 note (2026-07-22) — final sweep sign-off

The nine founding divergences are closed; no new rulings. Two instances the
phase gates missed were fixed at this gate, both already mandated above (no
spec change): PercentileBars (§4 in-SVG name legend → `ChartLegend` above the
SVG, §5 frameless `EmptyState` → framed, §9 `pairedBarOptions` + seed + 700
width) and DownDistanceHeatmap (§2 hand-rolled 1px-border wrapper →
`ChartFrame`, tooltip moved inside the frame). Its hand-rolled heat-ramp key
(square `var(--heat-N)` chips) is ratified as-is: §4 governs *series* legends;
a heat-level key is not a series legend and `ChartLegend` has no square-chip
swatch.

### Gate E note (2026-07-26) — the `team-metric-*` family

Server-rendered charts (`src/lib/charts/server/`) now come in a *family*: one
metric registry, one query, one card, and one shape per chart id. Rulings that
apply to it, none of which change the sections above:

- **Shape is an id, not a parameter.** `team-metric-trend` and
  `team-metric-bars` are separate ids over shared plumbing. A signed chart URL
  is permanent by design (Discord re-fetches on cache eviction, with no auth
  header), so a chart id is a forever-API — cheap to add, expensive to
  withdraw. The unification lives in `src/lib/charts/server/metricCard.tsx`,
  `src/lib/charts/metricScale.ts`, `src/lib/charts/metrics.ts` and
  `src/lib/queries/teamMetric.ts`; the renderers hold geometry only.
- **§9 stroke tiers for peer series** are enforced in one place,
  `seriesStrokeWeights()`: ≤2 peer series take PRIMARY, 3–4 drop to SECONDARY
  as the Gate C density hatch. Bars use the §9 bar weights (`ROUGH_BAR` via
  `pairedBarOptions`) and never the line tiers.
- **The `--series-1..4` categorical ramp** (§6) is assigned by *request order*,
  never by rank or placing: colour encodes identity, so a team keeps its ink
  across shapes of the same request. `seriesInk()` is the only assigner.
- **Direction is owed by every shape, discharged per shape.** A line inverts
  its y-axis for a `lowerIsBetter` metric and says so. A bar cannot — its
  encoding is length from a baseline, and both available inversions (rescaling
  to `max - value`, or truncating the axis) would misstate the data — so bars
  are **zero-anchored**, **ranked best-first**, and carry a note naming which
  bar length is the good one. Both notes sit one step above footnote size, in
  `--text-secondary`, because a PNG has no hover affordance to interrogate.
- **In-SVG legends** stay legal on server-rendered cards (§4 retires them only
  where an HTML legend is available). A shape whose marks are individually
  captioned — the bars' row labels — omits the legend rather than repeating
  those names.

### Gate E, second pass (2026-07-26) — `team-metric-scatter`

The family's third shape. Decisions taken by the product owner and implemented
as stated; the design review adjudicates the aesthetic, not the rulings below.

- **Top-right is always the good corner.** Universal across every scatter this
  family draws, whatever the two metrics are: an axis whose metric is
  `lowerIsBetter` (or is a rank) is *reversed*, which is the trend chart's
  single-axis treatment applied per axis. Consistency across charts was chosen
  deliberately over per-axis naturalness — a reader must never have to work out
  which of four corners is good. Nothing in a scatter's encoding resists it:
  position is not length, so unlike bars no quantity is misstated.
  `axisIsReversed()` in `src/lib/charts/metrics.ts` is the one predicate.
- **The reversal is stated twice**, because a PNG has no hover: on the axis
  itself (`scatterAxisLabel`, which names *which* axis reversed and why, in the
  metric's own terms — the thing a mixed pair makes unguessable), and in the
  note below the plot (`scatterDirectionNote`, which names the good corner, in
  the slot the trend and bars cards already use). This is the same reasoning
  that puts those notes one step above footnote size.
  > **Design review, Gate E second pass:** a third statement — a `best in both`
  > caption on the corner — is **removed**. It restated the note's leading
  > clause from a position that was not the plot's corner (the caption band
  > above the frame), and two words of it do not parse until the note has been
  > read, which makes it an echo rather than an independent statement. Two is
  > the ceiling: each survivor must carry something the others cannot.
  > Guarded by a `not.toContain` in `teamMetricScatter.test.tsx`.
- **~25 teams, not the full FBS field.** Four named teams is a picture with no
  context; ~130 rough marks is a texture. `rankBy` (default `sp_rating`) picks
  the field, and any team the caller named is **unioned in**, never substituted
  — a team asked about appears whether it placed 3rd or 90th, and prints its
  placing when it fell outside.
- **Team logos are the marks**, under the §7 raster exemption: never
  roughified, never filtered. A team with no logo row — or whose logo did not
  arrive — draws a rough mark at the same position and weight. Never a hole.
- **The field is context, the named teams are the subject.** The field is
  smaller, drawn at reduced opacity, and unlabelled; the named teams are larger,
  full strength, ringed in their `--series-*` ink and the only marks that carry
  a name. Muting is opacity and size, never a new colour (§6) — a logo carries
  its school's own. Overlap is resolved by draw order (worst placing first,
  highlights last), never by displacing a mark off its true position.
- **The §7 accent ring takes `--series-*` ink here.** §7 specifies `--accent`
  for the ring because it describes a hover/selection affordance on an
  interactive surface. On a static card carrying up to four rings at once the
  ring is identity, so it takes the team's ramp ink — `seriesInk()` remains the
  only assigner, and the team keeps the colour it had on a trend or bars card of
  the same request. *Ratified at design review.*
- **A surface may sit UNDER a data mark, drawn plain.** §6 sanctions static
  token-var fills for scaffold (row highlights, gutters) and bans them for data
  marks; a knockout disc beneath a mark is neither, and §6 did not cover it. It
  is legal on the same terms as the PlaycallingProfile row highlight: a single
  `--bg-surface` fill, no rough drawing, no new colour, and only where the mark
  above it would otherwise be read against another mark rather than against the
  card. `teamMetricScatter.tsx` uses it so a highlighted crest clears whatever
  cluster of field logos it lands on. *Ratified at design review; it was
  commented in the renderer but unrecorded here until this pass.*
- **Muting is for somebody else's artwork, never for our own ink.** A logo
  arrives at an unknown contrast and opacity is the only lever §7 leaves; the
  rough fallback mark is `--text-muted`, and `--text-muted` at 0.65 measures
  2.6:1 on the dark card and 2.8:1 on the light one — under WCAG 1.4.11's 3:1
  for a non-text mark, in **both** modes. Field opacity therefore reaches the
  `<image>` and stops there (4.4:1 / 5.9:1 at full strength). The "this is
  context" signal a muted mark gives up is already carried three other ways:
  the smaller box, the absent ring, the absent label. Same class of finding as
  the ruled `--color-pass` 2.46:1, and guarded the same way.

  > **Design review, Gate E second pass — BLOCKING, outstanding: dark-mode
  > crests need a paper backing.** ESPN crests are overwhelmingly drawn to sit
  > on white, and against `--bg-surface` dark (#252019) a large minority of any
  > top-25 field has no contrast to give: Penn State navy 1.02:1, Texas A&M
  > maroon 1.03:1, Ole Miss navy 1.01:1, Iowa black 1.30:1, Alabama crimson
  > 2.04:1, Ohio State scarlet 2.40:1, Utah red 2.75:1 — *measured at opacity
  > 1.0*, so raising `FIELD_OPACITY` cannot fix it. At Discord's ~400px column
  > the affected marks vanish outright and the card shows visibly fewer than
  > the 25 teams its own subtitle claims.
  >
  > The remedy is a **paper disc under every mark, in dark mode only**, at the
  > light theme's `--bg-surface`; a disc is 16:1 against the dark card and
  > restores each crest to exactly its light-mode legibility. It applies to
  > highlighted marks too — `ink.bgSurface` there is dark and knocks out
  > neighbours without giving the crest anything to sit on.
  >
  > Per-mode divergence is the correct shape of the fix, not an inconsistency:
  > the *inputs* are asymmetric, `--series-1..4` already carry different values
  > per mode for the same reason, and a disc at the light theme's own
  > `--bg-surface` is a token read, not a new colour. A backing in both modes
  > is wrong — it buys nothing on a white card and turns the light render into
  > a bubble chart. A halo or stroke is wrong — these crests are solid dark
  > silhouettes, so outlining them outlines a blob.
  >
  > Note for the implementer: `teamMetricScatter.test.tsx`'s dark-ink test
  > asserts `not.toContain('#FFFFFF')` as a "no light ink leaked" guard. That
  > guard becomes a scoped exception for the backing disc — do not delete it.
- **The renderer stays pure.** Logos are remote images, so the route resolves
  them and passes already-inlined `data:` URIs into `renderChartSvg` as ordinary
  input (`src/lib/queries/teamLogos.ts`: concurrent, per-request timeout,
  module-scope cache by URL). resvg fetches nothing, so a remote `href` renders
  as a hole rather than failing — `expectResvgSafe` now rejects any `<image>`
  href that is not a `data:` URI. Failure degrades to the rough fallback; it
  never fails the card.

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
