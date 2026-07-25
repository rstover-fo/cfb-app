# Public pick log -- spec

Phase 0 item (`docs/MONETIZATION_ROADMAP.md`). Ships alongside or just before
the Phase 2 paywall.

## Why this exists

Two jobs, and they pull in the same direction:

1. **Substantiation.** Once we charge for picks, every published accuracy claim
   is a marketing claim under FTC Act §5 and Stripe's "outrageous claims"
   prohibition. The defense is a contemporaneous, append-only record: this pick,
   at this timestamp, against this line, from this book -- graded by a rule
   stated in advance. Sites that quietly regrade are the ones that draw
   complaints.
2. **Conversion.** SP+ went free on ESPN in May 2025. Ratings are commodity now;
   what isn't is a track record a skeptic can audit. The `/models` page already
   publishes walk-forward accuracy honestly. The pick log is what makes those
   numbers checkable rather than asserted, and it is the single strongest asset
   on the free side of the paywall.

**Design consequence of #1:** the log must be capable of embarrassing us. If a
schema decision makes a losing week disappear or a pick silently improve, that
decision is wrong regardless of what it does for the numbers.

## What already exists

| Piece | Where | Status |
|---|---|---|
| Per-game prediction + edge + market line | `api.game_predictions` | ✅ exists |
| Slate view w/ kickoff time | `api.scored_matchup_edges` (`start_date`) | ✅ exists |
| Aggregate ATS record, incl. `edge_threshold` splits | `getPredictionAccuracy()` → `/models` | ✅ exists |
| Line snapshots over time | `api.line_movement` (append-only, `captured_at`) | ✅ exists |
| **Immutable record of what we published, when** | — | ❌ **missing** |
| **Per-pick graded result** | — | ❌ **missing** (only aggregates) |

### The blocker

`api.game_predictions` is documented as **latest-snapshot**:

> `DISTINCT ON game_id, model_version ORDER BY prediction_date DESC`

So the contracted surface exposes only the *most recent* prediction per
(game, model). A pick log built directly on it would be re-derived on every
read, and would silently change if the model re-ran closer to kickoff. That is
precisely the failure mode the log exists to rule out -- it cannot be the
source of truth for an auditable record.

**Do not fix this by asking cfb-database for full prediction history.** That
would answer "what did the model compute," which is a different and weaker
claim than "what did we publish to customers." The product claim is about
publication, so the ledger belongs to the app.

## Design: `app.published_picks`

An append-only ledger in the `app` schema that Phase 1 already establishes
(see `docs/plans/2026-07-24-phase1-auth-entitlements.md`). One row per
(game, model_version) per publication. Written by a **freeze job**, never by a
request handler.

### Lifecycle

```
  Tue 06:00 ET   freeze job snapshots the slate  ->  INSERT (immutable)
       |                                              pick fields frozen
       v
   kickoff        (nothing happens -- row already written)
       |
       v
  final score     grader job fills result fields ->  UPDATE (once only)
```

Freeze time is a **product decision that must precede the pick**, not a
consequence of when the job happened to run. Publishing Tuesday and grading
against a Saturday-morning line would be indefensible; the log records the line
as captured at freeze.

### Schema sketch

```sql
create table app.published_picks (
  id                bigserial primary key,

  -- identity
  game_id           bigint      not null,
  model_version     text        not null,
  season            int         not null,
  week              int         not null,
  season_type       text        not null,

  -- immutable pick payload (what we showed, at freeze)
  published_at      timestamptz not null default now(),
  kickoff_at        timestamptz not null,
  home_team         text        not null,
  away_team         text        not null,
  neutral_site      boolean     not null,
  expected_home_margin numeric   not null,
  home_win_prob     numeric     not null,
  market_provider   text,
  market_spread     numeric,
  market_home_margin numeric,
  market_captured_at timestamptz,
  edge              numeric,
  edge_pick         text        check (edge_pick in ('home','away')),

  -- grading (written once, after the game is final)
  graded_at         timestamptz,
  home_points       int,
  away_points       int,
  result            text        check (result in ('win','loss','push','void')),

  -- one published pick per game+model+freeze
  unique (game_id, model_version, published_at)
);

create index on app.published_picks (season, week);
create index on app.published_picks (model_version, result);
```

### Integrity guarantees (the part that does the legal work)

These are the reason the table is worth building at all. Without them it is
just a cache.

1. **Pick fields are immutable after insert.** A `BEFORE UPDATE` trigger raises
   if any column other than the grading block changes. Not a convention -- a
   constraint.
2. **Grading is write-once.** The same trigger rejects an update where
   `graded_at` is already non-null.
3. **`published_at < kickoff_at` is enforced** (`check`, plus the freeze job
   refuses to insert a row for a game already underway). A pick that cannot be
   proven to predate kickoff is not a pick.
4. **No deletes.** No delete grant to any role the app uses. Corrections happen
   by publishing a `void` result with a public note, never by removing a row.
5. **Public read.** RLS allows `select` to `anon` -- the log is free-tier
   content and must be readable without an account. This is deliberate: a track
   record behind a paywall proves nothing to a prospect.

### Grading rules -- state them before they matter

Published on the page itself, not just in code:

- **Which line:** the pick is graded against `market_spread` as captured at
  freeze (`market_captured_at`), from `market_provider`. Not the closing line.
  We commit to the number we showed.
- **Push:** exact-number push is `push`, excluded from win/loss, reported
  separately in the record (`12-8-1`).
- **Void:** cancelled/postponed games, or a pick published without a market
  line. Reported and excluded, never silently dropped.
- **Vig assumption:** ROI figures assume standard -110 pricing unless stated.
  This must appear next to any ROI number, or we don't publish ROI at all.
- **No minimum-edge filter by default.** `/models` already splits on
  `edge_threshold`; the log shows *every* published pick, and threshold views
  are a filter on top -- never the default. Showing only high-conviction picks
  by default is the classic way to launder a record.

## Query layer

`src/lib/queries/picks.ts`, following the existing `cache()` conventions:

```ts
getPublishedPicks(season, opts?: { week?, modelVersion?, result? }): PublishedPick[]
getPickLogSummary(season, modelVersion?): { wins, losses, pushes, voids, ats_pct, by_week }
```

Both read-only, both fail closed to `[]`/zeroes on error like the rest of the
query layer. The existing `getPredictionAccuracy()` stays as-is -- it reports
the *backtest*; this reports *live published picks*. Two different claims, and
the page must not blur them.

## Freeze + grade jobs

Two scheduled jobs. Cheapest home is Railway cron in this repo, reusing the
server Supabase client with a service-role key (Phase 1 ships
`src/lib/supabase/admin.ts`).

- **Freeze** (weekly, Tue 06:00 ET during the season): read
  `getScoredMatchupEdges(season, week)`, drop games already started, insert one
  row per game per model. Idempotent -- re-running the same week inserts
  nothing new (the unique constraint plus a "has this week been frozen" check).
- **Grade** (daily): find rows where `graded_at is null` and kickoff is >6h
  past, join final scores, compute `result`, single write-once update.

Both log a one-line JSON summary per run. A failed freeze must alert loudly:
a missed week is a permanent hole in the record.

## UI

New route `/picks` (free, linked from the footer and from `/models`):

- Header: overall record, ATS %, pushes/voids, and the grading rules stated
  inline -- not hidden behind a tooltip.
- Filters: season, week, model version, result. Default = **everything**.
- Table: kickoff, matchup, pick, line + book, edge, final score, result.
  Losses styled no less prominently than wins.
- Empty state before the first freeze: explain the log starts Week 1, rather
  than rendering a suspicious blank.
- Link each row to the game page.

Reuse `Table` from `components/ui`, `TeamMark` for logos, editorial tokens
throughout. Run the design-reviewer gate before merge.

## Phasing

| Step | Work |
|---|---|
| 1 | Migration: table, trigger, RLS, indexes (needs Phase 1's `app` schema) |
| 2 | Freeze job + idempotency test |
| 3 | Grade job + result-rule unit tests (push/void/vig edge cases) |
| 4 | `picks.ts` query module + tests |
| 5 | `/picks` page + design gate |
| 6 | Cross-link from `/models` and the footer |

Steps 1-3 are the load-bearing ones. The page is easy; the ledger's integrity
is the product.

## Open questions

1. **Freeze cadence.** Tuesday matches the roadmap's freshness-gating idea
   (subscribers Tuesday, free Saturday). If gating changes, freeze time follows
   it -- they must be the same moment, or the log won't match what subscribers
   saw.
2. **Both models, or one?** Publishing `elo_v1` and `elo_epa_blend_v1` picks
   side by side is more honest and is a differentiator, but doubles rows and
   invites "which record are you quoting?" Recommend: publish both, and make
   the page require an explicit model selection rather than defaulting to the
   better one.
3. **Backfill?** Tempting to seed the log from historical predictions. **Do
   not.** A backfilled row cannot honestly carry a `published_at`, and one
   fabricated timestamp poisons the whole artifact's credibility. The log
   starts empty on freeze day and earns its length.
4. **ROI display.** Recommend omitting ROI at launch and showing only W-L-P.
   ROI needs a stated vig and stake model, and it's the number most likely to
   be read as a promise of returns.
