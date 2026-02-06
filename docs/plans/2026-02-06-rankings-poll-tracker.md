# Sprint: Rankings & Poll Tracker

**Date:** 2026-02-06
**Status:** Planning
**Goal:** Add a dedicated Rankings page (`/rankings`) that surfaces AP Top 25 and Coaches Poll data with week-by-week navigation, ranking movement indicators, and a "bumps chart" visualization showing rank trajectories over the season.

## Context

The database has rich poll data (`core.rankings` — 29,579 rows) covering AP Top 25, Coaches Poll, and Playoff Committee Rankings across all seasons. None of this is surfaced in the app today. The existing `/analytics` page shows custom composite rankings, but users expect to see official poll rankings (AP/Coaches).

Additionally, line score data (`core.games__home_line_scores`, `core.games__away_line_scores` — 181k rows each) enables quarter-by-quarter scoring on game detail pages — a natural enhancement.

---

## Data Available

| Table | Rows | Key Columns |
|-------|------|-------------|
| `core.rankings` | 29,579 | rank, school, conference, first_place_votes, points, season, week, poll |
| `core.games__home_line_scores` | 181,027 | value (quarter score), _dlt_list_idx (quarter index) |
| `core.games__away_line_scores` | 181,027 | Same structure |

**Polls available:** AP Top 25, Coaches Poll, Playoff Committee Rankings, FCS Coaches, AFCA Div II/III

---

## Features

### Feature 1: Rankings Page (`/rankings`)

**Route:** `/rankings`

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Rankings               [AP Top 25 ▾] [2025 ▾] [Wk 15 ▾] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  POLL TABLE                                             │
│  ┌────┬─────┬──────────────┬───────┬────────┬────────┐ │
│  │ Rk │ Mvmt│ Team         │ Conf  │ Record │ Points │ │
│  ├────┼─────┼──────────────┼───────┼────────┼────────┤ │
│  │  1 │  —  │ Ohio State   │ B1G   │ 13-2   │ 1645   │ │
│  │  2 │ ▲3  │ Indiana      │ B1G   │ 14-1   │ 1589   │ │
│  │  3 │ ▼1  │ Georgia      │ SEC   │ 12-3   │ 1504   │ │
│  │ ...│     │              │       │        │        │ │
│  │ 25 │ NEW │ Missouri     │ SEC   │ 10-3   │   73   │ │
│  └────┴─────┴──────────────┴───────┴────────┴────────┘ │
│                                                         │
│  ────────────────────────────────────────────────────── │
│                                                         │
│  RANKING TRAJECTORY (Bumps Chart)                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Wk1  Wk2  Wk3  Wk4  ...  Wk15                  │  │
│  │  1 ─────────────────────────── Ohio State         │  │
│  │  2 ──╲                                           │  │
│  │  3    ╲────────────── Georgia                    │  │
│  │  4 ────╲──────╱───── Oregon                      │  │
│  │  ...                                             │  │
│  │ 25 ──────────────── Missouri                     │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Components:**
- `src/app/rankings/page.tsx` — Server component (data fetching)
- `src/components/rankings/RankingsClient.tsx` — Client component (poll/week/season selectors, state)
- `src/components/rankings/PollTable.tsx` — Sortable rankings table with movement badges
- `src/components/rankings/BumpsChart.tsx` — D3 bumps chart showing rank trajectories over the season

**Data flow:**
1. Server page fetches all rankings for the selected season (or default latest)
2. Client component manages poll, week, and season selection
3. PollTable renders the 25 teams for the selected week
4. BumpsChart renders all weeks for the selected season/poll

### Feature 2: Quarter Scores on Game Detail

**Enhancement to:** `/games/[id]`

Add quarter-by-quarter line scores above the box score table:

```
             1Q   2Q   3Q   4Q   Final
Army          7    3    0    6    16
Navy          7    7    0    3    17
```

**Components:**
- `src/components/game/QuarterScores.tsx` — New component
- Update `src/lib/queries/games.ts` with `getGameLineScores()`

### Feature 3: Update Sidebar Navigation

Add `/rankings` to the sidebar nav items.

### Feature 4: Dashboard Rankings Widget Enhancement

Update the existing StandingsWidget to show "AP Top 25" badge and link "View All" to `/rankings`.

---

## Implementation Tasks

### Task 1: Rankings Query Functions
**File:** `src/lib/queries/rankings.ts` (new)
**Work:**
- `getRankingsForWeek(season, week, poll)` — Fetch 25 ranked teams for a specific week/poll
- `getRankingsAllWeeks(season, poll)` — Fetch all weeks for bumps chart
- `getAvailablePolls(season)` — Get distinct polls for a season
- `getLatestWeek(season, poll)` — Get most recent week with rankings
- Join with `teams_with_logos` for logo/color enrichment and `records` for W-L

### Task 2: Rankings Page Route
**File:** `src/app/rankings/page.tsx` (new)
**Work:**
- Server component fetching initial data
- Pass data to RankingsClient

### Task 3: RankingsClient Component
**File:** `src/components/rankings/RankingsClient.tsx` (new)
**Work:**
- Poll selector (AP Top 25, Coaches Poll, CFP Rankings)
- Season selector
- Week selector (with arrows for prev/next)
- State management for selections
- Re-fetch on selection change

### Task 4: PollTable Component
**File:** `src/components/rankings/PollTable.tsx` (new)
**Work:**
- Rank column with rank number
- Movement badge (▲ green, ▼ red, — neutral, NEW for unranked→ranked)
- Team name with logo and primary color
- Conference
- Record (from `records` table)
- Points (with first-place votes for #1)
- Click row → team detail page
- Calculate movement by comparing current week rank to previous week

### Task 5: BumpsChart Visualization
**File:** `src/components/rankings/BumpsChart.tsx` (new)
**Work:**
- D3 bumps/rank chart (inverted y-axis: 1 at top, 25 at bottom)
- Lines connecting each team's rank across weeks
- Team color for lines; hover highlights a team
- roughjs strokes for hand-drawn aesthetic (consistent with scatter plot)
- Responsive width
- Click team label → team detail page
- Show only teams that were ranked at least once

### Task 6: Quarter Scores Component
**File:** `src/components/game/QuarterScores.tsx` (new)
**Work:**
- Horizontal table: team names as rows, quarters as columns
- Winner row bolded
- Final column with total score
- Handle OT (extra columns beyond 4)

### Task 7: Quarter Scores Query
**File:** `src/lib/queries/games.ts` (update)
**Work:**
- `getGameLineScores(gameId)` — Fetch home/away line scores
- Join via `_dlt_parent_id` from `core.games` to `core.games__home_line_scores` / `core.games__away_line_scores`
- Return `{ home: number[], away: number[] }`

### Task 8: Integrate Quarter Scores into Game Detail
**File:** `src/app/games/[id]/page.tsx` (update)
**Work:**
- Fetch line scores alongside box score
- Render QuarterScores between GameScoreHeader and GameBoxScore

### Task 9: Update Sidebar Navigation
**File:** `src/components/Sidebar.tsx` (update)
**Work:**
- Add Rankings nav item (Trophy icon from Phosphor)
- Position between Games and Analytics

### Task 10: Update Dashboard StandingsWidget
**File:** `src/components/dashboard/StandingsWidget.tsx` (update)
**Work:**
- Add small "View AP Top 25 →" link to `/rankings`
- Keep existing composite ranking as the default display

---

## Parallel Execution Plan

**Wave 1 (no file conflicts):**
- Task 1 (Rankings queries) — new file
- Task 5 (BumpsChart) — new file
- Task 6 (QuarterScores component) — new file
- Task 7 (Line scores query) — update games.ts

**Wave 2 (depends on Wave 1):**
- Task 2 (Rankings page route) — needs queries
- Task 3 (RankingsClient) — needs queries
- Task 4 (PollTable) — needs queries
- Task 8 (Integrate quarter scores) — needs component + query

**Wave 3 (finishing touches):**
- Task 9 (Sidebar nav update)
- Task 10 (Dashboard widget link)

---

## Types

```typescript
// src/lib/types/database.ts additions

interface PollRanking {
  rank: number
  school: string
  conference: string
  first_place_votes: number
  points: number
  season: number
  week: number
  poll: string
}

interface EnrichedPollRanking extends PollRanking {
  logo: string | null
  color: string | null
  wins: number
  losses: number
  prev_rank: number | null  // null = previously unranked
  movement: number | null   // positive = moved up, negative = moved down, null = new
}

interface LineScores {
  home: number[]
  away: number[]
}
```

---

## Validation

After all tasks complete:
1. `npm run typecheck` — no errors
2. `npm run test` — all tests pass
3. `npm run lint` — clean
4. `npm run build` — successful production build
5. Manual: Navigate to `/rankings`, switch polls/weeks/seasons
6. Manual: Check bumps chart renders with roughjs aesthetic
7. Manual: Check quarter scores on game detail pages
8. Manual: Verify mobile responsiveness on all new components

---

## Acceptance Criteria

- [ ] `/rankings` route displays AP Top 25 (default) for latest week
- [ ] Poll, season, and week selectors work correctly
- [ ] PollTable shows rank, movement, team logo/name, conference, record, points
- [ ] BumpsChart shows rank trajectories with hand-drawn lines
- [ ] Clicking a team in either view navigates to team detail
- [ ] Quarter scores visible on game detail pages
- [ ] Sidebar includes Rankings link
- [ ] All components are mobile-responsive
- [ ] Build passes with no new errors
