# Design Memo: Phase 1 — Auth + Entitlements Foundation

**Date:** 2026-07-24
**Status:** Design (no implementation)
**Owner:** architect
**Source of truth:** `docs/MONETIZATION_ROADMAP.md` (Phase 1, Phase 2, tier ladder)
**Exit criteria (from roadmap):** a signed-in user with a manually-inserted entitlement row is distinguishable from an anonymous visitor in a server component.

---

## 1. Scope

Phase 1 delivers the account substrate everything else stacks on. It ships **no
paywall** — nothing in the app changes behavior for anonymous visitors except
the appearance of a sign-in affordance. The gate itself is Phase 2.

In scope:

1. Supabase Auth, magic-link (passwordless) only, on the existing `@supabase/ssr` helpers.
2. `entitlements` + `usage_counters` tables with RLS, in an app-owned schema.
3. `getEntitlement(userId, product)` and friends, `cache()`-wrapped, in `src/lib/queries/`.
4. Sign-in page, account page, sidebar account affordance.
5. Forward-compat seams for Phase 2 (Stripe webhook → service-role writes) and Phase 3 (`usage_counters` check-and-increment from `/api/chat`).

Explicitly out of scope: Stripe anything, gating `/predictions`, chat, MCP keys,
OAuth providers, password auth, email change / account deletion flows.

---

## 2. Decision summary

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | App-owned tables live in a **new `app` schema**, not `public` | `public` is cfb-database's legacy convenience surface; a regen/migration there could collide. `app` gives cfb-app a namespace it owns end-to-end. |
| D2 | Migrations for `app.*` live in **cfb-app** (`supabase/migrations/`), not cfb-database | The schema contract makes cfb-database the source of truth for *data* schemas (`core`, `api`, `predictions`, marts). `app` carries no warehouse data — it is application state. Splitting ownership by schema keeps the contract intact. |
| D3 | Contract guard is **upgraded from a `core` denylist to a schema allowlist** (`api`, `app`) | Today's guard only bans `.schema('core')`; `.schema('app')` would pass silently, and so would a typo'd `.schema('predictions')`. Allowlisting is the same amount of code and closes the hole the new schema opens. |
| D4 | **No write policies** on either table for `authenticated` | Reads are RLS-scoped to `auth.uid()`. All writes go through service-role (Stripe webhook) or a `SECURITY DEFINER` RPC (usage increment). A user must never be able to grant themselves a pass or zero their own counter. |
| D5 | Magic link uses the **PKCE `code` + `exchangeCodeForSession`** flow via `/auth/callback` | Works with Supabase's default email template (no template edit needed), and `@supabase/ssr` defaults to PKCE. The `token_hash` / `/auth/confirm` variant is the fallback if we later need custom templates. |
| D6 | **Middleware is required**, not optional | Server Components cannot write cookies, so a refreshed access token can never be persisted from an RSC render. Without middleware the session dies silently at token expiry (1h default) and the user appears randomly signed out. |
| D7 | `getUser()` everywhere server-side; **`getSession()` is banned** | `getSession()` reads the cookie without verifying the JWT — it is trivially forgeable. `getUser()` round-trips to the auth server. Worth a lint note in the module header. |
| D8 | **No MCP tool in Phase 1** | The invariant is "MCP tool where agent-useful." The MCP endpoint authenticates with a single shared operator token today; an `get_my_entitlement` tool there would expose one user's billing state to any token holder. Phase 4 introduces per-user keys — revisit then. |

---

## 3. Schema ownership and the cfb-database contract

`../cfb-database/docs/SCHEMA_CONTRACT.md` was **not reachable** from this
workspace at design time (`/home/user/cfb-database` does not exist), so this
section works from the contract description in `CLAUDE.md` and the enforcement
in `src/lib/queries/__tests__/contract-guard.test.ts`. **Open question O1** below
tracks confirming this against the real document.

The contract as this app understands it:

- `core` / `core_staging` — dlt-loaded internal, **banned** from cfb-app.
- `api` — contracted PostgREST views, the preferred read surface.
- `public` — legacy convenience views + RPCs, still read but not extended.
- All of the above are **populated and owned by cfb-database**.

`entitlements` and `usage_counters` are not warehouse data. They are written by
cfb-app (and by Stripe on cfb-app's behalf), they have no dlt pipeline, and
cfb-database has no reason to know they exist. Putting them in `public` would
place app state inside a schema another repo migrates. Putting them in `api`
would be worse — `api` is by definition the *contracted read surface over
warehouse data*, and a mutable per-user table there breaks that meaning.

**Therefore: a new `app` schema, owned by cfb-app.**

### 3.1 The one hard dependency on cfb-database / ops

PostgREST only serves schemas listed in its `db-schemas` config. `.schema('app')`
from `supabase-js` returns a 404-ish PostgREST error until `app` is added to the
project's exposed schemas. That config is project-level, shared with
cfb-database, and is **the blocking prerequisite** for every other step:

```
Supabase Dashboard → Project Settings → API → Exposed schemas
  public, api  →  public, api, app
```

Equivalent SQL (if applied as migration rather than dashboard):

```sql
alter role authenticator set pgrst.db_schemas = 'public, api, app';
notify pgrst, 'reload config';
```

Coordinate this with whoever owns the Supabase project config. It is a superset
change — nothing cfb-database reads or writes is affected — but it must land
before any Phase 1 query works, and it must be replicated in every environment
(local, preview, prod).

### 3.2 Migration layout (new in cfb-app)

There is no `supabase/` directory in cfb-app today. Create:

```
supabase/
  migrations/
    20260725000000_create_app_schema.sql
    20260725000100_create_entitlements.sql
    20260725000200_create_usage_counters.sql
    20260725000300_create_consume_chat_question.sql   # Phase 3 seam, safe to land now
  README.md   # how to apply; states that app.* is cfb-app-owned, api/core are not
```

`supabase/README.md` should state the ownership boundary explicitly so a future
reader does not assume cfb-app has started shipping warehouse DDL.

### 3.3 Contract-guard interaction (D3)

Current guard (`src/lib/queries/__tests__/contract-guard.test.ts:27`):

```ts
const FORBIDDEN_PATTERN = /\.schema\(\s*['"]core['"]\s*\)/
```

This is a denylist of exactly one schema. `.schema('app')` passes today, which
means Phase 1 *does not trip the guard as written* — but it also means the guard
would not catch `.schema('core_staging')`, `.schema('predictions')`, or a typo.
Proposed replacement, same file, same walk logic:

```ts
// Only these schemas may be addressed from app code. `api` is the contracted
// warehouse read surface (cfb-database-owned); `app` is cfb-app's own
// account/entitlement state (see docs/plans/2026-07-24-phase1-auth-entitlements.md).
// Everything else -- notably core/core_staging -- is banned.
const ALLOWED_SCHEMAS = new Set(['api', 'app'])
const SCHEMA_CALL_PATTERN = /\.schema\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/g
```

…and the failure message keeps naming `core` explicitly so the existing error
copy stays useful. The `ALLOWLIST` file-level escape hatch stays as-is.

Two notes for the implementer:

- `auth.users` is never addressed from cfb-app via `.schema('auth')`. The user
  identity comes from `supabase.auth.getUser()`, not a PostgREST read. Keep it
  that way — `auth` stays off the allowlist.
- The guard scans `src/lib/mcp` too, so a future MCP entitlement tool would be
  covered automatically.

---

## 4. DDL sketch

Illustrative, not final. Column names deviate from the roadmap in one place
(`usage_date` instead of `date`) — flagged inline.

### 4.1 Schema + grants

```sql
create schema if not exists app;

grant usage on schema app to anon, authenticated, service_role;

-- Default-deny posture: no blanket table grants. Each table grants explicitly.
alter default privileges in schema app revoke all on tables from anon, authenticated;
```

### 4.2 `app.entitlements`

```sql
create table app.entitlements (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  product                     text not null,
  source                      text not null default 'manual',  -- 'manual' | 'stripe' | 'comp'
  granted_at                  timestamptz not null default now(),
  expires_at                  timestamptz,                     -- null = never expires
  stripe_customer_id          text,
  stripe_checkout_session_id  text,                            -- Phase 2 idempotency key
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- Regex, not an enum: season_pass_2027 must not require a migration.
  constraint entitlements_product_format
    check (product ~ '^(season_pass|mcp_addon)_[0-9]{4}$'),
  constraint entitlements_source_valid
    check (source in ('manual', 'stripe', 'comp'))
);

-- One row per (user, product). Makes the Phase 2 webhook a plain upsert.
create unique index entitlements_user_product_key
  on app.entitlements (user_id, product);

-- Second idempotency guard: a replayed checkout.session.completed cannot
-- create a duplicate even if the (user, product) upsert path is bypassed.
create unique index entitlements_checkout_session_key
  on app.entitlements (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

grant select on app.entitlements to authenticated;
grant all    on app.entitlements to service_role;
-- anon: nothing. Not even select.
```

Notes:

- **`expires_at` semantics:** `null` means perpetual. A season pass sold in
  August 2026 should get a real `expires_at` (proposal: `2027-02-01`, after the
  natty) so the 2027 pass is a genuine repurchase rather than a code change.
  "Active" is `expires_at is null or expires_at > now()`.
- **`stripe_customer_id` denormalized onto the row** is fine at this scale, per
  the roadmap. A separate `app.customers` table is the refactor if/when one user
  buys both products and we want a single portal link — not now.
- No `updated_at` trigger proposed; Phase 2's upsert sets it explicitly. A
  trigger is fine if preferred, but it is one more object to migrate.

### 4.3 `app.usage_counters`

```sql
create table app.usage_counters (
  user_id             uuid not null references auth.users(id) on delete cascade,
  usage_date          date not null,
  chat_questions_used integer not null default 0 check (chat_questions_used >= 0),
  updated_at          timestamptz not null default now(),
  primary key (user_id, usage_date)
);

grant select on app.usage_counters to authenticated;
grant all    on app.usage_counters to service_role;
```

Two deviations from the roadmap's sketch, both deliberate:

- **`usage_date`, not `date`.** `date` is a type name; a column called `date`
  makes every hand-written query and every RPC body noisier and invites
  quoting bugs. Cheap to rename now, annoying later.
- **Day boundary is `America/Chicago`, not UTC.** A "5 questions/day" cap that
  resets at 7pm CT during a Saturday slate reads as a bug to the user. The
  timezone is a single constant (`USAGE_TIMEZONE`) shared by the RPC and the
  TypeScript layer. **Open question O4** — confirm before the table has rows,
  because changing it later re-buckets history.

### 4.4 Free-tier "lifetime" counter

The tier ladder wants **3 lifetime** questions for free users and **5/day** for
pass holders. A `(user_id, usage_date)` table expresses the daily cap directly;
lifetime is `sum(chat_questions_used)` over all of a user's rows. At this scale
(one row per user per active day) that sum is trivially cheap and needs no
separate table or sentinel row. Keep one ledger, evaluate both caps against it.

### 4.5 `app.consume_chat_question` (Phase 3 seam — land in Phase 1)

Check-and-increment must be **one atomic operation**. A read-then-write from the
route handler lets a user with two open tabs exceed the cap, and the cap is the
thing keeping a $29 pass margin-positive.

```sql
create or replace function app.consume_chat_question(
  p_daily_limit    integer,
  p_lifetime_limit integer
)
returns table (allowed boolean, used_today integer, used_lifetime integer)
language plpgsql
security definer
set search_path = app, pg_catalog
as $$
declare
  v_user      uuid := auth.uid();
  v_today     date := (now() at time zone 'America/Chicago')::date;
  v_lifetime  integer;
  v_today_cnt integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Serializes concurrent questions for this user only. Cheaper and clearer
  -- than SERIALIZABLE isolation for a two-statement check-and-increment.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select coalesce(sum(uc.chat_questions_used), 0)
    into v_lifetime
    from app.usage_counters uc
   where uc.user_id = v_user;

  select coalesce(uc.chat_questions_used, 0)
    into v_today_cnt
    from app.usage_counters uc
   where uc.user_id = v_user and uc.usage_date = v_today;

  if v_lifetime >= p_lifetime_limit or v_today_cnt >= p_daily_limit then
    return query select false, v_today_cnt, v_lifetime;
    return;
  end if;

  insert into app.usage_counters (user_id, usage_date, chat_questions_used)
       values (v_user, v_today, 1)
  on conflict (user_id, usage_date)
    do update set chat_questions_used = app.usage_counters.chat_questions_used + 1,
                  updated_at = now();

  return query select true, v_today_cnt + 1, v_lifetime + 1;
end;
$$;

revoke all on function app.consume_chat_question(integer, integer) from public, anon;
grant execute on function app.consume_chat_question(integer, integer) to authenticated;
```

Design points worth preserving:

- **The function takes no `user_id`.** It reads `auth.uid()` internally, so a
  caller cannot spend someone else's quota. This is why `SECURITY DEFINER` is
  safe here.
- **Limits are parameters, not hardcoded.** The route handler passes
  `FREE_CHAT_QUESTIONS_LIFETIME` / `PASS_CHAT_QUESTIONS_PER_DAY` from
  `constants.ts` after resolving entitlement, so the tier ladder stays in one
  place (TypeScript) and pricing experiments don't require a migration. Pass
  holders get `p_lifetime_limit = 2147483647` (effectively unbounded).
- `set search_path` is mandatory on `SECURITY DEFINER` — without it the function
  is a privilege-escalation vector.

---

## 5. RLS policy design

```sql
alter table app.entitlements   enable row level security;
alter table app.usage_counters enable row level security;

create policy entitlements_select_own
  on app.entitlements for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy usage_counters_select_own
  on app.usage_counters for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Deliberately absent: insert / update / delete policies for `authenticated`.
-- With RLS enabled and no permissive policy for a command, that command is
-- denied for that role. Writes reach these tables exactly two ways:
--   1. service_role (BYPASSRLS) -- the Stripe webhook, Phase 2.
--   2. app.consume_chat_question() -- SECURITY DEFINER, Phase 3.
```

Notes and gotchas:

- **`(select auth.uid())`, not bare `auth.uid()`.** Wrapping in a scalar
  subquery lets Postgres evaluate it once as an InitPlan instead of per row.
  Irrelevant at 50 rows, free to get right now.
- **RLS filters, grants authorize.** Both are required. A permissive policy with
  no `GRANT SELECT` still returns nothing; a `GRANT INSERT` with no policy still
  denies. The DDL above sets both consistently — do not "fix" a permission error
  by adding a grant without checking the policy, or vice versa.
- **`anon` gets no grants at all.** An anonymous visitor's client never queries
  these tables; the app short-circuits on `user === null` before any query.
- **`FORCE ROW LEVEL SECURITY` is deliberately not used.** Forcing RLS applies
  policies to the table owner too, which would break `consume_chat_question`
  (a definer function running as the owner). `service_role` bypasses RLS via its
  `BYPASSRLS` role attribute regardless, so forcing buys nothing here and costs
  a debugging session.
- **Service-role key handling** is the single highest-severity security surface
  this phase introduces. See §9.1.

---

## 6. Auth flow (magic link in App Router)

### 6.1 Request

`/signin` renders a client form whose `action` is the `requestMagicLink` server
action. The action calls:

```ts
supabase.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    shouldCreateUser: true,
  },
})
```

`siteUrl` comes from a new **`NEXT_PUBLIC_SITE_URL`** env var, not from
`headers()`. Deriving origin from the request header works locally and then
sends preview-deployment users to a preview URL that gets torn down — an
explicit env var per environment is the boring correct answer.

Supabase Dashboard prerequisite (ops, same class as §3.1):
`Authentication → URL Configuration → Site URL` plus a **Redirect URLs
allowlist** containing `http://localhost:3000/auth/callback` and the production
callback. Supabase silently falls back to Site URL for non-allowlisted
redirects, which presents as "the magic link always lands on the homepage."

### 6.2 Callback

`src/app/auth/callback/route.ts` (Route Handler, GET):

1. Read `code` and `next` from the query string.
2. `const { error } = await supabase.auth.exchangeCodeForSession(code)` — this
   writes the session cookies via the `@supabase/ssr` cookie adapter, which
   works in a Route Handler (unlike in an RSC).
3. On success, `redirect(safeNext)`. On failure, redirect to
   `/auth/auth-code-error`.

**Open-redirect guard:** `next` is attacker-controllable via the email link.
Accept it only if it starts with `/` and not `//` (protocol-relative), else fall
back to `/account`. This is a one-line check that is very easy to omit.

Template: `src/app/ou/route.ts` + `src/app/ou/route.test.ts` is the existing
route-handler-with-cookies-and-redirect pair in this repo, and its test asserts
status + `location` + `set-cookie` — exactly the shape the callback test needs.

### 6.3 Sign-out

Server action `signOut()` → `supabase.auth.signOut()` → `redirect('/')`.
Invoked from a client component as `<form action={signOut}>`, so it works
without JS and needs no `onClick` handler.

### 6.4 Why not `token_hash` / `/auth/confirm`

Supabase's server-side guide also offers a `token_hash` + `verifyOtp` variant at
`/auth/confirm`, which requires editing the email template to emit
`{{ .TokenHash }}`. Both variants are equally vulnerable to link-prefetching
(§9.3). The `code` variant needs no template edit, so it is the smaller weekend.
Note the choice in the callback route's header comment so the next person knows
the alternative exists.

---

## 7. Session handling: middleware vs server components

This is the part most likely to be got wrong, so it is spelled out.

**Middleware's only job is to refresh the token and write the refreshed cookie.**
Server Components cannot set cookies (`src/lib/supabase/server.ts:19-22` already
swallows that exact failure in a `try/catch`). So when an access token expires
mid-session, the refresh must happen somewhere that *can* write — middleware or
a Route Handler. Without it, users get spuriously signed out after ~1 hour.

**Server Components read, they do not refresh.** They call `getCurrentUser()`,
which wraps `supabase.auth.getUser()`.

New files:

- `src/lib/supabase/middleware.ts` — exports `updateSession(request)`, creating a
  `createServerClient` bound to `request.cookies` / `response.cookies` and calling
  `getUser()`.
- `src/middleware.ts` — thin wrapper + `config.matcher`.

Three rules the implementer must not violate (they are the documented
`@supabase/ssr` footguns):

1. **Return the exact `supabaseResponse` object** the helper built. Constructing
   a fresh `NextResponse` and returning it drops the refreshed `Set-Cookie`
   headers and produces an infinite sign-in loop. If a redirect is needed, build
   `NextResponse.redirect(...)` and copy `supabaseResponse.cookies.getAll()` onto it.
2. **Do not put logic between `createServerClient` and `getUser()`.** Anything
   that touches cookies in between desynchronizes the request/response cookie jars.
3. **`getUser()`, never `getSession()`.** In middleware `getSession()` does not
   revalidate and will happily accept a forged cookie.

Matcher — exclude static assets and the two Route Handlers that authenticate by
bearer token or webhook signature rather than by cookie:

```ts
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/mcp|api/[^/]+/mcp|api/stripe|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

`src/app/api/[transport]/route.ts` resolves at `/api/mcp` with
`basePath: '/api'`; it uses `checkAuth` (bearer token) and has no use for a
cookie refresh. The `api/stripe` exclusion is pre-emptive for Phase 2 — the
webhook must reach the handler with its **raw body untouched**.

**Rendering impact: none.** `src/app/layout.tsx` already calls `cookies()`, so
every route in this app is already dynamically rendered. Adding auth reads does
not cost us any static routes, because there are none.

---

## 8. Modules created and API-shape contracts

### 8.1 File inventory

**Database**
- `supabase/migrations/*.sql` (4 files, §3.2)
- `supabase/README.md`

**Supabase clients**
- `src/lib/supabase/middleware.ts` — `updateSession`
- `src/lib/supabase/admin.ts` — service-role client (Phase 2 seam, §9.1)
- `src/middleware.ts`

**Auth / session**
- `src/lib/auth/session.ts`
- `src/lib/auth/__tests__/session.test.ts`

**Queries**
- `src/lib/queries/entitlements.ts`
- `src/lib/queries/__tests__/entitlements.test.ts`
- `src/lib/queries/__tests__/fixtures/entitlements.ts`
- `src/lib/queries/constants.ts` — **modified**, additive
- `src/lib/queries/__tests__/helpers.ts` — **modified**, `auth` stub (§10)
- `src/lib/queries/__tests__/contract-guard.test.ts` — **modified**, D3

**Types**
- `src/lib/types/entitlements.ts` (hand-written; `database.generated.ts` is
  generated against `public`/`api` and regenerating it to include `app` would
  churn a large file for two tables)

**Routes / pages**
- `src/app/auth/callback/route.ts` + `route.test.ts`
- `src/app/auth/auth-code-error/page.tsx`
- `src/app/signin/page.tsx`
- `src/app/account/page.tsx` + `page.test.tsx`
- `src/app/account/actions.ts` — the `'use server'` boundary

**Components**
- `src/components/auth/SignInForm.tsx` + test
- `src/components/auth/SignOutButton.tsx` + test
- `src/components/auth/AccountNavItem.tsx` + test
- `src/components/ui/input.tsx`, `src/components/ui/label.tsx` — via
  `npx shadcn@latest add input label`; `--input` is already aliased
  (`src/app/globals.css:100`), so they inherit editorial tokens with no
  hand-editing beyond a token audit
- `src/components/Sidebar.tsx` — **modified**
- `src/components/__tests__/Sidebar.test.tsx` — **modified**
- `src/app/layout.tsx` — **modified**

**Env**
- `.env.example` (new — the repo has none today), documenting
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MCP_AUTH_TOKEN`.

### 8.2 `src/lib/auth/session.ts`

```ts
export interface SessionUser {
  id: string
  email: string | null
}

/** Request-deduped current user, or null when anonymous. Uses getUser()
 *  (JWT-verifying), never getSession(). Never throws — an auth-server
 *  failure reads as "anonymous", matching the query layer's convention of
 *  degrading rather than exploding a page render. */
export const getCurrentUser: () => Promise<SessionUser | null>   // cache()

/** Server-component / server-action guard. Redirects to
 *  /signin?next=<encoded> when anonymous; returns a non-null user otherwise. */
export function requireUser(next?: string): Promise<SessionUser>
```

`requireUser` is intentionally *not* `cache()`d — it calls `redirect()`, which
throws a control-flow signal that should not be memoized.

### 8.3 `src/lib/queries/entitlements.ts`

```ts
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type EntitlementProduct = `season_pass_${number}` | `mcp_addon_${number}`
export type EntitlementSource = 'manual' | 'stripe' | 'comp'

export interface Entitlement {
  product: EntitlementProduct
  source: EntitlementSource
  granted_at: string
  expires_at: string | null           // ISO 8601, null = perpetual
  stripe_customer_id: string | null
}

/** The single entitlement row for (user, product), or null when absent or
 *  expired. "Active" == expires_at is null OR expires_at > now(); the filter
 *  runs in SQL, not in JS, so an expired row never crosses the wire. */
export const getEntitlement: (
  userId: string,
  product: EntitlementProduct,
) => Promise<Entitlement | null>                                   // cache()

/** All currently-active entitlements for a user. One query instead of N
 *  when a page needs to know about both products (the account page does). */
export const getActiveEntitlements: (
  userId: string,
) => Promise<Entitlement[]>                                        // cache()

/** Null-tolerant boolean convenience — takes the nullable user id straight
 *  from getCurrentUser() so callers don't branch twice. */
export const hasEntitlement: (
  userId: string | null | undefined,
  product: EntitlementProduct,
) => Promise<boolean>

export interface ViewerAccess {
  user: SessionUser | null
  seasonPass: boolean
  mcpAddon: boolean
}

/** The composed shape every gated surface will want in Phase 2, resolved in
 *  one cache()d call: identity + both product flags. This is the function
 *  `/predictions` and the chat route will actually call. */
export const getViewerAccess: () => Promise<ViewerAccess>          // cache()
```

Implementation notes for the data-layer engineer:

- `.schema('app').from('entitlements')`, chained
  `.eq('user_id', userId).eq('product', product)`
  `.or(\`expires_at.is.null,expires_at.gt.${nowIso}\`).maybeSingle()`.
  `maybeSingle()` — not `single()` — because "no entitlement" is the normal case
  and `single()` treats zero rows as a PostgREST error.
- Follow `src/lib/queries/rankings.ts`'s error convention: `console.error` with a
  `[entitlements]` prefix and return the safe value (`null` / `[]` / `false`).
  **Fail closed:** a query error must read as "no entitlement," never as access.
- `getViewerAccess` composes `getCurrentUser()` + `getActiveEntitlements()`;
  because both are `cache()`d, calling it from the layout *and* from a page in
  the same render costs one round trip total.
- Do **not** derive product slugs inside this module — import them (§8.4).

### 8.4 `src/lib/queries/constants.ts` additions

```ts
// Entitlement season. Deliberately NOT derived from CURRENT_SEASON:
// CURRENT_SEASON is the season with *data* (2025 today) while the pass being
// sold is for the *upcoming* season (2026). `season_pass_${CURRENT_SEASON}`
// would mint season_pass_2025 and silently sell the wrong product.
export const ENTITLEMENT_SEASON = 2026
export const SEASON_PASS_PRODUCT = `season_pass_${ENTITLEMENT_SEASON}` as const
export const MCP_ADDON_PRODUCT   = `mcp_addon_${ENTITLEMENT_SEASON}` as const

// Tier ladder (docs/MONETIZATION_ROADMAP.md). Lives in TypeScript, not in the
// DB, so a pricing/limit experiment is a deploy rather than a migration.
export const FREE_CHAT_QUESTIONS_LIFETIME = 3
export const PASS_CHAT_QUESTIONS_PER_DAY  = 5

// Day boundary for usage_counters. Must match app.consume_chat_question().
export const USAGE_TIMEZONE = 'America/Chicago'
```

This file's header says "Pure constants with no server dependencies - safe for
client components" — all of the above qualify, which matters because the upgrade
CTA in Phase 2 will want to render "5 questions/day" client-side.

### 8.5 Server-action boundary: `src/app/account/actions.ts`

Follows `src/app/games/actions.ts` and `src/app/predictions/actions.ts` exactly —
`'use server'`, re-export types, thin async wrappers.

```ts
'use server'

// Types re-exported so client components never import server-only modules.
export type { SessionUser } from '@/lib/auth/session'
export type { Entitlement, EntitlementProduct, ViewerAccess } from '@/lib/queries/entitlements'

export interface MagicLinkState {
  status: 'idle' | 'sent' | 'error'
  message?: string
}

/** useActionState-shaped: (prevState, formData) => nextState.
 *  Always returns 'sent' for a syntactically valid address, whether or not an
 *  account exists — a differentiated response is an account-enumeration oracle. */
export async function requestMagicLink(
  prevState: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState>

/** Clears the session and redirects to '/'. Invoked as <form action={signOut}>. */
export async function signOut(): Promise<void>
```

Boundary rules that hold for this phase:

- `SignInForm`, `SignOutButton`, `AccountNavItem` are `'use client'` and import
  **only** from `@/app/account/actions` and `@/lib/queries/constants`. They never
  import `@/lib/auth/session`, `@/lib/queries/entitlements`, or
  `@/lib/supabase/server`.
- Every non-type export in a `'use server'` file must be an async function.
  `MagicLinkState` is an `interface`, erased at compile time — fine, and the same
  pattern the existing action files already use for their re-exported types.
- Entitlement data reaches the UI **props-down from server components**
  (`layout.tsx` → `Sidebar`, `account/page.tsx` → children). There is no
  client-triggered entitlement refetch in Phase 1, so no `fetchEntitlement`
  action is needed. Do not add one speculatively — Phase 2 gates at the action
  layer, which means the *gated data fetchers* check entitlement internally
  rather than the client asking "am I entitled?" and then asking for data.

### 8.6 UI surface

- **`/signin`** — server component. If already signed in, `redirect('/account')`.
  Renders `<SignInForm next={searchParams.next} />`. Single email input,
  submit, and a "check your email" success state driven by `useActionState`.
  Editorial styling: existing `card.tsx` + `button.tsx`, headline in Libre
  Baskerville, tokens only — no raw hex.
- **`/account`** — server component. `const user = await requireUser('/account')`,
  then `getActiveEntitlements(user.id)`. Renders email, a plan row per product
  (or "Free" with a placeholder for the Phase 2 upgrade CTA), and
  `<SignOutButton />`. Leave an explicit comment where the Stripe Customer
  Portal link lands in Phase 2.
- **Sidebar** — gains `user?: SessionUser | null`, passed from `layout.tsx`
  alongside the existing `dataUpdatedLabel`. Renders `<AccountNavItem />` in the
  bottom section next to `<ThemeToggle />` and the existing Settings button:
  signed out → a `Link` to `/signin` ("Sign in", `SignIn` Phosphor icon); signed
  in → a `Link` to `/account` showing the email truncated, respecting the
  existing `collapsed` behavior (`md:hidden` on the label span).
  **The sidebar must not fetch.** It receives props. This is the invariant.

---

## 9. Forward-compatibility

### 9.1 Phase 2 — Stripe webhook (service-role client)

`src/lib/supabase/admin.ts`:

```ts
import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/** Service-role client. BYPASSES RLS — it is the only way to write
 *  app.entitlements. Import ONLY from route handlers and 'use server' files.
 *  Never from a component, never from src/lib/queries. */
export function createAdminClient() { /* SUPABASE_SERVICE_ROLE_KEY, no cookies, autoRefreshToken: false, persistSession: false */ }
```

Ship this file in Phase 1 (it is ~15 lines) so the security review happens once,
under no launch pressure. Three hard requirements:

- `import 'server-only'` at the top, so a stray client import is a **build
  error**, not a runtime key leak. Add `server-only` to dependencies.
- `SUPABASE_SERVICE_ROLE_KEY` — **no `NEXT_PUBLIC_` prefix**, ever. That prefix
  inlines the value into the client bundle and would hand every visitor full
  database write access.
- Add a guard test alongside `contract-guard.test.ts` asserting
  `@/lib/supabase/admin` is imported only from files that are Route Handlers or
  begin with `'use server'`. Same walk-the-tree shape as the existing guard;
  cheap, and it is the check that catches the mistake that ends the project.

Phase 2's webhook then does:
`createAdminClient().schema('app').from('entitlements').upsert({...}, { onConflict: 'user_id,product' })`
— which is exactly why §4.2 has that unique index, and why `authenticated` has
no insert policy.

Webhook idempotency beyond the unique indexes: a small `app.stripe_events
(event_id text primary key, received_at timestamptz)` insert-first table is the
standard pattern (`on conflict do nothing`; zero rows affected → already
processed → 200 and return). Not needed in Phase 1; note it in the migration
README so Phase 2 doesn't reinvent it.

**Linking Stripe to a user:** the webhook receives a Stripe customer, not a
Supabase user id. Pass `client_reference_id = user.id` when creating the
Checkout Session — that is a Phase 2 line of code, but it is the reason Phase 2
requires a *signed-in* user before checkout. Worth stating now because it shapes
the Phase 2 funnel: **sign in → checkout**, not checkout → account creation.

### 9.2 Phase 3 — chat usage counters

`/api/chat` (Route Handler, cookie-authenticated, so it stays *inside* the
middleware matcher) will:

1. `const { user, seasonPass } = await getViewerAccess()` → 401 if anonymous.
2. `const dailyLimit = seasonPass ? PASS_CHAT_QUESTIONS_PER_DAY : 1`
   and `const lifetimeLimit = seasonPass ? Number.MAX_SAFE_INTEGER : FREE_CHAT_QUESTIONS_LIFETIME`.
3. `supabase.rpc('consume_chat_question', { p_daily_limit, p_lifetime_limit })`
   **before** the first Anthropic token is spent — using the *user's* cookie
   client, not the admin client, so `auth.uid()` resolves.
4. `allowed === false` → 402/429 with the upgrade CTA payload.

Phase 1 ships the RPC and the migration; Phase 3 ships the caller. Ship a
`consumeChatQuestion()` wrapper in `src/lib/queries/entitlements.ts` too if it
costs nothing — but it is **not** `cache()`d (it mutates; memoizing a mutation
would silently drop the second increment in a request). Flag that in the header
comment, since every other function in the directory is cached.

---

## 10. Testing plan

The "triple" invariant (query fn + `createSupabaseMock` test, UI + RTL test, MCP
tool where agent-useful) applies with the MCP leg deliberately empty (D8).

**`createSupabaseMock` needs one extension.** `src/lib/queries/__tests__/helpers.ts`
returns `{ from, schema, rpc }` — no `auth`. Testing `getCurrentUser` needs
`auth.getUser()`. Add an optional config key:

```ts
export interface SupabaseMockConfig {
  tables?: ResponseMap
  apiTables?: ResponseMap      // keyed by table name for ANY .schema(x) call
  rpc?: Record<string, ResponseEntry>
  auth?: { user?: { id: string; email: string | null } | null; error?: PostgrestError | null }
}
```

Note the existing helper resolves `.schema(anything).from(t)` against
`config.apiTables[t]` — the schema name only namespaces the response *cursor*,
not the lookup. So `.schema('app').from('entitlements')` already works with
`apiTables: { entitlements: ok([...]) }` and **needs no change**. The `auth`
addition is the only edit. (Renaming `apiTables` → a schema-keyed map is the
cleaner design but touches ~15 existing test files — not this weekend.)

Test list:

| Test | Covers |
|---|---|
| `src/lib/queries/__tests__/entitlements.test.ts` | active row, expired row filtered, missing row → null, PostgREST error → fails closed, `getViewerAccess` composition |
| `src/lib/auth/__tests__/session.test.ts` | `getCurrentUser` signed in / anonymous / auth error → null |
| `src/app/auth/callback/route.test.ts` | valid code → 307 to `next`; missing code → error page; `next=https://evil.com` → falls back to `/account` |
| `src/components/auth/__tests__/SignInForm.test.tsx` | renders, submits, shows "check your email", shows error state |
| `src/components/auth/__tests__/AccountNavItem.test.tsx` | signed-out link, signed-in link + email, collapsed variant |
| `src/components/__tests__/Sidebar.test.tsx` (edit) | new prop renders; existing assertions unchanged |
| `src/app/account/page.test.tsx` | pass holder vs free rendering |
| `contract-guard.test.ts` (edit) | `.schema('app')` allowed, `.schema('core')` and `.schema('predictions')` still fail |

RLS itself is **not** unit-testable from Vitest (the mock has no policy engine).
Verify it manually with two real accounts — see checklist step 12. That manual
check is the actual security assurance; the unit tests only cover shape.

---

## 11. Risks and open questions

**R1 — Supabase's built-in SMTP will not survive launch (highest severity).**
The default email service is rate-limited to a couple of messages per hour
project-wide and is explicitly not for production. Magic links *are* the entire
auth mechanism, so this caps signups at roughly zero on launch day. **Mitigation:
configure a custom SMTP provider (Resend / Postmark / SES) during Phase 1**, not
Phase 2. It is a dashboard config plus a DNS record (SPF/DKIM), and the DNS
propagation is why it cannot be a launch-day task. Treat as a Phase 1 exit
criterion even though the roadmap doesn't list it.

**R2 — Email link prefetching burns single-use tokens.** Corporate mail scanners
and some clients issue a GET on links in received mail, consuming the magic link
before the human clicks; the user then sees "link expired." Mitigations, in
order of cost: (a) surface a clear "request a new link" path on
`/auth/auth-code-error`; (b) offer 6-digit OTP entry as an alternative
(`signInWithOtp` emails a code too if the template includes `{{ .Token }}`, and
`verifyOtp` accepts it) — this is the real fix and is maybe 40 lines; (c) accept
it. Recommend (a) in Phase 1, (b) if the weekend has room.

**R3 — Exposed-schemas config is shared with cfb-database.** §3.1 changes
project-level PostgREST config. Low risk (additive), but it must be replicated
across every environment and it is invisible in this repo's source. Document it
in `supabase/README.md` and `.env.example` so a new environment doesn't silently
404 on every entitlement read.

**R4 — Service-role key exposure.** See §9.1. The `server-only` import plus the
import guard test are the controls. Also confirm the key is set as a
non-`NEXT_PUBLIC_` variable in the deployment platform.

**R5 — Middleware touches every request.** Adding `src/middleware.ts` changes
behavior globally and adds an auth-server round trip per navigation. Land it in
its own commit, run the full suite before and after, and watch p50 latency.
`getUser()` per request is the documented trade-off for correctness over
`getSession()`; at this traffic level it is fine.

**R6 — `CURRENT_SEASON` is 2025 while the product sold is `season_pass_2026`.**
Any code that derives the product slug from `CURRENT_SEASON` mints the wrong
product and it will not be noticed until someone pays. §8.4 makes
`ENTITLEMENT_SEASON` a separate explicit constant precisely to prevent this.

**O1 — The schema contract document was not reachable** (`../cfb-database` absent
from this workspace). §3 reasons from `CLAUDE.md`'s description. Before writing
migrations, read `SCHEMA_CONTRACT.md` and confirm: (a) that it does not already
reserve a schema for app-owned state, (b) whether it specifies a migration
convention cfb-app should mirror, (c) whether Contract Rule 4's language needs an
amendment noting `app` as a cfb-app-owned, non-warehouse schema.

**O2 — `expires_at` for the 2026 season pass.** Proposal: `2027-02-01T00:00:00Z`.
Needs a product decision; it is written by Phase 2's webhook, so it must be
settled before Phase 2 and can be deferred past Phase 1.

**O3 — `/ou` is currently a legacy vanity redirect** (`src/app/ou/route.ts` →
`/teams/oklahoma?theme=ou`), *not* the over/under picks page the roadmap's Phase
2 assumes it will gate. Phase 2 either builds `/ou` as a new page (and relocates
the Oklahoma vanity redirect) or picks a different route for O/U picks. Not a
Phase 1 blocker; flagged because the roadmap reads as though the page exists.

**O4 — Usage-counter day boundary** (§4.3). Recommend `America/Chicago`. Cheap
now, re-buckets history later.

**O5 — Does an entitlement survive an email change?** Rows key on
`auth.users.id`, which is stable across email changes, so yes. No action needed —
recorded because it is the first question support will ask.

---

## 12. Implementation checklist

Ordered. Steps 1–3 are prerequisites with external dependencies — start them
first because they have wall-clock latency (DNS, dashboard access) even though
they are minutes of work.

**Prerequisites (do these Friday night)**

1. Add `app` to Supabase exposed schemas in every environment (§3.1). Verify
   with a `curl` against `/rest/v1/` for the `app` schema.
2. Configure custom SMTP + SPF/DKIM (R1). DNS needs time to propagate.
3. Set Site URL + Redirect URL allowlist (§6.1). Add `NEXT_PUBLIC_SITE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` to local `.env.local` and the deploy platform;
   create `.env.example`.

**Saturday morning — data layer**

4. Write `supabase/migrations/*.sql` (§4) + `supabase/README.md`. Apply locally.
   Insert one entitlement row by hand for your own user — that row is what
   proves the exit criterion.
5. `src/lib/types/entitlements.ts`.
6. Extend `createSupabaseMock` with the `auth` stub (§10). **Land this alone and
   run the whole suite** — every query test imports this file.
7. Upgrade `contract-guard.test.ts` to the schema allowlist (D3). Confirm it
   still fails on a planted `.schema('core')`.
8. `src/lib/queries/constants.ts` additions (§8.4).
9. `src/lib/auth/session.ts` + `src/lib/queries/entitlements.ts` + both test
   files + fixtures. Template: `src/lib/queries/rankings.ts` for structure and
   error convention, `__tests__/rankings.test.ts` for the mocking shape.

**Saturday afternoon — auth plumbing**

10. `src/lib/supabase/middleware.ts` + `src/middleware.ts` (§7). Land alone; run
    the full suite before and after (R5).
11. `src/app/auth/callback/route.ts` + test + `/auth/auth-code-error/page.tsx`.
    Template: `src/app/ou/route.ts` + `route.test.ts`.
12. **Manual RLS verification.** Two real accounts, both signed in, each with an
    entitlement row: confirm A cannot read B's row, cannot insert their own, and
    cannot update `usage_counters`. This is the security check the unit tests
    cannot do — do not skip it.

**Sunday morning — UI**

13. `npx shadcn@latest add input label`; audit both for raw color values and
    confirm they resolve to the editorial tokens.
14. `src/app/account/actions.ts` (§8.5).
15. `SignInForm` + `/signin` page + test.
16. `SignOutButton`, `AccountNavItem` + tests.
17. `/account` page + test.
18. Wire `layout.tsx` → `Sidebar` (`user` prop); update `Sidebar.test.tsx`.

**Sunday afternoon — hardening + Phase 2 seam**

19. `src/lib/supabase/admin.ts` with `import 'server-only'`; add the `server-only`
    dependency; write the admin-import guard test (§9.1).
20. Full gate: `npm run lint && npm run typecheck && npm run test && npm run build`.
21. End-to-end walk on a preview deploy: sign in from a real inbox → callback →
    `/account` shows the pass → sign out → sidebar reverts. Confirm the session
    survives past access-token expiry (the thing middleware exists for).
22. Design-reviewer pass on `/signin` and `/account` before calling Phase 1 done.

### Parallelism hazards

If this is split across agents, these are the collision points:

| File | Hazard |
|---|---|
| `src/lib/queries/__tests__/helpers.ts` | Imported by ~15 existing test files. Step 6 must land **alone and first**; nothing else should touch it. |
| `src/lib/queries/__tests__/contract-guard.test.ts` | Single owner (step 7). Its regex change affects what every other lot is allowed to write — land before the query lot. |
| `src/lib/queries/constants.ts` | Additive, but shared with any concurrent non-auth work. Append-only, one owner. |
| `src/app/layout.tsx` | Step 18 edits it; so does any concurrent nav/freshness work. Serialize. |
| `src/components/Sidebar.tsx` + `__tests__/Sidebar.test.tsx` | Move together, one owner. The component is `'use client'` — the prop added must stay serializable. |
| `src/middleware.ts` | New file, no textual conflict, but it changes behavior for **every route**, so no other lot should be mid-flight when it lands (step 10). |
| `src/app/account/actions.ts` | The client/server boundary. One owner; steps 15–17 all import from it, so it must land before them. |

Steps 9 (queries), 11 (callback route), and 13 (shadcn primitives) are genuinely
independent and can run in parallel once steps 6–8 have landed.
