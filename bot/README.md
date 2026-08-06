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
| `/memory` | `show` / `forget [number]` / `on` / `off` | See, delete, or disable the bot's long-term memory about you (see [Long-term memory](#long-term-memory)) | Free |
| `/picks` | `me` / `user <who>` / `board` / `void <number>` | The public prediction ledger: records, receipts, leaderboard (see [Prediction ledger](#prediction-ledger)) | Free |
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
   https://discord.com/oauth2/authorize?client_id=<APP_ID>&scope=bot+applications.commands&permissions=2147601408
   ```

   Permission `2147601408` covers View Channels, Send Messages, Embed Links, Attach Files, Read
   Message History, and Use Application Commands. Open the URL and invite the bot to your test
   server.

   Attach Files (`1 << 15`) is what lets the bot upload an image rather than only linking one.
   Chart images are referenced by URL (which needs just Embed Links), so the bot works without
   it — but `attachment://` references in Components V2 `MediaGallery`/`File`/`Thumbnail`
   components require it, and uploading the bytes directly is the documented workaround for
   Discord's intermittent 0x0-size bug on proxied external images.

   Re-inviting a bot that is already in the server re-authorizes it rather than duplicating it.
   If the bot is already installed, granting the new permission via Server Settings -> Roles ->
   the bot's managed role -> Attach Files has the same effect. Check for channel-level permission
   overwrites if the grant does not seem to take.
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
| `SUPABASE_URL` | No | -- | With `SUPABASE_SERVICE_ROLE_KEY`, switches storage to the Supabase `bot` schema (set both or neither -- see [Storage](#storage)) |
| `SUPABASE_SERVICE_ROLE_KEY` | No | -- | Supabase service-role key (secret, server-side only) |
| `PROFILES_PATH` | No | `data/profiles.json` | Where the JSON backend persists `/myteam` favorites (relative paths resolve against `process.cwd()`; ignored when Supabase is configured) |
| `SETTINGS_PATH` | No | `data/settings.json` | Where the JSON backend persists server toggles like `/lore` (ignored when Supabase is configured) |
| `MEMORY_PATH` | No | `data/memory.json` | Where the JSON backend persists long-term memory atoms (ignored when Supabase is configured) |
| `PICKS_PATH` | No | `data/picks.json` | Where the JSON backend persists prediction-ledger picks (ignored when Supabase is configured) |
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
- With `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set (see [Storage](#storage)), profiles,
  settings, and memory atoms live in Postgres and survive redeploys with no volume needed.
  Without them, the JSON files under `bot/data` are ephemeral -- a redeploy wipes them --
  unless you attach a small Railway volume mounted at `bot/data`.

## Storage

Long-term state -- `/myteam` favorites, the `/lore` toggle, and per-user memory atoms -- goes
through a storage layer (`src/storage/`) with two backends, chosen once at boot:

- **Supabase** (when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are both set): tables in the
  shared Supabase instance's **`bot` schema**. This schema is owned by this repo (cfb-app), not
  by cfb-database -- its migrations live in `bot/supabase/migrations/` and it is outside
  cfb-database's `SCHEMA_CONTRACT.md`. The schema must be listed under the Supabase project's
  API "Exposed schemas" for supabase-js to reach it; RLS is enabled with no policies, so the
  anon key can touch nothing -- only the service role (which bypasses RLS) has access.
- **JSON files** (otherwise): the original `data/*.json` behavior -- fine for local dev and
  the test suite, ephemeral on Railway without a volume.

Reads never block an answer: a Supabase outage logs an error and falls back to cached values or
defaults. Writes surface failures to the user ("could not save"). The boot log line
`{"evt":"storage","backend":"supabase"}` confirms which backend was selected.

## Long-term memory

After each successful `/ask` or @-mention answer, a fire-and-forget Haiku call
(`src/memory-extract.ts`, same cheap tier as the router and likewise not metered by the cost
guards) checks whether the exchange revealed anything durable about the user -- a preference,
a fact, a take -- and stores it as a "memory atom" (`src/memory-store.ts`, max 20 per user,
oldest evicted). The next question injects those atoms, plus the `/myteam` favorite, into the
per-turn user context (`src/user-context.ts`, capped at 600 characters) -- never into the
cached system prompt.

Memory is on by default, with full user control via `/memory`:

- `show` -- everything stored about you (ephemeral, only you see it)
- `forget [number]` -- delete one memory by its `show` number, or everything
- `off` / `on` -- stop/resume both remembering and using memories (`off` keeps what's stored
  but unused; `forget` wipes it)

Extraction failures are silent no-ops -- the answer the user already received is never
affected. Log lines carry counts and token usage only, never memory content, matching the
no-user-text logging rule.

## Prediction ledger

The same extraction call also listens for committed predictions -- "OU wins 10 this year",
"we beat Texas", "Texas covers Saturday" -- and logs them as public picks (game winner,
season win total, or against-the-spread). Questions and hypotheticals are never logged, and
the extractor is deliberately conservative: a false pick is worse than a missed one.

- **Capture:** pick candidates are resolved deterministically (`src/pick-resolve.ts`) --
  team names normalized against `src/data/teams.json` + an alias map, game picks matched to
  a real scheduled game via `query_games`, ATS lines captured at pick time. Unresolvable
  candidates are dropped. The bot acks a captured pick with a 📒 reaction (mentions) or an
  ephemeral note (/ask).
- **Settlement:** an hourly loop (`src/settlement.ts`, started on ClientReady) settles
  finished games from final scores and season totals from `get_season_outlook` -- free MCP
  calls only, and zero calls when no picks are open. ATS grades against the line at pick
  time; season totals early-settle once the win count clears the line.
- **Receipts:** `/picks me` / `/picks user` / `/picks board` (public, min 3 settled picks
  for the board), `/picks void <n>` (ephemeral, own picks only -- the misextraction escape
  hatch). The asker's record and open picks also ride the conversational context, so the
  bot brings receipts unprompted.
- `/memory off` stops pick *capture* along with memory extraction; already-logged picks
  stay on the public ledger (`/picks void` removes bad ones).

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
- [ ] After an `/ask` that mentions a personal preference, `/memory show` lists an extracted
      memory, `/memory forget` clears it, and `/memory off` stops new ones appearing
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
