# CFB Team 360 — Design Reference

Working reference for engineers and agents. The design system is **editorial/newspaper**:
serif headlines, warm paper surfaces, hand-drawn data. If a change makes the app look like
a generic SaaS dashboard, it is wrong.

## Philosophy

- **Newspaper, not dashboard.** Warm paper backgrounds, thin rules, near-square corners,
  restrained motion. Prefer a border and whitespace over a shadow and a gradient.
- **Hand-drawn data.** Charts are drawn with roughjs over D3 scales — sketchy strokes,
  slight wobble. Data feels annotated by a beat writer, not rendered by a BI tool.
- **Tokens are law.** All color, shadow, and type decisions flow from CSS custom properties
  in `src/app/globals.css`. No raw hex in components (exceptions listed below).

## Tokens (canonical set — `src/app/globals.css`)

### Editorial tokens (canonical)

| Group | Tokens |
|---|---|
| Surfaces | `--bg-primary` (page paper), `--bg-surface` (cards), `--bg-surface-alt` (inset/muted) |
| Text | `--text-primary`, `--text-secondary`, `--text-muted` |
| Structure | `--border` (rules/card borders) |
| Semantic | `--color-run` #C47A5A (signature), `--color-pass` #5C5A7A, `--color-positive` #4A7A5C, `--color-negative` #A65A5A, `--color-neutral`, `--color-field-goal` |
| Accent | `--accent`, `--accent-hover`, `--accent-foreground` (interactive; the only tokens team themes override) |
| Field | `--field-green`, `--field-endzone`, `--field-line` (FootballField viz only) |
| Shadows | `--shadow-soft` (resting cards), `--shadow-hover` (lifted/floating). These two only — never Tailwind `shadow-sm/md/lg`. |
| Texture | `--paper-opacity` (paper grain; dimmed in dark mode) |
| Type | `--font-headline` (Libre Baskerville), `--font-body` (DM Sans) |

Semantic colors are identical in light and dark mode; surfaces/text/border/accent flip.

### shadcn bridge (aliases only)

The shadcn variable set (`--background`, `--card`, `--primary`, `--muted`, `--destructive`,
`--input`, `--ring`, …) is a **pure alias layer** onto the editorial tokens, plus a
`@theme inline` block that exposes them as Tailwind utilities (`bg-card`, `text-muted-foreground`, …).

Rules:

- **Editorial vars are canonical; shadcn vars never define new colors.** Theme flips happen
  on the editorial vars, so the aliases resolve correctly in light, dark, and team-theme
  states with no `.dark` class and no re-declaration per theme.
- **Sanctioned raw-hex exceptions** in the bridge: `--primary-foreground` and
  `--destructive-foreground` are both the fixed paper-white `#FAF7F2` (text on saturated
  semantic fills). Any other raw hex added to the bridge is drift — reject it.
- **`--accent` collision guard:** the app already owns `--accent` (interactive/team-theme).
  shadcn's neutral hover/highlight role is therefore mapped to `--accent-shadcn` /
  `--accent-shadcn-foreground` (aliasing `--bg-surface-alt` / `--text-primary`). In
  `src/components/ui/` use `bg-accent-shadcn`; plain `bg-accent` does not exist as a utility.
- **Radius:** `--radius: 0.1875rem` (3px), matching `.card`. Derived radii use
  `max(2px, …)` floors: effective scale is `rounded-sm` 2px, `rounded-md` 2px,
  `rounded-lg` 3px, `rounded-xl` 7px. Note this override is global — every `rounded-*`
  utility in the app resolves to this compressed, near-square scale. That is intentional
  (editorial corners); do not "fix" a square corner by inlining an arbitrary radius.
- `--ring` is `--color-run`: focus rings are terracotta everywhere, including under
  team themes (team overlays change `--accent`, not `--primary`/`--ring`).

## Theming mechanics

- **Dark mode:** `@media (prefers-color-scheme: dark)` + `:root:not([data-theme])` handles
  system preference; explicit `[data-theme="light"|"dark"]` (set by `ThemeToggle` on `<html>`)
  wins over it. Both paths re-declare the same editorial values — keep them in sync when
  touching either.
- **Team theme overlay:** `[data-team-theme="ou"]` (set via `TeamThemeToggle`, cookie-backed,
  SSR-read in `layout.tsx`) overrides **only** `--accent`, `--accent-hover`,
  `--accent-foreground` — for each of light and dark (dark uses a lightened crimson for
  WCAG contrast). The base palette and shadcn `--primary` are untouched; no shared component
  may hardcode team colors. New team overlays copy this pattern.

## Typography

- **Headings** (`h1`–`h6`) are globally Libre Baskerville via `--font-headline`; utility
  `.text-headline` / `font-headline` for non-heading elements that need serif.
- **Body and running/table numerics** are DM Sans.
- **Hero stats are the one sanctioned serif numeral:** a stat card's single marquee value
  (MetricsCards, EloCard, AtsCard, PredictionCard, ReturningProductionCard, portal
  SummaryCards) is set `font-headline` + `tabular-nums` — the "almanac numeral" treatment —
  optionally with `underline-sketch` on the card's one headline number. Everything else
  (table columns, chart labels, captions, inline stats in sentences) stays DM Sans.
- **Stat/score columns** use `tabular-nums` (baked into the `TableCell` component).
- **Table/label headers** are the newspaper small-caps style: `text-[10px] uppercase
  tracking-wider font-normal` in muted text (see `PollTable.tsx`; `TableHead` matches).
- Active nav/headline emphasis uses `.underline-sketch` — the slightly rotated 2px
  `--color-run` underline — not bold-only or color-only states.

## Iconography

- **Phosphor Icons everywhere** in app code (`@phosphor-icons/react`), typically
  `weight="thin"`/`"regular"` to match the hand-drawn feel.
- **Entry point follows the component boundary:** server components must import from
  `@phosphor-icons/react/dist/ssr`; the root `@phosphor-icons/react` entry is
  client-only (`'use client'` files). Importing the client entry in a server
  component breaks the build (RSC boundary) — e.g. `PredictionCard`, `EdgeBoardWidget`
  use the `/dist/ssr` entry; `TeamPageClient` uses the root entry.
- **lucide-react is permitted only inside `src/components/ui/`** (shadcn internals:
  select chevrons, dialog close X). Never import lucide outside that directory.

## Charts (roughjs aesthetic)

- **One recipe** (`docs/chart-style-spec.md` is binding — ratified at Gate A): D3/manual
  scales in `useMemo`, a static React-rendered SVG scaffold (grids/axes/labels via
  `var(--token)` refs), one `<g ref={roughGroupRef}>` rough layer, and a `drawChart`
  `useCallback` that clears the group and draws with `rough.svg` — wired via
  `useEffect(drawChart)` + `useChartTheme(drawChart)`. No default-styled SVG data marks
  (plain `<rect>` bars, un-rough `<path>` series). `useRoughSvg` is deleted — never
  reintroduce it.
- **Color resolution:** roughjs bakes concrete colors at draw time, so all rough ink goes
  through `resolveColor` in `src/lib/charts/theme.ts` (semantic roles via `inkFor` in
  `src/lib/charts/series.ts`) and charts redraw on theme flips via `useChartTheme` —
  which observes `class`, `data-theme`, *and* `data-team-theme` (team overlays rewrite
  the `--accent*` tokens used for accent selection rings) —
  including team brand hex, which passes through unchanged but is applied only inside rough
  draw calls, never native SVG attrs. No raw hex in charts; never read tokens any other
  way; missing team colors fall back to `--text-primary` (home) / `--text-muted` (away).
- **Shared primitives** (`src/lib/charts/`): every chart sits in `ChartFrame`
  (surface + 1.5px border + 3px radius + p-4, title slot, `role="img"`/`ariaLabel`/
  `decorative` props, built-in `EmptyState` slot); details render in `ChartTooltip` — the
  reserved-height panel below the SVG with an in-SVG crosshair/row-highlight/accent-ring
  indicator (floating, cursor-following, and SVG-drawn tooltips are defects). On dense
  surfaces (scatter points, heat cells) hover *and* keyboard focus select one point/cell —
  a rough `var(--accent)` ring around a point or a `2px var(--accent)` outline on a cell —
  and details render in that same panel, never near the cursor. Series keys
  render in the HTML `ChartLegend` (opt-in `aria-pressed` toggle variant), never inside
  the SVG. `ChartTooltip` accepts an optional `headerAdornment` (a small raster/icon,
  e.g. a team logo, inline before the header text). Radial profiles use the shared
  `RoughRadar` primitive (≤ 2 series, values normalized to `0..domainMax`, default 100)
  — never a hand-rolled radar. CSS track/fill micro-bars are the shared `StatBar`
  (`src/lib/charts/StatBar.tsx`) — card chrome, never rough-drawn; callers pre-normalize
  the fill to a 0–100 percentage and own the null-row decision (house `—` placeholder).
  Migrations may not fork or wrap the primitives with per-chart styling.
- **Series semantics:** run = `--color-run`, pass = `--color-pass`, good/bad deltas =
  `--color-positive`/`--color-negative`. Paired/mirrored series always use the ±41°
  hachure rule (`pairedBarOptions`) so hue is never the only separating channel.
- **Heat surfaces** use the five `--heat-1`…`--heat-5` tokens (light+dark values in
  `globals.css`) — HTML cells via `var(--heat-N)` directly, rough ink via
  `resolveHeatColor(level)`. Never raw Tailwind color classes or `dark:` variants.
- **Stable wobble:** every chart passes a fixed `seed` in all rough options
  (default hierarchy: primary 3px/1.0 roughness, secondary 2px/0.7, tertiary 1.5px/0.5).
  Default canvas 700×350, `PADDING {30, 30, 50, 60}`, SVG `w-full h-auto`. 700×350 is a
  default, not a mandate (Gate B): heights vary with information density, and padding or
  rough-value deviations carry a code comment naming the reason. Dense multi-series
  surfaces (~25 peers, e.g. BumpsChart) may run idle series at tertiary weights with
  hover promoting the emphasized series to primary (Gate C).
- **Raster exemption:** team logos stay native `<image>`/`next/image`, never roughified;
  emphasis near raster is a rough `rc.circle` accent ring — no glow filters, no pulse
  animations. Transparent hit-target layers are likewise not rough-drawn.
- **Chart internals never use shadcn components or bridge utilities** — they consume
  editorial tokens directly. shadcn is chrome (controls, tables, dialogs), not data ink.
- **Empty charts** render `EmptyState` inside `ChartFrame` behind an explicit null-guard
  predicate — never bare strings, bare `null`, or fake zero-data marks.

## Server-rendered charts (`src/lib/charts/server/`)

The Discord bot cannot run our client recipe, so `/api/chart/[chart].png` renders React to
an SVG string and rasterizes it with resvg. Same editorial system, different constraints.
`docs/chart-style-spec.md` §9 Gate E and its second pass are binding; this is the summary.

- **Ink instead of `var()`.** `src/lib/charts/theme.ts` is `'use client'` and its
  `resolveColor` returns `#999` with no `document` — it fails *silently grey*. Server
  charts never touch it. They take a `ChartInk` (`src/lib/charts/tokens.ts`): `VAR_INK` for
  the browser, `literalInk('light'|'dark')` for resvg, which bakes literal hex from a
  DOM-free mirror of `globals.css`. The mirror is not a second source of truth —
  `tokens.sync.test.ts` fails in both directions on drift, including hex letter-casing.
  **Never write a hex into a server chart**; read it off the ink.
- **resvg is SVG 1.1 static.** No custom properties, no stylesheets, no classes, only
  partial `dominant-baseline`, and it fetches nothing. So: inline presentation attributes
  only; every `<text>` states its own `font-family` and `font-size`; vertical centring is
  an explicit `dy` via `centerDy()`; and every `<image href>` is a `data:` URI — a remote
  href renders as a silent hole, and `expectResvgSafe` rejects one. Fonts are the two
  vendored TTFs, named by `fontFamilyOf` so the family string cannot drift from the token.
  **No Phosphor here** — there is no icon font in the rasterizer. A server chart's empty
  state is `MetricEmptyCard`: masthead plus one sentence in the `EmptyState` voice.
- **The `team-metric-*` family: shape is an id, not a parameter.** A signed chart URL is a
  forever-API (Discord re-fetches after cache eviction, unauthenticated), so ids are cheap
  to add and expensive to withdraw. Three today — `-trend` (lines), `-bars` (ranked rows),
  `-scatter` (two axes, logo marks). Everything upstream of the picture is shared —
  `metrics.ts` (the metric enum), `metricScale.ts` (domain + ticks), `metricCard.tsx`
  (masthead, legend, series ink, empty state, missing-team note) — and a new shape costs a
  renderer's worth of *geometry* and nothing else. Do not add an `orientation` prop or a
  shared "plot area": a line's inverted axis and a bar's zero baseline are different ideas
  that happen to share a rectangle.
- **Every shape owes the reader a direction treatment, discharged per shape.** Half these
  metrics are better when smaller. A **line** inverts its y-axis so up is better. A **bar**
  cannot — its encoding is length from a baseline, and both available inversions would
  misstate a quantity — so bars stay zero-anchored and move direction into *sort order*.
  A **scatter** applies the line treatment per axis, so **top-right is always the good
  corner**, whatever the pair. `axisIsReversed()` is the one predicate behind all three.
  Each shape then *says so in words*, one step above footnote size in `--text-secondary`,
  because a PNG has no hover to interrogate. State it **at most twice**, and only where
  each statement carries something the other cannot (on a scatter: which axis reversed, on
  the axis; which corner is good, in the note). A third is an echo — dropped at Gate E.
- **`--series-1..4` by request order, never by rank.** `seriesInk()` is the only assigner,
  so a team keeps its ink across every shape of the same request. Never the semantic set
  (`--color-positive` on whoever placed third asserts a judgement the chart does not hold),
  and never sort order (colour would become a redundant second encoding of rank).
- **Canvas:** 700 wide, always. Height is per shape and grows with the legend. Type comes
  from `CHART_FONT_SIZE`; the masthead headline is the one `--font-headline` slot and every
  numeral on the card is DM Sans, same as the app.
- **Logos are the §7 raster exemption**, never roughified or filtered. The route resolves
  them to `data:` URIs (`src/lib/queries/teamLogos.ts`) and hands them to the renderer as
  ordinary input — `renderChartSvg` is pure, and that purity is what makes the byte-hash
  tests, the reviewable SVG snapshots and `Cache-Control: immutable` honest. A logo that
  does not arrive draws a rough mark at the same position; never a hole. **Opacity mutes
  somebody else's artwork, never our own ink** — `--text-muted` at 0.65 is under 3:1 in
  both modes, so field opacity reaches the `<image>` and stops there.
- **Dark mode needs a paper backing under crests.** ESPN crests are drawn for white, and
  against `--bg-surface` dark a large minority of any real field sits at 1–2.5:1 at full
  opacity — Penn State, Texas A&M, Ole Miss, Iowa, Alabama. The fix is a disc at the *light*
  theme's `--bg-surface` under each mark, **in dark mode only**; per-mode divergence is
  correct here because the inputs are asymmetric, exactly as `--series-*` already diverges.
  (Ruled at Gate E second pass; landing.)
- **Determinism is a contract, not a nicety.** No I/O, no clock, no unseeded randomness in
  a renderer: `ROUGH_SEED` on every rough call, ties in any sort broken by name, and the
  same spec must emit the same bytes.

## Component conventions

- **Cards:** the `.card` class (1.5px `--border`, 3px radius, `--shadow-soft`,
  hover lift) is the reference. The shadcn `Card` component expresses the same semantics
  (`border-[1.5px] border-border bg-card shadow-[var(--shadow-soft)]`) — use `Card` for new
  work; `.card` remains valid in existing server components.
- **Tabs:** `Tabs`/`TabsTrigger` mirror the hand-rolled `TeamPageClient.tsx` convention —
  individually bordered `rounded-sm` buttons, active = `--color-run` border + card surface +
  primary text + an underline-sketch-style accent bar. Do not restyle into segmented pills.
  **Scrollable tab rows:** a wide `TabsList` (e.g. the 7-tab team page) gets
  `w-full justify-start overflow-x-auto scrollbar-hide` **plus `py-1.5`** — `overflow-x`
  forces `overflow-y` to auto, and without the vertical padding the active tab's accent bar
  (`after:bottom-[-5px]`) and the 3px focus ring are clipped by the scroll container. The
  scrollbar stays hidden; the partially clipped last tab is the scroll affordance.
- **Responsive rows (mobile overflow):** the page body must never scroll
  horizontally — every horizontal row resolves narrow viewports one of three ways:
  1. **Ordered tab/chip rows** (metric tabs, plot-type selectors, sub-nav) where
     every option must stay reachable in order → `overflow-x-auto scrollbar-hide`
     on the row, plus a `py` clip-guard (`py-1.5` for `TabsList` with the active
     accent bar, `py-1` for plain bordered-button rows) so the accent bar/focus
     ring isn't clipped by the scroll container; row children get
     `shrink-0 whitespace-nowrap` (built into `TabsTrigger`). The partially
     clipped last chip is the scroll affordance (see the Tabs rule below).
     Examples: `StatLeadersTabs`, `GameTabSelector`, `SituationalView`,
     ScatterPlotClient's plot-type row.
  2. **Unordered control clusters** (filter selects, toggle groups, legends,
     search rows) → `flex-wrap`. Examples: `ChartLegend`, GamesList's dropdown
     row, EdgeBoardTable's filter row.
  3. **Wide tables** → an `overflow-x-auto` wrapper so the *table* scrolls
     inside its card, never the page (the shadcn `Table` ships its own wrapper;
     raw `<table>`s need an explicit `<div className="overflow-x-auto">`).
     Pair with `min-w-[…]` on the table only when columns would otherwise crush
     (see `PlayerGameLog`, `CoachesClient`).
  Fixed-width panels beside fluid content stack on mobile instead
  (`flex-col lg:flex-row` + `w-full lg:w-80` — see ScatterPlotClient's
  rankings view). Charts stay `w-full h-auto` with a `viewBox`.
- **Selects:** new work uses the shadcn `Select` (see `SeasonSelector.tsx`); GamesList,
  TeamList, and RankingsClient migrated in the Phase 4 sweep. The last native `<select>`s
  (players, comparison, rivals — styled via `selectClassName`/`selectStyle` in
  `src/lib/utils.ts`) are supported by the `select option` rule in globals.css until
  they migrate.
- **Dialogs/popovers:** card surface, 1.5px border, token shadows (`--shadow-hover` for
  dialogs, `--shadow-soft` for dropdowns). Motion is restrained: fade/position transitions
  only; no animation library is installed — do not paste stock shadcn `animate-in`/
  `slide-in-from-*` classes, they are no-ops here.
- **Buttons/badges:** variant colors come from bridge roles (`bg-primary`,
  `bg-destructive text-destructive-foreground`, `hover:bg-accent-shadcn`). No `text-white`,
  no `bg-gray-*`, no `dark:` variants — theming is 100% variable-driven.
- **Loading:** `Skeleton` = flat `bg-muted` + `animate-pulse rounded`, same treatment as
  `WidgetSkeleton.tsx` (title bar + logo-circle/text/value rows for dashboard widgets).
- **Errors:** widgets fail independently — `WidgetErrorBoundary` + `WidgetError` inside a
  card shell, never a blank hole or a full-page crash (global fallback: `src/app/error.tsx`).
- **Clickable table rows** (CoachesClient) get `tabIndex={0}` + Enter/Space `onKeyDown` +
  a descriptive `aria-label`, keeping the implicit `row` role (no `role="button"` override);
  nested links `stopPropagation` so team links don't trigger the row action.
- **Superlative emphasis in comparison tables** (best value per column, ConferenceTable) is
  `font-semibold` + `--text-primary` only — never semantic color, which stays reserved for
  signed good/bad deltas.

## Odds & records (prediction surfaces)

Betting/Elo surfaces (PredictionCard, LineMovementChart, EloCard, AtsCard,
EdgeBoardWidget, predictions page) share one formatting vocabulary:

- **Spreads are always signed** and come from `formatSpread` in
  `src/lib/format-odds.ts` (one decimal, `+` prefix on positives:
  "Ohio State -2.5", "Michigan +2.5"). Moneylines use `formatMoneyline` from the
  same file. Do not re-implement these locally.
- **Win probabilities** render as integer percentages ("62%"). Rate stats with
  meaningful decimals (ATS cover rate) use `formatPercent` (one decimal).
- **ATS records** are "W-L-P" (pushes always shown).
- **Signed deltas where the sign means good/bad** (season Elo Δ, avg cover margin)
  carry a `+`/`-` and are colored `--color-positive`/`--color-negative`.
- **Edges are magnitude + side, not good/bad:** the sign of `edge` only encodes
  which team the model likes, and the pick team is named in the copy — so edge
  badges tint with `--color-positive` (or neutral) only, never `--color-negative`.
- **Backtest/metric precision** (models page): projected-margin errors (MAE/RMSE) are one
  decimal with a `pts` unit; probability scores (Brier, CFBD Brier) are three decimals;
  EPA/play values are three decimals and signed (`+0.187`). ATS hit rates use
  `formatPercent` like any other rate stat.
- **Null values render as an em dash `—`** — on prediction/model surfaces in muted text,
  and as the house null placeholder in every new table/dialog cell (coaches, conferences,
  advanced leaders). Never a bare hyphen, en dash, or `--`; the older `--` placeholder
  survives only in legacy roster/recruiting tables.

## Percentiles & ranks

FBS-relative context captions share one vocabulary across PlaycallingProfile,
PortalActivityPanel, and ReturningProductionCard:

- **Percentiles are ordinals**, formatted via `formatOrdinal` in `src/lib/utils.ts`
  (handles 11th/12th/13th) — never hand-rolled suffix logic.
- **Spell out "percentile"** in card captions and tooltips ("81st percentile",
  "72nd percentile pass-heavy in FBS"). **Abbreviate to "pctl"** only in
  space-constrained chart annotations and inline stat lines ("72nd pctl pass-heavy",
  "44th pctl").
- **Absolute FBS ranks** are "#N in FBS" (ReturningProductionCard) — a rank is not a
  percentile; do not convert one into the other for display.
- Captions render muted (`--text-muted`), small, `tabular-nums`; directional leans
  ("run-heavy"/"pass-heavy") ride along in the same caption, never as a color.

## Empty states

Off-season and filtered-to-nothing surfaces render a **designed** empty state, never blank
space or a bare "No data" string. Use `src/components/EmptyState.tsx`: Phosphor icon
(`weight="thin"`), one-line title, optional description and suggested action
("Clear filters", "View {season} season"). It announces via `role="status"` so screen
readers can distinguish "genuinely empty" from "failed to load".

- **Copy voice:** one declarative sentence, often with an em-dash pivot to when the data
  returns — "Lines are off the board — edges return in season.", "No games on the board
  right now — check back at kickoff.", "Backtest metrics publish with the warehouse's next
  refresh." No exclamation points, no "Oops".
- **Client components use `EmptyState` directly.** Server components (EdgeBoardWidget,
  models page) inline the same icon + `role="status"` + title markup only because icon
  functions aren't RSC-serializable — the inline copy must match the EmptyState voice and
  treatment (`size={40} weight="thin"` muted icon, `text-sm font-medium` title).
- **No stray chrome on empty:** section headings, dividers, and filter rows that describe
  absent data are gated with the data (see TeamPageClient's Opponent-Adjusted Offense
  section); filters that let the user escape the empty state stay visible (EdgeBoardTable).
