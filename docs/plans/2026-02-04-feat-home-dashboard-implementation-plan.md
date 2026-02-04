---
title: "feat: Home Dashboard Implementation"
type: feat
date: 2026-02-04
design_doc: 2025-02-02-home-dashboard-design.md
status: ready
deepened: 2026-02-04
---

# Home Dashboard Implementation Plan

## Enhancement Summary

**Deepened on:** 2026-02-04
**Research agents used:** TypeScript Reviewer, Performance Oracle, Code Simplicity Reviewer, Architecture Strategist, Best Practices Researcher, Framework Docs Researcher, Pattern Recognition Specialist

### Key Improvements
1. **Error handling**: Use `Promise.allSettled()` instead of `Promise.all()` for resilient partial failures
2. **Performance**: Create logo sprite sheet for 3G optimization, add `unstable_cache` with revalidation tags
3. **Architecture**: Wrap each widget in Suspense + ErrorBoundary for independent loading/failure
4. **Simplification**: Consider inlining grid CSS in page.tsx, deferring WidgetCard extraction until patterns emerge

### New Considerations Discovered
- StatLeaders should prefetch all 4 tabs (data is small ~4-8KB total) for instant tab switching
- Logo sprite sheet eliminates 20 HTTP requests - critical for 3G target
- Type definitions should use Supabase generated types, not manual interfaces

---

## Overview

Implement the approved Home Dashboard design: migrate the team browser from `/` to `/teams` and replace `/` with a new dashboard featuring four widgets (Top Movers, Recent Games, Standings, Stat Leaders).

**Design Reference:** [2025-02-02-home-dashboard-design.md](./2025-02-02-home-dashboard-design.md)

## Problem Statement / Motivation

The current home page shows only the team browser, which is static content that doesn't give users a reason to return regularly. A dashboard with dynamic widgets (EPA movers, recent games, rankings) creates a compelling landing experience that surfaces interesting data without requiring navigation.

## Proposed Solution

Build 4-6 new components in `components/dashboard/` and restructure routes:

```
src/
├── app/
│   ├── page.tsx           # NEW: Dashboard with 4 widgets
│   ├── error.tsx          # NEW: Dashboard error boundary
│   └── teams/
│       └── page.tsx       # NEW: Team browser (moved from /)
├── components/
│   └── dashboard/
│       ├── TopMoversWidget.tsx    # EPA risers/fallers
│       ├── RecentGamesWidget.tsx  # Last 5 games
│       ├── StandingsWidget.tsx    # Top 10 composite
│       ├── StatLeadersWidget.tsx  # Server: fetches all tabs
│       ├── StatLeadersTabs.tsx    # Client: tab state only
│       ├── WidgetSkeleton.tsx     # Loading state
│       └── WidgetError.tsx        # Error state
└── lib/
    └── queries/
        └── dashboard.ts           # Cached data fetching functions
```

### Research Insights: Simplification

**Code Simplicity Review findings:**
- Consider **deferring** `DashboardGrid.tsx` and `WidgetCard.tsx` - a 2x2 grid is ~5 lines of Tailwind
- Start with inline styling in widgets; extract shared components only if 3+ identical patterns emerge
- Query functions can live in page.tsx initially; extract when reused elsewhere

**Recommendation:** Ship 4 widget components + page with inline grid. Extract abstractions after v1 is live.

---

## Technical Considerations

### Data Sources

| Widget | Primary Table/View | Join | Filter |
|--------|-------------------|------|--------|
| Top Movers | `team_season_trajectory` | `teams_with_logos` | FBS only |
| Recent Games | `games` | `teams_with_logos` | FBS, completed=true |
| Standings | `team_epa_season` + `defensive_havoc` + `team_special_teams_sos` | `teams_with_logos` | FBS only |
| Stat Leaders | `team_epa_season`, `defensive_havoc` | `teams_with_logos` | FBS only |

### Research Insights: Query Optimization

**Performance Oracle findings:**
- **Combine queries 3 + 4**: Standings and Stat Leaders share data sources - single JOIN query reduces latency
- **Optimal query count**: 3 parallel queries (trajectory, games, combined stats)
- **Caching strategy**:

| Data Type | Revalidate | Trigger |
|-----------|------------|---------|
| Trajectory (Top Movers) | 5 min | Weekly ranking updates |
| Recent Games | 1 min | During live games |
| Standings | 5 min | After game completion |
| Stat Leaders | 5 min | Post-game stat updates |

### Composite Score Formula (Standings)

```typescript
// Use named constants instead of magic numbers
const RANKING_WEIGHTS = {
  offense: 0.4,
  defense: 0.4,
  specialTeams: 0.2,
} as const

function calculateCompositeRank(rankings: {
  offenseRank: number
  defenseRank: number
  specialTeamsRank: number
}): number {
  return (
    rankings.offenseRank * RANKING_WEIGHTS.offense +
    rankings.defenseRank * RANKING_WEIGHTS.defense +
    rankings.specialTeamsRank * RANKING_WEIGHTS.specialTeams
  )
}
```

### Research Insights: Error Handling

**TypeScript Review findings - CRITICAL:**

```typescript
// BAD: Promise.all fails entirely if ANY query fails
const [movers, games, standings, leaders] = await Promise.all([...])

// GOOD: Promise.allSettled allows partial success
const results = await Promise.allSettled([
  getTopMovers(supabase, currentSeason),
  getRecentGames(supabase, currentSeason, 5),
  getStandings(supabase, currentSeason, 10),
  getStatLeaders(supabase, currentSeason),
])

const extractResult = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
  result.status === 'fulfilled' ? result.value : fallback

const movers = extractResult(results[0], [])
const games = extractResult(results[1], [])
// ... widgets render with whatever data succeeded
```

### Existing Patterns to Follow

| Pattern | Source | Notes |
|---------|--------|-------|
| Server data fetching | [analytics/page.tsx:20-41](src/app/analytics/page.tsx#L20-L41) | `Promise.all()` with Supabase |
| Card styling | [globals.css:131-142](src/app/globals.css#L131-L142) | `.card` class |
| Tab navigation | [TeamPageClient.tsx:97-123](src/components/team/TeamPageClient.tsx#L97-L123) | Active/inactive states |
| Trend indicators | [MetricsCards.tsx:22-62](src/components/team/MetricsCards.tsx#L22-L62) | TrendUp/TrendDown icons |
| Game row display | [ScheduleView.tsx:15-83](src/components/team/ScheduleView.tsx#L15-L83) | Logo + score + date |

### Empty State Handling

Each widget shows a "No data available" message when:
- API returns empty result
- Season data not yet loaded (off-season)
- Query fails (graceful degradation - other widgets still render)

### Responsive Breakpoint

- **Desktop (≥768px):** 2x2 grid with `grid-cols-2`
- **Mobile (<768px):** Single column with `grid-cols-1`

### Research Insights: Performance (3G Target)

**Performance Oracle budget analysis:**

```
3G Connection Profile:
- Bandwidth: ~400 kbps (50 KB/s)
- RTT: ~400ms
- Target: <2000ms to meaningful paint

Budget:
├── DNS + TCP + TLS: ~600ms
├── HTML shell: ~200ms
├── Critical CSS: ~100ms
├── JS hydration: ~300ms
└── Data fetch: ~400ms (server-side)
    ─────────────────────
    Total: ~1600ms ✓
```

**Critical optimizations:**

1. **Logo sprite sheet** - Single HTTP request vs 20 requests
```tsx
// Preload in layout.tsx
<link
  rel="preload"
  href="/logos/sprite.webp"
  as="image"
  type="image/webp"
/>
```

2. **Priority loading for above-fold logos**
```tsx
<Image
  src={`/logos/${teamId}.webp`}
  priority  // Preload top 6 logos
  loading="eager"
/>
```

3. **StatLeaders: Prefetch all 4 tabs** - Data is tiny (~4-8KB total), instant tab switching is worth it

---

## Acceptance Criteria

### Functional Requirements

- [ ] `/` displays new dashboard with 4 widgets
- [ ] `/teams` displays team browser (current Home content)
- [ ] All widgets show 2025 season data
- [ ] Top Movers shows 3 risers + 3 fallers with EPA delta
- [ ] Recent Games shows last 5 completed FBS games with scores
- [ ] Standings shows top 10 teams by composite ranking
- [ ] Stat Leaders has 4 tabs (EPA, Havoc, Success Rate, Explosiveness)
- [ ] Clicking team row navigates to `/teams/[slug]`
- [ ] "View All" links navigate to Analytics page

### Non-Functional Requirements

- [ ] Dashboard loads in <2s on 3G connection
- [ ] Widgets render independently (one failure doesn't block others)
- [ ] Responsive: 2x2 on desktop, stacked on mobile
- [ ] Sidebar highlights correct route (`/` = Home, `/teams` = Teams)
- [ ] Touch targets ≥44x44px on mobile
- [ ] Color contrast meets WCAG AA for riser/faller indicators

### Quality Gates

- [ ] TypeScript strict mode passes
- [ ] No console errors in browser
- [ ] Lighthouse accessibility score ≥90

---

## Implementation Tasks

### Phase 1: Route Migration

**Goal:** Move team browser to `/teams` without breaking existing functionality.

```
[x] 1.1 Create /app/teams/page.tsx
      - Copy content from current /app/page.tsx
      - Update any hardcoded "/" references
      - Test team browser works at new route

[x] 1.2 Update Sidebar navigation
      - Sidebar already had correct navigation setup
      - No changes needed
```

### Phase 2: Dashboard Infrastructure

**Goal:** Build data layer and shared components.

```
[x] 2.1 Create lib/queries/dashboard.ts with caching
      - Used React `cache` function for request deduplication
      - Avoids `unstable_cache` + cookies conflict

[x] 2.2 Create components/dashboard/WidgetSkeleton.tsx
      - Matches widget content structure
      - Shimmer animation

[x] 2.3 Create components/dashboard/WidgetError.tsx
      - Error message with retry button
      - Graceful fallback UI
```

### Phase 3: Widget Implementation

**Goal:** Build each widget with Suspense boundaries.

```
[x] 3.1 Create TopMoversWidget.tsx
      - Display 3 risers (green ↑) + 3 fallers (red ↓)
      - Show team logo, name, current EPA, delta vs prior season
      - Row links to /teams/[slug]
      - "View All" → /analytics

[x] 3.2 Create RecentGamesWidget.tsx
      - Display last 5 completed FBS games
      - Show both team logos, score (winner bolded), date
      - Conference game badge if applicable
      - "View All" disabled (future feature)

[x] 3.3 Create StandingsWidget.tsx
      - Display top 10 teams by composite ranking
      - Show rank, logo, team name, record, composite score
      - Row links to /teams/[slug]
      - "View All" → /analytics (rankings view)

[x] 3.4 Create StatLeadersWidget.tsx (Server) + StatLeadersTabs.tsx (Client)
      - Server component fetches all 4 categories
      - Client component handles tab state only
      - Display top 5 teams per category
      - "View All" → /analytics
```

### Phase 4: Dashboard Page Assembly

**Goal:** Wire everything together with independent error boundaries.

```
[x] 4.1 Replace /app/page.tsx
      - Dashboard with Suspense boundaries per widget
      - 2x2 responsive grid layout

[x] 4.2 Create /app/error.tsx for route-level errors

[ ] 4.3 Add TypeScript types using Supabase generated types (deferred - existing types work)
```

### Phase 5: Polish & Testing

**Goal:** Ensure quality and responsiveness.

```
[ ] 5.1 Create logo sprite sheet (deferred - future optimization)

[x] 5.2 Verify responsive behavior
      - Grid layout switches at sm breakpoint (640px)

[x] 5.3 Build and lint pass
      - TypeScript strict mode passes
      - ESLint passes (no errors in new code)

[ ] 5.4 Performance verification (to be done post-deploy)
```

---

## Dependencies & Risks

### Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| `team_season_trajectory` view | Exists | Has EPA delta calculation |
| `teams_with_logos` view | Exists | Has logo URLs |
| Composite ranking logic | Exists | Used in Analytics page |
| react-error-boundary | Need to add | `npm i react-error-boundary` |

### Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Off-season empty data | Medium | Empty state messaging ready |
| Route migration breaks bookmarks | Low | Users will navigate to /teams |
| Performance with 4 parallel queries | Low | Server-side rendering + caching |
| Single query failure crashes dashboard | Medium | Use `Promise.allSettled()` + per-widget ErrorBoundary |

---

## Success Metrics

- Dashboard renders all 4 widgets with real 2025 data
- Page load time <2s (measured via Lighthouse on 3G throttle)
- Zero console errors
- Sidebar correctly highlights active route
- Partial failures don't crash entire dashboard

---

## References & Research

### Internal References

- Design document: [2025-02-02-home-dashboard-design.md](./2025-02-02-home-dashboard-design.md)
- Analytics expansion: [2025-02-02-analytics-expansion.md](./2025-02-02-analytics-expansion.md)
- Data fetching pattern: [src/app/analytics/page.tsx:20-41](../src/app/analytics/page.tsx#L20-L41)
- Card styling: [src/app/globals.css:131-142](../src/app/globals.css#L131-L142)

### External References

- [Next.js Parallel Data Fetching](https://nextjs.org/docs/app/getting-started/fetching-data) - Promise.all pattern
- [Next.js Error Handling](https://nextjs.org/docs/app/getting-started/error-handling) - error.tsx boundaries
- [Next.js Caching](https://nextjs.org/docs/app/getting-started/caching-and-revalidating) - unstable_cache
- [Supabase SSR Setup](https://supabase.com/docs/guides/auth/server-side/creating-a-client) - @supabase/ssr
- [Supabase Type Generation](https://supabase.com/docs/guides/api/rest/generating-types)

### Data Sources

- `team_season_trajectory` - EPA by season with prior year comparison
- `team_epa_season` - Current season EPA metrics
- `defensive_havoc` - Defensive pressure metrics
- `team_special_teams_sos` - Special teams rankings
- `games` - Game results with scores
- `teams_with_logos` - Team metadata with ESPN logo URLs
