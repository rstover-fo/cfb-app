# Handoff: `run_analyst_query` migration for cfb-database

The MCP server in this app now registers a `run_sql` tool (`src/lib/mcp/tools.ts` §20)
that calls a `public.run_analyst_query(query_sql text)` RPC. **That RPC does not exist
yet** -- it belongs in cfb-database (schema source of truth, Contract Rule: all DDL
lives there). Until the migration below is applied, the tool degrades gracefully
("analyst SQL is not enabled on this server yet").

## Design

The security boundary is the database role, not the calling code or the LLM prompt:

- a dedicated `analyst_ro` role with `SELECT` on the `api` schema only -- no `core`,
  no `marts`, no write grants anywhere;
- the RPC runs `SECURITY DEFINER` but immediately drops to `analyst_ro` via
  `SET LOCAL ROLE`, inside a read-only transaction with a statement timeout;
- single-statement enforcement and a hard row cap server-side (the client also
  validates, but that's convenience, not security).

## Migration (apply in cfb-database)

```sql
-- 1. Restricted role ------------------------------------------------------
CREATE ROLE analyst_ro NOLOGIN;
GRANT USAGE ON SCHEMA api TO analyst_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA api TO analyst_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA api GRANT SELECT ON TABLES TO analyst_ro;

-- 2. Guarded executor -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_analyst_query(query_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = api, public
AS $$
DECLARE
  cleaned text := btrim(query_sql);
  result jsonb;
BEGIN
  -- Single read statement only. The role's grants are the real boundary;
  -- these checks just fail fast with clear messages.
  IF cleaned !~* '^(select|with)\M' THEN
    RAISE EXCEPTION 'only SELECT/WITH statements are allowed';
  END IF;
  cleaned := regexp_replace(cleaned, ';\s*$', '');
  IF position(';' IN cleaned) > 0 THEN
    RAISE EXCEPTION 'multiple statements are not allowed';
  END IF;

  SET LOCAL ROLE analyst_ro;
  SET LOCAL TRANSACTION READ ONLY;
  SET LOCAL statement_timeout = '8s';

  -- Row cap: wrap the statement; jsonb_agg over a LIMITed subquery.
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(q), ''[]''::jsonb) FROM (%s LIMIT 200) q',
    cleaned
  ) INTO result;

  RETURN result;
END;
$$;

-- 3. Expose via PostgREST to the anon role the app uses -------------------
GRANT EXECUTE ON FUNCTION public.run_analyst_query(text) TO anon;
-- (and to authenticated/service_role if those are used elsewhere)

NOTIFY pgrst, 'reload schema';
```

## Notes / decisions for the cfb-database reviewer

- **`LIMIT 200` wrapper**: appending `LIMIT` to a query that already has one is fine --
  the inner LIMIT wins if smaller. The wrapper also neutralizes attempts to return
  unbounded row counts.
- **`SET LOCAL ROLE` before EXECUTE** is the load-bearing line: the dynamic statement
  runs with `analyst_ro`'s grants, so even if the textual checks were bypassed, writes
  and reads outside `api` fail at the permission layer. `SET LOCAL` scopes it to this
  transaction.
- **Timeout tuning**: 8s chosen to stay under the app's 55s MCP client timeout and the
  60s Vercel function cap with generous margin; raise cautiously.
- **`\M` regex word boundary** is Postgres syntax (end-of-word).
- If `api` views ever include row-level-security-sensitive data, revisit grants -- today
  the whole schema is public read via the app anyway.
- Suggested test in cfb-database: the coach-two-schools query from the tool's
  description (joins `api.coaching_history` × `api.team_elo`) returns rows; an
  `INSERT` attempt raises; a `SELECT pg_sleep(20)` gets cancelled by the timeout;
  `SELECT * FROM core.games` fails with permission denied.
