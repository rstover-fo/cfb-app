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
- Add CFBD Tier 3 ($10/mo, already subscribed) and Stripe fees (~2.9% + $0.30)
  to the fixed side. Break-even is still under ~10 passes at $49.
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

- [x] ~~Subscribe to **CFBD Tier 3+**~~ -- **already on Tier 3** ($10/mo,
      confirmed 2026-07-24): 75,000 requests/mo shared across the football and
      basketball APIs, experimental GraphQL endpoint with real-time
      subscriptions, and weekly model-training-data downloads from week 5.
      This is the tier CFBD's own docs point product builders at, so the
      "are we on a commercial-appropriate plan" question is settled.
      - Quota is **not** a scaling risk: cfb-app never calls CFBD at runtime --
        ingestion happens in cfb-database's dlt pipelines, so request volume
        tracks pipeline frequency, not subscriber count. Paying users add zero
        CFBD calls.
      - Two Tier 3 benefits worth designing around later: **GraphQL real-time
        subscriptions** (a cheaper path for `/live` than polling) and the
        **weekly model training data** drops (direct input to the house models
        and any future O/U model).
- [ ] **Send the permission email.** Draft ready at
      `docs/plans/cfbd-permission-email.md` -- send it and file the reply.
      *This is the last genuine unknown in Phase 0.*
      Email `admin@collegefootballdata.com` (or ask in their Discord):
      one paragraph describing the product -- paid CFB analytics site, stores
      CFBD data in our own Postgres for serving, no data export or API resale,
      attribution in footer. Ask for explicit written OK on the store-and-serve
      pattern. **Keep the reply.**
- [x] ~~Add a site-wide footer credit~~ -- shipped in
      `src/components/SiteFooter.tsx`, wired into the root layout. Carries the
      CFBD credit, the non-affiliation disclaimer, and the
      entertainment-purposes line.
      Original note: add a site-wide footer credit: "Data: CollegeFootballData.com."
      (Attribution is optional per the terms but is the cheapest goodwill
      available from a maintainer who can revoke the key at will. There is no
      footer component in the app today.)
- [x] ~~Verify the CFBD key never ships to the client and isn't in the repo.~~
      **Verified 2026-07-25:** no `CFBD_API_KEY` reference anywhere in cfb-app,
      no `.env` files tracked, and the only `NEXT_PUBLIC_*` vars are
      `SUPABASE_URL`, `SUPABASE_ANON_KEY` (both public by design),
      `SCOUT_API_URL`, and `TEAM_LOGOS`. Expected -- cfb-app never calls CFBD;
      ingestion lives in cfb-database. **Re-run this check in cfb-database**,
      which is where the key actually lives.
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

- [x] ~~**Add `unoptimized` to the 9 logo `<Image>` sites that lack it.**~~
      **Done** -- all 23 sites now opt out (verified by re-audit; lint,
      typecheck, and 779 tests green). Since superseded by `TeamMark`, which
      owns the `unoptimized` prop centrally and has a regression test asserting
      the `src` never routes through `/_next/image`.
      *Audited 2026-07-24: 14 of 23 logo call sites passed `unoptimized`; these
      9 did not:*

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
- [x] ~~**Build a `TeamMark` component**~~ -- shipped in
      `src/components/TeamMark.tsx` with 8 tests. The flag is
      `NEXT_PUBLIC_TEAM_LOGOS=espn` (default) or `off` (neutral color-chip +
      initials mark sitewide). Note `abbreviation` is **not** in the app's data
      (`teams_with_logos` selects `school, logo, color, conference`), so the
      neutral mark derives initials from the school name.
      Original note: build a `TeamMark` component -- one abstraction that renders either
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

- [x] ~~Ship `/terms`, `/privacy`, `/disclaimer` routes~~ -- **shipped**
      (`src/app/{terms,privacy,disclaimer}/page.tsx`), linked from the footer.
      **Two caveats, both live:**
      1. **Unreviewed by a lawyer.** Each file carries a `DRAFT CONTENT`
         docblock saying so. Have counsel read them before the first charge.
      2. **Terms and Privacy describe Phase 1/2 architecture that does not
         exist yet** -- accounts, Stripe, usage caps. Accurate as of Phase 2,
         aspirational today. Re-read and correct when auth and billing ship; a
         privacy policy claiming a practice we don't follow is worse than none.

      Content shipped:
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
- [ ] **Public methodology page** and a timestamped, auditable pick log.
      **Spec'd:** `docs/plans/2026-07-25-pick-log-spec.md`. Headline finding --
      `api.game_predictions` is a *latest-snapshot* view (`DISTINCT ON game_id,
      model_version ORDER BY prediction_date DESC`), so it cannot back an
      auditable log; the record has to be an append-only
      `app.published_picks` ledger written by a weekly freeze job. Depends on
      Phase 1's `app` schema. Original note:
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
> ### ⚠️ BLOCKER: server-action gating alone is cosmetic today
>
> Measured 2026-07-25 against the live project. The `anon` role -- whose key is
> public by design and ships in the browser bundle -- currently holds `SELECT`
> on **40 objects in `api`**, 44 in `core`, and more in `ref`, `stats`,
> `ratings`, `recruiting`, `analytics`, `betting`, `draft`, `predictions`.
> cfb-app reads 35 `api` objects, so the prediction views that *are* the paid
> product are almost certainly in that anon-readable set (confirm the exact
> list before designing the fix).
>
> **Consequence:** gating `fetchScoredMatchupEdges` in a server action stops
> nobody. Anyone can lift the anon key from the deployed bundle and
> `select * from api.scored_matchup_edges` over PostgREST. The paywall would be
> a UI convention, not an access control.
>
> **`public.run_analyst_query` makes it worse, and independently.** It is
> `SECURITY INVOKER` (verified: `prosecdef = false`) with `anon=X/postgres` in
> its ACL -- so any anon caller gets an arbitrary read-only SQL interface
> running with anon's own grants. Two things follow:
> - The MCP endpoint's bearer token is **not** the boundary for this RPC. The
>   token gates our route handler; the RPC is reachable directly.
> - **Un-exposing schemas does not close it.** The function executes inside
>   Postgres, so PostgREST's exposed-schema list never applies. Only the
>   *role's grants* constrain it.
>
> **The principled fix is to make `anon`'s grants match the schema contract.**
> The contract says cfb-app reads `api` + `public` + `app`; the grants
> currently say far more. Revoke anon's `SELECT` outside those three, and both
> problems collapse at once -- the RPC becomes contract-bounded, and
> un-exposing schemas becomes belt-and-braces rather than the only defense.
>
> Then gated data needs a real boundary. Options, cheapest first:
> 1. RLS on the paid views keyed to `app.entitlements`.
> 2. Serve gated reads with the service-role client from server actions only,
>    and revoke anon `SELECT` on those specific views.
> 3. A `SECURITY DEFINER` view/function that checks entitlement internally.
>
> **Caveat before revoking anything:** cfb-database and cfb-scout share this
> project. Confirm neither depends on anon-role reads (dlt pipelines normally
> connect as `postgres`/service_role, so this is likely safe -- but verify).
>
> `app.entitlements` and `app.usage_counters` are **not** affected: anon has no
> grants on either, by design.
>
> #### Remediation log
>
> | Date | Action | Result |
> |---|---|---|
> | 2026-07-25 | Confirmed cfb-database does not use the anon role -- it connects via `psycopg2` + `SUPABASE_DB_URL` (`tests/conftest.py`). Only doc/vendored false positives in the grep. | Safe to revoke |
> | 2026-07-25 | `revoke select on all tables in schema core from anon` + matching `alter default privileges` | **BROKE PRODUCTION. Rolled back.** Analytics and other pages went blank. Restored with `grant select on all tables in schema core to anon`. |
>
> #### Why the revoke broke production -- read before retrying
>
> The reasoning that led to it was: cfb-app's code only calls `.schema('api')`,
> `.schema('app')`, and implicit `public`, therefore revoking `core` is safe.
> The premise was verified and correct. **The conclusion does not follow.**
>
> `api` and `public` are largely **views over `core` tables**. Whether a view
> needs the *caller* to hold privileges on its base tables depends on the view's
> `security_invoker` setting:
>
> - default (`security_invoker = false`) -- runs with the **view owner's**
>   privileges; base-table grants are irrelevant to the caller
> - `security_invoker = true` -- runs with the **caller's** privileges, so
>   `anon` must hold SELECT on the base tables in `core`
>
> Measured after the fact, and the split is stark:
>
> | Schema | Views | Invoker-mode |
> |---|---|---|
> | `api` | 41 | **1** (`matchup_forecast`) |
> | `public` | 13 | **13 -- all of them** |
>
> So `api` was nearly immune and **every `public` view broke at once**:
> `teams_with_logos`, `games`, `roster`, `team_epa_season`, `team_style_profile`,
> `defensive_havoc`, `team_tempo_metrics`, `team_season_trajectory`,
> `team_special_teams_sos`, `teams`, `team_season_epa`, `recruits_search`,
> `transfer_portal_search`.
>
> `teams_with_logos` alone backs `getTeamLookup()`, which feeds most pages in the
> app -- which is why the blast radius looked like "lots of views" rather than
> one page.
>
> **The distinction to hold onto:** "cfb-app does not *query* `core`" is true.
> "cfb-app does not *depend on* `core` grants" is false. Auditing the
> application's query layer says nothing about the database's view-dependency
> graph.
>
> #### Corrected prerequisite for any future revoke
>
> 1. Audit `security_invoker` across **every** exposed schema's views, not just
>    `api`:
>    ```sql
>    select n.nspname, c.relname,
>           coalesce(c.reloptions::text like '%security_invoker=true%', false) as security_invoker
>    from pg_class c join pg_namespace n on n.oid = c.relnamespace
>    where c.relkind in ('v','m') and n.nspname in ('api','public')
>    order by security_invoker desc, n.nspname, c.relname;
>    ```
> 2. Any invoker-mode view that reads a schema you plan to revoke must first be
>    converted to owner-privileged (a cfb-database change), or it goes dark.
> 3. Only then revoke -- and still one schema at a time, with the app open.
>
> **All remaining schemas are on hold** pending step 1. The same failure mode is
> waiting in each of them.
>
> #### What this means for the anon-exposure problem
>
> Revoking base-schema grants **cannot** be the fix, because cfb-app's own
> `public` views are 100% invoker-mode and depend on exactly those grants. The
> exposure and the app's read path are currently the same permission.
>
> The order that actually works:
> 1. **Convert `public`'s 13 views to owner-privileged** (drop
>    `security_invoker`) in cfb-database. `anon` then needs SELECT on the views
>    only, not on `core` and friends.
> 2. **Then** revoke anon's SELECT on the base schemas. Now it is a no-op for
>    the app and a real closure of the exposure.
>
> Note the tension: Supabase's advisor flags `security_definer_view` as a risk,
> because an owner-privileged view can serve rows past RLS on its base tables.
> That is the correct concern in general -- but these base tables have no RLS
> today (89 `rls_disabled_in_public` findings), so step 1 exposes nothing that
> is not already world-readable, while step 2 closes a great deal. If RLS is
> ever added to `core`, revisit this: owner-privileged views would bypass it.
>
> **Remaining schemas**, same treatment, one at a time with a pipeline cycle
> between: `ref`, `stats`, `ratings`, `recruiting`, `analytics`, `betting`,
> `draft`, `predictions`, `rp`, `features`, `live`, `marts`, `metrics`.
>
> - **Hold `scouting`** until cfb-scout is checked the same way -- it owns that
>   schema.
> - **Never touch** `storage`, `realtime`, `graphql_public` -- Supabase-managed.
> - **Keep** `api`, `public`, `app` -- the contract surface cfb-app reads.
>
> Two follow-ups that stop this recurring:
> 1. Disable **"Automatically expose new tables"** on the Data API page
>    (Supabase's own recommendation). With it on, every new table in an exposed
>    schema becomes publicly queryable the moment a pipeline creates it.
> 2. cfb-database already has privilege regression tests asserting
>    `psycopg2.errors.InsufficientPrivilege` (`tests/test_returning_schema.py`,
>    `tests/test_api_views.py`). Add an anon-grant assertion there so this
>    cannot silently regress.
>
> **Note on `alter default privileges`:** without `FOR ROLE` it only covers
> objects created by the role that ran it. If the dlt pipeline creates tables as
> a different role, new tables will re-acquire the grant -- re-run as
> `alter default privileges for role <pipeline_role> in schema <s> ...` if that
> shows up.

- Gate at the **server-action layer** -- necessary but NOT sufficient (see the
  blocker above). The existing pattern is right for
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
