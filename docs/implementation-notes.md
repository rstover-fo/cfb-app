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

**The bot's system prompt is memoized per lore variant.** `cachedBasePrompts` bakes the season in
when the prompt is first built, so a runtime season change would never reach the model. The cache
key now includes the season and week; a resolver change rebuilds the prompt (still byte-stable
per key, which is what Anthropic's prompt caching needs).
