# Task Breakdown: Analytics Page Enhancements

*Thank these ambitious features for their enthusiasm. Now let us give each one its own home.*

## Epic Overview

Enhance the `/analytics` page with improved rankings, sortable tables, expanded spider charts, and special teams data. Each task is sized to complete in one focused session without context overflow.

**Total Tasks**: 9
**Estimated Sessions**: 5-6 (some tasks can run in parallel)

**Data Available**: `records` table exists, `games` has ELO and points for SOS derivation

---

## Task 1: Sortable Rankings Table

**Priority**: P1
**Estimated Complexity**: Small
**Blocked By**: None
**Blocks**: None

### Description
Add click-to-sort functionality on the Rankings table columns. Users should be able to sort by Composite, Offense, or Defense to quickly find teams that excel in specific areas.

### Files Likely Involved
- `src/components/analytics/RankedTable.tsx` — add sort state and click handlers
- `src/components/analytics/ScatterPlotClient.tsx` — pass sort config if needed

### Acceptance Criteria
- [ ] Clicking column header sorts ascending, click again for descending
- [ ] Visual indicator shows current sort column and direction
- [ ] Default sort remains Composite DESC
- [ ] Smooth re-render without flicker

### Notes
Keep sorting client-side — data is already loaded. Consider using a small chevron icon for sort direction.

---

## Task 2: Display Actual Ranks in Table

**Priority**: P1
**Estimated Complexity**: Small
**Blocked By**: None
**Blocks**: None

### Description
Show the actual FBS-only rank numbers (Off #12, Def #5) alongside percentile scores. Users want to see "Oklahoma is #8 defense" not just "92% percentile."

### Files Likely Involved
- `src/components/analytics/RankedTable.tsx` — add rank columns to display
- `src/components/analytics/ScatterPlotClient.tsx` — already has `offRank`, `defRank` in rankedTeams

### Acceptance Criteria
- [ ] Table shows Off Rank and Def Rank as separate columns
- [ ] Ranks display as "#X" format
- [ ] Sortable by rank (integrates with Task 1)
- [ ] Hover tooltip explains "Rank among 134 FBS teams"

### Notes
Data already exists in `rankedTeams` — this is pure display work. Can be done in parallel with Task 1.

---

## Task 2B: Add Win-Loss Record to Rankings

**Priority**: P1
**Estimated Complexity**: Small-Medium
**Blocked By**: None
**Blocks**: None

### Description
Add win-loss record column to the Rankings table. Provides context that pure EPA rankings miss — Oklahoma may have lower EPA but a winning record.

### Files Likely Involved
- `src/app/analytics/page.tsx` — fetch records data
- `src/components/analytics/ScatterPlotClient.tsx` — merge records into rankedTeams
- `src/components/analytics/RankedTable.tsx` — display W-L column
- `src/lib/types/database.ts` — add Records type if needed

### Acceptance Criteria
- [ ] Records table shows W-L (e.g., "11-2")
- [ ] Sortable by wins
- [ ] Conference record shown on hover or separate column
- [ ] Handles teams with no records gracefully

### Notes
Check `core.records` table structure. May need `public.records` view. Could also derive from `games` table if records is incomplete.

---

## Task 3: Offense Spider Chart

**Priority**: P2
**Estimated Complexity**: Medium
**Blocked By**: None
**Blocks**: Task 5

### Description
Create a dedicated Offense spider/radar chart with offensive-specific metrics: Rush EPA, Pass EPA, Success Rate, Explosiveness, Red Zone Efficiency.

### Files Likely Involved
- `src/components/analytics/RadarChart.tsx` — may need to generalize or duplicate
- `src/components/analytics/OffenseRadar.tsx` — new component (if separating)
- `src/components/analytics/ScatterPlotClient.tsx` — add offense radar data computation
- `src/lib/types/database.ts` — verify TeamStyleProfile has all needed fields

### Acceptance Criteria
- [ ] Radar chart displays 5-6 offensive metrics
- [ ] Values normalized to 0-100 scale
- [ ] Uses team primary color
- [ ] Tooltip shows actual values on hover

### Notes
Check if we have Red Zone data. If not, substitute with another offensive metric (3rd down conversion, etc.). May need to query additional data.

---

## Task 4: Defense Spider Chart

**Priority**: P2
**Estimated Complexity**: Medium
**Blocked By**: None
**Blocks**: Task 5

### Description
Create a dedicated Defense spider chart with defensive metrics: EPA Allowed, Havoc Rate, Stuff Rate, Pass D Rank, Run D Rank, Turnovers Forced.

### Files Likely Involved
- `src/components/analytics/DefenseRadar.tsx` — new component
- `src/components/analytics/ScatterPlotClient.tsx` — add defense radar data computation
- `src/lib/types/database.ts` — verify DefensiveHavoc has all needed fields

### Acceptance Criteria
- [ ] Radar chart displays 5-6 defensive metrics
- [ ] Lower EPA allowed = higher score on chart (inverted properly)
- [ ] Values normalized to 0-100 scale
- [ ] Uses team primary color with slight variation from offense

### Notes
`defensive_havoc` view has: havoc_rate, opp_epa_per_play, stuff_rate, sacks, interceptions, tfls. Should be sufficient.

---

## Task 5: Combined Radar View Toggle

**Priority**: P2
**Estimated Complexity**: Small
**Blocked By**: Task 3, Task 4
**Blocks**: None

### Description
Add a toggle in the Rankings view to switch between Combined (current), Offense-only, and Defense-only spider charts.

### Files Likely Involved
- `src/components/analytics/ScatterPlotClient.tsx` — add toggle state and conditional rendering
- Potentially new wrapper component for radar selection

### Acceptance Criteria
- [ ] Toggle buttons: Combined | Offense | Defense
- [ ] Smooth transition between chart types
- [ ] Selected team persists across toggle changes
- [ ] Combined view shows current 6-metric radar

### Notes
This is primarily UI wiring — the hard work is in Tasks 3 and 4. Keep it simple.

---

## Task 6: Data Exploration — Special Teams & SOS

**Priority**: P1
**Estimated Complexity**: Small
**Blocked By**: None
**Blocks**: Task 7, Task 8

### Description
Investigate what special teams and strength-of-schedule data exists in cfb-database. Document findings and identify gaps.

### Files Likely Involved
- cfb-database: query existing tables for ST data
- cfb-database: check for SOS/opponent-adjusted metrics
- Document in `docs/data-audit-special-teams.md`

### Acceptance Criteria
- [ ] List all available special teams metrics (FG%, punt avg, return yards, etc.)
- [ ] List all SOS-related data (opponent win %, adjusted metrics)
- [ ] Identify which are in marts vs need to be computed
- [ ] Note any API sources for missing data

### Notes
This is research only — no code changes. Output is documentation that informs Tasks 7 and 8.

---

## Task 7: Special Teams Data Pipeline (if data exists)

**Priority**: P3
**Estimated Complexity**: Medium-Large
**Blocked By**: Task 6
**Blocks**: Task 8

### Description
If Task 6 finds special teams data, create marts and public views to expose it. If data doesn't exist, create pipeline to ingest from CollegeFootballData API.

### Files Likely Involved
- `cfb-database/src/schemas/marts/0XX_special_teams.sql` — new mart
- `cfb-database/src/pipelines/` — new pipeline if needed
- Supabase migration

### Acceptance Criteria
- [ ] `marts.special_teams` materialized view exists
- [ ] `public.special_teams` view exposed for API access
- [ ] Metrics: FG%, punt avg, kickoff touchback %, return avg
- [ ] Indexed and performant

### Notes
Depends entirely on Task 6 findings. May be skipped if data isn't available.

---

## Task 8: Integrate Special Teams into Rankings

**Priority**: P3
**Estimated Complexity**: Medium
**Blocked By**: Task 7
**Blocks**: None

### Description
Add special teams factor to composite ranking formula. Update spider chart to include ST spoke.

### Files Likely Involved
- `src/components/analytics/ScatterPlotClient.tsx` — update ranking formula
- `src/app/analytics/page.tsx` — fetch special teams data
- `src/components/analytics/RadarChart.tsx` — add ST spoke

### Acceptance Criteria
- [ ] Composite = (Off + Def + ST) / 3 or weighted formula
- [ ] Spider chart has Special Teams spoke
- [ ] Rankings shift appropriately for teams with elite/poor ST

### Notes
May want to make ST weight configurable (10%, 20%, etc.) since its impact varies.

---

## Dependency Graph

```
Task 1 (sortable) ←──────────────────────────────┐
Task 2 (show ranks) ←────────────────────────────┤ (parallel, no deps)
                                                 │
Task 3 (offense radar) ─────┐                    │
Task 4 (defense radar) ─────┼──→ Task 5 (toggle) │
                            │                    │
Task 6 (data exploration) ──┼──→ Task 7 (ST pipeline) ──→ Task 8 (integrate ST)
```

## Suggested Session Order

**Session 1**: Tasks 1 + 2 (parallel, both small, quick wins)
**Session 2**: Task 3 (Offense Radar)
**Session 3**: Task 4 (Defense Radar)
**Session 4**: Tasks 5 + 6 (Toggle is small; Data exploration is research)
**Session 5**: Tasks 7 + 8 (if ST data exists)

## Parallel Opportunities

- **Tasks 1 & 2**: Both modify RankedTable, but touch different concerns
- **Tasks 3 & 4**: Independent radar charts, could theoretically parallelize
- **Task 6**: Research task, can happen anytime

---

*Each task now knows exactly what it is. Each sparks clarity, not confusion.*
