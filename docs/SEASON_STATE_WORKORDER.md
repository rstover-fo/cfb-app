# Work order for cfb-database: `api.season_state`

**From:** cfb-app
**Date:** 2026-09-04
**Companion to:** `docs/plans/2026-09-04-1715-feat-season-rollover-plan.md` (why cfb-app needs this)
**Audience:** whoever is working in the cfb-database repo.

## Why

cfb-app used to hardcode the current season (`CURRENT_SEASON = 2025`) and was a year stale in
Week 2 of 2026 while the Discord bot had rolled over on its own calendar rule. cfb-app now
resolves the season from the warehouse: **the newest season with at least one completed game**,
plus the highest completed week. Today it computes that with three small PostgREST calls
against `public.games`. That works, but the definition belongs with the data, and the view
below also gives every consumer the same `through_week` and `is_complete` without re-deriving
them.

Until the view ships, cfb-app falls back to the `games` query automatically. Nothing on the
cfb-app side is blocked on this; it is a consolidation, not a prerequisite.

## The view

One row per season present in `games`, newest first when ordered by `season DESC`.

| Column | Type | Definition |
|---|---|---|
| `season` | int | From `games.season` |
| `games_total` | int | `COUNT(*)` for the season |
| `games_completed` | int | `COUNT(*) FILTER (WHERE completed)` |
| `through_week` | int, nullable | `MAX(week) FILTER (WHERE completed)`; NULL when nothing has been played |
| `first_kickoff` | timestamptz, nullable | `MIN(start_date)` for the season |
| `last_completed_at` | timestamptz, nullable | `MAX(start_date) FILTER (WHERE completed)` |
| `is_live` | bool | `games_completed > 0 AND games_completed < games_total` |
| `is_complete` | bool | `games_total > 0 AND games_completed = games_total` |

cfb-app reads: `season`, `through_week`, `is_live`, ordered by `season DESC`, filtered to
`games_completed > 0`, `LIMIT 1`. The other columns are for the dashboard's freshness stamp
and for future consumers.

## Conventions (same as the expansion work order)

- One file at `src/schemas/api/NNN_season_state.sql`, next number after `052`.
- Thin passthrough over a `marts.season_state` object built from `stats`/`core` games, or a
  direct aggregate over the same source `api.game_detail` reads from; either is fine as long as
  the `completed` semantics match `public.games.completed` (true once a final score lands).
- Owner-rights, not `security_invoker`, so `analyst_ro` and the bot can read it.
- End with the exact line `GRANT SELECT ON api.season_state TO anon, authenticated;`.
- A re-runnable `validation_season_state.sql` asserting: exactly one row per season; `through_week`
  NULL only when `games_completed = 0`; `is_live` and `is_complete` never both true; the 2025 row
  is `is_complete = true` with `through_week = 16`.
- Add `api.season_state` to `docs/SCHEMA_CONTRACT.md` with the column table above.

## What cfb-app will do when it lands

Flip `src/lib/queries/season.ts` to prefer `api.season_state` over the `games` query (the code
path already exists and treats a missing relation as "not shipped"), and extend the sidebar
stamp with `is_complete` wording. No other change.

## Questions

1. Is `games.completed` the right "loaded" signal from your side, or is there a better marker
   (a scores-final flag, a load watermark per season) that the view should use?
2. Does the daily load ever mark games completed before scores are final? If so, cfb-app's
   floors would scale one week early; harmless, but worth knowing.
