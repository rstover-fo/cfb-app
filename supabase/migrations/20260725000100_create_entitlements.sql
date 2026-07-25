-- Phase 1: app.entitlements -- who has paid for what.
--
-- Read by the app to gate /predictions and the chat agent. Written only by
-- service_role (the Phase 2 Stripe webhook) or by hand for comps. There is
-- deliberately no write path for `authenticated`.

create table app.entitlements (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  product                     text not null,
  source                      text not null default 'manual',
  granted_at                  timestamptz not null default now(),
  -- null = perpetual. A season pass should always carry a real expiry so the
  -- next season's pass is a genuine repurchase rather than a code change.
  expires_at                  timestamptz,
  stripe_customer_id          text,
  -- Phase 2 idempotency key: a replayed checkout.session.completed must not
  -- create a second entitlement.
  stripe_checkout_session_id  text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- Regex rather than an enum so season_pass_2027 needs no migration.
  constraint entitlements_product_format
    check (product ~ '^(season_pass|mcp_addon)_[0-9]{4}$'),
  constraint entitlements_source_valid
    check (source in ('manual', 'stripe', 'comp'))
);

-- One row per (user, product) makes the Phase 2 webhook a plain upsert.
create unique index entitlements_user_product_key
  on app.entitlements (user_id, product);

-- Second, independent idempotency guard -- holds even if the upsert path above
-- is ever bypassed.
create unique index entitlements_checkout_session_key
  on app.entitlements (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

alter table app.entitlements enable row level security;

-- RLS filters; grants authorize. Both are required, and they are set together
-- here on purpose -- do not "fix" a future permission error by adding a grant
-- without checking the policy, or vice versa.
grant select on app.entitlements to authenticated;
grant all    on app.entitlements to service_role;
-- anon: nothing, not even select. Anonymous visitors short-circuit in the app
-- before any entitlement query runs.

-- (select auth.uid()) rather than bare auth.uid(): the scalar subquery is
-- evaluated once as an InitPlan instead of once per row.
create policy entitlements_select_own
  on app.entitlements for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policy for `authenticated` is deliberate. With RLS on
-- and no permissive policy for a command, that command is denied. Writes reach
-- this table exactly two ways:
--   1. service_role (BYPASSRLS) -- the Stripe webhook, Phase 2
--   2. hand-issued comps by an operator
