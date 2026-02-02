# Analytics Views Expansion Plan

**Created:** 2026-02-02
**Status:** Research Phase
**Priority:** Next Session

## Session Summary (2026-02-02)

### Completed
- Team Analytics scatter plot at `/analytics`
- Three plot types: EPA vs Success Rate, Offense vs Defense Rank, Run vs Pass EPA
- Team logos as markers (ESPN CDN via `teams_with_logos` view)
- Contextual quadrant labels per plot type
- Conference filtering
- Team search/highlight with dimming
- Logos/Colors toggle
- FBS-only filtering (eliminates placeholder logos)
- Mouse-following tooltips with glow effects

### Current Tech
- Custom SVG scatter plots (no chart library)
- Supabase views: `teams_with_logos`, `team_epa_season`, `team_style_profile`
- CSS custom properties for theming

---

## Next Session: Research Phase

### 1. Audit Available Data
Before building new views, inventory what's in the database:

```sql
-- What tables/views exist?
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema IN ('public', 'stats', 'metrics', 'ratings')
ORDER BY table_schema, table_name;

-- What metrics are available per team per season?
-- Check team_epa_season, team_style_profile columns
-- Check for player-level stats
-- Check for game-level data
```

### 2. Research Questions
- What advanced metrics exist beyond EPA? (PPA, SP+, FEI, etc.)
- Do we have week-by-week data for trajectory charts?
- Do we have opponent-adjusted metrics?
- What recruiting/roster data could inform analytics?
- Do we have play-by-play for custom aggregations?

### 3. Competitive Analysis
Look at what other CFB analytics sites offer:
- ESPN FPI / SP+ rankings
- PFF grades
- Bill Connelly's SP+ components
- cfbfastR typical visualizations

---

## Potential New Analytics Views

### A. Team Rankings Dashboard
- Sortable table with multiple metrics
- Sparklines for trend
- Conference averages comparison

### B. Conference Comparison
- Box plots or violin plots by conference
- Conference strength over time

### C. Team Trajectory / Week-by-Week
- Line chart showing EPA/game progression
- Compare to previous season
- Highlight key games (ranked opponents, rivalry)

### D. Matchup Predictor
- Head-to-head comparison
- Strength vs weakness overlay
- Historical matchup data

### E. Recruiting Impact
- Correlation between recruiting rank and performance
- Transfer portal impact

### F. Player-Level Analytics
- Top performers by EPA added
- Position group breakdowns
- Usage vs efficiency

---

## Research Deliverables

Before writing code, the next session should produce:

1. **Data Inventory** - List of available tables, key columns, row counts
2. **Metric Definitions** - What each metric means, how it's calculated
3. **View Priorities** - Ranked list of which views to build first
4. **Data Gaps** - What's missing that would enable better analytics
5. **Schema Diagram** - How tables relate (if complex)

---

## Notes
- Keep custom SVG approach (no heavy chart libraries)
- Maintain design system (CSS variables, minimal aesthetic)
- Consider mobile responsiveness for new views
- Think about URL structure for deep linking to specific views/filters
