-- Phase 1: app.consume_chat_question -- atomic check-and-increment for the
-- chat quota. Lands in Phase 1 (not Phase 3) so the security-sensitive piece
-- is reviewed off the launch critical path.
--
-- Why a function instead of a read-then-write in the route handler: those are
-- two round trips, and a user with two open tabs can pass the check twice
-- before either write lands. The cap is what keeps a $49 pass margin-positive
-- against per-question LLM cost, so it has to be exact, not approximate.

create or replace function app.consume_chat_question(
  p_daily_limit    integer,
  p_lifetime_limit integer
)
returns table (allowed boolean, used_today integer, used_lifetime integer)
language plpgsql
security definer
-- Mandatory on SECURITY DEFINER. Without a pinned search_path this function is
-- a privilege-escalation vector.
set search_path = app, pg_catalog
as $$
declare
  v_user      uuid := auth.uid();
  v_today     date := (now() at time zone 'America/Chicago')::date;
  v_lifetime  integer;
  v_today_cnt integer;
begin
  -- The function takes no user_id: it reads auth.uid() itself, so a caller
  -- cannot spend someone else's quota. That is what makes DEFINER safe here.
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Serializes concurrent questions for this user only -- cheaper and clearer
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

-- Limits are parameters, not hardcoded: the caller resolves entitlement first
-- and passes the tier's numbers from TypeScript constants, so pricing
-- experiments never require a migration. Pass holders are called with an
-- effectively unbounded lifetime limit.
revoke all on function app.consume_chat_question(integer, integer) from public, anon;
grant execute on function app.consume_chat_question(integer, integer) to authenticated;
