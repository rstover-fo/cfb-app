# Home Dashboard Design

**Date:** 2025-02-02
**Status:** Approved
**Season:** 2025

## Overview

Migrate the current Home page (team browser) to `/teams` and replace `/` with a new dashboard featuring four widgets: Top Movers, Recent Games, Standings, and Stat Leaders.

## Goals

- Give users a reason to return regularly (fresh content on landing)
- Surface interesting data without requiring navigation
- Keep it simple: no auth, localStorage for future personalization

## Layout

```
┌─────────────────────────────────────┐
│  CFB 360 Dashboard    [2025 Season] │
├──────────────────┬──────────────────┤
│  TOP MOVERS      │  RECENT GAMES    │
│  (YoY risers/    │  (Last 5 with    │
│   fallers)       │   scores)        │
├──────────────────┼──────────────────┤
│  STANDINGS       │  STAT LEADERS    │
│  (Top 10 FBS     │  (EPA, Havoc,    │
│   composite)     │   tabs)          │
└──────────────────┴──────────────────┘
```

- 2x2 grid on desktop
- Single column stack on mobile
- Each widget is a card with header + "View All" link

---

## Widget Specifications

### 1. Top Movers

**Purpose:** Show FBS teams with biggest EPA improvement/decline vs prior season.

**Data Source:** `team_season_trajectory` joined with `teams_with_logos` (FBS filter)

**Display:**
| Direction | Team | 2025 EPA | Δ vs 2024 |
|-----------|------|----------|-----------|
| ↑ | Florida State | +0.31 | **+0.26** |
| ↑ | Vanderbilt | +0.43 | **+0.25** |
| ↑ | Utah | +0.34 | **+0.25** |
| ↓ | Nevada | -0.03 | **-0.24** |
| ↓ | Syracuse | +0.02 | **-0.23** |
| ↓ | Massachusetts | -0.04 | **-0.22** |

**Details:**
- Top 3 risers, top 3 fallers (6 rows total)
- Green badge for positive delta, red for negative
- Team logo inline
- Row links to team detail page
- "View All" → Analytics page

---

### 2. Recent Games

**Purpose:** Show last 5 completed FBS games with scores.

**Data Source:** `games` joined with `teams_with_logos` (FBS filter on home_team)

**Display:**
| Matchup | Score | Date |
|---------|-------|------|
| **Indiana** vs Miami | 27-21 | Jan 20 |
| **Indiana** vs Oregon | 56-22 | Jan 10 |
| **Miami** @ Ole Miss | 31-27 | Jan 9 |
| **SMU** vs Arizona | 24-19 | Jan 3 |
| **Wake Forest** @ Miss St | 43-29 | Jan 3 |

**Details:**
- Winner team name bolded
- Both team logos inline
- Conference game badge if applicable
- "View All" → Matchups page (future) or remains disabled

---

### 3. Standings Snapshot

**Purpose:** Show top 10 FBS teams by composite ranking.

**Data Source:** Computed from `team_epa_season`, `defensive_havoc`, `team_special_teams_sos`

**Formula:** 40% Offense + 40% Defense + 20% Special Teams (same as Analytics)

**Display:**
| Rank | Team | Record | Composite |
|------|------|--------|-----------|
| 1 | Team A | 12-2 | 94.2 |
| 2 | Team B | 14-1 | 92.8 |
| ... | | | |
| 10 | Team J | 10-3 | 85.1 |

**Details:**
- Team logo + primary color accent on rank
- Win-loss record from `records` or `team_season_trajectory`
- "View All" → Analytics page (rankings view)

---

### 4. Stat Leaders

**Purpose:** Show top 5 teams in key statistical categories.

**Data Source:** `team_epa_season`, `defensive_havoc`

**Tabs:** `EPA` | `Havoc` | `Success Rate` | `Explosiveness`

**Display (EPA tab example):**
| Rank | Team | Value |
|------|------|-------|
| 1 | Vanderbilt | +0.43 |
| 2 | North Texas | +0.38 |
| 3 | Notre Dame | +0.38 |
| 4 | Oregon | +0.36 |
| 5 | USC | +0.36 |

**Details:**
- Tab switching is client-side (no refetch)
- Compact rows: logo + team name + stat value
- "View All" → Analytics with corresponding scatter plot selected

---

## Data Fetching Strategy

Server component fetches all data in parallel:

```typescript
// app/page.tsx
export default async function Home() {
  const supabase = await createClient()
  const currentSeason = 2025

  const [movers, recentGames, standings, statLeaders] = await Promise.all([
    getTopMovers(supabase, currentSeason),
    getRecentGames(supabase, currentSeason, 5),
    getStandings(supabase, currentSeason, 10),
    getStatLeaders(supabase, currentSeason),
  ])

  return (
    <DashboardGrid
      movers={movers}
      recentGames={recentGames}
      standings={standings}
      statLeaders={statLeaders}
    />
  )
}
```

---

## New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `DashboardGrid` | `components/dashboard/DashboardGrid.tsx` | 2x2 responsive grid container |
| `TopMoversWidget` | `components/dashboard/TopMoversWidget.tsx` | Risers/fallers with delta badges |
| `RecentGamesWidget` | `components/dashboard/RecentGamesWidget.tsx` | Game cards with scores |
| `StandingsWidget` | `components/dashboard/StandingsWidget.tsx` | Ranked list with composite |
| `StatLeadersWidget` | `components/dashboard/StatLeadersWidget.tsx` | Tabbed stat categories |
| `WidgetCard` | `components/dashboard/WidgetCard.tsx` | Shared card wrapper (title, view all link) |

---

## Routing Changes

| Route | Before | After |
|-------|--------|-------|
| `/` | Team browser (filters, search, grid) | New dashboard |
| `/teams` | Only `/teams/[slug]` existed | Team browser (moved from `/`) |
| `/teams/[slug]` | Team detail page | Unchanged |

---

## Migration Steps

1. **Create `/app/teams/page.tsx`**
   - Copy current `app/page.tsx` content
   - Update header from "Teams" to keep consistent

2. **Replace `/app/page.tsx`**
   - New dashboard implementation
   - Import and render widget components

3. **Create widget components**
   - `components/dashboard/` directory
   - Each widget as separate component

4. **Update Sidebar**
   - `/teams` route should now be active when on `/teams` index
   - Home (`/`) active only on exact match

5. **Data utility functions**
   - `lib/queries/dashboard.ts` for widget data fetching

---

## Future Enhancements (Not in Scope)

- **Your Recent Teams** - localStorage tracking of viewed teams
- **Favorites** - Pin teams to dashboard
- **Weekly movers** - Requires weekly snapshot pipeline
- **Upcoming games** - "This week's matchups" widget

---

## Acceptance Criteria

- [ ] `/` displays new dashboard with 4 widgets
- [ ] `/teams` displays team browser (current Home content)
- [ ] All widgets show 2025 season data
- [ ] Widgets link to appropriate detail pages
- [ ] Responsive: 2x2 on desktop, stacked on mobile
- [ ] Sidebar highlights correct route
