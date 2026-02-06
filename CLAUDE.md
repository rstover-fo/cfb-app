# CFB Team 360

College football analytics dashboard. FBS team stats, rankings, game results, and scatter-plot explorer.

## Related Projects

This project is part of a three-repo college football platform sharing a single Supabase instance:

| Repo | Role | Relationship |
|------|------|-------------|
| **cfb-database** | Schema source of truth, dlt pipelines | Populates all schemas this app reads from |
| **cfb-scout** | Scouting intelligence API | Owns `scouting` schema; future integration planned |

Schema contract: `../cfb-database/docs/SCHEMA_CONTRACT.md`

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
  app/
    /                   # Dashboard home
    /analytics          # Scatter-plot explorer
    /games              # Games list
    /games/[id]         # Game detail (box score, drive patterns)
    /rankings           # Poll rankings + bumps chart
    /teams              # Team list
    /teams/[slug]       # Team detail page
    games/actions.ts    # Server actions for client-server boundary
    rankings/actions.ts # Server actions for rankings
  components/
    dashboard/          # Server components: Standings, StatLeaders, RecentGames, TopMovers
    analytics/          # ScatterPlotClient (D3 scatter with roughjs)
    visualizations/     # FootballField, DownDistanceHeatmap, DrivePatterns
    team/               # Team detail components
    game/               # GameBoxScore, GameScoreHeader, PlayerLeaders, QuarterScores
    rankings/           # BumpsChart, PollTable, RankingsClient
    (root)              # GamesList, PaperTexture, Sidebar, TeamCard, TeamList, TeamSearch, ThemeToggle
  hooks/
    useCountUp.ts       # Animated number counter
    useRoughSvg.ts      # roughjs SVG integration (core to chart aesthetic)
    useTheme.ts         # Theme context hook
  lib/
    queries/
      constants.ts      # CURRENT_SEASON, week boundaries (canonical source)
      shared.ts         # FBS_CONFERENCES, getTeamLookup, getFBSTeams
      dashboard.ts      # Dashboard widget queries
      games.ts          # Games page queries
      rankings.ts       # Rankings page queries
    supabase/           # Client/server Supabase helpers
    types/              # database.ts (manual), database.generated.ts (supabase gen)
    utils.ts            # teamNameToSlug, slugToTeamName, formatPercent, formatRank
```

## Key Constants

All season/conference constants live in `src/lib/queries/constants.ts` and `src/lib/queries/shared.ts`. Import from there -- do not define local copies.

## Database

This app reads from three Supabase Postgres schemas (all populated by cfb-database):

| Schema | Contains | Examples |
|--------|----------|---------|
| `public` | Convenience views, RPCs | `teams_with_logos`, `games`, `team_season_trajectory`, `roster` |
| `core` | Normalized game data | `rankings`, `records`, `game_team_stats`, line scores |
| `core_staging` | Player stats (dlt-loaded) | `game_player_stats` and nested child tables |

### dlt Table Conventions

Tables in `core` and `core_staging` use dlt parent-child relationships:
- `_dlt_id` -- unique row identifier
- `_dlt_parent_id` -- FK to parent table's `_dlt_id`
- `_dlt_list_idx` -- array position index

Example traversal: `game_player_stats` -> `__teams` -> `__categories` -> `__types` -> `__athletes`

### Key RPCs

`get_available_weeks`, `get_available_seasons`, `get_drive_patterns`, `get_down_distance_splits`, `get_red_zone_splits`, `get_field_position_splits`, `get_home_away_splits`, `get_conference_splits`, `get_trajectory_averages`, `get_player_season_stats_pivoted`

### Key Tables/Views

`teams_with_logos`, `team_epa_season`, `team_style_profile`, `defensive_havoc`, `team_tempo_metrics`, `records`, `team_special_teams_sos`, `rankings`, `game_team_stats`

Types are in `src/lib/types/database.ts`.

## Architectural Patterns

### Server Actions
Routes with client components use a server actions pattern (`'use server'` files like `games/actions.ts`, `rankings/actions.ts`) to wrap query functions and re-export types. This prevents client components from importing server-only modules.

### Request Deduplication
Server components use React `cache()` for request-level dedup of Supabase queries.

### Error Boundaries
- Global: `src/app/error.tsx`
- Widget-level: `WidgetError.tsx`, `WidgetErrorBoundary.tsx`, `WidgetSkeleton.tsx` in `components/dashboard/`

## Commands

```bash
npm run dev         # Start dev server
npm run build       # Production build
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run test        # Vitest (run once)
npm run test:watch  # Vitest (watch mode)
```

## Testing

- Tests use co-located `.test.tsx` files next to their components/pages
- `vitest.config.ts` configures jsdom environment and path aliases
- `src/test/setup.ts` for global test setup
- Pre-push hook (`.githooks/pre-push`) runs lint + typecheck before push

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=       # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anon key (public)
```

## Git Conventions

- Branch names: `feature/`, `fix/`, `refactor/`, `chore/` prefixes
- Commit messages: imperative mood, 50-char subject line

## Configuration Notes

- `next.config.ts` allows remote images from `a.espncdn.com` (team logos)
