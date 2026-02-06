# Game Detail Page Expansion — Implementation Plan

**Date:** 2026-02-06
**Branch:** `feature/game-detail-expansion`
**Brainstorm:** `docs/brainstorms/2026-02-06-game-detail-expansion-brainstorm.md`

## Overview

Expand `/games/[id]` from a basic box score page into a full game story experience with scoring timeline, drive chart, play-by-play, and game-specific situational splits. Fix the broken Player Leaders section first.

---

## Sprint 1: Foundation & Player Leaders Fix

**Goal:** Fix existing broken state, create database RPCs, add data fetching layer.

### Task 1.1: Fix Player Leaders Schema Reference
**Files:** `src/lib/queries/games.ts`
**Change:** Replace `.schema('core_staging')` with `.schema('core')` in `getGamePlayerLeaders()` (lines 279, 289, 301, 315, 329). The tables were migrated to `core` schema; `core_staging` no longer exists.
**Note:** Player stats are only loaded through 2024 season. The 2025 game (401754614) will still show "unavailable" because the data pipeline hasn't loaded 2025 `game_player_stats` yet. This is a data gap, not a code bug — the graceful fallback is correct.
**Validation:** Test with a 2024 game (e.g., id in 401628319-401729867 range) to verify player leaders render.

### Task 1.2: Create Game-Level Database RPCs
**Files:** New SQL functions in Supabase (via `apply_migration`)

**RPC 1: `get_game_drives(p_game_id BIGINT)`**
Returns all drives for a game ordered by drive_number. Columns: drive_number, offense, defense, start_period, start_yards_to_goal, end_yards_to_goal, plays, yards, drive_result, scoring, start_offense_score, end_offense_score, start_defense_score, end_defense_score, start_time_minutes, start_time_seconds, elapsed_minutes, elapsed_seconds, is_home_offense.

**RPC 2: `get_game_plays(p_game_id BIGINT)`**
Returns all plays for a game with drive context. Columns: drive_number, play_number, offense, defense, period, clock_minutes, clock_seconds, down, distance, yards_to_goal, yards_gained, play_type, play_text, ppa, scoring, offense_score, defense_score.
Filter out non-play rows (Timeout, End Period, End of Game, Kickoff).

**RPC 3: `get_game_scoring_summary(p_game_id BIGINT)`**
Returns scoring events in order. Derived from drives where scoring=true. Columns: drive_number, period, offense, drive_result, end_offense_score, end_defense_score, is_home_offense, start_time_minutes, yards, plays.

**RPC 4: `get_game_situational_splits(p_game_id BIGINT)`**
Returns down/distance and field position efficiency per team from this game's plays. Columns: team, side (offense/defense), split_type (down_distance/field_position), bucket, play_count, success_count, success_rate, avg_ppa, avg_yards_gained.

**RPC 5: `get_game_red_zone(p_game_id BIGINT)`**
Returns red zone efficiency per team. Derived from drives where start_yards_to_goal <= 20 OR any play within 20. Columns: team, side, trips, touchdowns, field_goals, turnovers, td_rate, scoring_rate.

### Task 1.3: Add TypeScript Types for New Data
**Files:** `src/lib/types/database.ts`
Add interfaces: `GameDrive`, `GamePlay`, `GameScoringEvent`, `GameSituationalSplit`, `GameRedZone`.

### Task 1.4: Add Query Functions & Server Actions
**Files:** `src/lib/queries/games.ts`, `src/app/games/actions.ts`
- Add `getGameDrives(gameId)`, `getGamePlays(gameId)`, `getGameScoringSummary(gameId)`, `getGameSituationalSplits(gameId)`, `getGameRedZone(gameId)` — all cached with `cache()`.
- For drives and plays: query `core.drives` and `core.plays` directly (no RPC needed for MVP — the tables have the data and are already granted). RPCs can be added later for optimization.
- Export new types from server actions file.

### Task 1.5: Update Game Detail Page Data Fetching
**Files:** `src/app/games/[id]/page.tsx`
Add new queries to the `Promise.all()` call. Pass data as props to new client components.

**Validation:** `npm run typecheck` passes. Page loads without errors. New data logged to verify shape.

---

## Sprint 2: Scoring Timeline (3 Tabbed Views)

**Goal:** Add scoring timeline section with step-line, win probability, and momentum tabs.

### Task 2.1: Create Shared GameTabSelector Component
**Files:** `src/components/game/GameTabSelector.tsx`
A reusable tab selector matching the existing tab pattern (TeamTabs style). Generic — takes tab config and renders content via render prop or children. Accessible with `role="tablist"`, `aria-selected`, etc.

### Task 2.2: Build Score Step-Line Chart
**Files:** `src/components/game/ScoringTimeline.tsx`, `src/components/game/ScoreStepLine.tsx`
- Parent `ScoringTimeline` manages tab state, renders selected view.
- `ScoreStepLine`: roughjs SVG chart.
  - X-axis: game time (Q1 start → Q4 end), with quarter dividers.
  - Y-axis: cumulative score.
  - Two step-lines (home/away) colored by team colors.
  - Scoring events marked with dots + labels (e.g., "TD 7-0").
  - Data source: `GameDrive[]` — extract scoring events from drives where `scoring=true`, plot cumulative scores at each event using `start_time_minutes` + `start_period`.
  - Hand-drawn roughjs aesthetic using `useRoughSvg()` hook.
  - Responsive: SVG viewBox scales, no fixed pixel sizes.

### Task 2.3: Build Win Probability Chart
**Files:** `src/components/game/WinProbabilityChart.tsx`
- Clean D3 line chart (not roughjs — needs smooth curves).
- X-axis: game time. Y-axis: 0-100% win probability for home team.
- Win probability heuristic: based on score differential and time remaining.
  - Formula: `wp = 1 / (1 + exp(-(score_diff * time_factor)))` where `time_factor` scales with remaining game time (larger diffs matter less early, more late).
  - Compute at each scoring event + quarter boundaries.
- 50% reference line. Area fill above/below 50% in team colors.
- Tooltip on hover showing score at that point.

### Task 2.4: Build Momentum Area Chart
**Files:** `src/components/game/MomentumChart.tsx`
- roughjs SVG stacked area chart.
- Shows per-quarter scoring differential as filled areas.
- Positive area = home team scoring edge (home color), negative = away team edge (away color).
- Quarter labels on x-axis.
- Simpler visualization — just 4 data points (one per quarter) from line scores.

### Task 2.5: Integrate Scoring Timeline into Page
**Files:** `src/app/games/[id]/page.tsx`
- Add `<ScoringTimeline>` component after QuarterScores.
- Pass drives data, game metadata (team names, colors), and line scores.

**Validation:** All three tabs render. Step-line matches actual scoring events. Responsive on mobile.

---

## Sprint 3: Drive Chart (3 Tabbed Views)

**Goal:** Add drive chart section with horizontal bars, field overlay, and vertical timeline.

### Task 3.1: Build Drive Horizontal Bar Chart
**Files:** `src/components/game/DriveChart.tsx`, `src/components/game/DriveBarChart.tsx`
- Parent `DriveChart` manages tab state.
- `DriveBarChart`: SVG chart with one row per drive.
  - Each drive is a horizontal bar from start_yards_to_goal to end_yards_to_goal.
  - Color-coded by outcome: TD=`var(--color-positive)`, FG=`var(--color-field-goal)`, Punt=`var(--color-neutral)`, Turnover/INT=`var(--color-negative)`, Downs=`var(--color-run)`, End of Half=`var(--color-pass)`.
  - Alternating background rows per team (like play-by-play sheets).
  - Team logo/name on left, drive result + plays/yards on right.
  - Yard markers at top (Own 20, 40, 50, Opp 40, 20, EZ).
  - roughjs bars for hand-drawn feel.

### Task 3.2: Build Drive Field Overlay
**Files:** `src/components/game/DriveFieldOverlay.tsx`
- Reuses existing `FootballField` component as background.
- Overlays drives as arrows/arcs on the field using `yardToX()` helper.
- Color-coded by outcome. Opacity for visual density management.
- Team selector toggle (show home drives, away drives, or both).
- Tooltip on hover showing drive details.

### Task 3.3: Build Drive Vertical Timeline
**Files:** `src/components/game/DriveTimeline.tsx`
- Vertical timeline, top (game start) to bottom (game end).
- Each drive rendered as a card with:
  - Team logo + name
  - Start → End field position
  - Plays, yards, time elapsed
  - Result icon (color-coded)
  - Quarter dividers between periods.
- Alternating left/right alignment per team (home left, away right).
- Scrollable if many drives.

### Task 3.4: Integrate Drive Chart into Page
**Files:** `src/app/games/[id]/page.tsx`
- Add `<DriveChart>` component after ScoringTimeline.
- Pass drives data and game metadata.

**Validation:** All three tabs render correctly. Drives match the raw data. Mobile responsive.

---

## Sprint 4: Play-by-Play Log

**Goal:** Collapsible drive-grouped play-by-play.

### Task 4.1: Build PlayByPlay Container
**Files:** `src/components/game/PlayByPlay.tsx`
- Groups plays by drive_number.
- For each drive, renders a `DriveSection`.
- Scoring drives and turnover drives expanded by default, others collapsed.

### Task 4.2: Build DriveSection Component
**Files:** `src/components/game/DriveSection.tsx`
- Collapsible header showing: drive #, team logo+name, start field position, result badge, plays count, yards, time elapsed.
- Expand/collapse with chevron icon and smooth height animation.
- When expanded, shows list of `PlayRow` components.
- Header background tinted with team color at low opacity.

### Task 4.3: Build PlayRow Component
**Files:** `src/components/game/PlayRow.tsx`
- Single play display: down & distance pill (e.g., "2nd & 7"), yards gained, play type icon, play description text.
- PPA value shown as small colored badge (green=positive, red=negative).
- Scoring plays highlighted with green left border.
- Turnover plays highlighted with red left border.
- Big plays (15+ yards) get a subtle highlight.

### Task 4.4: Integrate Play-by-Play into Page
**Files:** `src/app/games/[id]/page.tsx`
- Add `<PlayByPlay>` component after PlayerLeaders.
- Pass plays data and game metadata.

**Validation:** Drives expand/collapse. Play descriptions match. Scoring plays highlighted correctly.

---

## Sprint 5: Game Situational Splits

**Goal:** Game-specific down/distance, red zone, and field position analysis.

### Task 5.1: Build GameSituationalSplits Container
**Files:** `src/components/game/GameSituationalSplits.tsx`
- Three sub-tabs: Down & Distance, Red Zone, Field Position.
- Uses `GameTabSelector` from Sprint 2.

### Task 5.2: Build Game Down & Distance Grid
**Files:** `src/components/game/GameDownDistance.tsx`
- Reuse visual pattern from existing `DownDistanceHeatmap` component.
- Side-by-side grids for each team (home | away).
- 4 rows (downs 1-4) × 4 columns (distance buckets: 1-3, 4-6, 7-10, 11+).
- Color-coded by success rate.
- Cell shows: play count, success rate, avg PPA.
- Data source: `GameSituationalSplit[]` filtered to `split_type='down_distance'`.

### Task 5.3: Build Game Red Zone Efficiency
**Files:** `src/components/game/GameRedZone.tsx`
- Side-by-side cards for each team.
- Key stats: trips, TDs, FGs, turnovers, TD rate, scoring rate.
- Visual: mini donut chart or horizontal stacked bar showing TD/FG/Failed breakdown.
- roughjs donut for hand-drawn aesthetic.

### Task 5.4: Build Game Field Position Splits
**Files:** `src/components/game/GameFieldPosition.tsx`
- Side-by-side field zone breakdown for each team.
- Zones: Own 1-20, Own 21-50, Opp 49-21, Red Zone (Opp 20-1).
- Per zone: play count, success rate, avg PPA, avg yards gained.
- Visual: horizontal bars or heatmap strip.

### Task 5.5: Integrate Situational Splits into Page
**Files:** `src/app/games/[id]/page.tsx`
- Add `<GameSituationalSplits>` after PlayByPlay.
- Pass splits data and game metadata.

**Validation:** All three sub-tabs render. Values match raw play data. Both teams shown correctly.

---

## Final Page Layout (top to bottom)

```
← Back to Games                              Nov 29, 2025 · Week 14
┌─────────────────────────────────────────┐
│           GameScoreHeader                │  (existing)
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│           QuarterScores                  │  (existing)
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│   Scoring Timeline                       │  NEW
│   [Score Flow] [Win Prob] [Momentum]     │
│   ┌─────────────────────────────────┐   │
│   │    (selected chart view)         │   │
│   └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│   Drive Chart                            │  NEW
│   [Bar Chart] [Field] [Timeline]         │
│   ┌─────────────────────────────────┐   │
│   │    (selected drive view)         │   │
│   └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│           Box Score                      │  (existing)
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│           Player Leaders                 │  (fixed)
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│   Play-by-Play                           │  NEW
│   ▼ Drive 1 — Notre Dame → TD (11p/66y) │
│     1st & 10 | Rush | +8 yds            │
│     2nd & 2  | Pass | +15 yds           │
│     ...                                  │
│   ▶ Drive 2 — Stanford → Punt (3p/4y)   │
│   ▼ Drive 3 — Notre Dame → TD (11p/61y) │
│   ...                                    │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│   Situational Splits                     │  NEW
│   [Down & Distance] [Red Zone] [Field]   │
│   ┌─────────────────────────────────┐   │
│   │    (selected splits view)        │   │
│   └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## Data Access Strategy

**Direct table queries (not RPCs) for MVP:**
The `core.drives` and `core.plays` tables already have `SELECT` granted to `anon`/`authenticated` and contain all needed columns. For the initial implementation, query these tables directly from server components via `.schema('core')`. RPCs can be created later for performance optimization (e.g., if we need computed columns server-side).

**Win probability:** Computed client-side from drive scoring events. No database work needed.

**Situational splits:** Computed client-side from plays data. Each play has `down`, `distance`, `yards_to_goal`, `yards_gained`, `ppa`, `scoring`. Group and aggregate in the component.

This means we only need **Task 1.4** (query functions), not Task 1.2 (RPCs), which reduces sprint 1 scope significantly.

---

## File Summary

### New Files (17)
```
src/components/game/GameTabSelector.tsx        # Reusable tab selector
src/components/game/ScoringTimeline.tsx         # Scoring timeline container
src/components/game/ScoreStepLine.tsx           # Step-line chart (roughjs)
src/components/game/WinProbabilityChart.tsx     # Win probability (D3)
src/components/game/MomentumChart.tsx           # Momentum area (roughjs)
src/components/game/DriveChart.tsx              # Drive chart container
src/components/game/DriveBarChart.tsx           # Horizontal bar chart
src/components/game/DriveFieldOverlay.tsx       # Football field overlay
src/components/game/DriveTimeline.tsx           # Vertical timeline
src/components/game/PlayByPlay.tsx              # Play-by-play container
src/components/game/DriveSection.tsx            # Collapsible drive section
src/components/game/PlayRow.tsx                 # Individual play row
src/components/game/GameSituationalSplits.tsx   # Splits container
src/components/game/GameDownDistance.tsx         # Down & distance grid
src/components/game/GameRedZone.tsx             # Red zone efficiency
src/components/game/GameFieldPosition.tsx       # Field position splits
```

### Modified Files (4)
```
src/lib/queries/games.ts                       # Fix schema ref + add new queries
src/lib/types/database.ts                      # Add new interfaces
src/app/games/[id]/page.tsx                    # Add new sections
src/app/games/actions.ts                       # Export new types
```

---

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| 2025 season has no player stats data | Graceful "unavailable" message (already works). Fix schema ref so 2024 games work. |
| roughjs performance with many SVG elements | Drive chart has ~22 drives max per game — well within performance budget. |
| Win probability heuristic accuracy | Use logistic model with score diff and time remaining. Label as "estimated" in UI. |
| core.plays/drives not granted to anon | Verify grants exist; add if missing (MEMORY.md documents this pattern). |
| Mobile responsiveness for complex charts | SVG viewBox scaling + tab layout prevents horizontal overflow. Test at 375px. |
