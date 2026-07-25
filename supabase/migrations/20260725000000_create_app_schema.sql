-- Phase 1: the `app` schema -- cfb-app's own account/entitlement state.
--
-- Ownership boundary (see supabase/README.md):
--   core, core_staging  -- dlt internals, owned by cfb-database, banned here
--   api                 -- contracted read surface, owned by cfb-database
--   public              -- legacy views/RPCs, owned by cfb-database
--   app                 -- THIS SCHEMA, owned by cfb-app
--
-- Nothing in `app` is warehouse data. These tables are written by cfb-app and
-- by Stripe on its behalf, have no dlt pipeline, and cfb-database has no reason
-- to know they exist.
--
-- PREREQUISITE, and it blocks every Phase 1 query:
--   PostgREST only serves schemas in its db-schemas config. Until `app` is
--   added, .schema('app') from supabase-js returns a PostgREST 404.
--     Dashboard -> Project Settings -> API -> Exposed schemas:
--       public, api  ->  public, api, app
--   This is project-level config shared with cfb-database. It is a superset
--   change (nothing cfb-database reads or writes is affected), but it must be
--   replicated in every environment: local, preview, prod.

create schema if not exists app;

grant usage on schema app to anon, authenticated, service_role;

-- Default-deny posture. No blanket table grants in this schema -- each table
-- grants explicitly, so adding a table never silently exposes it.
alter default privileges in schema app revoke all on tables from anon, authenticated;
