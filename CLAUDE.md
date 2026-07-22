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
    useTheme.ts         # Theme context hook
  lib/
    charts/             # Shared chart primitives + theming (see DESIGN.md)
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

This app reads from two Supabase Postgres schemas (both populated by cfb-database):

| Schema | Contains | Examples |
|--------|----------|---------|
| `public` (default, no `.schema()` call) | Legacy convenience views + RPCs | `teams_with_logos`, `games`, `team_season_trajectory`, `roster`, `records` |
| `api` (`.schema('api')`) | Contracted PostgREST views -- the primary/preferred surface for new queries | `game_box_score`, `game_player_leaders`, `game_line_scores`, `game_drives`, `game_plays`, `game_win_probability`, `team_detail`, `matchup`, `poll_rankings` |

Direct access to the internal, dlt-loaded `core`/`core_staging` schemas is **banned**: every
known instance was migrated to an `api.*` view (see cfb-database's `docs/SCHEMA_CONTRACT.md`
Contract Rule 4), and `src/lib/queries/__tests__/contract-guard.test.ts` fails the build on any
new `.schema('core')` usage in `src/lib/queries`, `src/app`, or `src/lib/mcp`. Because `api.*`
views flatten cfb-database's dlt-loaded EAV/parent-child shapes server-side, cfb-app itself never
touches raw dlt columns (`_dlt_id`, `_dlt_parent_id`, `_dlt_list_idx`) or nested `__child` table
traversal -- that flattening happens once, in the view definition, not in this app's query layer.

### Key RPCs

`get_available_weeks`, `get_available_seasons`, `get_drive_patterns`, `get_down_distance_splits`, `get_red_zone_splits`, `get_field_position_splits`, `get_home_away_splits`, `get_conference_splits`, `get_trajectory_averages`, `get_player_season_stats_pivoted`

### Key Tables/Views

`teams_with_logos`, `games`, `team_epa_season`, `team_style_profile`, `defensive_havoc`, `team_tempo_metrics`, `records`, `team_special_teams_sos`, `roster` (`public`); `game_box_score`, `game_player_leaders`, `game_line_scores`, `game_drives`, `game_plays`, `game_win_probability`, `team_detail`, `matchup`, `poll_rankings` (`api`)

Full contracted surface: cfb-database's `docs/SCHEMA_CONTRACT.md`. Types are in `src/lib/types/database.ts`.

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
