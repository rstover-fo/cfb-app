# Handoff: rushing charting consumed in cfb-app

**From:** cfb-app
**Date:** 2026-09-03
**Audience:** cfb-database
**Re:** `docs/handoffs/2026-09-03-rushing-charting-bot-enablement.md` (work order) and
`docs/handoffs/2026-09-03-rushing-charting-for-cfb-app.md` (semantics)
**Plan:** `docs/plans/2026-09-03-1910-feat-rushing-charting-tool-plan.md`

## What shipped

| Surface | Where | Notes |
|---|---|---|
| `get_rushing_charting` curated tool | `src/lib/mcp/tools.ts`, `src/lib/queries/rushing-charting.ts` | Player grain over `api.rushing_charting_player_season`. MCP server, eve agent (`agent/tools/`), and advisor subagent. |
| `run_sql` schema card | `src/lib/mcp/tools.ts` | Three entries (player, team, direction views) using your draft text, plus the `api.roster_lookup` 2026 note and returning-player join. |
| `search_players` description | `src/lib/mcp/tools.ts` | Names `get_player_detail`'s `rushing_charting` block, its `directions` keys, the share rule (`carries / direction_available_attempts` for left/middle/right only; `unknown / direction_eligible_attempts` is the gap), and that the block is NULL when no charting row exists. |
| Runbook stage and invalidation contract | `docs/WAREHOUSE_EXPANSION_RUNBOOK.md` Stage 5 | Documentation only. The bot has no answer cache, so nothing consumes the tuple as a watermark today. |

## Tool contract

Input: `season` (default `CURRENT_SEASON`, currently 2025; before 2025 returns the coverage-boundary
message), `team`, `conference`, `position` (default `RB`; `ALL` drops the filter; input is
case-insensitive), `sort` (`ppa` default, `success_rate`, `explosiveness`, `ypc`, `stuff_rate`
ascending, `power_success`, `yards`, `attempts`, `line_yards`, `second_level_yards`,
`open_field_yards`), `min_attempts` (default 50, floors `attempts` server-side before the row cap;
the enforced floor is echoed back), `limit` (default 25, cap 100).

Response: `{"_source", "count", "rows", "min_attempts", "position", "coverage_note"}` with a derived
`direction_coverage_pct = direction_available_attempts / direction_eligible_attempts` per row (3dp,
null-preserving). `rushing_yards_available` ships per row even though it equals `attempts` on every
current row, so a future divergence is visible.

The description states, in order: rate metrics are over every carry (floor for sample size, not
coverage); default RB filter and why (QB `attempts` include sacks); direction about 40% resolved in
2025 and near-complete same-day in 2026; NULL never 0; player totals do not reconcile to team totals;
2025 moves only via explicit re-pull.

## Decisions you should know about

- **Player grain only.** Team run-game identity and direction splits go through `run_sql`. A
  `get_rushing_direction` team tool is deferred until 2026 has several weeks of data, as you suggested.
- **No direction sorts.** The 20-carry direction floor from your table appears only as the per-row
  coverage fraction; the player view carries no direction metric to sort on.
- **Floor column is `attempts` for every sort**, because `rushing_yards_available = attempts` on all
  1,708 player rows as of 2026-09-03. If that equality ever breaks on the player view, tell us; the
  floor would need to move to `rushing_yards_available` for rate sorts.
- **Invalidation tuple uses `api.*`**, per your section 4, with `COUNT(*)` kept alongside the three
  sums.

## Questions and requests

1. **Re-pull date.** The "about 40% in 2025" figure is hard-coded in the tool description and the
   schema card. When the `--sources passing,rushing` re-pull (planned ~2026-09-07) lands, we will
   re-derive it from the tuple. A note in either repo when it completes would help.
2. **Position casing.** We uppercase the input and match `position` exactly. The 15 codes we saw live
   are all uppercase; confirm `core.roster` never emits mixed case.
3. **`CURRENT_SEASON` rollover.** When cfb-app bumps to 2026, the 50-carry default will return an
   empty board for the first weeks. We own re-deriving the default before the bump; no action on
   your side.

Semantics questions belong against the companion doc, per your note.
