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
  edges and ATS picks (`/predictions`), the in-app chat agent, and MCP access.
  - Note: there is **no over/under picks product today**. The house models
    (`elo_v1`, `elo_epa_blend_v1`) produce an expected margin and an `edge` /
    `edge_pick` against `market_spread` -- i.e. ATS only. O/U *lines* are
    stored and displayed as context (`over_under`, `ou_result`), but no model
    predicts totals. An O/U model is a **candidate future feature**, not
    launch inventory. (`/ou` is an unrelated legacy vanity redirect to the
    Oklahoma team page.)
- **Pricing shape:** a one-time **season pass** (not a monthly sub). CFB is a
  5-month sport; monthly subs churn to zero every January and make revenue look
  broken. A season pass matches the fan's mental model.

### Tier ladder

| Tier | Price (starting point) | Includes |
|------|------------------------|----------|
| Free | $0 | Dashboard, teams, games, rankings, model accuracy page; 3 lifetime chat questions |
| Season Pass | **$49/season** (one-time, no auto-renew) | Predictions, scored ATS edges, chat agent (5 questions/day) |
| Week pass | $14.99 | One week of the above -- the trial mechanic |
| MCP add-on | +$19/season | Personal API key for the MCP endpoint -- bring-your-own-Claude access to the full data surface |

**Why $49 and not $29** (revised after market research, 2026-07-24): $29 sits
*below* the credibility floor for this category. Normalized to a ~5-month
season the comparables are SportsLine ~$50, Action Network PRO ~$100/yr,
Dimers ~$150-200, TeamRankings ~$299/yr, Sharp Football NCAAF **$950/season**.
Nothing credible sells model ATS picks under ~$10/mo. To an audience anchored
on $99-950, cheap reads as "no edge" -- $29 would attract *fewer* buyers, not
more. $49 is the defensible bottom of the real-product band and gives a legible
value story: a real CFB model at a fan price.

**No auto-renew, deliberately.** The FTC's click-to-cancel Negative Option Rule
was vacated by the 8th Circuit on 2025-07-08, but ROSCA and state auto-renewal
laws survive (California's amended ARL took effect 2025-07-01; MN/OR/CO have
their own). A true one-time season pass sidesteps essentially that entire
compliance surface. Re-sell manually each August.

A weekly pass is the football-native trial: Dimers ($14.99/wk), Action
($19.99/wk), and Sharp ($79.99+/wk) all run one. It captures people who only
care about rivalry week and the CFP.

**Competitive note -- the paid product cannot be "ratings."** Bill Connelly's
SP+ left the ESPN paywall in May 2025 and is now free alongside Massey and
Sagarin. The paid tier has to be the **ATS edges plus an honest, timestamped
track record** -- which is what's scoped here.

### Unit economics

- Fixed infra: ~$10-45/month (Railway + Supabase). Break-even at 2-10 passes.
- Marginal cost per subscriber: cents -- **except** the chat agent, which costs
  ~$0.05-0.10 per Sonnet question (~$0.15-0.25 on Opus escalation). The daily
  question cap is what keeps a $49 pass margin-positive; an uncapped heavy user
  would cost more than their pass.
- Add CFBD Tier 3+ ($10-30/mo, see Phase 0) and Stripe fees (~2.9% + $0.30) to
  the fixed side. Break-even is still under ~10 passes.
- The bot's existing guardrails (20s cooldown, 10 q/user/day, $10/day global
  budget in `bot/src/limits.ts`) carry over as the safety net. Worst-case LLM
  spend is structurally capped at ~$300/month.
- Sonnet 5 intro API pricing ($2/$10 per MTok) runs through 2026-08-31 --
  a cheap runway to measure real usage during launch. (`bot/src/limits.ts`
  hardcodes the post-intro $3/$15 rate, which overstates spend until September;
  conservative in the right direction, leave it.)

---

## Phase 0 -- Prerequisites (now, before any paid launch)

Researched 2026-07-24. **Nothing found blocks a paid launch.** No license is
required to sell picks/analytics content in the US, and Stripe does not treat
it as gambling. What follows is one cheap subscription, one email, one
component, and a page of boilerplate.

*Not legal advice. The CFBD redistribution question and any auto-renew
structure are worth 30 minutes with a lawyer before charging.*

### CFBD -- subscribe and get permission in writing

CFBD's terms (effective 2025-07-01, Rad Sports Analytics LLC) contain **no
commercial-use prohibition** -- no non-commercial clause, no written-permission
requirement to build a paid product. Their own API-tiers page explicitly points
product builders at Tier 3+: *"Move into Tier 3 or above when you are building
products, using GraphQL, or expecting repeated in-season traffic."*

The one clause that matters: *"Reselling or redistributing data obtained from
the API **without explicit permission**."* Our architecture is a mirror, not a
client -- cfb-database's dlt pipelines persist CFBD data into our Supabase and
cfb-app serves it. Once end users are *paying*, an unsympathetic reading of
that clause reaches us. Mitigating: we serve rendered pages and derived model
outputs, not bulk exports or an API. And the clause is conditional -- permission
is obtainable.

Exposure here is **contractual and relational** (key revocation, burned
relationship with a solo maintainer), not IP -- the underlying facts aren't
copyrightable (*Feist*; *NBA v. Motorola*).

- [ ] Subscribe to **CFBD Tier 3+** ($10-30/mo via Patreon) before charging.
- [ ] Email `admin@collegefootballdata.com` (or ask in their Discord):
      one paragraph describing the product -- paid CFB analytics site, stores
      CFBD data in our own Postgres for serving, no data export or API resale,
      attribution in footer. Ask for explicit written OK on the store-and-serve
      pattern. **Keep the reply.**
- [ ] Add a site-wide footer credit: "Data: CollegeFootballData.com."
      (Attribution is optional per the terms but is the cheapest goodwill
      available from a maintainer who can revoke the key at will. There is no
      footer component in the app today.)
- [ ] Verify the CFBD key never ships to the client and isn't in the repo.
- [ ] **Never** expose a bulk export / CSV download / public API of
      CFBD-derived rows. That is the line between "product" and "reseller."

### Team logos -- disclaimer, not license

Hotlinking `a.espncdn.com` inside a paid product is a technical breach of the
Disney/ESPN ToU ("personal, noncommercial use only"). Calibrate it, though:
**ESPN doesn't own these marks** -- the schools do; ESPN is a host. Their
realistic remedy is referer-blocking or URL rotation, not litigation. No
reported enforcement against a sports-analytics site was found.

CLC (Learfield) represents 800+ schools but licenses **merchandise** -- there is
no editorial/informational program to buy. The operative doctrine is nominative
fair use (*New Kids on the Block*): prongs 1 and 3 are easy for us; prong 2
("only so much of the mark as reasonably necessary") is where a full-color logo
is weaker than a plain school name. Enforcement history targets apparel and
uniforms, not stats sites.

**Market practice: paid products display official college logos, and they
self-host them.** Verified by fetching:

| Product | Paid? | Logos | How |
|---|---|---|---|
| **PFF** | $24.99/mo | Yes | Self-hosts a 2.9 MB SVG sprite of **vectorized** official school + conference marks on its own CDN |
| **TeamRankings** | ~$27-57/mo | Yes | Self-hosts school logos as GIFs (`/images/logo/ncf/…`) |
| **Action Network** | PRO tier | Yes | Self-hosts a full NCAAF set (`static.sprtactn.co/teamlogos/ncaaf/`) |
| **Sports Reference / Stathead** | $80+/yr | Yes | Self-hosts; **licensed the aggregation from SportsLogos.net** |
| **CFBD itself** | Patreon $1-30/mo | Yes | Self-hosts at `/api/logos/{size}/{espn_id}.png` -- recompressed ESPN 500px assets |
| **gameonpaper** | Free | Yes | **Hotlinks** ESPN directly (396 refs on one page) |

Two things fall out of that. First, **displaying college logos in a paid
product is unambiguously the industry norm** -- including for the person who
supplies our data. Second, **hotlinking ESPN is the *free* site's pattern**;
every paid comparable self-hosts, which reads as not wanting to depend on a
third party's CDN.

**But do not copy the self-hosting half.** The paid players who self-host either
**licensed** the aggregation (Sports Reference, from SportsLogos.net) or
**redrew** the marks as vectors (PFF). Copying ESPN's PNGs to our own origin is
the one move that is both a clearer Disney ToU breach (§2.A "reproduce,
distribute … or transform") *and* forfeits the server-test defense that
protects a true inline link. Hotlink now; if we ever want to self-host, license
or redraw first.

> **Conflicting agent findings, unresolved.** One research pass reported a
> verbatim NCAA non-affiliation disclaimer in TeamRankings' footer and a
> similar line on CFBD's About page; a second pass found **no** disclaimer on
> either (CFBD's terms are client-rendered and could not be read). Treat "every
> comparable ships a disclaimer" as **unverified**. It does not change the
> recommendation -- a disclaimer is cheap and *Toyota v. Tabari* confirms courts
> weigh one -- but do not repeat the claim as fact.

- [ ] **Add `unoptimized` to the 9 logo `<Image>` sites that lack it.**
      *Audited 2026-07-24: 14 of 23 logo call sites pass `unoptimized`; these
      9 do not:*

      | File | Lines |
      |---|---|
      | `src/components/GamesList.tsx` | 363, 425 |
      | `src/components/game/GameScoreHeader.tsx` | 23, 71 |
      | `src/components/dashboard/RecentGamesWidget.tsx` | 25, 87 |
      | `src/components/dashboard/StandingsWidget.tsx` | 22 |
      | `src/components/dashboard/StatLeadersTabs.tsx` | 43 |
      | `src/components/dashboard/TopMoversWidget.tsx` | 22 |

      Why it matters: with `unoptimized`, the browser fetches from ESPN
      directly and **our server never touches the bytes** -- an inline link,
      protected by the "server test" (*Perfect 10*; *Hunley v. Instagram*,
      9th Cir. 2023 -- though note a 2025 circuit split). Without it,
      `next/image` server-side fetches, re-encodes, caches under
      `<distDir>/cache/images`, and re-serves the asset from **our** domain
      via `/_next/image`. That is server-side reproduction and redistribution
      -- not protected by the server test, and squarely within the Disney ToU
      §2.A bar on "reproduce, distribute … or transform."
      **~15 minutes; the highest legal delta per minute of work in Phase 0.**
      Tradeoff: those images lose Next's resizing/WebP conversion, matching
      the 14 sites that already opt out. If dashboard performance regresses,
      the alternative is self-hosting a logo set (see `TeamMark` below), not
      re-enabling the optimizer against ESPN.
- [ ] **Build a `TeamMark` component** -- one abstraction that renders either
      the ESPN logo or a color-chip + abbreviation wordmark in Libre
      Baskerville. Logo URLs currently flow from `teams_with_logos` straight
      into five separate call sites. Centralizing means the whole site's team
      branding flips with one env flag if ESPN referer-blocks us or a
      compliance office emails. **Highest-leverage item in Phase 0; ~1
      afternoon.**
- [ ] **Zero logos in marketing** -- not on the pricing page, OG/social share
      images, ads, or favicon. Logos inside the analytics UI are informational;
      logos on a page that says "$49" look like endorsement, and that is the
      fact pattern that generates letters.
- [ ] Do **not** switch to Wikipedia/Wikimedia logos as a "safer" source --
      those are hosted under non-free fair-use rationales (en.wiki
      `Template:Non-free school logo`; Commons refuses fair-use files
      outright), not free licenses, and self-hosting adds server-side copying.
      No permissively-licensed CFB logo set exists -- the GitHub repos that
      look like one are ESPN/SportsLogos scrapers whose MIT license covers the
      *code*, not the images.
- [ ] **Separate exposure worth a look: Disney ToU §2.B.x** bans automated
      extraction "compiling, building, creating or contributing to any
      collection of data, data set or database." If any `cfb-database` dlt
      pipeline pulls from ESPN endpoints, that is a **larger** commercial-terms
      problem than the logos are. Audit the pipeline's sources.

### Picks content -- legal and platform posture

Selling analysis is not accepting wagers, and **no US state licenses B2C
handicapping content**. The usual counterexample, Nevada's "information
service" licensing (NRS 463.01642), reaches only those who sell information
*to a licensed sports pool* -- B2B, not consumer content.

**Stripe does not prohibit this.** Every gambling bullet on their US restricted
list is qualified by a prize ("sports forecasting or odds-making **with a
monetary or material prize**"). We sell content: no prize, no entry fee, no
wager. Confirmed empirically -- Action Network, DubClub, and Establish The Run
all run on Stripe today. (Notably Stripe's *Japan* list does name prediction
services for gambling; they know how to name the category when they mean to.)

The Stripe clauses that actually bite are about **marketing, not product**:
"get rich quick," "outrageous claims," "fake testimonials." So *"the model beat
the closing line by 1.4 pts/game over 2019-2025"* is fine; *"guaranteed
winners"* closes the account. Same standard as FTC Act §5 substantiation.

- [ ] Ship `/terms`, `/privacy`, `/disclaimer` routes -- **the app has none
      today.** Minimum content:
      1. "For entertainment and informational purposes only. This site does not
         accept or facilitate wagers of any kind."
      2. "No outcome is guaranteed. Past model performance does not predict
         future results."
      3. 18+ age statement.
      4. Responsible-gambling block (1-800-GAMBLER plus the NY/CT/MD lines,
         mirroring RotoWire).
      5. Non-affiliation disclaimer (NCAA, conferences, member institutions,
         ESPN) -- does double duty for the logo section above.
      6. Clear refund policy. "No refunds, no credits for partial periods" is
         the industry standard and is fine *if disclosed pre-purchase*.
- [ ] Describe the business to Stripe at onboarding as **"sports analytics
      content subscription"** -- which is what it is.
- [ ] **Enable Stripe Tax from day one.** Digital subscriptions are taxable in
      ~25 states; economic nexus is typically $100k or 200 transactions per
      state per year. A checkbox now, a mess later.
- [ ] **Public methodology page** and a timestamped, auditable pick log --
      record each pick *before kickoff* with the line and book graded against,
      disclose the vig assumption, publish losing weeks. It is both the FTC §5
      defense and the best conversion asset. Sites that quietly regrade are the
      ones that draw complaints.

### Keep off the roadmap

- **Sportsbook affiliate links.** A different regulatory regime entirely -- NJ
  requires DGE vendor registration, AZ an affiliate license ($1,500 initial /
  $500 renewal). Don't bolt these on casually.
- **Any bulk data export or public API** of CFBD-derived rows (see above).

### Remaining decision

- [ ] Confirm **$49 season pass, no auto-renew**, plus a $14.99 week pass
      (see the tier ladder above for the reasoning).

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

- **Stripe Checkout** (hosted page), one-time payment mode -- **not** a
  subscription. No card data touches the app, no subscription lifecycle, and
  per Phase 0 the one-time structure sidesteps the ROSCA / state auto-renewal
  compliance surface entirely.
- Two prices against the same `season_pass_2026` product: $49 season, $14.99
  week (the week pass writes a short `expires_at`).
- **Enable Stripe Tax** on the prices at setup (Phase 0).
- `/api/stripe/webhook` route handler: on `checkout.session.completed`, write
  the `entitlements` row. Verify the webhook signature; make the handler
  idempotent on `event.id`.
- Gate at the **server-action layer** -- the existing pattern is perfect for
  this. `fetchScoredMatchupEdges` checks entitlement before querying; client
  components never receive gated data.
- Gating style: hard paywall on `/predictions` for anonymous users, or
  **freshness gating** (subscribers see picks Tuesday, free users Saturday
  morning). Freshness gating is a strong option because the free tier still
  demonstrates the product every week.
- Stripe Customer Portal link on the account page for receipts.
- Upgrade CTA components on the gated pages (styled to the editorial theme --
  this is a sales page, treat it like one). **No team logos on it** (Phase 0),
  and no guarantee/"easy money" language -- that copy is what actually
  jeopardizes a Stripe account.
- Ship the `/terms`, `/privacy`, `/disclaimer` routes and the footer
  (attribution + non-affiliation) from Phase 0 **before** the first charge.

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
