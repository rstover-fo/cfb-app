# cfb-agent-memory service

The agent's graph-memory backend: a thin **user-scoped FastAPI wrapper**
(`app.py`) over the pinned
[`neo4j-agent-memory`](https://github.com/neo4j-labs/agent-memory) library,
talking Bolt to the Neo4j Aura instance `cfb-agent-memory`. Runs as a small
always-on Railway service in the bot's project, so one long-lived process
owns the Aura connection pool instead of every Vercel lambda opening Bolt
sockets.

Why not the library's stock MCP server: its tool surface binds one
`MemoryIntegration` per process (single-tenant, built for desktop
assistants). The library's `ShortTermMemory`/`LongTermMemory` take
`user_identifier` per call -- this wrapper exposes exactly the operations
the agent needs, each scoped to a Discord snowflake, with multi-tenant
enforcement on (`MemorySettings.memory.multi_tenant=True`).

Consumers: the Next.js app's eve agent (post-turn hook, dynamic
user-context, `memory_search`/`remember` tools, the `/api/memory` route the
Discord bot's `/memory` command calls). All requests carry a short-lived
HS256 bearer JWT (`iss cfb-app`, `aud cfb-memory`).

## Endpoints (all POST + JSON + bearer JWT, except `/health`)

| Endpoint | Body | Does |
|---|---|---|
| `GET /health` | -- | Authless liveness (`{ok, connected}`) |
| `/turn` | `{user, session_id, question, answer}` | Store one Q&A pair in user-scoped conversation memory (embedded, no entity extraction -- the app's Haiku pipeline owns semantics) |
| `/remember` | `{user, kind, content, context?, metadata?}` | Store one durable memory; `kind` in `preference\|fact\|take` (bot-atom semantics); dedup built in |
| `/context` | `{user}` | All memories, oldest-first (the stable `/memory show` numbering order) |
| `/search` | `{user, query, limit?}` | The user's memories ranked for a query (lexical v1; vector once the library's search grows a user filter) |
| `/forget` | `{user, memory_id?}` | Forget one or all; removes this user's edge, deletes nodes only when orphaned (dedup can share nodes across users) |

## Environment variables (Railway service)

| Var | Value | Notes |
|---|---|---|
| `NEO4J_URI` | `neo4j+s://<id>.databases.neo4j.io` | From the Aura instance |
| `NEO4J_USER` | `neo4j` | |
| `NEO4J_PASSWORD` | (Aura-generated) | |
| `NEO4J_DATABASE` | `neo4j` | Optional |
| `NAM_EMBEDDING` | `openai/text-embedding-3-small` | |
| `OPENAI_API_KEY` | (OpenAI key) | Read by the embedding provider |
| `MEMORY_JWT_SECRET` | (shared secret) | Preferred name. `FASTMCP_SERVER_AUTH_JWT_PUBLIC_KEY` is accepted as a fallback (the name used at first provisioning), so an existing deployment needs no re-paste. |

The other `FASTMCP_SERVER_AUTH*` variables from the first provisioning pass
are unused by this wrapper and harmless to leave in place.

The Vercel app's counterpart pair: `MEMORY_ENDPOINT` = this service's base
URL (`https://cfb-agent-memory-production.up.railway.app` -- a trailing
`/mcp` from the earlier plan is tolerated and stripped by the client) and
`MEMORY_JWT_SECRET` = the same shared secret.

## Railway settings

- Root directory: `/memory-server`; watch paths `memory-server/**`
- Healthcheck path: `/health`
- Restart policy: on failure

## Local run

```bash
docker build -t cfb-agent-memory memory-server/
docker run --rm -p 8080:8080 \
  -e NEO4J_URI=neo4j+s://... -e NEO4J_PASSWORD=... \
  -e OPENAI_API_KEY=... -e MEMORY_JWT_SECRET=dev-secret-at-least-32-bytes-long \
  cfb-agent-memory
```
