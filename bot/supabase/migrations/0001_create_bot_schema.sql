-- Schema `bot` is owned by cfb-app/bot (the Discord bot), NOT cfb-database.
-- cfb-database's dlt pipelines and docs/SCHEMA_CONTRACT.md do not cover it;
-- this file (and its successors in bot/supabase/migrations/) is the source
-- of truth for everything in the schema.
--
-- Access model: the bot connects with the service_role key (a single trusted
-- server-side process). RLS is enabled with zero policies as defense in
-- depth -- anon/authenticated hold no grants and match no policies, so they
-- are denied outright; service_role bypasses RLS.

create schema if not exists bot;

create table bot.user_profiles (
  user_id        text primary key,                 -- Discord user snowflake
  favorite_team  text,                             -- exact school name, set via /myteam
  memory_enabled boolean not null default true,    -- /memory on|off
  set_at         timestamptz,                      -- when favorite_team was last set
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Global (not per-guild) settings, mirroring settings.ts today. Singleton row
-- enforced by the key check; going per-guild later means relaxing the check
-- and adding a column, with no API break.
create table bot.app_settings (
  key          text primary key check (key = 'global'),
  lore_enabled boolean not null default true,
  updated_at   timestamptz not null default now()
);

alter table bot.user_profiles enable row level security;
alter table bot.app_settings  enable row level security;

grant usage on schema bot to service_role;
grant all on all tables in schema bot to service_role;
alter default privileges in schema bot grant all on tables to service_role;
