-- Prediction ledger: picks auto-extracted from conversation by
-- bot/src/memory-extract.ts, resolved to real games/lines at capture time
-- (pick-resolve.ts), settled by the hourly loop (settlement.ts), and
-- surfaced via /picks and buildUserContext(). Same access model as
-- 0001/0002: RLS on, no policies, service_role only.

create table bot.picks (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null,                       -- Discord user snowflake
  kind           text not null check (kind in ('game_winner', 'ats', 'season_total')),
  team           text not null,                       -- exact school name; the side the user backed
  opponent       text,                                -- exact school name (game picks only)
  game_id        bigint,                              -- resolved at capture (game picks only)
  season         int not null,
  week           int,                                 -- from the matched schedule row (game picks)
  direction      text check (direction in ('win', 'cover', 'over', 'under')),
  -- ats: home_spread AT PICK TIME (null = line pending; settlement backfills).
  -- season_total: normalized half-point win line (e.g. "wins 10" -> 9.5).
  -- Settlement grades against this stored line, never the closing line.
  line           numeric(5, 1),
  pick_home      boolean,                             -- game picks: is `team` the home side of game_id
  statement      text not null check (char_length(statement) <= 200),  -- the user's words
  status         text not null default 'open'
                 check (status in ('open', 'won', 'lost', 'push', 'void')),
  settled_detail text check (char_length(settled_detail) <= 300),
  created_at     timestamptz not null default now(),
  settled_at     timestamptz
);

create index picks_user_created_idx on bot.picks (user_id, created_at);
create index picks_open_idx on bot.picks (status) where status = 'open';

alter table bot.picks enable row level security;

-- Covered by 0001's default privileges; explicit for clarity/safety.
grant all on bot.picks to service_role;
