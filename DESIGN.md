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
- **Body and all numerics** are DM Sans. Never set stats in the serif.
- **Stat/score columns** use `tabular-nums` (baked into the `TableCell` component).
- **Table/label headers** are the newspaper small-caps style: `text-[10px] uppercase
  tracking-wider font-normal` in muted text (see `PollTable.tsx`; `TableHead` matches).
- Active nav/headline emphasis uses `.underline-sketch` — the slightly rotated 2px
  `--color-run` underline — not bold-only or color-only states.

## Iconography

- **Phosphor Icons everywhere** in app code (`@phosphor-icons/react`), typically
  `weight="thin"`/`"regular"` to match the hand-drawn feel.
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

## Component conventions

- **Cards:** the `.card` class (1.5px `--border`, 3px radius, `--shadow-soft`,
  hover lift) is the reference. The shadcn `Card` component expresses the same semantics
  (`border-[1.5px] border-border bg-card shadow-[var(--shadow-soft)]`) — use `Card` for new
  work; `.card` remains valid in existing server components.
- **Tabs:** `Tabs`/`TabsTrigger` mirror the hand-rolled `TeamPageClient.tsx` convention —
  individually bordered `rounded-sm` buttons, active = `--color-run` border + card surface +
  primary text + an underline-sketch-style accent bar. Do not restyle into segmented pills.
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

## Empty states

Off-season and filtered-to-nothing surfaces render a **designed** empty state, never blank
space or a bare "No data" string. Use `src/components/EmptyState.tsx`: Phosphor icon
(`weight="thin"`), one-line title, optional description and suggested action
("Clear filters", "View {season} season"). It announces via `role="status"` so screen
readers can distinguish "genuinely empty" from "failed to load".
