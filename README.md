# CFB Team 360

College football analytics dashboard for FBS teams -- stats, rankings, game analysis, and interactive visualizations.

## Features

- **Team Detail Pages** -- roster-level stats, season EPA breakdowns, style profiles, and special teams ratings per team
- **Game Analysis** -- drive-by-drive EPA charts, down-and-distance heatmaps, and football field visualizations
- **Scatter Plot Explorer** -- compare any two team metrics across the FBS with interactive D3 plots
- **Defensive Havoc Metrics** -- TFL rates, sack rates, and forced turnovers aggregated by team
- **Recruiting Analysis** -- class rankings and talent distribution
- **Editorial Design** -- newspaper-inspired layout with paper textures and hand-drawn roughjs chart strokes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, Radix UI primitives |
| Charts | D3 7 + roughjs for hand-drawn aesthetic |
| Icons | Phosphor Icons |
| Data | Supabase (Postgres via PostgREST + RPCs) |
| Testing | Vitest + React Testing Library |
| Language | TypeScript 5 (strict) |

## Getting Started

### Prerequisites

- Node.js 24+
- npm
- A Supabase project with CFBD data loaded

### Environment Variables

Create a `.env.local` file in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

### Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Deployment

Production runs on **Vercel** (project `v0-production-data-application`) and auto-deploys
the `main` branch; pull requests get preview deployments with a bot comment linking the URL.

- **Production:** https://v0-production-data-application.vercel.app
- **Required env vars** (Vercel → Project → Settings → Environment Variables):
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the same two values
  as `.env.local`. No other configuration is needed; all routes are dynamic
  (server-rendered), so no build-time data access occurs.
- **Data dependency:** the app reads only the contracted `api.*` views, `public.*`
  convenience views, and RPCs from the cfb-database Supabase warehouse (see that repo's
  `docs/SCHEMA_CONTRACT.md`). New warehouse views must be deployed there before app
  code that consumes them ships — until then the affected pages render empty states.
- **CI:** `.github/workflows/ci.yml` runs lint, typecheck, tests, and a production build
  on every push and PR to `main` using placeholder Supabase env values.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run test` | Run Vitest (single run) |
| `npm run test:watch` | Run Vitest in watch mode |

## Project Structure

```
src/
  app/
    page.tsx              # Dashboard home (standings, stat leaders, recent games)
    analytics/            # Scatter plot explorer
    games/                # Game list and game detail pages
    teams/[slug]/         # Team detail pages
  components/
    dashboard/            # Server components: standings, stat leaders, top movers
    analytics/            # ScatterPlotClient (D3 scatter with roughjs)
    visualizations/       # FootballField, DownDistanceHeatmap, DrivePatterns
    team/                 # Team detail components (EPA, style profile, recruiting)
    game/                 # Game-level analysis components
  lib/
    queries/              # Supabase data fetchers and shared constants
    supabase/             # Client and server Supabase helpers
    types/                # TypeScript types (manual + generated)
    utils.ts              # Slug helpers, formatting
```

## Design System

- **Headlines:** Libre Baskerville (serif)
- **Body:** DM Sans (sans-serif)
- **Theme:** Paper textures, muted tones, editorial/newspaper aesthetic
- **Charts:** Hand-drawn strokes via roughjs on D3-rendered SVGs
- **Dark mode:** Supported via `ThemeToggle` component
- **Tokens:** CSS custom properties (`--text-primary`, `--bg-surface-alt`, etc.)

## Data

Powered by Supabase Postgres loaded with College Football Data (CFBD). Key tables include `teams_with_logos`, `team_epa_season`, `team_style_profile`, `defensive_havoc`, `team_tempo_metrics`, `records`, and `team_special_teams_sos`. Types are defined in `src/lib/types/database.ts`.
