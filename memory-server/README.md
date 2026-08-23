# cfb-agent-memory service

The agent's graph-memory backend: the upstream
[`neo4j-agent-memory`](https://github.com/neo4j-labs/agent-memory) MCP server
(pinned in the Dockerfile), pointed at the Neo4j Aura instance
`cfb-agent-memory`. Runs as a small always-on Railway service in the same
project as the Discord bot, so one long-lived process owns the Aura
connection pool instead of every Vercel lambda opening Bolt sockets.

Consumers: the Next.js app's eve agent (hooks, dynamic user-context, the
`/api/memory` route) via `@modelcontextprotocol/sdk` over streamable HTTP,
authenticated with short-lived HS256 bearer JWTs.

## Environment variables (all set on the Railway service)

| Var | Value | Notes |
|---|---|---|
| `NEO4J_URI` | `neo4j+s://<id>.databases.neo4j.io` | From the Aura instance |
| `NEO4J_USER` | `neo4j` | Aura default |
| `NEO4J_PASSWORD` | (Aura-generated) | Shown once at instance creation |
| `NEO4J_DATABASE` | `neo4j` | Aura default; optional |
| `NAM_EMBEDDING` | `openai/text-embedding-3-small` | Vector search embeddings |
| `OPENAI_API_KEY` | (OpenAI key) | Read by the embedding provider |
| `FASTMCP_SERVER_AUTH` | `fastmcp.server.auth.providers.jwt.JWTVerifier` | Turns bearer auth ON -- without this the server is open |
| `FASTMCP_SERVER_AUTH_JWT_PUBLIC_KEY` | (shared secret, `openssl rand -base64 48`) | HS256 shared secret -- the field is named public_key upstream but carries the symmetric secret |
| `FASTMCP_SERVER_AUTH_JWT_ALGORITHM` | `HS256` | |
| `FASTMCP_SERVER_AUTH_JWT_ISSUER` | `cfb-app` | Must match the JWTs the app mints |
| `FASTMCP_SERVER_AUTH_JWT_AUDIENCE` | `cfb-memory` | Must match the JWTs the app mints |

The Vercel app gets the counterpart pair: `MEMORY_ENDPOINT` (this service's
public URL + the MCP path) and `MEMORY_JWT_SECRET` (same value as
`FASTMCP_SERVER_AUTH_JWT_PUBLIC_KEY`), from which it mints a short-lived
bearer JWT per request.

## Railway settings

- Root directory: `memory-server/` (builds this Dockerfile)
- Watch paths: `memory-server/**` -- app/bot commits must not redeploy it
- Restart policy: on failure
- Generate a public domain (Settings -> Networking) -- that hostname is
  `MEMORY_ENDPOINT`'s base

## Local run

```bash
docker build -t cfb-agent-memory memory-server/
docker run --rm -p 8080:8080 \
  -e NEO4J_URI=neo4j+s://... -e NEO4J_USER=neo4j -e NEO4J_PASSWORD=... \
  -e NAM_EMBEDDING=openai/text-embedding-3-small -e OPENAI_API_KEY=... \
  cfb-agent-memory
```

(Omit the `FASTMCP_SERVER_AUTH_*` group locally to run without auth.)
