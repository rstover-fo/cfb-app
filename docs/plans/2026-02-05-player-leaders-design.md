# Games Phase 2C: Player Leaders

**Date:** 2026-02-05
**Status:** Ready for Implementation
**Author:** Rob + Claude

## Overview

Add a Player Leaders section to the game detail page (`/games/[id]`) showing top performers in Passing, Rushing, Receiving, and Defense for each team. Uses mock data initially, ready to swap to real data when `game_player_stats` tables are populated.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Location | Below Box Score | Natural reading flow, works on mobile |
| Categories | Core 4 (Pass/Rush/Rec/Def) | Covers main stats fans care about |
| Players shown | Top 1, expandable | "Leaders" implies top; expand for depth |
| Stat display | Full stat line | Detail page warrants complete picture |
| Layout | Side-by-side columns | Matches Box Score, easy comparison |

---

## Data Structure

**Database tables (when populated):**
```
core.game_player_stats
  └── __teams (team)
       └── __categories (name: "passing", "rushing", etc.)
            └── __types (name: "C/ATT", "YDS", etc.)
                 └── __athletes (id, name, stat)
```

**TypeScript types:**

```typescript
interface PlayerStat {
  id: string
  name: string
  stats: Record<string, string>  // e.g., { "C/ATT": "18/27", "YDS": "285" }
}

interface TeamLeaders {
  passing: PlayerStat[]
  rushing: PlayerStat[]
  receiving: PlayerStat[]
  defense: PlayerStat[]
}

interface PlayerLeaders {
  away: TeamLeaders
  home: TeamLeaders
}
```

**Stat line formatting by category:**
- Passing: `C/ATT, YDS, TD, INT`
- Rushing: `CAR, YDS, TD`
- Receiving: `REC, YDS, TD`
- Defense: `TCKL, TFL, SACK` (or `TCKL, INT, PD`)

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  PLAYER LEADERS                                             │
├────────────────────────────┬────────────────────────────────┤
│  Navy                      │  Army                          │
├────────────────────────────┼────────────────────────────────┤
│  PASSING                   │  PASSING                       │
│  B. Carter                 │  J. Smith                      │
│  18/27, 285 YDS, 2 TD      │  12/22, 156 YDS, 1 TD          │
│  ▼ Show more               │  ▼ Show more                   │
├────────────────────────────┼────────────────────────────────┤
│  RUSHING                   │  RUSHING                       │
│  M. Johnson                │  T. Williams                   │
│  22 CAR, 145 YDS, 1 TD     │  18 CAR, 98 YDS                │
│  ▼ Show more               │  ▼ Show more                   │
├────────────────────────────┼────────────────────────────────┤
│  RECEIVING                 │  RECEIVING                     │
│  D. Wilson                 │  K. Brown                      │
│  6 REC, 87 YDS, 1 TD       │  4 REC, 62 YDS                 │
│  ▼ Show more               │  ▼ Show more                   │
├────────────────────────────┼────────────────────────────────┤
│  DEFENSE                   │  DEFENSE                       │
│  R. Davis                  │  L. Martinez                   │
│  8 TCKL, 2 TFL, 1 SACK     │  10 TCKL, 1 INT                │
│  ▼ Show more               │  ▼ Show more                   │
└────────────────────────────┴────────────────────────────────┘
```

**Responsive behavior:**
- Desktop (≥640px): Two columns side by side
- Mobile (<640px): Stack vertically, away team first

**"Show more" behavior:**
- Reveals next 2-3 players in that category
- Toggles to "Show less" when expanded
- State is local per category per team

---

## Components

**New files:**
```
src/lib/types/database.ts              → Add PlayerStat, TeamLeaders, PlayerLeaders
src/lib/queries/games.ts               → Add getGamePlayerLeaders() with mock data
src/components/game/PlayerLeaders.tsx  → Main two-column layout
src/components/game/PlayerCategory.tsx → Single category with expand/collapse
```

**Component hierarchy:**
```
PlayerLeaders (props: { leaders: PlayerLeaders, game: GameWithTeams })
  └── PlayerCategory (props: { category: string, players: PlayerStat[], teamName: string })
```

---

## Implementation Tasks

| # | Task | File | Notes |
|---|------|------|-------|
| 1 | Add player leader types | `src/lib/types/database.ts` | `PlayerStat`, `TeamLeaders`, `PlayerLeaders` |
| 2 | Add `getGamePlayerLeaders()` | `src/lib/queries/games.ts` | Mock data now, real query later |
| 3 | Create `PlayerLeaders` component | `src/components/game/PlayerLeaders.tsx` | Two-column layout |
| 4 | Create `PlayerCategory` component | `src/components/game/PlayerCategory.tsx` | Expandable list |
| 5 | Integrate into game page | `src/app/games/[id]/page.tsx` | Add section below box score |
| 6 | Verify build passes | - | No TypeScript errors |

---

## Mock Data Strategy

Until `game_player_stats` tables are populated, `getGamePlayerLeaders()` returns realistic mock data:

```typescript
const MOCK_LEADERS: PlayerLeaders = {
  away: {
    passing: [
      { id: '1', name: 'B. Carter', stats: { 'C/ATT': '18/27', 'YDS': '285', 'TD': '2', 'INT': '1' } },
      { id: '2', name: 'R. Jones', stats: { 'C/ATT': '2/3', 'YDS': '15', 'TD': '0', 'INT': '0' } },
    ],
    rushing: [
      { id: '3', name: 'M. Johnson', stats: { 'CAR': '22', 'YDS': '145', 'TD': '1' } },
      // ...
    ],
    // ... other categories
  },
  home: { /* similar structure */ }
}
```

**Swap to real data:** Update `getGamePlayerLeaders()` to query the dlt hierarchy when data is loaded.

---

## Acceptance Criteria

- [ ] Player Leaders section appears below Box Score
- [ ] Shows 4 categories: Passing, Rushing, Receiving, Defense
- [ ] Displays top player per category for each team
- [ ] "Show more" expands to reveal additional players
- [ ] Full stat line shown for each player
- [ ] Responsive: two columns on desktop, stacked on mobile
- [ ] Build passes with no new errors

---

## Future: Real Data Query

When player stats are loaded, the query will traverse:
```
core.game_player_stats (game_id)
  → __teams (_dlt_parent_id, team, home_away)
    → __categories (_dlt_parent_id, name)
      → __types (_dlt_parent_id, name)
        → __athletes (_dlt_parent_id, id, name, stat)
```

Sort leaders by primary stat (YDS for offense, TCKL for defense).
