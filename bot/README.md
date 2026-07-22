# CFB Discord Bot

An always-on Discord gateway bot for a ~100-person college-football community, built on top of
cfb-app's hosted MCP server. Deterministic slash commands (`/rankings`, `/team`, `/scores`, ...)
call the MCP server directly and cost nothing to run. `/ask` and `@`-mentions run a Claude agent
over the same MCP server via Anthropic's MCP connector, tiered between Sonnet 5 (default) and
Opus 4.8 (advisor, for gnarly analytical questions), with a Haiku classifier routing between them.

## Commands

| Command | Options | What it does | LLM? |
|---------|---------|---------------|------|
| `/rankings` | `week?`, `poll?` (AP Top 25 / Coaches Poll), `top?` (default 25, max 100) | Poll rankings via `get_rankings` | Free |
| `/scores` | *(none)* | Live scoreboard for games in progress today via `get_live_scoreboard` | Free |
| `/team` | `team` (autocomplete) | A team's current-season snapshot + recent history via `query_team` | Free |
| `/matchup` | `team1`, `team2` (both autocomplete) | Head-to-head history between two teams via `query_matchup` | Free |
| `/edges` | `week?`, `limit?` (default 5, max 10) | Where the house prediction model diverges most from the market line via `get_matchup_edges` | Free |
| `/leaders` | `metric` (Wins / PPG / Scoring Defense / EPA per Play / SP+ / wepa), `limit?` (default 10, max 100) | Team leaderboard by a chosen metric via `get_leaderboard` | Free |
| `/player` | `name`, `team?` (autocomplete) | Search for a player and see season stats via `search_players` | Free |
| `/ask` | `question` | Full conversational Q&A over all 19 MCP tools, tiered Sonnet 5 / Opus 4.8 | LLM |
| `/myteam` | `team` (autocomplete) | Saves your favorite team so `/ask` and @-mentions can use it as context | Free |
| `/help` | *(none)* | Lists all commands | Free |

@-mentioning the bot (`@CFB Bot how good is Ohio State's defense?`) runs the same conversational
path as `/ask`, including a typing indicator, per-channel memory, and reply-to-message context.

There is no `/prediction` command: `get_game_prediction` keys on a numeric `game_id`, so
team-pair predictions route through `/ask`, where Claude resolves the game first.

## Architecture in 10 lines

Two answer paths. (1) **Deterministic** -- a command handler calls `callCfbTool()`
(`src/mcp-client.ts`) directly against the hosted `/api/mcp` endpoint and renders an embed; zero
LLM cost. (2) **Conversational** -- `/ask` and `@`-mentions call `askClaude()` (`src/claude.ts`),
which makes one `client.beta.messages.create` call with the Anthropic MCP connector
(`mcp_servers` + `mcp_toolset`) pointed at the same `/api/mcp` endpoint -- the whole tool loop
runs server-side on Anthropic's infrastructure, so there's no client-side tool loop to maintain.
`src/router.ts` makes a cheap Haiku classification call first (simple vs. gnarly) to pick Sonnet 5
or Opus 4.8; Sonnet's system prompt can end a reply with an `[ESCALATE]` sentinel as a backstop,
which triggers one re-run on Opus. Per-channel short-term memory (`src/memory.ts`, 30-minute TTL)
and per-user favorite-team profiles (`src/profiles.ts`, `/myteam`) are injected into the prompt
per turn but never touch the cached system-prompt prefix. `src/limits.ts` gates every
conversational call with a cooldown, a per-user daily cap, and a global dollar budget before any
Anthropic call is made. See the design doc's "Two answer paths" and "Cost picture" sections for
the full reasoning.

## Discord app setup runbook

Do this first against a private test server, then repeat the invite + `npm run register` steps
against the real server once everything checks out.

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) ->
   **New Application**.
2. On the **General Information** tab, copy the **Application ID** -- this is `DISCORD_APP_ID`.
3. Go to the **Bot** tab -> **Reset Token** -> copy it -- this is `DISCORD_TOKEN`. On the same
   tab, make sure **Public Bot** is disabled.
4. Still on the **Bot** tab, under **Privileged Gateway Intents**, enable **MESSAGE CONTENT
   INTENT**. This is a portal toggle only -- no Discord review is required while the bot is in
   fewer than 100 servers.
5. Build an invite URL, substituting your Application ID:

   ```
   https://discord.com/oauth2/authorize?client_id=<APP_ID>&scope=bot+applications.commands&permissions=2147568640
   ```

   Permission `2147568640` covers View Channels, Send Messages, Embed Links, Read Message
   History, and Use Application Commands. Open the URL and invite the bot to your test server.
6. In Discord, enable **Developer Mode** (User Settings -> Advanced), then right-click your test
   server's icon -> **Copy Server ID** -- this is `DISCORD_GUILD_ID`.
7. With `DISCORD_TOKEN`, `DISCORD_APP_ID`, and `DISCORD_GUILD_ID` set (see [Environment
   variables](#environment-variables) below), run `npm run register`. Registration is
   guild-scoped, so it propagates instantly rather than the up-to-an-hour delay for global
   commands.
8. Once the bot behaves as expected in the test server, invite it to the real server (step 5
   again with the real server) and re-run `npm run register` with `DISCORD_GUILD_ID` pointed at
   the real server's ID.

## Environment variables

All defaults and validation live in `src/config.ts`.

| Variable | Required? | Default | Purpose |
|----------|-----------|---------|---------|
| `DISCORD_TOKEN` | Yes | -- | Bot token from the Developer Portal's Bot tab |
| `DISCORD_APP_ID` | Yes | -- | Application ID from the Developer Portal's General Information tab |
| `DISCORD_GUILD_ID` | Yes | -- | Guild slash commands are registered against |
| `MCP_URL` | Yes | -- | Base URL of cfb-app's hosted MCP server, e.g. `https://v0-production-data-application.vercel.app/api/mcp` |
| `MCP_AUTH_TOKEN` | Yes | -- | Bearer token the MCP server expects -- must be the **same value** configured on Vercel for `/api/mcp` (see `docs/MCP.md`) |
| `ANTHROPIC_API_KEY` | No | -- | Anthropic API key. Without it, deterministic slash commands still work; `/ask` and `@`-mentions reply with a friendly "unavailable" message |
| `MODEL_DEFAULT` | No | `claude-sonnet-5` | Default conversational model (simple-tier questions) |
| `MODEL_ADVISOR` | No | `claude-opus-4-8` | Advisor model for gnarly questions and `[ESCALATE]` re-runs |
| `MODEL_ROUTER` | No | `claude-haiku-4-5` | Cheap classifier model for simple-vs-gnarly routing |
| `PROFILES_PATH` | No | `data/profiles.json` | Where `/myteam` favorites are persisted (relative paths resolve against `process.cwd()`) |
| `COOLDOWN_SECONDS` | No | `20` | Minimum seconds between LLM-backed questions from the same user |
| `USER_DAILY_LIMIT` | No | `10` | Max LLM-backed questions a single user can ask per day |
| `DAILY_BUDGET_USD` | No | `10` | Global daily spend ceiling in USD for the LLM path |
| `CFB_SEASON` | No | August-pivot rule | Overrides the season commands default to when none is specified (current year from August on, else the prior year) |

## Run locally

```bash
npm install
cp .env.example .env   # then fill in the values above
npm run dev            # tsx watch src/index.ts
```

```bash
npm test          # vitest run
npm run typecheck  # tsc --noEmit
```

## Deploy on Railway

1. Create a new Railway service from this repo.
2. Set **Root Directory** to `bot/`. Railway's nixpacks builder auto-detects Node and runs
   `npm ci && npm run build` (build) then `npm start` (start) -- no Dockerfile needed.
3. Set all the environment variables from the table above.
4. Set the service's **watch paths** to `bot/**` so commits touching only the rest of the
   monorepo (the Next.js app) don't trigger a bot redeploy.
5. Set a restart-on-failure policy. discord.js reconnects the gateway websocket on its own after
   a network blip -- a process restart is only needed for a hard crash.

Notes:

- In-memory limits (`src/limits.ts`) and per-channel conversation memory (`src/memory.ts`) reset
  on every redeploy. This is accepted at this scale (~100 users, one process).
- `data/profiles.json` (the `/myteam` favorites file) is ephemeral without a Railway volume --
  a redeploy wipes it. Optional: attach a small volume mounted at `bot/data` and set
  `PROFILES_PATH` accordingly to persist favorites across deploys.

## Cost controls

Every conversational call goes through `checkAllowance()` (`src/limits.ts`) before any Anthropic
request is made:

1. **Per-user cooldown** (`COOLDOWN_SECONDS`, default 20s) -- blocks rapid-fire questions from
   one user.
2. **Per-user daily cap** (`USER_DAILY_LIMIT`, default 10/day) -- resets at UTC midnight.
3. **Global dollar budget** (`DAILY_BUDGET_USD`, default $10/day) -- also resets at UTC midnight.
   Spend is priced from the actual `usage` returned by each Anthropic response, at that response's
   model's per-token rates, including the 1.25x cache-write and 0.1x cache-read multipliers --
   not a flat per-call estimate.

Rough per-question cost: Sonnet 5 tier ~$0.06-0.20, Opus 4.8 advisor tier ~$0.10-0.35, Haiku
router classification ~$0.001. Once the budget or a user's cap is hit, `/ask` and `@`-mentions
reply with a message pointing at the still-free slash commands -- those are never affected by any
of these guards.

## Evals

```bash
npm run eval                  # full run against evals/golden.json (real Anthropic calls)
npm run eval -- --dry-run     # validate golden.json against the schema, no network calls
npm run eval -- --only <id>   # run a single golden entry by id
```

The harness (`evals/run.ts`) sends each golden question through `askClaude()` for real, applies
deterministic assertions (expected tier, must/must-not-match regexes, max length), and -- for
entries with a `judge` criterion -- one Haiku call that grades the answer against that criterion.
It prints a per-entry table plus pass-rate and total spend. This makes real, billed Anthropic
calls, so it's manual-only and never runs in CI. Run it before deploys and after any change to
the system prompt or router logic.

## Smoke-test checklist

Run through this in the private test server before promoting a change to the real server:

- [ ] `/rankings` renders an embed with real ranking rows
- [ ] `/team` autocomplete suggests matching school names as you type
- [ ] `/ask` defers immediately, then edits in a grounded, cited answer
- [ ] `@`-mentioning the bot shows a typing indicator and replies
- [ ] Replying to a message while `@`-mentioning the bot pulls that message in as context
- [ ] `/myteam` saves a team, and a later `/ask` question uses it as context
- [ ] Asking two questions back-to-back triggers the cooldown message
- [ ] Temporarily setting a bad `ANTHROPIC_API_KEY` makes `/ask` reply with a friendly
      "unavailable" message instead of crashing, and the process stays up

## Annual chores

- **Refresh `src/data/teams.json`** each offseason -- FBS membership and school names change
  with conference realignment and new entrants. `query_team` / `get_leaderboard` can confirm or
  correct an exact spelling if a school looks missing or misspelled.
- **`DEFAULT_SEASON`** rolls over automatically via the August-pivot rule in `src/config.ts`
  (`deriveDefaultSeason`) -- no action needed most years. Set `CFB_SEASON` to override it
  manually if the pivot ever needs to happen early or late.
