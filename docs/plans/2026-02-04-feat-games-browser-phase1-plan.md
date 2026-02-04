---
title: "feat: Games Browser - Phase 1 (List Page)"
type: feat
date: 2026-02-04
brainstorm: docs/brainstorms/2026-02-04-games-browser-brainstorm.md
deepened: 2026-02-04
---

# Games Browser - Phase 1: List Page

## Enhancement Summary

**Deepened on:** 2026-02-04
**Research agents used:** kieran-typescript-reviewer, performance-oracle, code-simplicity-reviewer, architecture-strategist, Context7 (Next.js, Supabase)

### Key Improvements
1. Replace `select('*')` with explicit columns for type safety and performance
2. Move all filters to SQL (database-level) instead of JS filtering
3. Simplify scope: defer URL state, ranked filter, skeleton to later iteration
4. Extract `getTeamLookup()` to shared module for reuse

### Considerations Discovered
- Must wrap `useSearchParams` in Suspense boundary
- Supabase `.or()` enables complex team filtering at DB level
- 800 games is manageable client-side, but design for scale

---

## Overview

Build `/games` page to browse completed FBS games with comprehensive filtering. This enables the "View All" link from the dashboard Recent Games widget and establishes the foundation for game detail pages (Phase 2).

## Problem Statement

Users can see the last 5 games on the dashboard but cannot:
- Browse all games from a week or season
- Filter games by conference, team, or ranked matchups
- Find specific historical matchups

The disabled "View All" link signals incomplete functionality.

## Proposed Solution

Create a `/games` route with:
- Week selector (tabs)
- Conference filter (dropdown)
- Team filter (dropdown with ~130 FBS teams)
- Game cards linking to `/games/[id]` (Phase 2)

### Research Insights: Scope Simplification

**Deferred to later iterations (YAGNI):**
- URL state persistence — Use React state first; add if users request sharing
- Ranked filter toggle — Validate need before building ELO-based filter
- Loading skeleton — Spinner first; skeleton is polish
- Game detail stub — Create when building Phase 2

**Why:** Tighter Phase 1 ships faster and validates core use case (browsing by week/conference).

## Technical Approach

### Architecture

```
/games
├── page.tsx              # Server component, fetches initial data
└── GamesListClient.tsx   # Client component with filters

/lib/queries/
├── games.ts              # Query functions
└── shared.ts             # Extract getTeamLookup(), FBS_CONFERENCES (NEW)
```

### Research Insights: Architecture Alignment

**Pattern compliance verified:**
- Server/client split mirrors `/teams` page exactly
- Query layer extension follows established `cache()` pattern
- Component reuse (filter dropdowns, game row) reduces duplication

**Recommendation:** Extract shared utilities before implementation:
```typescript
// /lib/queries/shared.ts
export const getTeamLookup = cache(async () => { ... })
export const FBS_CONFERENCES = [ ... ]
export const CURRENT_SEASON = 2025
```

### Key Patterns to Reuse

| Pattern | Source | Usage |
|---------|--------|-------|
| Query with `cache()` | [dashboard.ts:143](src/lib/queries/dashboard.ts#L143) | Request deduplication |
| `getTeamLookup()` | [dashboard.ts:77](src/lib/queries/dashboard.ts#L77) | Team logos/colors |
| Filter dropdowns | [TeamList.tsx:78](src/components/TeamList.tsx#L78) | Conference selector |
| Tab navigation | [TeamList.tsx:98](src/components/TeamList.tsx#L98) | Week tabs |
| Game row | [RecentGamesWidget.tsx:9](src/components/dashboard/RecentGamesWidget.tsx#L9) | Game display |

### Database Query

```typescript
// src/lib/queries/games.ts
export interface GamesFilter {
  season: number
  week?: number
  conference?: string      // At least one team from this conference
  team?: string            // Exact team name match
}

// Explicit columns - NOT select('*')
const GAME_COLUMNS = `
  id,
  season,
  week,
  start_date,
  home_team,
  away_team,
  home_points,
  away_points,
  home_conference,
  away_conference,
  conference_game,
  completed
` as const

export const getGames = cache(async (filter: GamesFilter): Promise<GameWithTeams[]> => {
  const supabase = await createClient()
  const teamLookup = await getTeamLookup()

  let query = supabase
    .from('games')
    .select(GAME_COLUMNS)
    .eq('season', filter.season)
    .eq('completed', true)
    .not('home_points', 'is', null)
    .order('start_date', { ascending: false })

  // ALL filters at database level
  if (filter.week) {
    query = query.eq('week', filter.week)
  }

  if (filter.conference) {
    query = query.or(`home_conference.eq.${filter.conference},away_conference.eq.${filter.conference}`)
  }

  if (filter.team) {
    query = query.or(`home_team.eq.${filter.team},away_team.eq.${filter.team}`)
  }

  const { data, error } = await query

  if (error) {
    console.error('Games query failed:', error)
    throw new Error(`Failed to fetch games: ${error.message}`)
  }

  // Filter to FBS-only and enrich with team data
  return (data ?? [])
    .filter(g => teamLookup.has(g.home_team) && teamLookup.has(g.away_team))
    .map(g => ({
      ...g,
      homeLogo: teamLookup.get(g.home_team)?.logo ?? null,
      homeColor: teamLookup.get(g.home_team)?.color ?? null,
      awayLogo: teamLookup.get(g.away_team)?.logo ?? null,
      awayColor: teamLookup.get(g.away_team)?.color ?? null,
    }))
})
```

### Research Insights: Query Best Practices

**From TypeScript review:**
- ✅ Use explicit column selection (not `select('*')`)
- ✅ Move filters to SQL with `.or()` for complex conditions
- ✅ Add explicit error handling with typed errors
- ✅ Define return types explicitly

**From Performance review:**
- ✅ Database-level filtering scales better than JS filtering
- ⚠️ Verify indexes exist on `season`, `week`, `home_team`, `away_team`
- Consider adding React Query caching for repeat visits

**Recommended indexes (verify in Supabase):**
```sql
CREATE INDEX IF NOT EXISTS idx_games_season_completed ON games(season, completed);
CREATE INDEX IF NOT EXISTS idx_games_week ON games(week);
CREATE INDEX IF NOT EXISTS idx_games_home_team ON games(home_team);
CREATE INDEX IF NOT EXISTS idx_games_away_team ON games(away_team);
```

### Default View

"Current week" = `MAX(week) WHERE completed = true AND season = current_season`

```typescript
export const getCurrentWeek = cache(async (season: number): Promise<number> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('games')
    .select('week')
    .eq('season', season)
    .eq('completed', true)
    .order('week', { ascending: false })
    .limit(1)
    .single()

  return data?.week ?? 1
})
```

## Acceptance Criteria

### Functional Requirements

- [x] `/games` page displays completed FBS games
- [x] Default view shows current week's games
- [x] Week filter: tabs for weeks 1-15, "Postseason"
- [x] Conference filter: dropdown with all FBS conferences
- [x] Team filter: dropdown with all FBS teams
- [x] Filters combine with AND logic
- [x] Empty state when no games match filters
- [x] "View All" link in dashboard widget navigates to `/games`

### Non-Functional Requirements

- [x] Page loads in < 2s on 3G
- [x] Filters respond in < 200ms (server round-trip)
- [x] Mobile responsive (filters stack vertically)

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/queries/shared.ts` | Create | Extract `getTeamLookup()`, `FBS_CONFERENCES` |
| `src/lib/queries/games.ts` | Create | `getGames()`, `getCurrentWeek()` |
| `src/app/games/page.tsx` | Create | Server component, initial data fetch |
| `src/components/GamesList.tsx` | Create | Client component with filters |
| `src/components/Sidebar.tsx` | Modify | Enable Games nav item |
| `src/components/dashboard/RecentGamesWidget.tsx` | Modify | Enable "View All" link |
| `src/lib/queries/dashboard.ts` | Modify | Import from shared.ts |

## Implementation Tasks

### Task 1: Extract shared utilities
- [x] Create `src/lib/queries/shared.ts`
- [x] Move `getTeamLookup()` from dashboard.ts
- [x] Move `FBS_CONFERENCES` constant
- [x] Update dashboard.ts imports

### Task 2: Create games query module
- [x] Create `src/lib/queries/games.ts`
- [x] Define `GamesFilter` and `GameWithTeams` types
- [x] Implement `getGames(filter)` with explicit columns
- [x] Implement `getCurrentWeek(season)` helper
- [x] Add error handling

### Task 3: Create games list page
- [x] Create `src/app/games/page.tsx`
- [x] Fetch current week and initial games on server
- [x] Pass to client component

### Task 4: Create GamesList client component
- [x] Week filter (tabs for 1-15, "Postseason")
- [x] Conference filter (dropdown)
- [x] Team filter (dropdown)
- [x] React state for filters (not URL state)
- [x] Loading spinner during fetches
- [x] Empty state message

### Task 5: Wire up navigation
- [x] Enable "Games" in Sidebar.tsx (remove `disabled: true`)
- [x] Enable "View All" link in RecentGamesWidget.tsx

### Task 6: Test & polish
- [x] All filter combinations work
- [x] Mobile responsive filters
- [x] Error handling displays user-friendly message

## Research Insights: Implementation Details

### Client Component Pattern

```typescript
// src/components/GamesList.tsx
'use client'

import { useState, useTransition } from 'react'
import { getGames } from '@/lib/queries/games'
import type { GamesFilter, GameWithTeams } from '@/lib/queries/games'

interface GamesListProps {
  initialGames: GameWithTeams[]
  initialWeek: number
  season: number
  conferences: string[]
  teams: string[]
}

export function GamesList({
  initialGames,
  initialWeek,
  season,
  conferences,
  teams
}: GamesListProps) {
  const [games, setGames] = useState(initialGames)
  const [week, setWeek] = useState(initialWeek)
  const [conference, setConference] = useState<string>('')
  const [team, setTeam] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  const handleFilterChange = (newFilter: Partial<GamesFilter>) => {
    startTransition(async () => {
      const filter: GamesFilter = {
        season,
        week: newFilter.week ?? week,
        conference: newFilter.conference ?? conference || undefined,
        team: newFilter.team ?? team || undefined,
      }
      const newGames = await getGames(filter)
      setGames(newGames)
    })
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-4 mb-6">
        {/* Week tabs */}
        {/* Conference dropdown */}
        {/* Team dropdown */}
      </div>

      {/* Loading state */}
      {isPending && <div className="text-center py-4">Loading...</div>}

      {/* Games list or empty state */}
      {games.length === 0 ? (
        <div className="text-center py-8 text-[var(--text-muted)]">
          No games found matching your filters
        </div>
      ) : (
        <div className="space-y-2">
          {games.map(game => <GameRow key={game.id} game={game} />)}
        </div>
      )}
    </div>
  )
}
```

### Performance Optimization (Future)

If performance becomes an issue at scale:
```typescript
// Add React Query for caching
import { useQuery } from '@tanstack/react-query'

const { data: games, isLoading } = useQuery({
  queryKey: ['games', filter],
  queryFn: () => getGames(filter),
  staleTime: 5 * 60 * 1000, // 5 min for current season
})
```

## Success Metrics

- "View All" click-through from dashboard
- Filter usage distribution (which filters are used most)
- Time to find a specific game (user testing)

## Dependencies

- Existing `teams_with_logos` view for team data
- Existing `games` table with conference fields
- Dashboard query patterns

## Risks

| Risk | Mitigation |
|------|------------|
| Large result sets (800+ games/season) | Database-level filtering reduces payload; add pagination if needed |
| Missing team logos | Fallback to colored placeholder (existing pattern) |
| Slow filter response | Use `useTransition` for non-blocking UI; add React Query if needed |

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Conference filter scope | "At least one team" — uses `.or()` in Supabase |
| URL state needed? | Deferred — use React state; add if users request sharing |
| Ranked filter? | Deferred — validate need before building |
| Pagination? | Not needed initially; 800 games is manageable |

## Future Enhancements (Phase 2+)

- URL state persistence for shareability
- Ranked matchups filter (ELO-based)
- Game detail pages (`/games/[id]`)
- React Query caching
- Loading skeletons

## References

- Brainstorm: [2026-02-04-games-browser-brainstorm.md](../brainstorms/2026-02-04-games-browser-brainstorm.md)
- Query patterns: [dashboard.ts](../../src/lib/queries/dashboard.ts)
- Filter patterns: [TeamList.tsx](../../src/components/TeamList.tsx)
- Game display: [RecentGamesWidget.tsx](../../src/components/dashboard/RecentGamesWidget.tsx)
- Next.js useSearchParams: [Next.js Docs](https://nextjs.org/docs/app/api-reference/functions/use-search-params)
- Supabase filtering: [Supabase JS Docs](https://supabase.com/docs/reference/javascript/using-filters)
