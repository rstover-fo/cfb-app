# Runbook: shipping the 2026-08-30 warehouse expansion

**Date:** 2026-08-31
**Companion docs:** `WAREHOUSE_EXPANSION_HANDOFF.md` (what we need and why),
`WAREHOUSE_EXPANSION_DB_WORKORDER.md` (how to build it, in cfb-database's conventions),
`plans/2026-08-30-expansion-exposure-plan.md` (P1/P2/P3 priorities).

This is the execution order. It spans two repos and several sessions, so it is written to be
picked up cold.

## The shape of the problem

Every item is gated on cfb-database publishing an `api.*` view. cfb-app cannot start any of
it early: `run_sql` executes as `analyst_ro`, which holds SELECT on the `api` schema only, and
reading raw schemas directly is banned by `CLAUDE.md` and enforced by
`src/lib/queries/__tests__/contract-guard.test.ts`.

So the critical path runs **entirely through cfb-database**, and cfb-app's work is a series of
short consume-cycles that each begin the day a view deploys. There is no useful cfb-app prep
work to do in between: writing a query module against column names that are not final yet is
rework, not a head start.

```
cfb-database                          cfb-app
------------                          -------
build mart + api view  ──►  smoke test via run_sql  ──►  query module + tool + tests
      (stage N)                    (the gate)                   (stage N)
```

---

## The view cycle

This repeats once per surface. Do not vary it; the gate in step 2 is what keeps cfb-app from
building against a view the bot cannot see.

**1. cfb-database builds and deploys.** One file at `src/schemas/api/NNN_<view>.sql` over a
`marts.*` object (`044_core_ratings.sql` is the template), ending in the exact line
`GRANT SELECT ON api.<view> TO anon, authenticated;` that `tests/test_api_grants.py`
regex-matches. Add a re-runnable `validation_<unit>.sql` and a
`deploys/<unit>-manifest.json` listing marts files, then api files, then validation.
New view files start at **045** (`044_core_ratings.sql` is the current highest).

**2. GATE — smoke test from cfb-app before writing any code.** Call the `run_sql` MCP tool
against the new view:

```sql
SELECT * FROM api.<view> LIMIT 5;
```

This must return rows **through `run_sql`**, not just through PostgREST. It is the one check
that proves the view is owner-rights rather than `security_invoker` — a `security_invoker`
view is readable by the web app and *invisible to the Discord bot*, which is how
`matchup_forecast` got shipped broken. Also confirm the grain
(`count(*)` vs `count(DISTINCT <key>)`) matches what the work order asked for, before anything
depends on it.

If the gate fails, it goes back to cfb-database. Do not work around it in cfb-app.

**3. cfb-app consumes.** Per `src/lib/mcp/tools.ts` (which is the registry — there is no
separate registry file):

- Query module in `src/lib/queries/`, **MCP dialect**: returns `McpResult<T>`, uses `fail()`
  and `clamp()`, no `cache()` (see the rationale at `src/lib/queries/mcp.ts:18-23`).
- Tool: `XArgs` interface → `xToolImpl` → `xDescription` → `xInputShape`, then
  `withToolTelemetry` export and registration with `READ_ONLY_ANNOTATIONS`.
- Mirror in `agent/tools/<x>.ts` via `defineTool`.
- Types hand-transcribed into `src/lib/types/api.generated.ts` (every column `| null`).
- Tests in `src/lib/mcp/__tests__/` — `penalties-tools.test.ts` is the closest template.
- **Add the view to the `run_sql` schema card** (`src/lib/mcp/tools.ts`) in the same PR.
  Never list a surface the view layer does not yet cover.

**4. Verify and ship.** `npm run lint && npm run typecheck && npm run test` (contract-guard
must stay green with an empty `ALLOWLIST`). Exercise the new tool through MCP and confirm the
semantics the work order specified actually appear in the payload.

---

## Sequence

### Stage 0 — cfb-database only, no cfb-app work

Two things, both prerequisites rather than features.

1. **Dedupe `api.player_detail`'s recruiting fan-out.** Work order §0. This is a hard blocker
   for stage 3: LEFT JOINing a usage payload onto a view that already fans out propagates the
   duplication into the new columns. Do not collapse `team` while fixing it — the per-team
   rows are real.
2. **Answer the three open decisions** (work order §1 and §4): whether
   `stats.player_season_overview` gains `team` in its primary key; whether
   `marts.epa_crossvalidation` is internal or consumable; whether per-season completion flags
   can be exposed for the corrections campaign.

*Done when:* `api.player_detail` returns one row per `(player_id, season, team)`, and the three
questions have answers written down.

### Stage 1 — passing charting (the headline)

cfb-database ships `api.passing_charting_player_season` (045),
`api.passing_charting_target_season` (046), `api.passing_charting_team_season` (047).

cfb-app then ships `get_passing_charting` and `get_target_profile` in one PR, plus a new
`src/lib/queries/passing-charting.ts`.

*Watch:* both coverage denominators and both derived percentages must appear in every payload
(`air_yards_*` and `yards_after_catch_*`). A leaderboard without them ranks on coverage, not
skill. NULL is not-yet-charted, never zero. 2025+ only.

*Done when:* the bot can answer "who has the highest aDOT" and "who leads in targets" with the
denominator visible in the answer. **MCP/agent surface only** — no public UI until 2026
coverage is broad.

### Stage 2 — coaching (independent of stage 1; can run in parallel)

cfb-database adds `coach_id` to `api.coaching_history` and `api.coach_records` (additive), and
ships `api.coach_tenures` (048) carrying `is_interim` and `classification`.

cfb-app rekeys `src/lib/queries/coaches.ts` onto `coach_id` and adds `get_coach_tenure`.

*Payoff:* this deletes three existing hacks — the `first_name + last_name` join
(`coaches.ts:170-182`), the `DEFAULT_MIN_GAMES = 24` interim heuristic (`:59-61`), and the
`.in('team', <~130 names>)` FBS filter (`:56-58`).

*Done when:* `/coaches` and `get_coaching_history` key on `coach_id`, and those three
workarounds are gone rather than merely bypassed.

### Stage 3 — player hub (blocked on stage 0)

cfb-database extends `api.player_detail` additively with the `stats.player_season_overview`
usage/PPA payload. cfb-app adopts it for new capability first; migrating `/players` and
`/players/[id]` off the `public.get_player_*` RPCs is cleanup and can trail.

### Stage 4 — P2 surfaces

- **CFP bracket** — `api.cfp_bracket` over `core.cfp_*`. **Schedule this to land before
  December** or it misses the season it is for. New `/cfp` route plus a nav entry in
  `src/components/Sidebar.tsx`, and a `get_cfp_bracket` tool. Make the 4-team vs 12-team era
  explicit; `round`/`seed` are not comparable across them.
- **Conference affiliations** — `api.conference_affiliations`, per-season grain expanded from
  the source's span grain. Fixes the realignment bug class and retires the hardcoded
  `FBS_CONFERENCES` list at `src/lib/queries/shared.ts:27-41`.
- **Advanced team stats** and **as-of weekly ratings** — straightforward consume-cycles.

---

## Notes on running it

**Parallelism.** Stages 1, 2 and 4 are independent of each other. Only stage 3 has a hard
predecessor (stage 0). If cfb-database has capacity for one thing at a time, stage 0 first
(it unblocks the most and fixes a live bug), then stage 1.

**One surface per PR on the cfb-app side.** Each stage is a small, self-contained PR: query
module, tool, agent mirror, types, tests, schema-card entry. Bundling stages makes the
schema-card diff hard to review, and the card is the thing the bot actually reads.

**The corrections campaign.** Historical EPA shifts until the 2014–2025 refresh drains through
early October. The bot's long-term memory and prediction ledger persist answers across
sessions, so numbers recorded now will disagree with the same query later. Until cfb-database
exposes per-season completion flags, treat pre-2026 EPA in stored answers as provisional.

**Announcing.** Nothing here is announceable to the Discord until stage 1 clears its gate.
Before then the bot cannot reach any of it, and its failure mode on an unreachable surface is
guessing rather than declining — which is the risk this whole plan exists to avoid.
