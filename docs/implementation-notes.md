# Implementation notes

Deviations from plans, recorded at the moment they were taken so the plan and the code can be
reconciled later. Newest first.

## 2026-09-04 — season rollover (docs/plans/2026-09-04-1715-feat-season-rollover-plan.md)

**KTD8 assumed the bot has an MCP client. It does not.** The bot reaches the hosted MCP server only
through Anthropic's server-side `mcp_servers` connector inside a Messages API call, so it cannot
call `get_data_freshness` at prompt-build time. Options were (a) a hand-rolled streamable-HTTP
JSON-RPC client in the bot against `/api/mcp`, or (b) a small public JSON route on the Next.js app
that returns the resolved `SeasonState`. Took (b): `GET /api/season` served by the same
`getCurrentSeasonForRoute()` the tools use, derived from the bot's configured `MCP_URL` origin.
It is one fetch, has no auth surface (the payload is a season number and a week), and cannot
drift from what the tools answer. `get_data_freshness` still gains `current_season` and
`through_week` per KTD7 for the model's own use; the bot just does not depend on it.

**Code review (run 20260904-181415-84bd68d2) changed four plan-stated behaviours.**

- *R12 floor formula gains an upper clamp.* The plan's `max(10, ceil(default × through_week / 12))`
  scales UP past week 12, and `is_live` (any `completed = false` row for the season) stays true
  through bowls or after a cancelled game, so a 50 floor became 55-67 late in a live season.
  `scaleFloor` now clamps at the default: `min(default, max(10, ceil(...)))`.
- *R5's ten-minute route cache does not apply to a fallback.* A `source: 'fallback'` result
  (warehouse unreachable, `CURRENT_SEASON` served) is cached for 30s (`FALLBACK_CACHE_TTL_MS`),
  not 600s, so one transient failure cannot pin a year-stale season on every tool, both eve
  prompts, and `/api/season` for ten minutes. Not zero, because an uncached fallback would make
  every call during a sustained outage pay two Supabase fetch timeouts.
- *`/api/season` sends `Cache-Control: no-store` for a fallback state* instead of the public
  60s/600s header, and the bot treats a 200 body with `source: 'fallback'` as a failed fetch
  when it already holds a good state (keep-previous, warn once). On its very first resolution the
  bot still accepts the fallback body, since nothing better exists.
- *The bot honours `CFB_SEASON` before its first refresh* (`getSeasonState()` consults the
  memoized config until a refresh lands), `bot/evals/run.ts` now refreshes before running, and
  `BotConfig.defaultSeason` was dropped as dead. The bot prompt gained the same "best-guess
  fallback" caveat the eve prompt renders, keyed into its prompt cache by `source`.

Also caught there: `src/lib/agent/pick-resolve.ts` still stamped picks with the compiled
constant while the eve prompt stated the resolved season; it now resolves once per
`resolvePickCandidates()` call, matching `bot/src/pick-resolve.ts`.

**The bot's system prompt is memoized per lore variant.** `cachedBasePrompts` bakes the season in
when the prompt is first built, so a runtime season change would never reach the model. The cache
key now includes the season and week; a resolver change rebuilds the prompt (still byte-stable
per key, which is what Anthropic's prompt caching needs).
