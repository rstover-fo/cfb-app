# Player Analytics: Leaderboards & Detail Pages

**Date:** 2026-02-06
**Status:** Ready for Implementation
**Brainstorm:** `docs/brainstorms/2026-02-06-player-analytics-brainstorm.md`

## Overview

Add player analytics as a first-class feature: a leaderboard browse page at `/players` and a full player profile at `/players/[id]`. Integrate player links throughout existing pages.

---

## Architecture Decisions

### Data Access Strategy

**Problem:** The `api.*` and `marts.*` schemas have no PostgREST grants. Only `public` and `core` schemas are accessible from the frontend.

**Solution:** Create new public RPCs that query the underlying data:

| RPC | Source | Purpose |
|-----|--------|---------|
| `get_player_season_leaders(p_season, p_category, p_conference, p_limit)` | `stats.player_season_stats` | Leaderboard page |
| `get_player_detail(p_player_id, p_season)` | `core.roster` + `stats.player_season_stats` + `recruiting.recruits` | Player profile bio + stats |
| `get_player_game_log(p_player_id, p_season)` | `marts.player_game_epa` + `api.game_player_leaders` | Per-game stats + EPA |
| `get_player_percentiles(p_player_id, p_season)` | `marts.player_comparison` | Positional percentile rankings |

The existing `get_player_search` RPC already works for search.

### Route Structure

```
/players              → PlayersPage (server) → PlayersClient (client)
/players/[id]         → PlayerDetailPage (server) → PlayerDetailClient (client)
```

### Component Architecture

```
src/
  app/
    players/
      page.tsx            # Server component — fetches initial leaderboard data
      actions.ts          # Server actions for client interactivity
      [id]/
        page.tsx          # Server component — fetches player profile
  components/
    players/
      PlayersClient.tsx         # Leaderboard page client shell
      LeaderboardTable.tsx      # Sortable stat leader table (reused per category)
      PlayerSearchBar.tsx       # Fuzzy search with debounced RPC calls
      PlayerDetailClient.tsx    # Profile page client shell
      PlayerBioHeader.tsx       # Bio card with physicals, team, recruiting info
      PlayerStatsTable.tsx      # Season stats (position-aware columns)
      PlayerGameLog.tsx         # Per-game stats table
      PercentileRadar.tsx       # roughjs radar/spider chart
      GameTrendChart.tsx        # roughjs line chart (game-by-game)
  lib/
    queries/
      players.ts              # All player query functions
```

---

## Sprint 1: Database RPCs & Data Layer

### Task 1.1: Create `get_player_season_leaders` RPC

**Migration:** Creates a function that pivots `stats.player_season_stats` EAV data into category-specific leaderboard rows.

```sql
CREATE OR REPLACE FUNCTION public.get_player_season_leaders(
  p_season integer,
  p_category text DEFAULT 'passing',
  p_conference text DEFAULT NULL,
  p_limit integer DEFAULT 50
) RETURNS TABLE(
  player_id varchar, player_name varchar, team varchar, conference varchar, position varchar,
  -- passing
  pass_yds numeric, pass_td numeric, pass_int numeric, pass_pct numeric, pass_att numeric, pass_cmp numeric,
  -- rushing
  rush_yds numeric, rush_td numeric, rush_car numeric, rush_ypc numeric,
  -- receiving
  rec_yds numeric, rec_td numeric, rec numeric, rec_ypr numeric,
  -- defense
  total_tackles numeric, solo_tackles numeric, sacks numeric, tfl numeric, passes_defended numeric, interceptions numeric,
  -- rank
  yards_rank bigint
)
```

**Acceptance:** Query returns top 50 passers for 2024 season in < 2 seconds.

### Task 1.2: Create `get_player_detail` RPC

Joins `core.roster` + `stats.player_season_stats` (pivoted) + `recruiting.recruits` (lateral join).

```sql
CREATE OR REPLACE FUNCTION public.get_player_detail(
  p_player_id text,
  p_season integer DEFAULT NULL
) RETURNS TABLE(
  player_id varchar, name text, team varchar, position varchar, jersey bigint,
  height bigint, weight bigint, year bigint, home_city varchar, home_state varchar,
  season bigint, stars bigint, recruit_rating float, national_ranking bigint, recruit_class bigint,
  -- pivoted stats
  pass_att numeric, pass_cmp numeric, pass_yds numeric, pass_td numeric, pass_int numeric, pass_pct numeric,
  rush_car numeric, rush_yds numeric, rush_td numeric, rush_ypc numeric,
  rec numeric, rec_yds numeric, rec_td numeric, rec_ypr numeric,
  tackles numeric, solo numeric, sacks numeric, tfl numeric, pass_def numeric, interceptions numeric,
  fg_made numeric, fg_att numeric, xp_made numeric, xp_att numeric, punt_yds numeric,
  ppa_avg float, ppa_total float
)
```

**Acceptance:** Returns full profile for player ID `4433971` (Kyle McCord) with recruiting data.

### Task 1.3: Create `get_player_game_log` RPC

Joins `marts.player_game_epa` with game metadata for a per-game breakdown.

```sql
CREATE OR REPLACE FUNCTION public.get_player_game_log(
  p_player_id text,
  p_season integer
) RETURNS TABLE(
  game_id bigint, week integer, opponent varchar, home_away text, result text,
  -- EPA data from marts.player_game_epa
  plays bigint, total_epa numeric, epa_per_play numeric, success_rate numeric,
  explosive_plays bigint, total_yards numeric, play_category text
)
```

**Acceptance:** Returns McCord's game log with EPA data for each game.

### Task 1.4: Create `get_player_percentiles` RPC

Wraps `marts.player_comparison` materialized view.

```sql
CREATE OR REPLACE FUNCTION public.get_player_percentiles(
  p_player_id text,
  p_season integer
) RETURNS TABLE(
  player_id varchar, name varchar, team varchar, position varchar, position_group text,
  -- raw stats
  pass_yds numeric, pass_td numeric, pass_pct numeric, rush_yds numeric, rush_td numeric,
  rush_ypc numeric, rec_yds numeric, rec_td numeric, tackles numeric, sacks numeric, tfl numeric,
  ppa_avg float,
  -- percentiles
  pass_yds_pctl float, pass_td_pctl float, pass_pct_pctl float,
  rush_yds_pctl float, rush_td_pctl float, rush_ypc_pctl float,
  rec_yds_pctl float, rec_td_pctl float,
  tackles_pctl float, sacks_pctl float, tfl_pctl float,
  ppa_avg_pctl float
)
```

**Acceptance:** Returns percentiles for a QB showing pass_yds_pctl near 1.0 for top passers.

### Task 1.5: Create query functions in `src/lib/queries/players.ts`

TypeScript query layer wrapping the RPCs with proper types.

Functions:
- `getPlayerSeasonLeaders(season, category, conference?, limit?)`
- `getPlayerDetail(playerId, season?)`
- `getPlayerGameLog(playerId, season)`
- `getPlayerPercentiles(playerId, season)`
- `searchPlayers(query, position?, team?, season?)` (wraps existing `get_player_search`)
- `getPlayerAvailableSeasons(playerId)` — get seasons with data for a player

Types to define in `src/lib/types/database.ts`:
- `PlayerLeaderRow`
- `PlayerProfile`
- `PlayerGameLogEntry`
- `PlayerPercentiles`
- `PlayerSearchResult`

**Acceptance:** All functions typed, `cache()` wrapped, return correct data.

---

## Sprint 2: Players Leaderboard Page (`/players`)

### Task 2.1: Create server page `src/app/players/page.tsx`

Server component that:
- Reads `searchParams` for `season`, `category`, `conference`
- Fetches initial leaderboard data via `getPlayerSeasonLeaders`
- Fetches available seasons via `getAvailableSeasons`
- Passes to `PlayersClient`

### Task 2.2: Create server actions `src/app/players/actions.ts`

Re-exports:
- `fetchPlayerSeasonLeaders(season, category, conference, limit)`
- `fetchSearchPlayers(query, position, team, season)`
- Types: `PlayerLeaderRow`, `PlayerSearchResult`

### Task 2.3: Create `PlayersClient.tsx`

Client component with:
- Season selector (reuse SeasonSelector pattern from rankings)
- Category tabs: Passing | Rushing | Receiving | Defense
- Conference filter dropdown
- Search bar integration (PlayerSearchBar)
- LeaderboardTable for current category
- `useTransition()` + `requestIdRef` pattern for data fetching
- Loading skeleton states

### Task 2.4: Create `LeaderboardTable.tsx`

Reusable sortable table that:
- Accepts `category` prop to determine visible columns
- Columns per category:
  - **Passing:** Rank, Player, Team, Yards, TD, INT, Comp%, Att
  - **Rushing:** Rank, Player, Team, Yards, TD, Carries, YPC
  - **Receiving:** Rank, Player, Team, Yards, TD, Rec, YPR
  - **Defense:** Rank, Player, Team, Tackles, Solo, Sacks, TFL, INT, PD
- Player name links to `/players/[id]`
- Team name links to `/teams/[slug]`
- Sortable column headers
- Editorial table styling (Libre Baskerville headers, DM Sans body)

### Task 2.5: Create `PlayerSearchBar.tsx`

Search component that:
- Debounced input (300ms) calling `get_player_search` RPC
- Dropdown results showing: name, team, position
- Click navigates to `/players/[id]`
- Empty state and loading indicator
- Keyboard navigation (arrow keys + enter)

### Task 2.6: Add "Players" to Sidebar navigation

Add entry between "Games" and "Rankings":
```tsx
{ href: '/players', label: 'Players', icon: UserCircle }  // from Phosphor
```

**Acceptance:** `/players` page loads with passing leaders by default, can switch categories/seasons/conferences, search works.

---

## Sprint 3: Player Detail Page (`/players/[id]`)

### Task 3.1: Create server page `src/app/players/[id]/page.tsx`

Server component that:
- Reads `params.id` and `searchParams.season`
- Fetches in parallel: `getPlayerDetail`, `getPlayerPercentiles`, `getPlayerGameLog`
- Handles missing player (notFound())
- Passes all data to `PlayerDetailClient`

### Task 3.2: Create server actions `src/app/players/[id]/actions.ts`

Re-exports for season switching:
- `fetchPlayerDetail(playerId, season)`
- `fetchPlayerGameLog(playerId, season)`
- `fetchPlayerPercentiles(playerId, season)`

### Task 3.3: Create `PlayerDetailClient.tsx`

Client shell with:
- Season selector for multi-year players
- Layout: Bio header → Stats table → Charts row → Game log
- `useTransition()` for season switching
- Back navigation link

### Task 3.4: Create `PlayerBioHeader.tsx`

Bio card displaying:
- Player name (Libre Baskerville, large)
- Team logo (from `teams_with_logos`) + team name (linked to `/teams/[slug]`)
- Position, jersey #, year (FR/SO/JR/SR)
- Height (ft'in"), weight (lbs)
- Hometown (city, state)
- Recruiting info card (conditional): stars, rating, national rank, class year
- Paper card styling with subtle shadow

### Task 3.5: Create `PlayerStatsTable.tsx`

Position-aware season stats table:
- Detects position group from player data
- Shows relevant columns per group:
  - **QB:** Comp/Att, Yards, TD, INT, Comp%, YPA, PPA
  - **RB:** Car, Yards, TD, YPC, PPA
  - **WR/TE:** Rec, Yards, TD, YPR, PPA
  - **Defense:** Tackles, Solo, TFL, Sacks, INT, PD, PPA
  - **K/P:** FG (made/att), XP (made/att), Points
- Editorial table styling

### Task 3.6: Create `PercentileRadar.tsx` (roughjs)

Radar/spider chart:
- 5-6 axes based on position group
- **QB:** Pass Yds, Pass TD, Comp%, PPA, Rush Yds (dual-threat indicator)
- **RB:** Rush Yds, Rush TD, YPC, PPA, Rec Yds
- **WR:** Rec Yds, Rec TD, Receptions, YPR, PPA
- **Defense:** Tackles, Sacks, TFL, INT, PPA
- roughjs hand-drawn lines and fill
- Fixed viewBox (e.g., 400x400) + `className="w-full max-w-md"`
- CSS variable resolution for colors
- MutationObserver for theme changes
- Labels at each axis point
- Player percentile values overlaid

### Task 3.7: Create `GameTrendChart.tsx` (roughjs)

Game-by-game line chart:
- X-axis: weeks/games
- Y-axis: primary stat (EPA per play or yards)
- roughjs hand-drawn line with data point circles
- Tooltip on hover showing game details
- Fixed viewBox (800x300) + responsive width
- Theme-aware colors

### Task 3.8: Create `PlayerGameLog.tsx`

Game log table:
- Columns: Week, Opponent, Result, key stats (position-aware), EPA/play
- Opponent links to game detail (`/games/[id]`)
- Sortable columns
- Highlight row for best/worst EPA games

**Acceptance:** `/players/4433971` loads full McCord profile with bio, stats, charts, game log.

---

## Sprint 4: Navigation Integration & Polish

### Task 4.1: Link player names in RosterView

Update `RosterView.tsx`:
- Wrap player name cell in `<Link href={/players/${player.id}}>`
- Subtle hover underline styling

### Task 4.2: Link player names in PlayerLeaders (game detail)

Update `PlayerLeaders.tsx` and `PlayerCategory.tsx`:
- Wrap player name in link to `/players/[id]`
- Handle case where player.id might be missing

### Task 4.3: Add metadata and SEO

- `generateMetadata` for both pages
- `/players`: "CFB Player Leaderboards — [Season]"
- `/players/[id]`: "[Player Name] — [Team] [Position] Stats"

### Task 4.4: Error boundaries and loading states

- Error boundary for `/players` route
- Error boundary for `/players/[id]` route
- Loading skeletons for both pages
- Empty state when no data found

### Task 4.5: Update CLAUDE.md

Add new routes, components, and RPCs to project documentation.

**Acceptance:** Full feature works end-to-end, player names clickable throughout app, proper error handling.

---

## Data Flow Summary

```
/players
  Server: getPlayerSeasonLeaders(2024, 'passing') → PlayersClient
  Client: fetchPlayerSeasonLeaders(season, category, conf) on filter change
          fetchSearchPlayers(query) on search input

/players/[id]
  Server: Promise.all([getPlayerDetail, getPlayerPercentiles, getPlayerGameLog])
  Client: fetchPlayerDetail(id, season) on season change
          fetchPlayerPercentiles(id, season) on season change
          fetchPlayerGameLog(id, season) on season change
```

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| RPC query performance on large `stats.player_season_stats` | Add indexes on (season, category) if needed; LIMIT results |
| `api.game_player_leaders` view times out | Fall back to direct `core.game_player_stats` hierarchy traversal (existing pattern) |
| `marts.player_game_epa` missing player_id join key | Join via player_name + team + game_id (verify uniqueness) |
| Player IDs inconsistent across tables | Use `core.roster.id` as canonical; `stats` table uses same IDs |
| No player photos available | Design bio header to work without photo; add later if URL pattern found |

---

## Files Created/Modified

**New files (17):**
- `src/app/players/page.tsx`
- `src/app/players/actions.ts`
- `src/app/players/[id]/page.tsx`
- `src/app/players/[id]/actions.ts`
- `src/components/players/PlayersClient.tsx`
- `src/components/players/LeaderboardTable.tsx`
- `src/components/players/PlayerSearchBar.tsx`
- `src/components/players/PlayerDetailClient.tsx`
- `src/components/players/PlayerBioHeader.tsx`
- `src/components/players/PlayerStatsTable.tsx`
- `src/components/players/PlayerGameLog.tsx`
- `src/components/players/PercentileRadar.tsx`
- `src/components/players/GameTrendChart.tsx`
- `src/lib/queries/players.ts`
- 4 SQL migrations (RPCs)

**Modified files (5):**
- `src/components/Sidebar.tsx` — add Players nav item
- `src/components/team/RosterView.tsx` — link player names
- `src/components/game/PlayerLeaders.tsx` — link player names
- `src/lib/types/database.ts` — add player types
- `CLAUDE.md` — update documentation
