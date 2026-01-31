# Historical Trajectory Chart Redesign

## Overview

Enhance the Historical Trajectory chart with better styling, more metrics, metric definitions, and comparative lines for conference and FBS averages.

## Requirements

1. **More metrics** - Dropdown with all available metrics (8 total)
2. **Metric definitions** - Inline subtitle showing definition when metric selected
3. **Comparison lines** - Team vs Conference avg vs FBS avg
4. **Better styling** - Gradient fills, smooth curves, improved hover states

## Data Sources

### Team Data
- Table: `team_season_trajectory`
- Available: 2020-2024 (backfill needed for earlier years)

### Conference/FBS Averages
- Need new RPC: `get_trajectory_averages(p_conference, p_season_start, p_season_end)`
- Returns: season, metric averages for conference and FBS

## Metrics

| ID | Label | Field | Definition | Invert? |
|----|-------|-------|------------|---------|
| wins | Wins | wins | Total wins for the season | No |
| win_pct | Win % | win_pct | Percentage of games won | No |
| epa | EPA/Play | epa_per_play | Expected points added per play | No |
| success | Success Rate | success_rate | Percentage of plays with positive EPA | No |
| off_rank | Off EPA Rank | off_epa_rank | Offensive efficiency ranking among FBS | Yes |
| def_rank | Def EPA Rank | def_epa_rank | Defensive efficiency ranking among FBS | Yes |
| recruiting | Recruiting | recruiting_rank | 247Sports composite recruiting rank | Yes |
| epa_delta | EPA Δ | epa_delta | Year-over-year change in EPA/play | No |

## Visual Design

### Chart Lines
1. **Team** - Solid 3px, `--color-run`, gradient fill underneath
2. **Conference avg** - Dashed 2px, `--text-muted`
3. **FBS avg** - Dotted 1.5px, `--border`

### Styling
- Smooth curve interpolation (cubic bezier between points)
- Hollow circle data points, filled on hover
- Horizontal grid lines only, very light
- Auto-scaled Y-axis with nice round numbers

### Hover Interaction
- Vertical crosshair at hovered season
- Tooltip card with all three values:
  ```
  2023
  Alabama: 12 wins
  SEC avg: 7.2 wins
  FBS avg: 6.1 wins
  ```

### Legend
- Below chart, horizontal
- Clickable to toggle line visibility

## Component Structure

```
TrajectoryChart
├── MetricDropdown (select metric + shows definition)
├── ChartSVG
│   ├── GridLines
│   ├── YAxis
│   ├── XAxis (seasons)
│   ├── FBSLine (dotted)
│   ├── ConferenceLine (dashed)
│   ├── TeamLine (solid + gradient fill)
│   ├── DataPoints
│   └── HoverCrosshair + Tooltip
└── Legend (toggleable)
```

## Data Flow

1. Server component fetches:
   - Team trajectory (existing)
   - Conference averages (new RPC)
   - FBS averages (new RPC)

2. Pass all three datasets to TrajectoryChart

3. Client component handles:
   - Metric selection state
   - Hover state
   - Line visibility toggles

## Implementation Tasks

1. Create `get_trajectory_averages` RPC in Supabase
2. Update page.tsx to fetch averages
3. Rewrite TrajectoryChart component with new design
4. Add metric dropdown with definitions
5. Implement hover tooltip
6. Add toggleable legend
7. Test and polish animations
