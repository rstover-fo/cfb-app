-- Scope the prediction ledger per guild: multi-guild deployments (the test
-- server and the real server share one DISCORD_GUILD_ID allowlist) must not
-- mix their public /picks boards. Stamped at capture; public views filter on
-- it. Nullable: settlement runs cross-guild, and legacy rows (none in prod
-- at migration time) simply stop appearing in guild-filtered views.

alter table bot.picks add column guild_id text;

create index picks_guild_idx on bot.picks (guild_id);
