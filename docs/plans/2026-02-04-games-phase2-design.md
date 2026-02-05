# Games Page Phase 2 Design

**Date:** 2026-02-04
**Status:** Draft
**Author:** Rob + Claude

## Overview

Enhance the Games browser with improved filtering (year, season phase) and add game detail pages with box scores, analytics, and AI-generated narratives.

---

## Part 1: Games Filter Improvements

### Problem

- Default view shows most recent week (bowls) with only 1 FBS game
- No way to browse historical seasons (26 years of data: 2000-2025)
- Week tabs show all 16 weeks without clear regular/post-season separation

### Solution

Add year selector, phase toggle, and dynamic week tabs.

### Visual Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│  Games                                                  │
│  Browse completed FBS games by week, conference, or team│
├─────────────────────────────────────────────────────────┤
│  [All] [Regular] [Post-Season]          ← Phase toggle  │
├─────────────────────────────────────────────────────────┤
│  [All] [1] [2] [3] ... [14]  |  [Champs] [Bowls]       │
│  ↑ Week tabs (dynamic based on phase)                   │
├─────────────────────────────────────────────────────────┤
│  [2025 ▾]  [All Conferences ▾]  [All Teams ▾]  Clear   │
│  ↑ Year      ↑ Conference         ↑ Team               │
└─────────────────────────────────────────────────────────┘
```

### Filter State

```typescript
interface GamesFilter {
  season: number           // 2000-2025
  phase: 'all' | 'regular' | 'postseason'
  week: number | null      // null = "All" within phase
  conference?: string
  team?: string
}
```

### Phase-to-Weeks Mapping

| Phase | Weeks Shown | Query Filter |
|-------|-------------|--------------|
| `all` | 1-16 (separated) | No week constraint |
| `regular` | 1-14 | `week <= 14` |
| `postseason` | 15-16 (Champs/Bowls) | `week >= 15` |

### Default State

- **Year:** Most recent season with completed games (2025)
- **Phase:** "Regular"
- **Week:** Most recent completed week within regular season (weeks 1-14)

```typescript
// getDefaultWeek() logic
1. Fetch max completed week for the season
2. If max week <= 14 → return that week
3. If max week >= 15 → return 14 (last regular season week)
```

### Behaviors

- Phase toggle controls which weeks appear in week tabs
- "All" phase shows all 16 weeks (with visual separator between regular/post)
- Year dropdown: 2000-2025, descending order
- Year change resets phase to "Regular" and week to that year's latest regular week
- Conference/Team filters persist across year changes
- URL state sync (optional): `?season=2024&phase=regular&week=8&conf=SEC`

---

## Part 2: Game Detail Page

### URL

`/games/[id]`

### Navigation

- Click anywhere on game row in games list → navigates to game detail
- Team name links still navigate to team pages (existing behavior)

### Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  ← Back to Games                  Dec 13, 2025 • Week 16│
├─────────────────────────────────────────────────────────┤
│                                                         │
│   [Logo] Army         16  -  17         Navy [Logo]     │
│          Black Knights    FINAL    Midshipmen           │
│                                                         │
│   Venue: M&T Bank Stadium • Attendance: 45,321          │
├─────────────────────────────────────────────────────────┤
│  BOX SCORE                                              │
│  ┌─────────────────┬─────────┬─────────┐               │
│  │                 │  Army   │  Navy   │               │
│  ├─────────────────┼─────────┼─────────┤               │
│  │ Passing         │ 8/15    │ 12/22   │               │
│  │ Pass Yards      │ 102     │ 156     │               │
│  │ Rush Yards      │ 245     │ 198     │               │
│  │ Total Yards     │ 347     │ 354     │               │
│  │ Turnovers       │ 1       │ 0       │               │
│  │ 3rd Down        │ 4/10    │ 6/12    │               │
│  │ Red Zone        │ 1/2     │ 2/3     │               │
│  │ Penalties       │ 5-45    │ 3-25    │               │
│  │ Possession      │ 28:42   │ 31:18   │               │
│  │ Sacks           │ 2       │ 1       │               │
│  │ Fumbles Lost    │ 0       │ 1       │               │
│  └─────────────────┴─────────┴─────────┘               │
│                                                         │
│  PLAYER LEADERS                                         │
│  Passing:  J. Smith (Navy) - 12/22, 156 yds, 1 TD      │
│  Rushing:  M. Johnson (Army) - 18 car, 112 yds         │
│  Receiving: T. Williams (Navy) - 4 rec, 67 yds, 1 TD   │
├─────────────────────────────────────────────────────────┤
│  ✨ GAME STORY                                          │
│                                                         │
│  Navy's defense bent but didn't break in a classic     │
│  rivalry showdown. Army dominated time of possession   │
│  with their trademark triple-option attack, but a      │
│  crucial fourth-quarter turnover swung momentum...     │
│  [Read more]                                           │
├─────────────────────────────────────────────────────────┤
│  ADVANCED ANALYTICS                     [▼ Expand]      │
│  ┌─────────────────┬─────────┬─────────┐               │
│  │                 │  Army   │  Navy   │               │
│  ├─────────────────┼─────────┼─────────┤               │
│  │ EPA/Play        │ +0.02   │ +0.08   │               │
│  │ Success Rate    │ 42%     │ 48%     │               │
│  │ Explosiveness   │ 1.12    │ 1.24    │               │
│  │ Havoc Rate      │ 8.2%    │ 11.4%   │               │
│  │ Finishing Drives│ 50%     │ 67%     │               │
│  └─────────────────┴─────────┴─────────┘               │
└─────────────────────────────────────────────────────────┘
```

### Content Sections

1. **Score Header** - Teams, logos, final score, date, venue
2. **Box Score** - Full traditional stats (C + D from design)
3. **Player Leaders** - Top passer, rusher, receiver per team
4. **Game Story** - AI-generated narrative (featured section with ✨)
5. **Advanced Analytics** - EPA, success rate, explosiveness (expandable)

---

## Part 3: Data Inventory

### Available Data (Ready to Use)

| Data | Table | Rows | Notes |
|------|-------|------|-------|
| Games | `public.games` | 45,897 | Core game results |
| Teams | `public.teams_with_logos` | 1,899 | Logos, colors, conference |
| Box Scores | `core.game_team_stats*` | 21,044 games | Full team stats per game |
| Drives | `core.drives` | 547,323 | Drive-level data |
| Play-by-play | `core.plays_y*` | Millions | Partitioned by year (2004-2026) |

### Box Score Data Structure

```sql
-- Query pattern for box score
SELECT
  g.id as game_id,
  t.team,
  t.home_away,
  s.category,
  s.stat
FROM core.game_team_stats g
JOIN core.game_team_stats__teams t ON t._dlt_root_id = g._dlt_id
JOIN core.game_team_stats__teams__stats s ON s._dlt_parent_id = t._dlt_id
WHERE g.id = ?
```

Available stat categories:
- `completionAttempts`, `netPassingYards`, `passingTDs`
- `rushingAttempts`, `rushingYards`, `rushingTDs`
- `totalYards`, `firstDowns`
- `thirdDownEff`, `fourthDownEff`
- `turnovers`, `fumblesLost`, `interceptions`
- `possessionTime`, `totalPenaltiesYards`
- `sacks`, `tacklesForLoss`, `qbHurries`
- And more...

### Data Requiring Backfill

| Data | Table | Status | Action |
|------|-------|--------|--------|
| Player game stats | `core.game_player_stats` | Empty (0 rows) | Backfill via cfb-database |
| Game narratives | `public.game_narratives` | Does not exist | Create table + batch job |
| Game-level EPA | TBD | May derive from plays | Compute or backfill |

---

## Part 4: AI Narrative Pipeline

### Overview

Generate engaging game summaries using an LLM "Sports Journalist Agent."

### Generation Timing

**Batch nightly** - Process all newly completed games each night.
- No user-facing latency
- Narratives ready when users visit
- Historical backfill runs in batches (prioritize recent seasons)

### Data Table

```sql
CREATE TABLE public.game_narratives (
  game_id BIGINT PRIMARY KEY REFERENCES public.games(id),
  narrative TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  model_version VARCHAR(50),
  word_count INT
);
```

### Input Data for Generation

- Final score
- Box score stats (from `core.game_team_stats*`)
- Drive summaries (from `core.drives`)
- Key plays (optional, from `core.plays_y*`)
- Team context (rivalry, rankings, conference implications)

### Narrative Style

2-3 paragraphs capturing:
- Game flow and momentum shifts
- Key plays/turning points
- Statistical highlights
- Context (rivalry, playoff implications, etc.)

---

## Part 5: Implementation Tasks

### Phase 2A: Games Filter Improvements

| Task | File | Priority |
|------|------|----------|
| Add `getLatestSeason()` query | `src/lib/queries/shared.ts` | P0 |
| Add `phase` to GamesFilter type | `src/lib/queries/games.ts` | P0 |
| Update games query for phase filtering | `src/lib/queries/games.ts` | P0 |
| Add year dropdown to filter row | `src/components/GamesList.tsx` | P0 |
| Add phase toggle (segmented control) | `src/components/GamesList.tsx` | P0 |
| Make week tabs dynamic based on phase | `src/components/GamesList.tsx` | P0 |
| Update default week logic | `src/lib/queries/games.ts` | P0 |
| URL state sync (optional) | `src/components/GamesList.tsx` | P1 |

### Phase 2B: Game Detail Page

| Task | File | Priority |
|------|------|----------|
| Create game detail route | `src/app/games/[id]/page.tsx` | P0 |
| Add `getGameById()` query | `src/lib/queries/games.ts` | P0 |
| Add box score query (core schema) | `src/lib/queries/games.ts` | P0 |
| Build GameBoxScore component | `src/components/GameBoxScore.tsx` | P0 |
| Make game rows clickable | `src/components/GamesList.tsx` | P0 |
| Add drives query | `src/lib/queries/games.ts` | P1 |
| Build GameAnalytics component | `src/components/GameAnalytics.tsx` | P1 |

### Phase 2C: Player Leaders (Blocked on Backfill)

| Task | File | Priority |
|------|------|----------|
| Backfill `game_player_stats` | cfb-database session | P0 |
| Add player leaders query | `src/lib/queries/games.ts` | P1 |
| Build GameLeaders component | `src/components/GameLeaders.tsx` | P1 |

### Phase 2D: AI Narratives

| Task | File | Priority |
|------|------|----------|
| Create `game_narratives` table | Migration | P0 |
| Design narrative generation prompt | TBD | P0 |
| Build batch job (Edge Function or cron) | `supabase/functions/` | P1 |
| Build GameStory component | `src/components/GameStory.tsx` | P1 |
| Historical backfill script | cfb-database | P2 |

---

## Dependencies

```
Phase 2A (Filters) ─────────────────────────────────> Can start immediately

Phase 2B (Detail Page) ─────────────────────────────> Can start immediately
    └── Box score uses core.game_team_stats (ready)
    └── Drives uses core.drives (ready)

Phase 2C (Player Leaders) ──────────────────────────> Blocked on backfill
    └── Requires core.game_player_stats (empty)

Phase 2D (AI Narratives) ───────────────────────────> Can start design
    └── Generation can use box score + drives
    └── Player stats nice-to-have for richer narratives
```

---

## Open Questions

1. **URL state sync** - Worth the complexity for shareable links?
2. **Analytics derivation** - Compute EPA/success rate from plays on-demand, or pre-compute and store?
3. **Narrative model** - Which LLM to use? Claude, GPT-4, or smaller model for cost?
4. **Historical backfill priority** - Which seasons to generate narratives for first?
