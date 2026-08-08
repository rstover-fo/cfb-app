# Expected Points -- consumption reply

**From:** cfb-app
**Date:** 2026-08-08
**Re:** cfb-database `docs/handoffs/2026-08-08-expected-points-handoff.md` (+ its SCHEMA_CONTRACT entry)
**Status:** Shipped and RECONCILED against the handoff text -- `get_expected_points` MCP tool
(tool 25) over `api.expected_points`, a `run_sql` schema-card entry, `ApiSchema.Views` types, a
bot prompt block, and this reply.

A process note up front: the inbound handoff document was not readable from the session that
built the first pass of this consumption (the cfb-database repo attach was pending approval), so
the initial build was established by **live introspection** of the shared warehouse -- the view
definition via `pg_get_viewdef`, the `COMMENT ON` metadata (which is what pointed at the handoff
path), `information_schema.columns`, and verification queries against `api.expected_points`
itself. The handoff text was then relayed by the repo owner and the consumption reconciled
against it same-day -- see "Reconciliation" below. Every claim here carries its SQL so it can be
re-run after any model refresh.

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

## 4. Reconciliation against the handoff text (same-day)

The handoff resolved three of the original four asks and corrected two of cfb-app's inferences;
the consumption was updated accordingly:

- **Bucket boundaries** (was ask 2 -- ANSWERED): down-aware, d1 `standard`(=10)/`short`(<10)/
  `long`(>10)/`goal`; d2-4 `short`(<=3)/`med`(4-6)/`long`(7-10)/`xlong`(>10)/`goal`. cfb-app now
  ships `distanceBucketFor(down, distance, yardsToGoal?)` and the tool accepts a `distance`
  input, so "3rd and 7" maps exactly instead of returning the bucket spread.
- **Era rationale** (was ask 3 -- ANSWERED): rules eras, solved separately per the design doc.
  The same state moves ~15 SE between eras (own-25 1st-and-10: 1.58 -> 1.80), which is now a
  named trap ("never average eras") in the module header, tool description, and schema card.
- **Freshness** (was ask 4 -- ANSWERED): recomputed on demand via the `compute_drive_chain`
  deploy workflow, not on the daily schedule; `computed_at` is the staleness signal. Additive
  changes (new columns, a new open era) will not be announced as breaking.
- **Corrected inference -- `p_turnover`:** cfb-app had written "includes turnover on downs";
  the handoff says "includes defensive-TD turnovers" and does not assert the downs case (the
  exposed outcome probabilities do not sum to 1, so the absorption set is wider than the four
  columns). Wording aligned to the handoff everywhere.
- **Contract text adopted:** NULL `ep_net` renders "not computed" (never 0, never clamped or
  abs()ed, EPA deltas only from `ep_net`); NULL `se_boot` renders "interval unavailable" (never
  +/- 0); intervals-not-verdicts (`ep_drive +/- 2*se_boot`) -- all three now emitted as computed
  caveats / basis text by the tool. The payload's basis block also carries the handoff's
  validation stats (monotonicity pass; P(TD) calibration MAE 0.0072-0.0077; play-level r = 0.86
  vs CFBD ppa against a 0.93 grid ceiling) under the label "house EP v1.5".
- **Rule-2 PostgREST `+` trap -- VERIFIED SAFE for this app's client:** the handoff warns
  `era=eq.2021+` decodes as a space and matches nothing. supabase-js (the app's only PostgREST
  path) encodes it correctly -- verified live on 2026-08-08 with the app's exact query shape:
  `.schema('api').from('expected_points').eq('era', '2021+')` returned `d1|standard|z8`
  (ep_drive 1.7961). Hand-built REST URLs remain on the hook for the encoding.
- **Contract-internal surfaces respected:** `analytics.ep_states` and
  `analytics.drive_chain_transitions` are not read by any cfb-app code; `ep_states` appears in
  this doc and the types file as provenance only. Noted that a drive-sequences (sunburst) mart
  will carry the transitions surface later.
- **Suggested UI uses** (field-position value strip, 4th-down context chip): deliberately NOT in
  this pass -- deferred as a separate task by the repo owner's scope decision. The agent-answers
  use is live via the tool.

## 5. P2 confirmed merged -- and the 4th-down comparison it gates (2026-08-08, later)

The repo owner confirmed P2 (the net next-score basis) merged in cfb-database. Live re-check:
no structural change (same 16 columns, 483 rows, `ep_net` still 100% populated), but the data
was RECOMPUTED at 14:45:40 UTC -- after the 14:05-14:08 batch cited above -- with values in the
same range (`d1|standard|z10` in 2021+: ep_net -0.1226, consistent with the handoff's "own-5,
modern era" illustration). `computed_at` behaving as the staleness signal, as documented.

With P2 in, cfb-app shipped the handoff's P2-gated suggestion at the tool level: a
`fourth_down_decision` block on `get_expected_points` when asked a fully-specified 4th-down
state (down=4 + distance + yards_to_goal). All math on `ep_net` (rule 1):

- **EP(go)** = the d4 state's own `ep_net` (go-conditional = exactly "given they go").
- **EP(punt)** = the **distribution-weighted E[EP(outcome)]** over the era's real punt outcomes
  from the punting zone, from `api.game_drives` (LEFT-join to the next drive): each resulting
  opponent starting ZONE valued at `-ep_net` of the opponent's 1st-and-10 there (touchbacks,
  returns and receiver-kept muffs included), punts returned or blocked for TDs valued at -6.97,
  and kicking-team recoveries valued at `+ep_net` of the average retained spot. Explicitly NOT
  `EP(E[field position])` -- the EP curve is nonlinear across zones, so evaluating it at the
  mean spot would bias the punt value (both points raised by PR #51's automated review and
  adopted); the ~1% of punts that do not transfer possession cleanly are kept, not filtered by
  an inner join. Per-era outcome distributions (with counts) are embedded in
  `src/lib/queries/expected-points.ts` (`PUNT_OUTCOMES_BY_ERA_ZONE`) with the generating SQL in
  the provenance comment. Worked example, live 2026-08-08: 4th-and-2 at midfield in 2021+ --
  EP(go) +1.388 vs distribution-weighted EP(punt) -0.374 (the single-point version said -0.411;
  the ~0.04 correction is Jensen plus tail outcomes), delta +1.76 toward going.
- The block carries its assumptions verbatim, including that the **FG option is not modeled**,
  and caveats a punt side resting on a nearly-extinct punting zone (2021+ zones 1-3 total
  13/35/94 punts -- teams no longer punt from opponent territory; 2004-2013 has thousands of
  those, a nice era artifact).

**Optional ask (5):** if the drive-sequences mart ends up exposing punt outcomes (or a
punt-implied next-state surface lands in `api`), cfb-app will happily swap the embedded
empirical table for the contracted surface -- flagging it here so the need is known.

## 6. Asks (remaining)

1. Update the two stale `ep_net` `COMMENT ON` blocks (finding 2): P2 is merged and `ep_net` is
   populated (the contract changelog says so too), but both comments still say "NULL until P2",
   which misleads anyone introspecting the warehouse. Verified still stale after the P2 merge.
2. (Optional) A contracted punt-implied next-state surface, per §5.

## What cfb-app shipped (2026-08-08)

- `src/lib/queries/expected-points.ts` -- query layer: era/zone/bucket helpers
  (`eraForSeason`, `fieldZoneForYardsToGoal`, `distanceBucketFor`), pinned era vocabulary,
  `McpResult` contract.
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
