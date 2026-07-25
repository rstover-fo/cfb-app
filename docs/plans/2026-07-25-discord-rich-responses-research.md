# Discord Rich Responses — Research

**Question (from #matrix):** "is there a way to get the bot to output a graphic or like a discord
artifact instead of plain text"

**Short answer:** Yes, three separate ways, and they stack. Discord has a components system
(Components V2) that is the closest thing it has to an "artifact"; it renders real images that we
can generate from cfb-app's existing chart code; and it supports buttons/menus for follow-ups.
None of it needs a dependency upgrade — `bot/package-lock.json` already resolves discord.js to
**14.27.0**, and the Components V2 builders landed in 14.19.

---

## 1. Where the bot is today

| Path | Renderer | Result |
|------|----------|--------|
| `/rankings`, `/team`, `/scores`, `/matchup`, `/edges`, `/leaders`, `/player`, `/help` | `EmbedBuilder` (`bot/src/format.ts`) | Colored embed, title, fields, footer |
| `/ask` (`bot/src/commands/ask.ts`) | raw `content` string | Plain text |
| `@`-mention (`bot/src/mention.ts`) | raw `content` string | Plain text |

The screenshot is the conversational path. `splitMessage()` (`format.ts:537`) chops the model's
answer into ≤1900-char chunks, max 3, and posts them as bare messages. The system prompt
(`bot/src/claude.ts:112`) actively constrains output to *"under 1500 characters. Use Discord
markdown (bold, bullets) — no giant tables."* So the wall of bold text is exactly what we asked
for. Everything below is about widening that instruction and giving the model somewhere better to
put the numbers.

The deterministic commands are already in decent shape; **the gap is entirely on `/ask` and
mentions.**

---

## 2. The menu, cheapest first

### Tier 0 — Markdown we aren't using (hours, no API change)

Discord's markdown is richer than the prompt currently allows:

- `#`/`##`/`###` headers (must start the line)
- `-# subtext` — small gray text, ideal for the source/citation line the bot already writes out
  longhand
- `>` blockquotes, `[label](url)` masked links (link straight into cfb-app team pages)
- `<t:1753449600:R>` relative timestamps — "kickoff in 3 days", rendered in each user's timezone
- ` ``` ` monospace blocks — the only way to align columns, since **Discord has no table syntax**
- ` ```ansi ` blocks: 8 foreground + 8 background colors, bold, underline

⚠️ **ANSI is out for this server.** Colored ANSI blocks render on desktop/web only; on mobile
users see the raw escape codes. The screenshot is mobile, which is where the audience is. Plain
monospace blocks are safe everywhere — cap them at ~5 rows so they don't line-wrap on a phone.

**Work:** rewrite the formatting rules in `getBaseSystemPrompt()`, raise the char ceiling, add a
couple of golden-set eval entries that assert header/subtext usage.

### Tier 1 — Components V2 for the `/ask` path (~1 day)

This is the "Discord artifact" ProphetWild is describing. Opt in per-message with the
`IS_COMPONENTS_V2` flag (`1 << 15`, `MessageFlags.IsComponentsV2`) and you get a composable layout
instead of a fixed embed shape:

| Builder | What it gives us |
|---------|------------------|
| `ContainerBuilder` | Embed-like bordered card with an accent color — set it to the team's color from `teams_with_logos.color` |
| `TextDisplayBuilder` | Markdown text, placed anywhere, any number of times |
| `SectionBuilder` | 1–3 text blocks with a **button or thumbnail accessory** on the right (team logo from `teams_with_logos.logo`) |
| `MediaGalleryBuilder` | 1–10 images — this is where generated charts go |
| `SeparatorBuilder` | Rules between "How we got here" / "Read" sections |
| `FileBuilder` | Attach the CSV/JSON behind an answer |
| Action rows | Buttons + select menus, inline with the content |

**Limits and caveats (all verified against Discord's component reference):**

- Max **40 components** per message (nested ones count).
- **4000 characters** total across all text components — double the 2000-char `content` cap, so
  `splitMessage`'s 3-chunk truncation mostly goes away for `/ask`.
- Opting in **disables `content`, `embeds`, `poll`, and `stickers`** on that message.
- The flag **cannot be removed** from a message once set.
- Attachments do **not** auto-display; they must be referenced by a `File`, `MediaGallery`, or
  `Thumbnail` component via `attachment://name.png`.
- On a deferred interaction (which `/ask` uses — `deferReply()` at `ask.ts:37`), do **not** pass
  the flag to `deferReply()`. Pass it on `editReply()` with `content`, `embeds`, `poll`, and
  `stickers` explicitly `null`. There is history here (discord-api-docs #7515, discord.js #10855
  typings) — verify the exact call shape against 14.27 before building on it.

**Mentions get this too, and more easily.** `message.reply()` takes `MessageReplyOptions`, which
extends `MessageCreateOptions` — whose `flags` field accepts exactly `SuppressEmbeds`,
`SuppressNotifications`, and `IsComponentsV2`. So the mention path is a plain
`message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 })`, with **none of
the deferral dance** `/ask` needs: the flag just goes on the send. The reply-to reference is set by
the endpoint, not by a field CV2 disables, so replies still thread and still ping the author
(`allowedMentions.repliedUser` remains available — note that with CV2 it now governs mentions
inside `TextDisplay` markdown, since there is no `content`). Section §3 covers the shared plumbing.

**Recommendation: put Components V2 on the `/ask` and mention path only.** Because CV2 forbids
`embeds` on the same message, migrating the deterministic commands means porting all of
`format.ts` at once. Not worth coupling those two changes.

### Tier 2 — Actual graphics (2–4 days) ← the real ask

Three ways to get a PNG in front of a user. **Option B is the one to build.**

**A. Render inside the bot process.** `@napi-rs/canvas` (what the discord.js guide recommends) or
`satori` + `@resvg/resvg-js`. Rejected: forks chart code away from cfb-app, adds native deps to a
small Railway box, and the visual language drifts from the site.

**B. Render in cfb-app, reference from the bot. ✅** The Next app is already deployed on Vercel and
already has `d3@7.9`, `roughjs@4.6`, and the whole `src/lib/charts` theme (`ChartFrame`,
`RoughRadar`, `StatBar`, `axes`, `theme`). Add an image route — `GET
/api/chart/team-epa.png?team=Oklahoma&season=2026` — and the bot just points a `MediaGallery` item
(or `embed.setImage`) at the URL. Two rendering techniques inside that route:

- **`next/og`'s `ImageResponse`** (satori + resvg) for card-style graphics: stat cards, matchup
  comparisons, leaderboards. Flexbox/CSS subset, custom fonts — Libre Baskerville and DM Sans are
  already the design system's. Budget: 500KB of total assets per response.
- **Hand-drawn charts server-side.** `d3-scale` and roughjs's `rough.generator()` are both pure
  JS with no DOM dependency, so the route can emit an SVG string and rasterize it with resvg. Most
  roughjs-in-Node writeups reach for `xmldom` to fake a DOM; the generator API skips that entirely.
  This keeps the sketchy site aesthetic instead of inventing a second chart style for Discord.

Pros: one chart codebase, Vercel CDN caching, bot stays thin, images outlive the bot process.
Caveats: Discord proxies and caches external images **by URL** — every input that changes the
picture (season, week, team) must be in the query string, and live-data charts need a cache-buster.
There is a long-standing proxy bug where an embed image occasionally reports 0×0 and doesn't
render; fetching the bytes and uploading them as a real attachment sidesteps it, and our PNGs are
tens of KB against a 25MB ceiling, so that fallback is free.

**C. QuickChart** (hosted Chart.js-as-a-URL). Fastest possible prototype, but off-brand and puts a
third party in the request path. Use it to prove the plumbing, not to ship.

**What to draw first** — mapped to answers the bot already gives:

1. **By-down EPA / success-rate bars** — literally the content of the screenshot
2. Season trajectory line (`team_season_trajectory` already backs the site's version)
3. Matchup radar — `RoughRadar` exists
4. Leaderboard bars for `/leaders`
5. Win-probability curve for a game (`api.game_win_probability`)

**How does Claude decide to draw one?** Give it a tool. `src/lib/mcp/tools.ts` already registers
19 tools behind `/api/mcp`; add a `render_chart` tool that takes a small spec (chart type,
entities, metric, season) and returns a URL. Then charts are model-selected per question rather
than hardcoded per command — which is precisely "output a graphic instead of plain text." The bot
detects returned chart URLs in the answer and lifts them into a `MediaGallery`.

### Tier 3 — Interactivity (2–3 days on top)

Buttons and select menus turn one answer into a thread of them: *"Show the raw numbers"*,
*"Compare to conference"*, *"Next week"*, a season/poll picker on `/rankings`. Notes:

- Component clicks arrive as their own interaction events — separate 3-second ack deadline, and
  the token is good for 15 minutes.
- Needs a `custom_id` routing convention (≤100 chars, so encode small state directly in it) or a
  short-TTL state map — `bot/src/memory.ts` already establishes that pattern.
- Ephemeral responses (`MessageFlags.Ephemeral`) are good for "show me the SQL you ran" without
  spamming the channel.
- Threads are the answer to long replies: post a summary in-channel, put the full breakdown in a
  thread. Fixes the wall-of-text problem independent of everything above.

### Tier 4 — Discord Activities / Embedded App SDK (weeks) — not now

The literal artifact: a sandboxed iframe running a web app inside the Discord client, launched
from a channel. cfb-app is already a Next app, so the content exists, but Activities are a
separate app surface with Discord's proxy/CSP rules and are designed around shared, live,
multiplayer sessions. Overkill for a 100-person stats server. Worth revisiting only if there's
demand for something genuinely live and shared — an interactive game-day scoreboard everyone
watches together.

---

## 3. Both answer paths, one renderer

`/ask` and `@`-mentions are the same answer wearing different delivery mechanics, and today they
duplicate the formatting logic — `ask.ts:46-58` and `mention.ts:88-97` each call `splitMessage()`
and then send it their own way. Any rich-response work has to land in both, so Phase 1 should
start by extracting the rendering, not by editing two files in parallel.

**Proposed shape:** a new `bot/src/render/answer.ts` exporting something like

```ts
buildAnswerPayloads(text: string, opts: { team?: TeamStyle; charts?: string[] })
  => Array<{ components: TopLevelComponent[]; flags: MessageFlags.IsComponentsV2; files?: AttachmentBuilder[] }>
```

Each path then owns only its transport:

| | `/ask` | `@`-mention |
|---|---|---|
| Transport | `deferReply()` → `editReply(payload[0])` → `followUp(...)` | `message.reply(payload[n])` per payload |
| CV2 flag | **not** on `deferReply`; on `editReply` with `content`/`embeds`/`poll`/`stickers` set to `null` | just on the send |
| Progress signal | Discord's built-in "thinking…" | existing 8s typing loop (`mention.ts:30`) — unchanged |
| Reply semantics | reply to the interaction | replies to the triggering message, pings author |

Two things to get right:

1. **Return an array, not one payload.** CV2's 4000-char text budget means most answers fit in a
   single container, but long ones still split — and each extra payload is a separate CV2 message
   on both paths. Keep `splitMessage()`'s job (deciding *where* to break) and change only what
   wraps each chunk. Raising its `CHUNK_MAX` from 1900 toward the CV2 budget is a one-line change
   that alone kills most of the 3-chunk truncation.
2. **Leave the plain-text paths alone.** `mention.ts` has four bare-string replies —
   `EMPTY_MENTION_HELP`, `refusalMessage()`, the empty-answer message, and `GENERIC_ERROR_REPLY` —
   and `ask.ts` uses `errorEmbed()` for its failures. CV2 is per-message, so these can stay exactly
   as they are. Don't mix a container and a `content` string in one send; that's the one
   combination the API rejects.

Because the mention path has no deferral caveat, **prototype there first** — it isolates "does the
container render the way we want on mobile" from "did we get the deferred-edit call shape right."

## 4. Recommended sequencing

**Phase 1 — formatting (this week, small).** Extract the shared renderer described in §3, then
move **both** `/ask` and `@`-mentions onto it: a Components V2 container with the team accent
color, a header, a `-#` source line, and the team logo as a `Section` thumbnail. Widen
the system prompt's formatting vocabulary (headers, subtext, masked links to cfb-app team pages,
`<t:>` timestamps), raise the 1500-char ceiling toward the 4000-char CV2 budget, and replace "no
giant tables" with "≤5-row monospace block, mobile-safe." No new infrastructure; immediately fixes
the screenshot.

**Phase 2 — charts (the real answer).** `/api/chart/*.png` in cfb-app + a `render_chart` MCP tool
+ the bot rendering returned URLs in a `MediaGallery`. Ship by-down EPA bars first, since that is
the exact question that triggered this.

**Phase 3 — buttons.** Follow-up actions on `/ask` answers and pagination on `/rankings` /
`/leaders`.

**Skip** Activities.

## 5. Risks and things to watch

- 🚩 **The bot cannot attach files today.** The invite URL in `bot/README.md` uses permission
  integer `2147568640`, which decomposes exactly to View Channels + Send Messages + Embed Links +
  Read Message History + Use Application Commands. **`ATTACH_FILES` (`1 << 15`, 32768) is not in
  it.** That is fine for Tier 2 option B's default path — external image URLs go through Discord's
  media proxy and need only Embed Links — but any approach that uploads PNG bytes, including the
  `attachment://` references that `MediaGallery`/`File`/`Thumbnail` components use for local files,
  will fail until the bot is re-invited with `2147601408` (`2147568640 + 32768`). Re-inviting is a
  human step in the Developer Portal, so surface it early. Applies to both answer paths equally.
- **Mobile first.** The audience is on phones. No ANSI color; keep monospace blocks narrow; test
  every container on mobile before shipping — and test it on *both* paths, since a mention reply
  and a slash-command reply render in different message contexts.
- **CV2 is one-way per message and excludes embeds.** Don't half-migrate `format.ts`.
- **Latency.** `/ask` already takes 10–30s. Return a chart *URL* and let Discord fetch it — never
  block the reply on in-process rasterization.
- **Cost.** Images cost no LLM tokens; a `render_chart` tool call is a couple hundred. The
  existing `limits.ts` budget guards are unaffected.
- **Cache correctness.** Discord caches proxied images by URL. Live/in-progress-game charts need a
  cache-busting param or they'll go stale mid-game.

## 6. Sources

- [Discord component reference](https://docs.discord.com/developers/components/reference) — CV2
  types, the 40-component and 4000-char limits, flag restrictions
- [discord.js display components guide](https://discordjs.guide/legacy/popular-topics/display-components)
  — builders, `attachment://`, deferred-interaction caveat
- [discord.js `ContainerBuilder`](https://discord.js.org/docs/packages/discord.js/14.19.3/ContainerBuilder:Class)
- [`MessageCreateOptions`](https://discord.js.org/docs/packages/discord.js/14.24.2/MessageCreateOptions:Interface)
  — confirms `flags` accepts `IsComponentsV2` on regular (non-interaction) sends, which is what the
  mention path uses
- [Using message components](https://docs.discord.com/developers/components/using-message-components)
  — the flag applies identically to Message Create, Execute Webhook, and interaction responses
- [Discord permissions reference](https://docs.discord.com/developers/topics/permissions) —
  `ATTACH_FILES` bit
- [Cannot use Components V2 if you defer an interaction (discord-api-docs #7515)](https://github.com/discord/discord-api-docs/issues/7515)
- [A guide to ANSI on Discord](https://gist.github.com/kkrypt0nn/a02506f3712ff2d1c8ca7c9e0aed7c06)
  and [why it breaks on mobile](https://ultratextgen.com/guide/discord-colored-text-guide/)
- [Next.js `ImageResponse`](https://nextjs.org/docs/app/api-reference/functions/image-response) —
  satori + resvg, CSS subset, 500KB budget
- [roughjs](https://www.npmjs.com/package/roughjs) and
  [generating SVG with roughjs in Node](https://www.esparkinfo.com/qanda/nodejs/generate-an-svg-file-in-nodejs)
- [Image manipulation with @napi-rs/canvas](https://discordjs.guide/popular-topics/canvas)
- [Send charts with a Discord bot (QuickChart)](https://quickchart.io/documentation/send-charts-discord-bot/)
- [Embed image ignored for external URLs (discord-api-docs #725)](https://github.com/discord/discord-api-docs/issues/725)
  — proxy/0×0 behavior
- [Embedded App SDK](https://docs.discord.com/developers/developer-tools/embedded-app-sdk)
