# Phase 3: Situational Analytics - Design Document

**Status:** Approved
**Author:** Rob (Head of Technology)
**Date:** January 30, 2026

---

## Overview

Add a tabbed navigation system to team pages and implement the first situational analytics view: Down & Distance heatmaps with offense/defense side-by-side comparison.

**Goal:** Give analysts and fans a quick visual read on how a team performs in key game situations.

---

## Tab Structure

### Primary Navigation (Team Page)

| Tab | What's in it | Status |
|-----|-------------|--------|
| **Overview** | Metrics, Style Profile, Drive Patterns, Trajectory | Existing |
| **Situational** | Down & Distance, Red Zone, Field Position, etc. | Phase 3 |
| **Schedule** | Game-by-game results, EPA by game, upcoming | Future |
| **Roster** | Player cards, snap counts, top performers | Future |
| **Compare** | Side-by-side with other teams, conference avg | Future |

### Situational Sub-Navigation

```
Situational
├── Down & Distance (Phase 3 - active)
├── Red Zone (future)
├── Field Position (future)
├── Home vs Away (future)
└── vs Conference (future)
```

---

## Down & Distance View

### Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [ Overview ] [ Situational ] [ Schedule ] [ Roster ] [ Compare ]       │
├─────────────────────────────────────────────────────────────────────────┤
│  Down & Distance  |  Red Zone  |  Field Position  |  ...                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────┐  ┌───────────────────────────────┐  │
│  │  OFFENSE                      │  │  DEFENSE                      │  │
│  │         1-3   4-6  7-10  11+  │  │         1-3   4-6  7-10  11+  │  │
│  │  1st    ███   ██░   ██░  █░░  │  │  1st    ██░   ██░   ███  ███  │  │
│  │  2nd    ███   ██░   █░░  █░░  │  │  2nd    ██░   ███   ███  ███  │  │
│  │  3rd    ████  ██░   █░░  ░░░  │  │  3rd    █░░   ██░   ███  ████ │  │
│  │  4th    ████  ███   ██░  █░░  │  │  4th    █░░   █░░   ██░  ███  │  │
│  └───────────────────────────────┘  └───────────────────────────────┘  │
│                                                                         │
│  ░ Below avg    ██ Average    ████ Elite     Hover: 68% · +0.12 EPA    │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Key Situations                                                         │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │  3rd & Short │  │  3rd & Long  │  │  4th Down    │  │  2nd & Long  ││
│  │     1-3 yds  │  │    7+ yds    │  │  Attempts    │  │    7+ yds    ││
│  │     68%      │  │     31%      │  │     14       │  │     42%      ││
│  │   #12 FBS    │  │   #87 FBS    │  │   9 conv.    │  │   #45 FBS    ││
│  │   ▲ +5%      │  │   ▼ -3%      │  │   64% conv   │  │   ═ 0%       ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### Heatmap Specifications

**Grid dimensions:** 4 rows × 4 columns

| Row | Down |
|-----|------|
| 1 | 1st down |
| 2 | 2nd down |
| 3 | 3rd down |
| 4 | 4th down |

| Column | Distance Bucket |
|--------|-----------------|
| 1 | 1-3 yards (short) |
| 2 | 4-6 yards (medium) |
| 3 | 7-10 yards (long) |
| 4 | 11+ yards (very long) |

**Color scale:**
- `--color-negative` (#A65A5A) — Below average performance
- `--bg-surface-alt` (#EDE8DF) — Average performance
- `--color-positive` (#4A7A5C) — Elite performance

**Cell interaction:**
- Hover/focus shows tooltip with: success rate %, EPA per play, play count
- Keyboard accessible (tab through cells)
- Screen reader: aria-label with full context

**Two heatmaps side-by-side:**
- Left: Offensive performance (team's success when they have the ball)
- Right: Defensive performance (team's success stopping opponents)

### Key Situations Cards

Four callout cards highlighting headline situations:

| Card | Situation | Primary Metric |
|------|-----------|----------------|
| 1 | 3rd & Short (1-3 yds) | Conversion rate % |
| 2 | 3rd & Long (7+ yds) | Conversion rate % |
| 3 | 4th Down | Attempts + conversion rate |
| 4 | 2nd & Long (7+ yds) | Success rate % |

**Card contents:**
- Situation label
- Primary metric (big number)
- National rank (#X FBS)
- Trend vs last season (▲ ▼ ═)

Cards show offensive stats. Defense comparison available in heatmap.

---

## Styling

All components use existing editorial design tokens:

- **Tabs:** `border-[1.5px]`, `rounded-sm`, active state with `--color-run` accent
- **Heatmap cells:** `border-[1px]` with `--border`, rounded corners
- **Cards:** Existing `.card` class with hover lift
- **Typography:** `--font-headline` for section headers, `--font-body` for data

---

## Data Requirements

### New RPC: `get_down_distance_splits`

```sql
-- Parameters: team name, season
-- Returns: Aggregated down/distance stats

SELECT
  down,                    -- 1, 2, 3, 4
  distance_bucket,         -- '1-3', '4-6', '7-10', '11+'
  side,                    -- 'offense', 'defense'
  play_count,
  success_rate,            -- 0.0 to 1.0
  epa_per_play,
  conversion_rate,         -- for 3rd/4th down situations
  national_rank            -- optional, for callout cards
FROM down_distance_splits
WHERE team = $1 AND season = $2
ORDER BY side, down, distance_bucket
```

**Distance bucket logic:**
```sql
CASE
  WHEN distance BETWEEN 1 AND 3 THEN '1-3'
  WHEN distance BETWEEN 4 AND 6 THEN '4-6'
  WHEN distance BETWEEN 7 AND 10 THEN '7-10'
  ELSE '11+'
END AS distance_bucket
```

### TypeScript Types

```typescript
interface DownDistanceSplit {
  down: 1 | 2 | 3 | 4
  distance_bucket: '1-3' | '4-6' | '7-10' | '11+'
  side: 'offense' | 'defense'
  play_count: number
  success_rate: number
  epa_per_play: number
  conversion_rate: number | null
  national_rank?: number
}

interface KeySituation {
  label: string
  description: string
  value: number
  format: 'percent' | 'count'
  rank: number
  trend: number  // positive = improved, negative = declined
}
```

---

## Phase 3 Scope

### In Scope

1. **Tab navigation component** — Primary tabs (Overview, Situational, Schedule, Roster, Compare)
2. **Situational sub-navigation** — Down & Distance active, others show "Coming soon"
3. **DownDistanceHeatmap component** — Offense + Defense side-by-side
4. **KeySituationsCards component** — 4 callout cards
5. **Database RPC** — `get_down_distance_splits`
6. **Placeholder content** — Schedule, Roster, Compare tabs

### Out of Scope (Future)

- Red Zone sub-tab
- Field Position sub-tab
- Home vs Away sub-tab
- vs Conference sub-tab
- Schedule tab full implementation
- Roster tab full implementation
- Compare tab full implementation

---

## Accessibility

| Requirement | Implementation |
|-------------|----------------|
| Keyboard navigation | Tab through heatmap cells, arrow keys within grid |
| Screen reader | aria-label on each cell with full context |
| Color-blind safe | Text values visible on hover, not color-only |
| Focus indicators | Visible focus ring on interactive elements |
| Touch targets | Min 44x44px for heatmap cells |

---

## Component Structure

```
src/components/
├── team/
│   ├── TeamTabs.tsx           # Primary tab navigation
│   ├── SituationalView.tsx    # Container for situational content
│   └── KeySituationsCards.tsx # 4 callout cards
├── visualizations/
│   └── DownDistanceHeatmap.tsx # Dual heatmap component
```

```
src/app/teams/[slug]/
├── page.tsx                   # Refactor to use tabs
```
