# Warehouse expansion -- cfb-app exposure plan (P1/P2/P3)

**Date:** 2026-08-30
**Status:** Planned. P1 feature work is blocked on cfb-database views.
**Outbound handoff:** `docs/WAREHOUSE_EXPANSION_HANDOFF.md`
**Re:** cfb-database's 2026-08-29/30 expansion (passing charting, player hub, coaching ids,
CFP + realignment, ratings/metrics, `espn` schema)

## The constraint that orders everything

None of the expansion is reachable from this repo today, and no amount of cfb-app code changes
that. Verified live on 2026-08-30 via `run_sql`:

- `run_sql` runs as `analyst_ro` (`current_user = analyst_ro`), which holds `SELECT` on the
  `api` schema only. `SELECT count(*) FROM stats.passing_plays` -> *permission denied for
  schema stats*; same for `ref`.
- `information_schema.tables` shows the api schema is still the pre-expansion 45 views.
- The `anon`/`authenticated` grants do not help the web app either: that path means reading raw
  dlt tables, which `CLAUDE.md` bans and `src/lib/queries/__tests__/contract-guard.test.ts`
  fails the build on.

So the critical path runs through cfb-database, and the highest-leverage thing this repo can do
is send a precise view-request doc. Because `api.*` views are owner-rights (not
`security_invoker`), each view file unlocks PostgREST for the app and `run_sql` for the bot at
once, with no grant change -- which is why we are asking for views rather than a wider
`analyst_ro`.

**Decisions taken:** (1) views only, do not widen `analyst_ro`; (2) passing charting reaches
MCP/agent first, public UI waits for coverage; (3) extend `api.player_detail` additively rather
than add a second overlapping player-season view.

## P1

| # | Item | Consumer | Source | Semantics it must carry |
|---|---|---|---|---|
| 1 | Outbound view-request handoff | cfb-database | -- | **Done** -- `docs/WAREHOUSE_EXPANSION_HANDOFF.md` |
| 2 | `api.player_detail` schema-card correction | `run_sql` -> bot + eve agent + advisor | existing `api.player_detail` | **Done, unblocked.** The card claimed "one row per player-season"; the recruiting join fans out for reclassified recruits (Jeremiah Smith 2025 appears as both a #1 5-star and a #243 4-star, stats duplicated verbatim). Aggregates double-count exactly the blue-chip players the bot is asked about. |
| 3 | `get_passing_charting` | MCP / eve / advisor / Discord | *requested* `api.passing_charting_player_season`, `_team_season` | `attempts_available` in every payload; default coverage floor stated in the description; NULL = not-yet-charted; 2025+ only; `parse_status='partial'` rows are provisional |
| 4 | `get_target_profile` | same | *requested* `api.passing_charting_target_season` | First receiver-grain surface this app has ever had. `target_share_charted` is a share of charted attempts, never presented as true target share |
| 5 | `get_coach_tenure` + `coach_id` rekey | MCP + `/coaches` | *requested* `api.coach_tenures`; `coach_id` on existing coach views | Retires the `first_name + last_name` join (`coaches.ts:170-182`), the `DEFAULT_MIN_GAMES = 24` interim heuristic (`:59-61`), and the `.in('team', <~130 names>)` FBS filter (`:56-58`) |
| 6 | Player hub adoption | `/players`, `/players/[id]`, MCP | *requested* additive extension of `api.player_detail` | Key includes `team` (transfer = two rows); athlete ids are TEXT; dedupe must land before the JOIN or duplication propagates |

Items 3-6 follow the established MCP recipe -- `src/lib/mcp/tools.ts` is the registry, no
separate registry file: query fn returning `McpResult<T>` -> `XArgs` / `xToolImpl` /
`xDescription` / `xInputShape` -> `withToolTelemetry` export -> `registerMcpTools()` with
`READ_ONLY_ANNOTATIONS` -> `agent/tools/<x>.ts` mirror via `defineTool` -> test in
`src/lib/mcp/__tests__/`. Closest template: `src/lib/mcp/__tests__/penalties-tools.test.ts`.

New query modules use the **MCP dialect** (`McpResult`, `fail()`, `clamp()`, **no** `cache()`)
per the rationale at `src/lib/queries/mcp.ts:18-23`. Planned file:
`src/lib/queries/passing-charting.ts`.

## P2

| Item | Consumer | Source | Semantics |
|---|---|---|---|
| CFP bracket | new `/cfp` route + nav entry (`src/components/Sidebar.tsx:29-43`), `get_cfp_bracket` tool | *requested* `api.cfp_bracket` (2014+), grain `(season, round, seed)` | Largest single content gap -- the app has no CFP representation at all. `round`/`seed` not comparable across the 4- and 12-team eras. Must not be read as reviving `season_outlook.playoff_prob` (NULL by design; tools hard-guard against estimating it at `tools.ts:2341`, `:2629`). Wants to land before December |
| Conference affiliations | `/rivals`, `/compare` history, `/conferences`; deletes the `FBS_CONFERENCES` hardcode at `src/lib/queries/shared.ts:27-41` | *requested* `api.conference_affiliations`, grain `(team_id, season)` | Fixes the documented NDSU bug class -- `ref.teams` holds current membership, so historical seasons get today's classification. Range-guard the pre-modern end (history to 1869) |
| Advanced team stats | `/games/[id]`, team pages | *requested* `api.game_advanced_team_stats` (2014+), grain `(game_id, team_id)` | Garbage-time-excluded variants must be named distinctly from raw ones |
| As-of weekly ratings | model/backtest story, companion to `api.team_week_features` | *requested* `api.ratings_weekly` (2005+) | Leak-free as-of snapshots; never join to a season-final rating |

## P3

- `api.srs_expanded` -- broadens `/analytics`; low incremental value over SP+/CORE/Elo/FPI.
- ESPN player splits (`api.espn_player_splits`) -- only if the extended `api.player_detail`
  proves insufficient. CFBD athlete/team/game ids **are** ESPN ids; no crosswalk needed.
- `metrics.ppa_predicted` -- second EP lookup beside `api.expected_points`; adopt only with an
  explicit authoritative-source rule, or the agent will give incoherent EP answers.
- `espn.play_participants` -- novel but heavy, no designed consumer yet.
- Migrate `/players` and `/players/[id]` off the `public.get_player_*` RPCs onto the extended
  `api.player_detail`. `api.player_detail`, `api.player_season_leaders`, `api.roster_lookup`,
  `api.recruit_lookup`, `api.recruiting_roi` and `api.matchup_forecast` are all typed in
  `src/lib/types/api.generated.ts` and queried by nothing. Consolidation, not a feature.

**Declining:** the Fox/Yahoo id crosswalks (no consumer here), `ratings.massey_composite`
(empty until Massey publishes 2026), and the `ncaa` schema (deliberately ungranted).

## Open questions with cfb-database

1. `marts.epa_crossvalidation` is pitched as a data-quality panel candidate but the
   `SCHEMA_CONTRACT.md` 2026-08-29 entry declares it INTERNAL and not a shipping gate. Nothing
   designed against it pending an answer.
2. The 2014-2025 corrections campaign drains through early October. The bot's long-term memory
   and prediction ledger persist answers across sessions, so a September number will disagree
   with the same query in October. Asked for per-season completion flags so we can
   scope-invalidate rather than distrust the whole range.

## Verification

- `npm run lint && npm run typecheck && npm run test` (pre-push hook runs lint + typecheck).
- `src/lib/queries/__tests__/contract-guard.test.ts` must stay green with an empty `ALLOWLIST`.
- Per view as it deploys: confirm the `analyst_ro` path end-to-end by querying the new view
  through the `run_sql` MCP tool before wiring any UI to it -- that is the check that proves the
  owner-rights assumption for that specific view (a `security_invoker` view would be readable by
  the app and invisible to the bot; this bit cfb-database once already on `matchup_forecast`).
- For charting tools: assert coverage denominators appear in every response payload.
