-- Phase 1: app.usage_counters -- the chat-agent quota ledger.
--
-- One row per (user, local day). The daily cap reads a single row; the free
-- tier's lifetime cap is sum(chat_questions_used) across a user's rows, which
-- at one-row-per-active-day is trivially cheap and needs no second table.
--
-- Two deliberate choices:
--   * `usage_date`, not `date` -- `date` is a type name, and a column called
--     `date` makes every hand-written query and RPC body noisier.
--   * The day boundary is America/Chicago, not UTC. A "5 questions/day" cap
--     that resets at 7pm CT mid-Saturday-slate reads as a bug. The timezone is
--     mirrored in app.consume_chat_question and in TypeScript constants --
--     changing it after this table has rows re-buckets history.

create table app.usage_counters (
  user_id             uuid not null references auth.users(id) on delete cascade,
  usage_date          date not null,
  chat_questions_used integer not null default 0 check (chat_questions_used >= 0),
  updated_at          timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table app.usage_counters enable row level security;

grant select on app.usage_counters to authenticated;
grant all    on app.usage_counters to service_role;

create policy usage_counters_select_own
  on app.usage_counters for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No write policy for `authenticated`. Increments go exclusively through
-- app.consume_chat_question() (SECURITY DEFINER), so a user cannot hand-edit
-- their own quota by calling PostgREST directly.
