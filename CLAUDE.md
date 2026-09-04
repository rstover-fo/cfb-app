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

The current season is resolved from the warehouse, not from a constant: `getCurrentSeasonCached()`
(React Server Components) or `getCurrentSeasonForRoute()` (MCP route handler, ten-minute cache) in
`src/lib/queries/season.ts` return `{season, through_week, is_live, source}` -- the newest season
with at least one completed game. `CURRENT_SEASON` in `constants.ts` is only the fallback when that
query fails; never bump it to "fix" a stale season. `CFB_SEASON` (env) pins the season on every
surface, app and bot alike. `get_season_outlook`'s `projection_season` is a separate concept.

## Database

This app reads from two Supabase Postgres schemas (both populated by cfb-database):

| Schema | Contains | Examples |
|--------|----------|---------|
| `public` (default, no `.schema()` call) | Legacy convenience views + RPCs | `teams_with_logos`, `games`, `team_season_trajectory`, `roster`, `records` |
| `api` (`.schema('api')`) | Contracted PostgREST views -- the primary/preferred surface for new queries | `game_box_score`, `game_player_leaders`, `game_line_scores`, `game_drives`, `game_plays`, `game_win_probability`, `team_detail`, `matchup`, `poll_rankings`, `rushing_charting_player_season` |
| `bot` (Discord bot only) | Bot-owned durable state -- owned by THIS repo (`bot/supabase/migrations/`), not part of cfb-database's SCHEMA_CONTRACT; the Next.js app never reads it | `user_profiles`, `app_settings`, `memory_atoms` |

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

`teams_with_logos`, `games`, `team_epa_season`, `team_style_profile`, `defensive_havoc`, `team_tempo_metrics`, `records`, `team_special_teams_sos`, `roster` (`public`); `game_box_score`, `game_player_leaders`, `game_line_scores`, `game_drives`, `game_plays`, `game_win_probability`, `team_detail`, `matchup`, `poll_rankings`, `season_outlook`, `model_backtest`, `expected_points`, `core_ratings`, `rushing_charting_player_season`, `rushing_charting_team_season`, `rushing_charting_direction_season` (`api`)

`api.rushing_charting_*` (CFBD rushing charting, 2025+ only) is the opposite of passing charting:
the rate metrics (`ppa`, `success_rate`, `stuff_rate`, `explosiveness`, line/second-level/open-field
yards) are computed over EVERY carry -- full data coverage, not a partial charted subset, though
`explosiveness` (EPA per successful carry) and `power_success` (short-yardage conversion rate) keep
their own narrower denominators -- so they need a sample-size floor (50 carries by default), not
a coverage caveat. Direction splits are the partial piece (`direction_available_attempts` /
`direction_eligible_attempts`, ~40% resolved in 2025). `defense_*` on the team view is that team's
own run defense. Player `attempts` never sum to team `offense_attempts` (CFBD keeps team-only and
multi-carrier carries off player rows). Served by `src/lib/queries/rushing-charting.ts` and the
`get_rushing_charting` MCP tool (player grain); team and direction grains go through `run_sql`.

`api.core_ratings` (CFBD CORE, opponent/situation-adjusted team ratings) is 2016+ only --
NULL/absent for earlier seasons means not-rated, never 0 -- and `defense` is LOWER-better
(best defense = `defense_rank ASC`). `core_overall`/`core_offense`/`core_defense` are also
embedded on `api.team_detail` and `api.team_history`.

`api.season_outlook` (simulated season win totals) is not FBS-only -- filter on its
`classification` column before ranking, and check `is_projection` before calling a row a
forecast. `api.model_backtest` is how wrong those projections usually are; pin `scope = 'fbs'`
and read the interval from `resid_p10`/`resid_p90`, never `± win_mae`. Both are served by
`src/lib/queries/season-outlook.ts` and the `get_season_outlook` MCP tool.

`api.expected_points` (the house EP model) is a STATE lookup, not a team stat: one row per
(era, down x distance-bucket x field-zone state), no team column. down=4 rows are
go-for-it-conditional, `ep_drive`/`ep_net` are different scoring bases, and oddball cells can
rest on a single observed play (check `n_obs`/`se_boot`). Served by
`src/lib/queries/expected-points.ts` and the `get_expected_points` MCP tool.

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
