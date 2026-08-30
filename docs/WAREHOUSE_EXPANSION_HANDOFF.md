# Warehouse expansion (2026-08-29/30) -- exposure plan + view requests

**From:** cfb-app
**Date:** 2026-08-30
**Re:** cfb-database `docs/handoffs/2026-08-30-expansion-exposure-for-cfb-app.md`
**Status:** Planned, not shipped. **Every item is blocked on an `api.*` view** -- see §1.
One finding in §2 is shippable today and is being fixed in this repo now.

Thanks -- the expansion is the biggest capability jump since the prediction layer, and
`stats.passing_plays.target_id` in particular unlocks a grain cfb-app has never had.

All SQL below was run read-only through `run_sql` (i.e. as `analyst_ro`, the same path the
Discord bot uses) on 2026-08-30, so you can re-run any of it rather than trusting the numbers.

---

## 1. The "zero code" quick win cannot work -- and the fix is one-sided in your favour

The handoff's first quick win is "add the new tables to the bot's `run_sql` available-views
prompt list (zero code)". That would ship a bot that confidently emits SQL which cannot run.

`run_sql` -> `public.run_analyst_query` -> `SET LOCAL ROLE analyst_ro`, and per your own
`src/schemas/public/012_run_analyst_query.sql`, `analyst_ro` holds `USAGE` + `SELECT` on the
`api` schema **only**. Verified live:

```sql
SELECT current_user, session_user;
-- current_user = analyst_ro, session_user = authenticator

SELECT count(*) FROM stats.passing_plays;
-- ERROR: permission denied for schema stats
SELECT count(*) FROM ref.coach_seasons;
-- ERROR: permission denied for schema ref
```

The `anon`/`authenticated` SELECT grants you mention do not rescue this. They are a different
role path, and for the Next.js app they would additionally require the schema to be
PostgREST-exposed and would mean reading raw dlt tables directly -- which `CLAUDE.md` bans,
`src/lib/queries/__tests__/contract-guard.test.ts` fails the build on, and your own brief rules
out ("shipped features must not couple to raw tables").

Worth being explicit about the failure mode, because it is worse than a blank answer: a model
that gets `permission denied` does not report the surface as unavailable. It retries, rephrases,
guesses a different table name, and eventually answers from parametric memory. Advertising an
unreachable table in the schema card is strictly worse than not advertising it.

**The fix is cheap and needs no grant change.** `api.*` views are owner-rights (not
`security_invoker`), so `analyst_ro` reads *through* them without any privilege on the
underlying schema. One view file -- `src/schemas/api/NNN_<view>.sql` ending in
`GRANT SELECT ON api.<view> TO anon, authenticated;` -- unlocks PostgREST for the web app and
`run_sql` for the bot **simultaneously**.

So: we are not asking you to widen `analyst_ro`. We are asking for views, and we will add each
one to the schema card as it deploys. Confirmed today that the api schema is still the
pre-expansion set of 45 views:

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'api' ORDER BY 1;
-- 45 rows, none of them expansion surfaces
```

---

## 2. Finding: `api.player_detail` is not "one row per player-season"

This is pre-existing, not from the expansion, but it lands directly on the
`stats.player_season_overview` ask in §3, so it needs fixing first.

The recruiting join fans out for players who appear in more than one recruiting class
(reclassifications). The stat columns are duplicated verbatim across the fanned rows:

```sql
SELECT player_id, name, team, stars, recruit_rating, national_ranking, recruit_class, rec_yds, ppa_avg
FROM api.player_detail WHERE season = 2025 AND player_id = '5079720';
```
| name | stars | recruit_rating | national_ranking | recruit_class | rec_yds | ppa_avg |
|---|---|---|---|---|---|---|
| Jeremiah Smith | 4 | 0.9151 | 243 | 2023 | 1243 | 0.945 |
| Jeremiah Smith | 5 | 0.9997 | 1 | 2024 | 1243 | 0.945 |

Two consequences:

1. **Aggregates double-count.** Any `SUM(rec_yds)` / `AVG(ppa_avg)` leaderboard built over this
   view is wrong for exactly these players. `rec_yds = 1243` is counted twice.
2. **Recruit pedigree is nondeterministic.** A consumer taking "whichever row comes first" gets
   either the #1 overall 5-star or a #243 4-star for the same player. The 2023 row is the stale
   pre-reclass entry; nothing in the view says which to prefer.

Blast radius -- small by percentage, but concentrated in the highest-profile players, who are
precisely who the bot gets asked about:

| season | players | dup players | dup rows | % dup |
|---|---|---|---|---|
| 2020 | 16,419 | 39 | 78 | 0.238% |
| 2021 | 18,501 | 195 | 392 | 1.054% |
| 2022 | 30,399 | 2 | 4 | 0.007% |
| 2023 | 22,464 | 1 | 2 | 0.004% |
| 2024 | 22,837 | 16 | 32 | 0.070% |
| 2025 | 30,004 | 14 | 28 | 0.047% |

The 2025 duplicate set is Jeremiah Smith, Boo Carter, Sammy Brown, Dre'lon Miller, Mike
Matthews, Daniel Hill, Amir Jackson, Ian Moore, Justin Williams, Ondre Evans -- a blue-chip
list, not a random one.

`api.player_comparison` is **clean** (14,397 players / 0 duplicates for 2025), so the fan-out is
specific to `player_detail`'s recruiting join, not to the shared upstream.

**Ask:** dedupe the recruiting join to one row per `(player_id, season, team)` -- keep the
latest `recruit_class` (the reclassified, authoritative entry) or expose the pedigree at its own
grain. cfb-app does not query this view today (it uses the `public.get_player_detail` RPC), so
there is no consumer to break.

**What we are fixing on our side today:** the `run_sql` schema card advertises
`api.player_detail` to the bot as "one row per player-season, 2004+ (~340k rows)". That claim is
false and the bot will aggregate on it, so we are correcting the card now rather than waiting
for the view fix.

---

## 3. View requests

Priority is cfb-app's, not a delivery instruction. Semantics listed are the ways each surface
can be read wrongly; they are the part we care about most, since a column we can compute and a
caveat we cannot are not the same kind of gap.

### P1

**`api.passing_charting_player_season`** -- grain `(season, player_id, team_id)`
> player_id, player_name, team_id, team, conference, position, `attempts_charted`,
> **`attempts_available`**, `coverage_pct`, `adot`, air_yards_total, yac_total,
> yac_per_completion, completions_charted, depth/direction split counts, `partial_share`
>
> `attempts_available` must ship **on every row**, not as a separate coverage table. With 2025
> at 407/820 player-seasons charted, a leaderboard without the denominator ranks on coverage,
> not on skill -- and that is a chart a reader cannot tell is wrong. NULL = not-yet-charted,
> never zero. `partial_share` so consumers can flag rows resting on `parse_status='partial'`
> plays that may be re-charted upstream.

**`api.passing_charting_target_season`** -- grain `(season, target_id, team_id)`
> target_id, player_name, team_id, team, conference, `targets_charted`,
> `team_attempts_charted`, `target_share_charted`, receptions_charted, `catch_rate_charted`,
> `adot`, air_yards_total, yac_total, yac_per_reception, depth/direction splits
>
> The highest-value item in the expansion for us. cfb-app has no receiver-grain analysis at all
> today -- `api.player_wepa_leaders` carries passing/rushing/kicking and no receiving category,
> so "who is the best receiver" is currently unanswerable from the contracted surface.
> Name the share column `target_share_charted`, not `target_share`: it is a share of *charted*
> attempts and will be misread as a true target share the moment it is called one.

**`api.passing_charting_team_season`** -- grain `(season, team_id)`
> `offense_*` / `defense_*` metric pairs. Please flatten the raw `offense__`/`defense__` dunder
> columns to house naming -- per Contract Rule 4 the app should never see dlt column shapes.

**`coach_id` on `api.coaching_history` and `api.coach_records`** (additive)
> This fixes shipped breakage, not a nice-to-have. `src/lib/queries/coaches.ts:170-182` joins
> the two views on `first_name + last_name` because no id column exists, with a comment
> acknowledging that two coaches sharing a name would collide. `ref.coach_seasons.coach__id`
> (CFBD coachId) makes it a real key. Additive column, no consumer churn.

**`api.coach_tenures`** -- grain `(coach_id, team_id, tenure_start)`
> coach_id, coach_name, team_id, team, tenure_start, tenure_end (NULL = active), hire_date,
> `is_interim`, `record__*`, `classification`
>
> Two columns replace two hacks in our code. `is_interim` replaces `DEFAULT_MIN_GAMES = 24`
> (`coaches.ts:59-61`), a heuristic that exists only to keep interim one-game records off the
> win% leaderboard and which also silently drops legitimate short tenures. `classification`
> replaces pushing FBS filtering through `.in('team', <~130 names>)` (`coaches.ts:56-58`),
> which we do because `api.coach_records` has no classification column.

**Extend `api.player_detail` additively with the `stats.player_season_overview` payload**
> Preferred over a second player-season view: one surface, zero consumer churn, and it gives a
> view that is already typed in our repo a reason to be queried. NULL outside 2014-2025 full
> depth matches house semantics. **Dedupe (§2) first** -- LEFT JOINing a usage payload onto a
> view that already fans out propagates the duplication into the new columns.
>
> Two naming asks while you are in there: `player_id` here vs `athlete_id` on
> `player_wepa_leaders`/`player_usage_leaders` -- one spelling, please. And please restate in
> the column COMMENT that the key includes `team`, so a mid-season transfer is two rows and
> `WHERE player_id = ... AND season = ...` returns more than one.

### P2

| View | Grain | Why / semantics |
|---|---|---|
| `api.cfp_bracket` over `core.cfp_bracket`/`cfp_games`/`cfp_participants` (2014+) | `(season, round, seed)` | cfb-app has **zero** CFP representation -- our single largest content gap. `core.*` is banned to us, so a view is the only route. `round`/`seed` are not comparable across the 4- and 12-team eras; please make the era explicit rather than leaving it to be inferred. This should land before December to be useful this season. Note it must not be read as reviving `season_outlook.playoff_prob`, which is NULL by design and which our tools hard-guard against estimating. |
| `api.conference_affiliations` over `ref.conference_affiliations`/`conference_changes` | `(team_id, season)` -> conference, classification | Fixes a bug class you already documented: the 2026-07-22 contract entry records NDSU's FCS season being labelled FBS because `ref.teams` holds *current* membership. Per-season affiliation replaces games-derived inference for `/rivals`, `/compare` history and `/conferences`, and lets us delete the hardcoded `FBS_CONFERENCES` list at `src/lib/queries/shared.ts:27-41`. History to 1869 is welcome; we will range-guard the pre-modern end in UI. |
| `api.game_advanced_team_stats` (2014+) | `(game_id, team_id)` | Please name the garbage-time-excluded variants distinctly from the raw ones. Two columns differing only by an invisible filter are the easiest thing in this dataset to mix up, and neither we nor the bot can tell them apart at read time. |
| `api.ratings_weekly` over `ratings.fpi_weekly` + `external_weekly` (2005+) | `(season, week, team_id, system)` | Leak-free as-of snapshots are the property that makes these usable as model features at all; label them as-of in the COMMENT so they are never joined to a season-final rating. Natural companion to `api.team_week_features`. |

### P3 / declining

- `ratings.srs_expanded` -- would broaden `/analytics`, but low incremental value over the
  SP+/CORE/Elo/FPI set we already carry.
- ESPN player splits -- request as `api.espn_player_splits` only if the extended
  `api.player_detail` proves insufficient. Confirmed useful that CFBD athlete/team/game ids
  **are** ESPN ids, so no crosswalk is needed.
- `metrics.ppa_predicted` -- a second EP lookup alongside the house `api.expected_points`.
  Happy to take it, but only with an explicit "which is authoritative" rule in the COMMENT:
  handing one agent two EP models without a precedence rule produces incoherent answers.
- `espn.play_participants` -- genuinely novel, but heavy and with no designed consumer here yet.
- **Declining:** `ref.player_id_xwalk`/`team_id_xwalk`/`game_id_xwalk` (Fox/Yahoo ids have no
  consumer in this repo); `ratings.massey_composite` (revisit when it populates); the `ncaa`
  schema (understood as deliberately ungranted, nothing planned).

---

## 4. Two things to settle

1. **`marts.epa_crossvalidation`.** Your handoff lists it as a data-quality panel candidate, but
   the 2026-08-29 `SCHEMA_CONTRACT.md` entry declares it **INTERNAL, not a public surface** and
   explicitly not a shipping gate. Those disagree. We have designed nothing against it pending
   your answer; if it is meant to be consumable it needs an `api.*` view like everything else.
2. **The corrections campaign.** Noted that the 2014-2025 refresh drains through early October
   and historical EPA will shift. Our concern is the Discord bot's long-term memory and
   prediction ledger, which persist answers across sessions -- a number recorded in September
   will silently disagree with the same query in October. If you can flag when a season's
   correction pass completes, we can scope-invalidate rather than distrust the whole range.

---

## 5. What cfb-app ships when

Nothing feature-facing is shippable before the first view lands; that is the honest state
rather than a negotiating position. Sequenced:

- **On P1 views:** `get_passing_charting` and `get_target_profile` MCP tools (coverage
  denominators mandatory in every payload, with a default coverage floor stated in the tool
  description), `get_coach_tenure`, and a `coach_id` rekey of the existing coach queries.
  Passing charting goes to the **agent/MCP surface only** at first -- a 2025-only,
  half-covered leaderboard on a public page is a worse artifact than no page.
- **On P2 views:** a `/cfp` route, realignment-correct conference history, advanced team stats
  on game and team pages.
- **Today, unblocked:** the `api.player_detail` schema-card correction from §2.
