-- Long-term memory atoms: durable facts/preferences/takes about individual
-- Discord users, extracted from /ask and @-mention conversations by
-- bot/src/memory-extract.ts. Capped at 20 per user in app code
-- (memory-store.ts), inspectable and deletable by the user via /memory.
-- Same access model as 0001: RLS on, no policies, service_role only.

create table bot.memory_atoms (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,                            -- Discord user snowflake
  content    text not null check (char_length(content) <= 200),
  kind       text not null check (kind in ('preference', 'fact', 'take')),
  source     text not null default 'extraction' check (source in ('extraction')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memory_atoms_user_created_idx on bot.memory_atoms (user_id, created_at);

alter table bot.memory_atoms enable row level security;

-- Covered by 0001's default privileges; explicit for clarity/safety.
grant all on bot.memory_atoms to service_role;
