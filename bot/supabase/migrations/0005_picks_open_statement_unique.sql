-- One OPEN pick per (user, statement): the database-level idempotency the
-- ledger's two writers need. The policy layers (bot pick-store.ts, app
-- picks-store.ts) each dedup via read-then-write, which serializes within
-- one process but not across the bot + serverless app writing concurrently
-- (PR #53 review finding). This constraint closes that window for exact
-- duplicates: a second concurrent insert of the same open statement fails
-- with 23505 instead of double-posting.
--
-- Writer behavior on conflict:
-- - App (src/lib/agent/picks-store.ts): classifies 23505 as 'duplicate'
--   and reports the pick as deduped, not failed.
-- - Bot (bot/src/storage/supabase-backend.ts, unchanged): insert throws,
--   the capture pipeline's log-and-swallow contract turns it into a no-op
--   -- which IS the dedup semantics; its own policy layer already prevents
--   duplicate open statements in normal flow, so this fires only on the
--   cross-writer race the policy layers cannot see.
--
-- Settled/void picks are exempt (partial index): re-stating a pick after
-- the old one settles is a legitimate new ledger entry.
CREATE UNIQUE INDEX IF NOT EXISTS picks_open_statement_unique
  ON bot.picks (user_id, statement)
  WHERE status = 'open';
