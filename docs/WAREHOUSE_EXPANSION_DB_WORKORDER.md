# Work order for cfb-database: views cfb-app needs from the 2026-08-30 expansion

**From:** cfb-app
**Date:** 2026-08-30
**Companion to:** `docs/WAREHOUSE_EXPANSION_HANDOFF.md` (the why); this doc is the how.
**Audience:** whoever is working in the cfb-database repo.

Everything below was checked against cfb-database `main` @ `2425ca1` and against the live
database through `run_sql` (i.e. as `analyst_ro`). Where a claim is inferred from a dlt
resource decorator rather than a live read, it says so.

Conventions this repo already enforces, so new work must match:

- api views are **thin passthroughs over a `marts.*` object**, one file per view at
  `src/schemas/api/NNN_<view>.sql`. Highest existing is `044_core_ratings.sql`, so **new
  files start at 045**. `044_core_ratings.sql` is the cleanest template.
- Every api definition file **must** end with the exact line
  `GRANT SELECT ON api.<view> TO anon, authenticated;` -- `tests/test_api_grants.py`
  regex-matches that literal per `CREATE VIEW`, and a DROP/CREATE apply strips grants
  otherwise. `analyst_ro` needs nothing extra: it is covered by the api-schema default
  privileges in `src/schemas/public/012_run_analyst_query.sql`.
- Views must be **owner-rights, not `security_invoker`**. This is the whole mechanism that
  lets `analyst_ro` read expansion data it has no schema privilege on. A `security_invoker`
  view here would be readable by the web app and invisible to the Discord bot -- the
  `matchup_forecast` failure mode.
- Ship a re-runnable `src/schemas/api/validation_<unit>.sql` (see `validation_penalties.sql`)
  and a `deploys/<unit>-manifest.json` listing marts files, then api files, then validation.

---

## 0. Blocker: dedupe `api.player_detail` before anything joins onto it

`api.player_detail` is not one row per player-season. The recruiting join fans out for
players carrying two recruiting classes (reclassifications), and the stat columns are
duplicated verbatim across the fanned rows:

```sql
SELECT player_id, name, team, stars, recruit_rating, national_ranking,
       recruit_class, rec_yds, ppa_avg
FROM api.player_detail
WHERE season = 2025 AND player_id = '5079720';
--  Jeremiah Smith | 4 | 0.9151 | 243 | 2023 | 1243 | 0.945
--  Jeremiah Smith | 5 | 0.9997 |   1 | 2024 | 1243 | 0.945
```

Counts per season (`GROUP BY season, player_id HAVING count(*) > 1`):

| season | players | dup players | dup rows |
|---|---|---|---|
| 2020 | 16,419 | 39 | 78 |
| 2021 | 18,501 | 195 | 392 |
| 2022 | 30,399 | 2 | 4 |
| 2023 | 22,464 | 1 | 2 |
| 2024 | 22,837 | 16 | 32 |
| 2025 | 30,004 | 14 | 28 |

Under 1% of players, but the 2025 set is Jeremiah Smith, Boo Carter, Sammy Brown, Dre'lon
Miller, Mike Matthews, Daniel Hill, Amir Jackson, Ian Moore, Justin Williams, Ondre Evans --
blue-chip, i.e. exactly who the bot is asked about. `SUM(rec_yds)` double-counts them and
recruit pedigree is nondeterministic (#1 overall 5-star or a #243 4-star, depending on row
order). `api.player_comparison` is clean (14,397 players / 0 dupes, 2025), so it is specific
to `player_detail`'s recruiting join.

**Fix:** collapse the recruiting side to one row per `(player_id, season, team)` --
`DISTINCT ON (player_id, season, team) ORDER BY player_id, season, team, recruit_class DESC`
keeps the reclassified (authoritative) entry. The ORDER BY is load-bearing and its leading
terms must be the DISTINCT ON keys -- Postgres rejects any other leading order, and without
the trailing `recruit_class DESC` it keeps an arbitrary class (verified on PR #55: the
unordered form returned the stale 2023 row over the 2024 one). Alternatively drop pedigree
from this view and leave it to `api.recruit_lookup`. cfb-app does not query this view today (it uses the
`public.get_player_detail` RPC), so there is no consumer to break.

**Do not collapse `team` while you are in there.** The view's grain is
`(player_id, season, team)` and the per-team rows are legitimate: a player on two teams in a
season gets one row per stint, each carrying only that stint's stats, and summing them is the
only way to get a season total. For 2025 that is 4 players (distinct `(player_id, team)`
30,008 vs distinct `player_id` 30,004); 2024 has 6. Deduping to one row per player-season
would destroy real data -- the target is the recruiting fan-out only.

**Do this before task 5.** LEFT JOINing a usage payload onto a view that already fans out
propagates the duplication into the new columns.

---

## 1. Grain inconsistency across the new player-grain tables

Read from the dlt `primary_key` decorators (`src/pipelines/sources/*.py`) -- worth confirming
against live constraints before acting:

| table | primary_key | team in key? |
|---|---|---|
| `stats.passing_player_season` (`passing.py:287`) | `["season", "player_id", "team"]` | yes |
| `stats.player_success_season` (`stats.py:490`) | `["season", "id", "team"]` | yes |
| **`stats.player_season_overview`** (`player_overview.py:70-71`) | **`["season", "id"]`** | **no** |

`player_season_overview` is the outlier, and it is the one being positioned as the
player-grain hub. With `write_disposition="merge"` on `(season, id)`, a player who transfers
mid-season collapses to a single row -- last write wins -- while the two tables it is meant
to be the hub for keep both stints. The hub disagrees with its own spine.

Second, smaller: the spine is spelled `id` on `player_season_overview` / `player_success_*`
and `player_id` on `passing_player_*` and `api.player_detail`. One spelling, please, or at
minimum a documented alias in the api layer.

**Ask:** add `team` to `player_season_overview`'s primary key, or state explicitly that this
table is deliberately one-row-per-player-season with a canonical-team rule, so consumers know
which stint they are getting.

---

## 2. `api.passing_charting_player_season` (new, `045_`)

Backing table `stats.passing_player_season`, PK `(season, player_id, team)`. Real column
names, from `src/schemas/migrations/057_passing_grants_indexes.sql`:

- metrics: `total_air_yards`, `average_depth_of_target`, `total_yards_after_catch`,
  `average_yards_after_catch`
- **two** coverage denominators: `air_yards_attempts_available`,
  `yards_after_catch_attempts_available` -- and therefore two derived percentages,
  `air_yards_coverage_pct` and `yards_after_catch_coverage_pct`, each from its own
  denominator. A single unqualified `coverage_pct` next to two denominators is unreadable:
  nothing on the row says which one it was derived from.

Correction to our handoff, which assumed a single `attempts_available`: there are two,
because air-yards and YAC charting can cover different play sets. **Both must ship on every
row**, unaliased into one number. With 2025 at 407/820 player-seasons charted, a leaderboard
without them ranks on coverage rather than skill, and that is a chart a reader cannot tell is
wrong.

Semantics to carry in the view COMMENT (mirroring the phrasing already in migration 057):
NULL means the plays behind the value were not charted; **0 is a real observed value**; the
`*_attempts_available` column is the charting-coverage denominator. 2025+ only.

Join `position`/`conference` in from `ref.teams` / roster **on numeric team id, never the
name string** -- `ref.teams` has 35 legitimate duplicate school names, so a name join needs
`DISTINCT ON (school)` or accepts fanout. `passing_player_season` carries `team` as a name
string, so this join is the one place fanout can sneak in; if there is no numeric team id on
that table, dedupe explicitly.

## 3. `api.passing_charting_target_season` (new, `046_`)

The highest-value item for us. Built from `stats.passing_plays` (PK `(game_id, play_id)`)
aggregated to `(season, target_id, team)`; `target_id` is indexed
(`idx_passing_plays_target_id`). cfb-app has no receiver-grain analysis at all today --
`api.player_wepa_leaders` carries passing/rushing/kicking and no receiving category -- so
"who is the best receiver" is currently unanswerable from the contracted surface.

- `passing_plays` has no `season` column in its PK; join `api.game_detail`/`core.games` on
  `game_id` for season, the same idiom the `game_plays` view already uses.
- Use `offense_id`/`defense_id` (numeric) for team joins, per their column COMMENTs.
- Name the share column **`target_share_charted`**, not `target_share`. It is a share of
  *charted* attempts and will be misread as a true target share the moment it is called one.
- Carry a `partial_share` (fraction of contributing plays with `parse_status = 'partial'`) so
  consumers can flag provisional rows. Per the migration COMMENT, `'partial'` was the only
  value observed in probing and means air yards / depth / direction / YAC may read NULL.

## 4. `api.passing_charting_team_season` (new, `047_`)

Backing `stats.passing_team_season`, PK `(season, team)`. Columns are the same six per side
with `offense__` / `defense__` dunder prefixes (12 total). **Flatten to `offense_*` /
`defense_*`** -- per Contract Rule 4 the app must never see dlt column shapes, and cfb-app's
contract-guard test exists to keep raw shapes out of the query layer.

Carry the migration's warning in the COMMENT: `defense__*` is *this team's passing defense*
(what opposing offenses did against them), not the opponent's own offensive row.

## 5. Coaching: `coach_id` + `api.coach_tenures` (new, `048_`)

`ref.coach_seasons` PK is `["coach__id", "year", "team__id"]` (note the dunder columns, and
`year` rather than `season`); `coach__id` is indexed. `ref.coach_tenures` and
`ref.coach_profiles` are granted in migrations 050/054.

Two asks:

1. **Add `coach_id` to `api.coaching_history` and `api.coach_records`** (additive, no consumer
   churn). This fixes shipped breakage: `cfb-app/src/lib/queries/coaches.ts:170-182` joins the
   two views on `first_name + last_name` because no id column exists, with a comment
   acknowledging that two coaches sharing a name would collide.
2. **New `api.coach_tenures`**, grain `(coach_id, team_id, tenure_start)`: coach_id,
   coach_name, team_id, team, tenure_start, tenure_end (NULL = active), hire_date,
   `is_interim`, `record__*`, and **`classification`**.

Those last two columns each retire a hack in our code. `is_interim` replaces
`DEFAULT_MIN_GAMES = 24` (`coaches.ts:59-61`), a heuristic that exists only to keep interim
one-game records off the win% leaderboard and which also silently drops legitimate short
tenures. `classification` replaces pushing the FBS filter through `.in('team', <~130 name
strings>)` (`coaches.ts:56-58`), which we do only because `api.coach_records` has no
classification column.

## 6. Player hub: extend `api.player_detail` additively

After task 0. LEFT JOIN the `stats.player_season_overview` usage / success-rate / PPA payload
onto the existing view rather than shipping a second overlapping player-season surface --
zero consumer churn, and NULL outside 2014-2025 full depth matches house NULL semantics.

Resolve task 1's key question first: if `player_season_overview` stays `(season, id)` while
`player_detail` is `(player_id, season, team)`, the join is one-to-many on the team side and
needs an explicit rule.

---

## P2 views (not on the critical path, but CFP is seasonally timed)

| View | Backing | Notes |
|---|---|---|
| `api.cfp_bracket` | `core.cfp_bracket` (PK `season`), `core.cfp_games` (`season, id`), `core.cfp_participants` (`season, team__id`) | cfb-app has **zero** CFP representation -- our largest content gap. `core.*` is banned to us, so a view is the only route. `cfp_bracket` has array fields (`participants[]`, `rounds[]`, `rounds[].matchups[]`, `matchups[].slots[]`) that dlt splits into child tables -- flatten them in the mart, do not expose `__child` traversal. Make the **era explicit**: `round`/`seed` are not comparable across the 4- and 12-team formats. Wants to land before December. Must not be read as reviving `api.season_outlook.playoff_prob`, which is NULL by design. |
| `api.conference_affiliations` | `ref.conference_affiliations` (PK `team_id, conference_id, start_year`), `ref.conference_changes` (`effective_year, team_id`) | **Note the grain mismatch:** the source is *span*-grain (`start_year`), and we need *per-season* rows `(team_id, season)` -> conference, classification. Expanding spans to seasons is the actual work here. This fixes the bug class you documented on 2026-07-22 (NDSU's FCS season labelled FBS because `ref.teams` holds current membership) and lets us delete cfb-app's hardcoded `FBS_CONFERENCES` list. |
| `api.game_advanced_team_stats` | `stats.game_advanced_team_stats` (PK `game_id, team`), `game_id` indexed | Name the garbage-time-excluded variants **distinctly** from the raw ones. Two columns differing only by an invisible filter are the easiest thing in this dataset to mix up, and neither we nor the bot can tell them apart at read time. |
| `api.ratings_weekly` | `ratings.fpi_weekly` + `external_weekly` | Label as-of in the COMMENT so they are never joined to a season-final rating. Leak-free as-of is the property that makes them usable as model features at all. |

Not requested: the Fox/Yahoo crosswalks (`ref.*_xwalk`) have no consumer in cfb-app;
`ratings.massey_composite` can wait until it populates; nothing is planned on `ncaa`.

---

## Two things to settle

1. **`marts.epa_crossvalidation`.** The expansion handoff lists it as a data-quality panel
   candidate; the 2026-08-29 `SCHEMA_CONTRACT.md` entry declares it INTERNAL, not a public
   surface, and explicitly not a shipping gate. Those disagree. We have designed nothing
   against it. If it is meant to be consumable it needs an `api.*` view like everything else.
2. **The corrections campaign.** The 2014-2025 refresh drains through early October and
   historical EPA will shift. Our concern is the Discord bot's long-term memory and prediction
   ledger, which persist answers across sessions -- a number recorded in September will
   silently disagree with the same query in October. If you can expose per-season completion
   flags (`migrations/051_refresh_ledger.sql` looks like it already tracks this), we can
   scope-invalidate rather than distrust the whole range.

## Reminder on apply order

Migrations 050 / 054 / 057 are `run_migrations.py --file` (deploy-manifest) applies that must
run **after the first successful load** of their source -- dlt creates each table on first
write, so the plain GRANT/CREATE INDEX statements fail with "relation does not exist" against
a database where the load has not run. Any mart built on these tables inherits that ordering.
