# CFB Team 360

College football analytics dashboard. FBS team stats, rankings, game results, and scatter-plot explorer.

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS 4, Radix UI primitives
- Supabase SSR (Postgres via PostgREST + RPCs)
- D3 + roughjs for hand-drawn chart aesthetic
- Phosphor Icons
- Vitest + React Testing Library

## Design System

Editorial/newspaper theme:
- **Headline:** Libre Baskerville (serif)
- **Body:** DM Sans (sans-serif)
- Paper textures, hand-drawn chart strokes (roughjs)
- CSS custom properties for theming (`--text-primary`, `--bg-surface-alt`, etc.)
- Dark mode supported via `ThemeToggle`

## Project Structure

```
src/
  app/              # Next.js routes: /, /analytics, /games, /teams/[slug]
  components/
    dashboard/      # Server components: Standings, StatLeaders, RecentGames, TopMovers
    analytics/      # ScatterPlotClient (D3 scatter with roughjs)
    visualizations/ # FootballField, DownDistanceHeatmap, DrivePatterns
    team/           # Team detail components
  lib/
    queries/        # Supabase data fetchers
      constants.ts  # CURRENT_SEASON, week boundaries (canonical source)
      shared.ts     # FBS_CONFERENCES, getTeamLookup, getFBSTeams
      dashboard.ts  # Dashboard widget queries
      games.ts      # Games page queries
    supabase/       # Client/server Supabase helpers
    types/          # database.ts (manual), database.generated.ts (supabase gen)
    utils.ts        # teamNameToSlug, etc.
```

## Key Constants

All season/conference constants live in `src/lib/queries/constants.ts` and `src/lib/queries/shared.ts`. Import from there -- do not define local copies.

## Commands

```bash
npm run dev         # Start dev server
npm run build       # Production build
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run test        # Vitest (run once)
npm run test:watch  # Vitest (watch mode)
```

## Git Conventions

- Branch names: `feature/`, `fix/`, `refactor/`, `chore/` prefixes
- Commit messages: imperative mood, 50-char subject line

## Data

All data comes from Supabase Postgres. Tables include `teams_with_logos`, `team_epa_season`, `team_style_profile`, `defensive_havoc`, `team_tempo_metrics`, `records`, `team_special_teams_sos`, and more. Types are in `src/lib/types/database.ts`.
