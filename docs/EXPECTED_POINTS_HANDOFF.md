# Expected Points -- consumption reply

**From:** cfb-app
**Date:** 2026-08-08
**Re:** cfb-database `docs/handoffs/2026-08-08-expected-points-handoff.md` (+ its SCHEMA_CONTRACT entry)
**Status:** Shipped -- `get_expected_points` MCP tool (tool 25) over `api.expected_points`, a
`run_sql` schema-card entry, `ApiSchema.Views` types, a bot prompt block, and this reply.

A process note up front: the inbound handoff document itself was not readable from the session
that built this consumption (the cfb-database repo attach was pending approval), so everything
below was established by **live introspection** of the shared warehouse -- the view definition
via `pg_get_viewdef`, the `COMMENT ON` metadata (which is what pointed at the handoff path),
`information_schema.columns`, and verification queries against `api.expected_points` itself.
Every claim carries its SQL so it can be re-run after any model refresh. If the handoff asserts
anything this reply does not cover (bucket yard boundaries, era rationale, refresh cadence),
those asserts are still unverified by cfb-app -- see the asks.

## 1. Verified surface

```sql
SELECT COUNT(*) AS rows,
       COUNT(DISTINCT era) AS eras,
       COUNT(*) - COUNT(DISTINCT (era, state)) AS dupes_by_era_state,
       COUNT(*) - COUNT(DISTINCT (era, down, distance_bucket, field_zone)) AS dupes_by_dims
FROM api.expected_points;
-- rows: 483, eras: 3, dupes_by_era_state: 0, dupes_by_dims: 0   (2026-08-08)
```

Grain is exactly one row per `(era, state)`, and the view's decoded dimensions
(`down`, `distance_bucket`, `field_zone`) reach the same grain -- no pin-or-duplicate trap here,
unlike `season_outlook`'s `model_version`. Eras: `2004-2013` (157 rows), `2014-2020` (164),
`2021+` (162). `analyst_ro` can read it, and the view does **not** carry
`security_invoker = true` -- checked explicitly, because `api.matchup_forecast` shipped with that
flag and was unreadable by the analyst role until the `matchup_forecast_owner_rights` migration
(2026-08-08) flipped it.

## 2. Finding: the "ep_net is NULL until P2" comments are stale

Both `COMMENT ON` blocks say `ep_net` is NULL until P2 lands:

> `analytics.ep_states`: "... ep_net is NULL until P2 (net next-score basis; the
> CFBD-PPA-comparable one) -- NULL, never 0."
> `api.expected_points`: "... ep_net NULL until the net next-score basis lands (P2)."

The column is fully populated in every era:

```sql
SELECT era, COUNT(*) AS n, COUNT(ep_net) AS ep_net_non_null, COUNT(se_boot) AS se_boot_non_null
FROM api.expected_points GROUP BY era ORDER BY era;
-- 2004-2013: n 157, ep_net 157, se_boot 157
-- 2014-2020: n 164, ep_net 164, se_boot 164
-- 2021+:     n 162, ep_net 162, se_boot 162      (2026-08-08)
```

So P2 evidently landed (or the compute always wrote both bases). **Ask:** update both comments --
they are the discovery surface for anyone introspecting the warehouse, and they currently
instruct consumers to expect a NULL that never occurs. cfb-app's tool documents `ep_net` as
nullable anyway (typed `number | null`), so a future era computed without P2 degrades safely.

## 3. Verified semantics consumed as-is

- `ep_drive` (from `COMMENT ON COLUMN`): absorption probabilities x values
  `{TD 6.97, FG 3, SAFETY -2, TURNOVER_TD -6.97, else 0}`; drive-scoring basis, ignoring the
  field-position handoff.
- `se_boot`: bootstrap SE of `ep_drive`, cluster-resampled by `game_id`; NULL under
  `--no-bootstrap` (currently non-null everywhere).
- `down=4` rows are go-for-it-conditional (view comment). Spot-checked as plausible:
  `d4|short|z8` has `ep_drive 1.53 / ep_net -0.22` vs `d1|standard|z8`'s `1.80 / 0.90`.
- `state` encodes `d{down}|{bucket}|z{zone}`; the view decodes zone deciles as
  `yards_to_goal_min = (zone-1)*10 + 1`, `max = LEAST(zone*10, 99)` -- zone 1 is 1-10 yards
  from the goal, zone 10 is 91-99.
- Bucket vocabulary differs by down: down 1 has `goal/short/standard/long` only ('standard'
  being the ordinary 1st-and-10 state at 30k-77k observations per era); downs 2-4 have
  `goal/short/med/long/xlong` and no `standard`. Verified by grouping the 2021+ era.
- Sparse cells are real: `min(n_obs) = 1` in every era (e.g. `d1|goal|z4` in 2021+, a
  penalty-manufactured 1st-and-goal from the 31-40 decile). The tool flags any returned cell
  under 100 observations and instructs the model to treat it as an anecdote.

## 4. Asks

1. Update the two stale `ep_net` comments (finding 2).
2. Publish the **bucket yard boundaries** (`short`/`med`/`long`/`xlong`, and the exact
   `standard` definition) in the SCHEMA_CONTRACT entry or as `COMMENT ON COLUMN
   distance_bucket`. cfb-app deliberately does not guess them: the tool exposes the bucket enum
   and tells the model to omit the bucket and read the spread when unsure, which works but makes
   "3rd and 7" answerable only approximately.
3. Confirm the **era boundaries' rationale** (2013/2014 and 2020/2021 breaks) so the tool's era
   notes can say why the eras exist rather than just that they do.
4. State the **refresh cadence** for `analytics.ep_states` (all 483 rows were computed
   2026-08-08 14:05-14:08 UTC in one batch). If it recomputes on a schedule, `computed_at` is
   the staleness signal and cfb-app will surface it; if it is one-shot, say so.

## What cfb-app shipped (2026-08-08)

- `src/lib/queries/expected-points.ts` -- query layer: era/zone helpers
  (`eraForSeason`, `fieldZoneForYardsToGoal`), pinned era vocabulary, `McpResult` contract.
- `get_expected_points` (tool 25) in `src/lib/mcp/tools.ts` -- payload carries a `basis` block
  (ep_drive vs ep_net definitions) and computed `caveats` (down-4 conditionality, sparse cells,
  truncation), same structural-honesty pattern as `get_season_outlook`.
- `run_sql` schema-card entry for `api.expected_points` with the no-team-column, down-4, and
  sparse-cell warnings inline.
- `ApiSchema.Views.expected_points` in `src/lib/types/api.generated.ts` (live-introspected
  columns, provenance comment).
- Bot prompt block routing situation-value questions to the tool and keeping team-strength
  questions away from it (`bot/src/claude.ts`), with prompt-level test coverage.
- Docs: `CLAUDE.md` Key Tables/Views + usage warning, `docs/MCP.md` tool section (which also
  corrects that doc's stale claim that `get_season_outlook`'s accuracy block is hardcoded).
