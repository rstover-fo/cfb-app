# Supabase migrations (cfb-app)

## Ownership boundary -- read this first

cfb-app and cfb-database share one Supabase project. They do **not** share
schemas.

| Schema | Owner | cfb-app may |
|---|---|---|
| `core`, `core_staging` | cfb-database | **nothing** -- banned, enforced by `src/lib/queries/__tests__/contract-guard.test.ts` |
| `api` | cfb-database | read only |
| `public` | cfb-database | read only (legacy views + RPCs) |
| `app` | **cfb-app** | own it -- migrations live here |

**Everything in this directory must target `app`.** If you find yourself writing
DDL for `api`, `public`, or `core` here, stop: that belongs in cfb-database.
This directory existing does not mean cfb-app has started shipping warehouse
DDL.

## Blocking prerequisite

PostgREST only serves schemas listed in its `db-schemas` config. Until `app` is
added, every `.schema('app')` call from `supabase-js` fails with a PostgREST
404, and no Phase 1 code works.

    Dashboard -> Project Settings -> API -> Exposed schemas
      public, api  ->  public, api, app

Equivalent SQL, if applied as a migration instead:

```sql
alter role authenticator set pgrst.db_schemas = 'public, api, app';
notify pgrst, 'reload config';
```

This is project-level config shared with cfb-database. It is a superset change
-- nothing cfb-database reads or writes is affected -- but it must be
replicated in **every** environment (local, preview, prod), and it must land
before the migrations below are useful.

## Applying

```bash
supabase db push                 # against the linked project
supabase migration list          # confirm what's applied
```

Migrations are ordered by filename timestamp and are expected to run exactly
once. They are written to be independently readable -- each states why it
exists, not just what it creates.

## What's here

| Migration | Creates |
|---|---|
| `20260725000000_create_app_schema.sql` | the `app` schema, usage grants, default-deny posture |
| `20260725000100_create_entitlements.sql` | `app.entitlements` + RLS (who paid for what) |
| `20260725000200_create_usage_counters.sql` | `app.usage_counters` + RLS (chat quota ledger) |
| `20260725000300_create_consume_chat_question.sql` | atomic check-and-increment RPC |

Design rationale: `docs/plans/2026-07-24-phase1-auth-entitlements.md`.

## Two rules worth not relearning

1. **RLS filters, grants authorize.** Both are required. A permissive policy
   with no `GRANT SELECT` returns nothing; a `GRANT INSERT` with no policy still
   denies. Do not fix a permission error by adding a grant without checking the
   policy, or vice versa.
2. **No write policies for `authenticated` on either table, on purpose.** Writes
   arrive only via `service_role` (the Stripe webhook) or
   `app.consume_chat_question()` (SECURITY DEFINER). If a future feature seems
   to need a user-facing write, that is a design conversation, not a policy to
   add quietly.
