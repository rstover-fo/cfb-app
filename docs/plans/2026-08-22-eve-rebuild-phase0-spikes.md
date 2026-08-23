# Eve rebuild — Phase 0 spike results

Phase 0 of the agent rebuild (one eve-hosted brain serving Discord + in-app
chat, Neo4j graph memory). Each spike below gated a design decision in the
approved plan; outcomes are recorded here so later phases don't re-litigate
them. Verified against `eve@0.44.3` and `@neo4j-labs/agent-memory@0.4.1`
(TS) / `neo4j-agent-memory` (Python) as of 2026-08-22.

## S1 — memory-service topology: **Option B (self-hosted MCP server)**

- The TypeScript `@neo4j-labs/agent-memory` SDK is a fetch client for the
  hosted NAMS service (`https://memory.neo4jlabs.com/v1`, `nams_` API keys).
  Its `bridge` transport targets conformance/reference adapters that are not
  shipped as a runnable server. It cannot speak Bolt.
- The Python `neo4j-agent-memory` package provides the only self-hostable
  server: an **MCP server** (`pip install "neo4j-agent-memory[mcp,openai]"`,
  `neo4j-agent-memory mcp serve --transport sse --port 8080`) configured via
  `MemorySettings` with `neo4j={uri: "neo4j+s://<aura>", ...}` and
  embeddings `"openai/text-embedding-3-small"`. Neo4j 5.20+ required.
- **Decision:** deploy that MCP server as a small Railway service next to the
  bot, pointed at the existing Aura instance. The app (eve hooks, dynamic
  instructions, `/api/memory` route) consumes it with
  `@modelcontextprotocol/sdk` — already an app dependency for `/api/mcp`.
  The TS SDK is NOT used (installed, inspected, removed).
- Core MCP toolset confirmed: `memory_search`, `memory_get_context`,
  `memory_store_message`, `memory_add_entity`, `memory_add_preference`,
  `memory_add_fact` (+10 extended-profile tools).
- **No deletion/forget tools exist in the MCP profile**, so the plan's
  fallback is active: `/memory forget` runs through a service-secret-protected
  `src/app/api/memory/route.ts` doing a scoped Cypher `DETACH DELETE` by user
  identifier with `neo4j-driver` (module-scope driver, small pool).
- Live Aura round-trip still pending credentials — first task of Phase 2.

## S2 — eve stream events carry what the bot needs

- `action.result` events carry `data.result` with `callId`, **`toolName`**,
  and the **full tool `output`** (`toModelOutput` projections do not apply to
  channel/hook events). Bot-side `render_chart` extraction works from these.
- `turn.completed` carries only `{sequence, turnId}` — **no usage**. Usage
  lives on **`step.completed`**: `usage {costUsd?, inputTokens?,
  outputTokens?, cacheReadTokens?, cacheWriteTokens?}` per model call. The
  bot's `limits.ts` prices a turn by summing `step.completed` usage (prefer
  `costUsd` when present).
- Full hook event map includes `turn.started/completed/failed/cancelled`,
  `message.completed`, `session.waiting`, `subagent.*` — everything the
  post-turn memory/picks hook and the bot client need.

## S4 — zod v3 passes into eve via Standard Schema

- `defineTool.inputSchema` accepts `StandardSchemaV1 | StandardJSONSchemaV1 |
  JsonObject`. The app's pinned zod `^3.25.76` implements Standard Schema, and
  `agent/tools/get_rankings.ts` typechecks against it under the app's own
  tsconfig. No zod v4 migration needed; eve vendors its own zod privately.
- Correction to early design notes: the authored field is `inputSchema`, not
  `input`.

## S5 — builds green; one real refactor was required

- `next build` under `withEve()` succeeds with CI's placeholder Supabase env
  and no AI/eve env at all; the existing `serverExternalPackages`,
  `outputFileTracingIncludes`, and image config survive the wrap.
- `eve build` compiles the agent (tsconfig `@/*` aliases resolve through
  eve's bundler; nitro output lands in `.eve/`/`.output/`, now git- and
  eslint-ignored).
- **Finding:** eve evaluates authored modules in plain Node, outside any Next
  request context. The tool graph reached `next/headers` through
  `src/lib/supabase/server.ts` (`cookies()`), which broke `eve build`.
  **Fix:** `server.ts` is now a Next-free, process-memoized anon
  `@supabase/supabase-js` client — behavior-identical for every current
  caller (public reads, anon key, no auth sessions exist). When Phase 1 adds
  Supabase Auth, auth-aware code gets its own request-scoped `@supabase/ssr`
  client; the data-plane client stays cookie-free. All 1423 app tests pass
  unchanged.
- eve's CLI requires Node ≥ 24 (matches `.nvmrc`; CI/dev boxes on Node 22 can
  build the Next app but not run `eve build`/`eve dev`).

## Still open (owned by later phases)

- S3 → superseded: web search is Firecrawl-backed custom tools per the plan.
- S6 (multi-principal Discord-channel sessions) and S7 (`eve/client` on the
  bot's runtime) — Phase 3.
- ~~Live Aura + memory-server round-trip — Phase 2 entry task.~~ Done
  2026-08-23: `cfb-agent-memory` live on Railway against Aura; round-trip
  (remember → context → search → turn → cross-user isolation → forget, plus
  401 on missing auth) passed against the deployed service.

## Phase 2 addendum (2026-08-23)

App-side memory (`src/lib/memory/client.ts`) reads `MEMORY_ENDPOINT` +
`MEMORY_JWT_SECRET` at call time and disables cleanly when unset — but on
Vercel, env values are snapshotted into each deployment, so adding them in
the dashboard does nothing for existing builds. Any env change there needs a
fresh deployment to take effect (this commit is that lever for the preview).
