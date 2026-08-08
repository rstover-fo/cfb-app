# CFBD CORE ratings -- consumption reply

**From:** cfb-app
**Date:** 2026-08-08
**Re:** cfb-database `docs/handoffs/2026-08-08-core-ratings-for-cfb-app.md` (+ SCHEMA_CONTRACT entry)
**Status:** Shipped -- types, query columns, `run_sql` schema-card entries, and the `query_team`
tool description now carry CORE. No new tool: CORE is a team rating, and the existing
`query_team` / `run_sql` surfaces cover it.

## Verified (live, 2026-08-08)

```sql
SELECT COUNT(*), COUNT(*) - COUNT(DISTINCT (team, season)), MIN(season), MAX(season)
FROM api.core_ratings;
-- 1309 rows, 0 dupes, 2016..2025 -- matches the handoff exactly
```

- `analyst_ro` can SELECT it and the view carries no `security_invoker` flag (checked
  explicitly after the `matchup_forecast` incident).
- `overall = offense - defense` holds to within 0.01 everywhere -- the 346 rows that miss it
  at 2dp are pure independent-rounding drift, not a data problem. Not filed as a finding.
- Lower-better `defense` confirmed empirically: 2025's #1 defense_rank is Texas Tech at
  -26.26.
- Embeds are consistent: `api.team_detail.core_overall` for Ohio State (33.82) matches its
  `core_ratings` row, which is 2025's overall_rank 1. Pre-2016 `team_history` rows carry NULL
  CORE columns, as contracted.
- As-of markers behave: the completed 2025 season reads `through_week = 1,
  through_season_type = 'postseason'` (the final postseason snapshot).

## What cfb-app shipped

- `src/lib/types/api.generated.ts`: `core_ratings` view entry + the three additive columns on
  `team_detail`/`team_history`, each with the NULL-means-not-rated and lower-better-defense
  notes. (This file is hand-transcribed by design -- the handoff's `supabase gen types` step is
  not runnable from this environment; columns were confirmed by live introspection instead.)
- `src/lib/queries/mcp.ts` (`TEAM_DETAIL_COLUMNS`/`TeamDetailRow`) and
  `src/lib/queries/compare.ts` (`TEAM_HISTORY_COLUMNS`): the CORE columns are now selected, so
  `query_team` returns them for both the current-season snapshot and the per-season history.
- `run_sql` schema card: an `api.core_ratings` entry carrying the three traps (2016+ NULLs,
  LOWER-better defense with the exact ORDER BY warning, snapshot semantics), plus CORE columns
  on the `team_detail`/`team_history` lines.
- `docs`: `CLAUDE.md` Key Tables/Views + usage warning.

Deferred (per the handoff's "optional"): UI surfaces (CORE next to SP+/FPI on team pages, a
ratings leaderboard) and a `get_leaderboard` metric for CORE ranks.
