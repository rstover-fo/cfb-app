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

- Recipe: D3 for scales/layout, roughjs (via `useRoughSvg`) for strokes/fills —
  sketchy rectangles, wobbly lines, hachure fills. No default-styled SVG/`<rect>` bars.
- **Color resolution:** roughjs bakes concrete color strings at draw time, so charts must
  resolve tokens through `src/lib/charts/theme.ts` — `resolveColor('var(--color-run)')` —
  and re-draw on theme flips via `useChartTheme`. Never hardcode chart hex; never read
  tokens any other way.
- Series semantics: run = `--color-run`, pass = `--color-pass`, good/bad deltas =
  `--color-positive`/`--color-negative`. Team-specific marks may use the team's brand color
  passed in as data (already-resolved hex is passed through `resolveColor` unchanged).
- **Chart internals never use shadcn components or bridge utilities** — they consume
  editorial tokens directly. shadcn is chrome (controls, tables, dialogs), not data ink.
- **Paired-series fills mirror their hachure angle** (e.g. ±41° in PercentileBars'
  tornado layout) so the two sides stay distinguishable beyond hue alone — color is
  never the only channel separating mirrored series.

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
- **Selects:** new work uses the shadcn `Select` (see `SeasonSelector.tsx`). Several native
  `<select>`s remain (GamesList, TeamList, RankingsClient, players, comparison, rivals) —
  the `select option` rule in globals.css supports them until they migrate.
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
