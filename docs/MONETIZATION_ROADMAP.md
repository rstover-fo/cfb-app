# Monetization Roadmap

Phased plan for turning CFB Team 360 into a paid product: a freemium season pass
gating the prediction/edge content, an in-app chat agent, and a paid MCP tier --
with a long-term option on premium charting data (SIS-class) once subscriber
revenue supports it.

Written 2026-07-24. The 2026 season starts with Week 0 on Aug 29, so the
revenue-critical phases (1-2) target a mid-August launch.

## Strategy summary

- **What's free:** the editorial dashboard -- teams, games, rankings, analytics
  explorer, and the `/models` accuracy page. The public, verifiable model track
  record *is* the marketing. Never paywall it.
- **What's paid:** the opinionated, time-sensitive content -- scored matchup
  edges (`/predictions`), over/under picks (`/ou`), the in-app chat agent, and
  MCP access.
- **Pricing shape:** a one-time **season pass** (not a monthly sub). CFB is a
  5-month sport; monthly subs churn to zero every January and make revenue look
  broken. A season pass matches the fan's mental model.

### Tier ladder

| Tier | Price (starting point) | Includes |
|------|------------------------|----------|
| Free | $0 | Dashboard, teams, games, rankings, model accuracy page; 3 lifetime chat questions |
| Season Pass | $29 early-bird / $39 in-season | Predictions, edges, O/U, chat agent (5 questions/day) |
| MCP add-on | +$19/season (or $5/mo) | Personal API key for the MCP endpoint -- bring-your-own-Claude access to the full data surface |

Prices are hypotheses to validate, not commitments. The comparable market
(picks Discords, Action Network-style products) sits in the $30-100/season band.

### Unit economics

- Fixed infra: ~$10-45/month (Railway + Supabase). Break-even at 2-10 passes.
- Marginal cost per subscriber: cents -- **except** the chat agent, which costs
  ~$0.05-0.10 per Sonnet question (~$0.15-0.25 on Opus escalation). The daily
  question cap is what keeps a $29 pass margin-positive; an uncapped heavy user
  would cost more than their pass.
- The bot's existing guardrails (20s cooldown, 10 q/user/day, $10/day global
  budget in `bot/src/limits.ts`) carry over as the safety net. Worst-case LLM
  spend is structurally capped at ~$300/month.
- Sonnet 5 intro API pricing ($2/$10 per MTok) runs through 2026-08-31 --
  a cheap runway to measure real usage during launch. (`bot/src/limits.ts`
  hardcodes the post-intro $3/$15 rate, which overstates spend until September;
  conservative in the right direction, leave it.)

---

## Phase 0 -- Prerequisites (now, before any paid launch)

No code. Blocking items:

- [ ] **CFBD licensing.** cfb-database is fed by CollegeFootballData.com;
      commercial use requires their permission / Patreon tier. Get it in
      writing before charging anyone.
- [ ] **Logo strategy for paid surfaces.** Team logos come from `a.espncdn.com`.
      ESPN-hosted trademarked logos inside a *paid* product is a small but real
      risk. Decide: neutral logo set / plain wordmarks on gated pages, or
      accept the risk knowingly.
- [ ] **Disclaimer copy.** "Entertainment/informational purposes, not betting
      advice" on `/predictions` and `/ou`. Selling analytics content is fine
      under Stripe's terms (media product, not a gambling operator), but the
      disclaimer needs to exist.
- [ ] **Pick launch pricing** (see ladder above) and an early-bird window.

## Phase 1 -- Auth + entitlements foundation (~1 weekend)

The prerequisite everything else stacks on. The app currently has no user
accounts.

- Supabase Auth with magic links (already on Supabase; passwordless keeps it
  simple).
- New tables (with RLS):
  - `entitlements` -- `user_id`, `product` (`season_pass_2026`,
    `mcp_addon_2026`), `expires_at`, `stripe_customer_id`.
  - `usage_counters` -- `user_id`, `date`, `chat_questions_used`. Replaces the
    bot's in-memory counters for the web surface and makes caps
    entitlement-aware.
- Minimal account UI: sign-in, account page, sign-out in the sidebar.
- A `getEntitlement(userId, product)` helper in `src/lib/queries` (or a new
  `src/lib/entitlements.ts`), wrapped in React `cache()` like the other
  queries.

**Exit criteria:** a signed-in user with a manually-inserted entitlement row is
distinguishable from an anonymous visitor in a server component.

## Phase 2 -- Stripe season pass (~1 weekend; target mid-August)

- **Stripe Checkout** (hosted page), one-time payment mode. No card data ever
  touches the app; no subscription lifecycle to manage.
- `/api/stripe/webhook` route handler: on `checkout.session.completed`, write
  the `entitlements` row. Verify the webhook signature; make the handler
  idempotent on `event.id`.
- Gate at the **server-action layer** -- the existing pattern is perfect for
  this. `fetchScoredMatchupEdges` / the O/U route check entitlement before
  querying; client components never receive gated data.
- Gating style: hard paywall on `/predictions` + `/ou` for anonymous users, or
  **freshness gating** (subscribers see picks Tuesday, free users Saturday
  morning). Freshness gating is a strong option because the free tier still
  demonstrates the product every week.
- Stripe Customer Portal link on the account page for receipts/refunds.
- Upgrade CTA components on the gated pages (styled to the editorial theme --
  this is a sales page, treat it like one).

**Exit criteria:** a stranger can pay real money and see this week's edges
without any manual step.

**This is the launch.** Phases 3+ are in-season improvements; don't block the
season-pass launch on them.

## Phase 3 -- In-app chat agent (~2-3 weekends, in-season)

The bot (`bot/`) already contains ~80% of the backend: Haiku 4.5 router ->
Sonnet 5 default -> Opus 4.8 advisor escalation, system prompts, cost
accounting, limits logic. This phase is a new frontend plus a route handler
that reuses those patterns.

- **Backend:** `/api/chat` route handler (SSE streaming) using the Anthropic
  SDK tool runner (`client.beta.messages.toolRunner` + `betaTool`).
  - Tool handlers call `src/lib/queries` **directly** -- no MCP round-trip.
    MCP stays the external/power-user surface only.
  - Port the router/escalation tiering and the pricing table from
    `bot/src/limits.ts`; back the caps with `usage_counters` instead of
    process memory.
  - Keep a global daily budget guard (env var, same $10/day default).
- **Caps:** free users 3 questions *lifetime* (the conversion hook -- let them
  feel it, then paywall); pass holders 5/day. Both enforced server-side
  against `usage_counters` + `entitlements`.
- **Frontend:** the official `@shadcn` registry has no chat components -- use a
  third-party registry (**prompt-kit**, **shadcn-chatbot-kit**, or Vercel
  **AI Elements**) added to `components.json`. Keep the *presentational*
  components (message list, streaming markdown, input) and wire them to the
  SSE stream from the Anthropic SDK route -- most of these kits assume the
  Vercel AI SDK's `useChat`, which we are not adopting.
- **Theming pass:** the components arrive in generic shadcn styling. Restyle
  to the editorial system (Libre Baskerville / DM Sans, CSS custom
  properties, paper texture) or the chat panel will read as bolted-on. Run
  the design-reviewer gate at the end.

**Exit criteria:** a pass holder can ask "why did the model like Kansas State
last week?" in the app and get a streamed, data-grounded answer; a free user
hits the 3-question wall and sees the upgrade CTA.

## Phase 4 -- MCP paid tier (~1 weekend)

The auth infrastructure mostly exists (`src/lib/mcp/auth.ts` already does
SHA-256 + constant-time comparison; it just reads a single env token).

- `mcp_api_keys` table: `user_id`, `key_hash` (SHA-256), `created_at`,
  `revoked_at`, `last_used_at`.
- Extend `checkAuth` to look up the presented token's hash in the table
  (keep the env-var master token for ops). Fail closed, as today.
- Key management UI on the account page: generate (show once), revoke.
- **Rate limiting per key** -- especially for `run_sql`-shaped tools, which
  are the one path where a heavy user could push Supabase into a higher tier.
  A simple per-key daily call count in Postgres is enough at this scale.
- Sell as an add-on via a second Stripe Checkout price; entitlement product
  `mcp_addon_2026`. Gate key generation on it.
- Docs page: how to connect Claude Desktop / Claude Code / claude.ai to the
  endpoint.

**Exit criteria:** an add-on buyer can mint a key, connect Claude, and query
matchup edges from their own Claude conversation; revoking the key cuts access.

## Phase 5 -- Generated weekly content (optional, ~1 weekend, in-season)

The best LLM economics available: generate once, serve to all subscribers.
Costs like infrastructure, sells like a premium feature.

- AI-written weekly matchup previews for the FBS slate (~60 games), generated
  Tuesday night via the **Batch API** (50% off -- roughly $2-5/week total,
  fixed regardless of subscriber count).
- Store in a `game_previews` table; render on game pages (gated or
  freshness-gated like the picks).
- Ground each preview in the same query data the chat tools use; include the
  model's edge/pick so the content and the product reinforce each other.

## Phase 6 -- Premium data (long-term, gated on traction)

The strategic idea: charting-grade data vendors (SIS, PFF, Telemetry) sell
almost exclusively B2B at five-figure contracts. Nobody aggregates enthusiast
demand -- 500 fans x $50 is the same money as one B2B seat. That aggregation
play is the wedge (PFF+ did it for the NFL; college is open).

**Decision gates -- do not spend ahead of these:**

| Milestone | Unlocks |
|-----------|---------|
| ~50 season passes | Product-market signal is real; invest in Phase 5 content and marketing |
| ~150 passes | Trial a cheap premium feed (CFBD premium tier / Telemetry) as an upsell experiment |
| ~400-700 passes (~$1.0-1.7k/mo) | Revenue can carry an entry-level SIS-class contract; start the licensing conversation |

**Licensing caveats (matter more than price):**

- B2B contracts restrict *redistribution* -- showing raw licensed rows to end
  users is a different, pricier license than internal use. The workable
  pattern is **derived metrics**: compute house scores/models *from* the feed
  and display those.
- Negotiating angle with SIS: this product is a distribution channel to a
  market they don't serve. Ask explicitly about an enthusiast/derived-metrics
  tier.

---

## Sequencing at a glance

```
Aug 2026        Phase 0 -> 1 -> 2      LAUNCH before Week 0 (Aug 29)
Sep-Oct 2026    Phase 3 (chat), Phase 4 (MCP tier)
Oct-Nov 2026    Phase 5 (weekly previews) if traction warrants
Dec 2026        Bowl-season promo; measure conversion, churn intent
2027 offseason  Phase 6 evaluation against the milestone table
```

Season-over-season, the pass renews as a new product each August
(`season_pass_2027`), which is where the pricing experiment continues.
