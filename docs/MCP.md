# MCP Server (v2 -- streamable HTTP)

This app hosts a read-only [MCP](https://modelcontextprotocol.io) server at

```
https://v0-production-data-application.vercel.app/api/mcp
```

built with Vercel's [`mcp-handler`](https://www.npmjs.com/package/mcp-handler) package
(streamable-HTTP transport, `createMcpHandler`), mounted inside this Next.js app at
`src/app/api/[transport]/route.ts`. It exposes the same eight tools as the reference Python
stdio server in `cfb-database/mcp/` (see below) but as a hosted HTTP endpoint any MCP client
can connect to directly -- no local Python install, no `SUPABASE_ANON_KEY` distributed to
every client.

**This supersedes the Python stdio server** (`cfb-database/mcp/src/cfb_mcp/`). That server
still works and its tool semantics are the source of truth this one was ported from, but new
integrations should point at this HTTP endpoint instead.

## Auth

Every request must carry a bearer token:

```
Authorization: Bearer <token>
```

Enforced in `src/lib/mcp/auth.ts`, checked before the request ever reaches the MCP transport
handler:

- **Missing/wrong token -> `401`** with a JSON `{"error": "..."}` body explaining what was
  wrong.
- **`MCP_AUTH_TOKEN` unset on the server -> `401` for every request, including ones with a
  bearer token.** The endpoint fails closed; there is no "no token configured -> allow
  anything" fallback.
- Token comparison is constant-time (`crypto.timingSafeEqual` over SHA-256 digests of both
  sides), so response timing can't be used to guess the token byte-by-byte.

### Generate a token

```bash
openssl rand -hex 32
```

### Configure it on Vercel

Project -> Settings -> Environment Variables -> add `MCP_AUTH_TOKEN` (Production, and
Preview/Development if you want the endpoint reachable there too) -> redeploy.

## Connector setup

### claude.ai

Settings -> Connectors -> Add custom connector:

- **URL:** `https://v0-production-data-application.vercel.app/api/mcp`
- **Authentication:** send an `Authorization` header with value `Bearer <your token>`

### Claude Code

```bash
claude mcp add --transport http cfb https://v0-production-data-application.vercel.app/api/mcp \
  --header "Authorization: Bearer <your token>"
```

### Claude Desktop

Streamable HTTP servers need a local stdio-to-HTTP bridge
([`mcp-remote`](https://www.npmjs.com/package/mcp-remote)) in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cfb": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://v0-production-data-application.vercel.app/api/mcp",
        "--header",
        "Authorization: Bearer <your token>"
      ]
    }
  }
}
```

## Tool catalog

All eight tools are read-only, non-destructive, idempotent, and return a compact JSON string
(never throw). Every successful result includes a `_source` field naming the exact `api.*`
view or `public` RPC the data came from, plus a `count` and a `rows` array -- or a plain
`"No ... found"` string when a query matches nothing. Rows are capped at 100 per call
(`search_players` defaults to 25).

| Tool | Arguments | Backing object(s) |
|------|-----------|--------------------|
| `query_team` | `team` | `api.team_detail` + `api.team_history` |
| `query_games` | `season?`, `week?`, `team?`, `min_excitement?`, `limit?` | `api.game_detail` |
| `query_matchup` | `team_a`, `team_b` | `api.matchup` + `api.game_detail` |
| `get_rankings` | `season`, `week?`, `poll?`, `season_type?` (`regular`\|`postseason`, default `regular`), `limit?` | `api.poll_rankings` |
| `get_leaderboard` | `season`, `metric` (`wins`\|`ppg`\|`scoring_defense`\|`epa`\|`sp_rating`\|`wepa`), `limit?` | `api.leaderboard_teams`, or `api.team_wepa_season` for `wepa` |
| `situational_splits` | `team`, `season`, `split_type` (`home_away`\|`conference`\|`red_zone`\|`down_distance`\|`field_position`) | `get_home_away_splits`, `get_conference_splits`, `get_red_zone_splits`, `get_down_distance_splits`, `get_field_position_splits` (`public` RPCs) |
| `search_players` | `query`, `team?`, `season?`, `limit?` | `get_player_search` then `get_player_detail` for the top hit (`public` RPCs) |
| `get_data_freshness` | *(none)* | `get_data_freshness` (`public` RPC) |

Argument semantics, caveats (tied poll ranks, the `season_type` postseason/week-1 collision,
exact-match team-name matching, the double-quoted `or=` filter for names like `"Miami (OH)"`,
row caps) are ported faithfully from the Python reference server -- see
`cfb-database/mcp/src/cfb_mcp/server.py` and `cfb-database/mcp/README.md` for the full
rationale behind each one, and the per-tool `description`/argument docs registered in
`src/lib/mcp/tools.ts` for the exact wording exposed to MCP clients.

## Implementation notes

- Query layer: `src/lib/queries/mcp.ts` (new view/RPC wrappers -- team detail, game detail,
  poll rankings, leaderboard/wepa, situational-split RPCs, player search/detail, data
  freshness) plus reuse of the existing `getTeamHistory` (`src/lib/queries/compare.ts`) and
  `getMatchup`/`getMatchupGames` (`src/lib/queries/matchups.ts`). Every read goes through the
  `api` schema's views or documented `public` RPCs, same as the rest of this app --
  `src/lib/queries/__tests__/contract-guard.test.ts` fails the build on any direct `core`
  schema access.
- Tool implementations: `src/lib/mcp/tools.ts`, exported as plain `(args) => Promise<string>`
  functions so they're unit-testable without the MCP transport; `registerMcpTools()` wires
  them into the SDK's `McpServer` with Zod input schemas.
- Auth: `src/lib/mcp/auth.ts`.
- Route: `src/app/api/[transport]/route.ts` (Node.js runtime, `maxDuration = 60`).
