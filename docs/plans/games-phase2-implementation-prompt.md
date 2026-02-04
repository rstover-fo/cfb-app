# Games Phase 2 Implementation Prompt

Copy this prompt to start a new Claude Code session:

---

## Session Start Prompt

```
I'm working on CFB 360 App at /Users/robstover/Development/personal/cfb-app

We're implementing Games Phase 2 based on the design doc at docs/plans/2026-02-04-games-phase2-design.md

Current branch: feature/games-phase2

## What to Build

### Phase 2A: Filter Improvements (do this first)

1. **Dynamic season detection** - Replace hardcoded CURRENT_SEASON with getLatestSeason() query
2. **Year dropdown** - Add to filter row, 2000-2025 descending
3. **Phase toggle** - Segmented control [All] [Regular] [Post-Season] above week tabs
4. **Dynamic week tabs** - Show weeks based on phase selection:
   - All: weeks 1-16 (with separator)
   - Regular: weeks 1-14
   - Post-Season: weeks 15-16 (labeled Champs/Bowls)
5. **Smart default** - Default to Regular phase, latest completed regular season week

### Phase 2B: Game Detail Page (after 2A works)

1. **Route** - Create /games/[id]/page.tsx
2. **Make rows clickable** - Link game rows to detail page
3. **Box score query** - Join core.game_team_stats tables (pattern in design doc)
4. **Box score component** - Two-column stat comparison table
5. **Drives query** - Fetch from core.drives for game flow

## Key Patterns

### GamesFilter type update:
```typescript
interface GamesFilter {
  season: number
  phase: 'all' | 'regular' | 'postseason'  // NEW
  week: number | null  // null = "All" within phase
  conference?: string
  team?: string
}
```

### Box score query (already tested):
```sql
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

### Phase-to-weeks mapping:
- regular: week <= 14
- postseason: week >= 15
- all: no week constraint (but show all tabs)

## Files to Modify

- src/lib/queries/shared.ts - Add getLatestSeason()
- src/lib/queries/games.ts - Add phase filter, box score query
- src/components/GamesList.tsx - Year dropdown, phase toggle, dynamic weeks
- src/app/games/[id]/page.tsx - NEW: Game detail page
- src/components/GameBoxScore.tsx - NEW: Box score component

## What's NOT in scope (blocked)

- Player leaders (game_player_stats table is empty, needs backfill)
- AI narratives (separate task)
- Advanced analytics section (can stub it)

Start with Phase 2A filter improvements. Read the design doc first, then implement.
```

---

## Notes for Next Session

- The `public.games` table is the main games table used by the app
- The `core.*` schema has richer data (box scores, drives, plays)
- Team logos/colors come from `teams_with_logos` via the `getTeamLookup()` pattern
- The app uses React Server Components with server actions for data fetching
- Current week detection uses `getCurrentWeek()` which returns the MAX completed week - this is why bowls (week 16) was showing as default
