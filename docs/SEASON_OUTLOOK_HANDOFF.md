# Handoff: `fitted_v1` + `api.season_outlook` — corrections and asks

**From:** cfb-app
**Date:** 2026-07-26
**Re:** cfb-database's `2026-07-26` season-outlook handoff
**Status:** shipped in cfb-app — `get_season_outlook` MCP tool, `api.season_outlook` added to
the `run_sql` schema card, bot self-description corrected, `fitted_v1` adopted as
`DEFAULT_PREDICTION_MODEL`

Thanks — the projection surface is good and the bot now answers the standings question with
the error band attached. Everything below is either a correction to the handoff, a bug it
would have caused downstream, or an ask.

All figures are from read-only queries run 2026-07-26; the SQL is included so you can re-run
after any model refresh rather than trusting these numbers.

---

## 1. `fitted_v1` is a full third model version, not just the projection model

The handoff frames `fitted_v1` as "the better model … what scores upcoming games now", which
undersold it. It is a fully populated third model version in **both**
`api.game_predictions` and `api.scored_matchup_edges`:

| surface | fitted_v1 rows | seasons |
|---|---|---|
| `api.game_predictions` | 23,453 | 2018–2026 |
| `api.scored_matchup_edges` | 1,638 | 2026 only |

> **Correction (2026-07-27).** An earlier revision of this section attached
> "23,453 rows spanning 2018–2026" to both surfaces. That figure is
> `api.game_predictions` alone. `scored_matchup_edges` holds upcoming games with a market
> line, so it carries 1,638 rows per model version and is empty out of season **by design** —
> not a failure state, and it should not render as an error. Thanks to cfb-database for
> catching it.

cfb-app had a two-element `PREDICTION_MODEL_VERSIONS` constant, so neither the bot nor the web
UI could name or select it. Fixed — but a consumer reading only the handoff would have added a
projection tool and still shipped `elo_epa_blend_v1` as its game-level default.

---

## 2. `fitted_v1` has its own `home_win_prob` — this one broke documented copy

**Not mentioned in the handoff, and it is the most consequential omission.**

Our schema notes, three MCP tool descriptions, and a query-module header all carried the rule
"`home_win_prob` is Elo-only in BOTH versions, so only `expected_home_margin` changes." That
was true of the two Elo rows and is false for `fitted_v1`, which carries its own Platt-scaled
win probability:

```sql
SELECT model_version, home_win_prob, expected_home_margin
FROM api.game_predictions
WHERE game_id = 401856634
ORDER BY model_version;
-- elo_epa_blend_v1  0.7000   9.01
-- elo_v1            0.7000   6.69
-- fitted_v1         0.8772  20.03
```

0.70 → 0.88 on the same game is not a rounding difference. Any consumer that cached "win
probability is constant across versions" is now quoting a number from the wrong model. Worth
an explicit line in `SCHEMA_CONTRACT.md`.

---

## 3. `fitted_v1` is better on margin only — it is *worse* against the spread

The handoff cites margin MAE (14.69 vs 15.69 / 15.88) and concludes `fitted_v1` "is the better
model". On the same rows it has the **worst** ATS hit rate of the three and a level Brier:

```sql
SELECT model_version, margin_mae, margin_rmse, ats_hit_rate, brier, cfbd_brier
FROM api.prediction_accuracy
WHERE season = 2025 AND edge_threshold = 0
ORDER BY margin_mae;
-- fitted_v1         14.6874  18.5242  0.4765  0.181079  0.157122
-- elo_epa_blend_v1  15.6860  19.9666  0.4962  0.181503  0.157122
-- elo_v1            15.8781  20.2382  0.5038  0.181503  0.157122
```

Predicting a margin accurately and beating a market line are different tests, and `fitted_v1`
got measurably better at the first while getting slightly worse at the second. Flagging this
because the handoff's own closing argument is that a clean number hiding its uncertainty is
the thing to avoid — "best MAE, therefore the better model" is the same shape of claim. Our
`/models` page and the `get_model_accuracy` tool description now state the tradeoff explicitly
rather than ranking the three.

---

## 4. `fitted_v1` coverage is narrower — this shipped as a bug here for one commit

Also not in the handoff:

```sql
SELECT model_version, MIN(season), MAX(season),
       COUNT(elo_margin) AS has_elo_margin,
       COUNT(epa_margin) AS has_epa_margin, COUNT(*) AS n
FROM api.game_predictions GROUP BY 1 ORDER BY 1;
-- elo_epa_blend_v1  2015  2026  28091  15348  28091
-- elo_v1            2015  2026  28091      0  28091
-- fitted_v1         2018  2026      0      0  23453
```

Two consequences:

- **`fitted_v1` starts at 2018; the Elo versions reach 2015.** Making it the default silently
  broke pre-2018 game lookups — our tool reported "no prediction found" for a 2016 game when
  one exists under an Elo version. Caught only by running against real PostgREST; our unit
  tests mock the query layer, so they could not see it. The no-match string now points at the
  Elo versions.
- **`elo_margin` and `epa_margin` are NULL on all 23,453 `fitted_v1` rows.** Sensible — the
  fitted ridge does not decompose its margin — but a consumer will read it as missing data
  unless told. Now documented in our tool description.

Both belong in the contract next to the model description.

---

## 5. `api.season_outlook` for a completed season is a trap

The handoff's suggested query pins `season = 2026`, so it never hits this. Anything that
defaults the season does.

2025 is in the view (699 rows) and is **fully played**, so its rows are final records wearing
projection column names:

```sql
SELECT team, projected_wins, actual_wins, games_completed, games_scheduled,
       wins_p10, wins_p90, conf_title_prob
FROM api.season_outlook
WHERE season = 2025 AND conference = 'SEC' AND model_version = 'fitted_v1'
ORDER BY projected_wins DESC LIMIT 6;
-- Georgia     12.00  12  13/13  12.00  12.00  0.2500
-- Texas A&M   11.00  11  12/12  11.00  11.00  0.2500
-- Ole Miss    11.00  11  12/12  11.00  11.00  0.2500
-- Oklahoma    10.00  10  12/12  10.00  10.00  0.0000
-- Alabama     10.00  10  13/13  10.00  10.00  0.2500
-- Vanderbilt  10.00  10  12/12  10.00  10.00  0.0000
```

`projected_wins == actual_wins`, the percentile band has collapsed (`p10 == p90`), and
`conf_title_prob` is a **simulation tiebreak artifact** — four teams at exactly 0.2500,
because teams that finished level split it evenly. It is not the actual champion.

This is why our tool resolves a missing `season` from `MAX(season)` in the view rather than
from our `CURRENT_SEASON` constant: that constant trails the calendar in the offseason, and
the season it trails to is precisely this one. A consumer defaulting to "current season" gets
hindsight labelled as a forecast, with a fabricated-looking title race attached.

We handle it by deriving caveats from `games_completed` vs `games_scheduled`. **Ask:** worth
either an `is_projection` boolean on the view, or a note in the contract, so the next consumer
does not have to work it out.

---

## 6. The view is not FBS-only, and there is no `classification` column

2026 is 350 rows across 49 named conferences plus 13 rows with `conference IS NULL` — FBS,
FCS, DII and DIII together, many with one or two games loaded. An unfiltered
`ORDER BY projected_wins DESC` compares teams playing entirely different schedules.

`api.season_outlook` has no `classification` column, and our repo has an explicit rule against
filtering FBS by conference-name allowlist (it leaked FCS schools into production once). We
sidestepped it by requiring a `team` or `conference` argument, but that only works because our
surface is a curated tool — a `run_sql` caller has no such guardrail, so our schema card now
carries a warning.

**Ask:** add `classification` to the view. It is the single cheapest fix here.

---

## 7. Question: is `schedule_complete` calibrated to a 12-game FBS slate?

**Unverified — flagging as an observation, not a finding.** All 8 Ivy League teams in 2026
show `schedule_complete = false` with `games_scheduled = 10`, `games_simulated = 10`,
`games_unscored = 0`:

```sql
SELECT team, games_scheduled, games_simulated, games_unscored, schedule_complete
FROM api.season_outlook
WHERE season = 2026 AND conference = 'Ivy' AND model_version = 'fitted_v1';
```

The Ivy League plays a 10-game regular season, so those schedules look complete to us. If the
flag is `games_scheduled >= 11` or similar, it is a false alarm for every conference that does
not play 12 — and it drives our "these are floors, not full-season projections" caveat, so we
are currently warning about the Ivy League for no reason. Could you confirm the definition?

Related and minor: `p_bowl_eligible` is computed for FCS/DII/DIII teams (Yale 0.888), where
bowl eligibility is not a thing.

---

## 8. Ask: expose the preseason backtest as an `api.*` view

The honesty numbers the handoff tells us to relay — win MAE 1.743, RMSE 2.168, bias −0.126,
n=921, the asymmetric 80% interval `[−2.68, +3.02]`, baselines 2.128 / 2.140 — are not
queryable anywhere. `features.model_metadata` holds only the walk-forward ridge fits, and
`features` is outside the contracted `api` surface we are allowed to read.

So they are **hardcoded constants in cfb-app** (`SEASON_OUTLOOK_ACCURACY` in
`src/lib/mcp/tools.ts`), attached to every `get_season_outlook` response. That works, and it
is the right call for now, but it means the day `backtest_preseason.py` reruns, our numbers go
stale silently and nothing anywhere will fail.

An `api.model_backtest` view — one row per `(model_version, metric_set)` with the MAE/RMSE/
bias/n and the residual quantiles — would let us read them instead. Not blocking; the tool
ships without it. But this is the one number in the payload we cannot verify at runtime.

---

## What cfb-app shipped

- **`get_season_outlook`** MCP tool over `api.season_outlook`. Requires `team` or `conference`
  (see §6). Returns the envelope plus a hardcoded `accuracy` block and a `caveats` array
  **computed from the returned rows** — a static tool description cannot say "this season is
  already played" or "8 of 8 of these teams have a partial schedule", and those are exactly
  the facts that decide whether the numbers may be called a forecast.
- **`api.season_outlook` added to the `run_sql` schema card**, with the not-FBS-only and
  `games_simulated`-not-`games_scheduled` warnings inline.
- **`fitted_v1` is now `DEFAULT_PREDICTION_MODEL`**, across the MCP tools and the web UI.
- **Bot corrected.** It no longer treats season projections as out of scope, and it lost a
  claim that had gone false independently of your handoff: "unplayed games have no scores or
  predictions". All 1,638 games of 2026 are unplayed and every one carries predictions from
  all three models.

Your framing — "here is the table, here is how wrong it usually is" — is what the bot now
does. The caveats ride in the payload rather than only in the prompt, on the theory that a
warning next to the numbers survives longer than one in a system prompt read a thousand tokens
earlier.

---

# Response and resolution (2026-07-27)

cfb-database answered in PR #56 and shipped fixes for all eight items. Verified against the
live warehouse before adopting:

| Item | Shipped | Verified |
|---|---|---|
| §6 `classification` | new column, season-accurate | 2026: 138 fbs / 128 fcs / 38 ii / 33 iii / 13 NULL. 2025 fbs=136, so it really is per-season |
| §5 `is_projection` | new column, `games_simulated > games_completed` | 2026: 350/350 true. 2025: **0**/699 — correctly marks the settled season |
| §7 `schedule_complete` | now division-aware (modal `games_scheduled` among conference peers) | FCS 128/128 complete; the Ivy false alarm is gone |
| §7 `p_bowl_eligible` | NULL outside FBS | non-NULL on 138/138 FBS, 0 on all 212 others |
| §8 `api.model_backtest` | new view (migration 045) | see below |

**The backtest table shipped empty.** `api.model_backtest` existed with the right columns but
`predictions.model_backtest` had zero rows, so following "stop hardcoding, read it live"
literally would have stripped the error band off every projection — the exact failure mode
this whole exchange was about. cfb-database traced it to a deploy ordering error (the backtest
ran before migration 045 created the table) and repopulated. Now one row: `fitted_v1` / `fbs`,
2019–2025, n=921, `win_mae` 1.738, `resid_p10` −2.646, `resid_p90` +3.024, `run_date`
2026-07-27.

Worth recording as a pattern rather than a one-off: a view whose DDL deploys separately from
its writer can present as live-and-correct while being empty, and a consumer that trusts the
"deployed and verified" line without querying it inherits the gap silently.

## New finding: duplicate backtest rows (for cfb-database)

`api.model_backtest` holds **two** rows for `fitted_v1` / `fbs`, identical in `run_date`
(2026-07-27), `strength_share` (0.150), `n` (921), `win_mae`, `rmse`, `bias`, `coverage` and
both residual bounds — differing only in `season_start`:

```sql
SELECT season_start, season_end, run_date, n, win_mae
FROM api.model_backtest WHERE model_version = 'fitted_v1' AND scope = 'fbs';
-- 2018  2025  2026-07-27  921  1.738
-- 2019  2025  2026-07-27  921  1.738
```

The view's grain is `DISTINCT ON (model_version, scope, season_start, season_end,
strength_share)`, so both survive. Two consequences:

- **The suggested query is non-deterministic.** `... WHERE model_version = 'fitted_v1' AND
  scope = 'fbs' ORDER BY run_date DESC LIMIT 1` ties on `run_date`, so Postgres may return
  either. We hit this: the tool reported the window as 2018–2025 on one run and 2019–2025 on
  the next. Fixed our side by adding `season_start`/`season_end` tiebreaks, and by fetching
  two rows so we can warn when a tie is *material* rather than cosmetic. Today the metrics are
  identical, so the pick only changes the reported window — but if a future run makes them
  diverge, the naive query silently picks one.
- **One of the two rows is mislabeled.** Both claim n=921, but a 2018–2025 window covers a
  season more than 2019–2025 and should not produce the same team-season count. Your handoff
  documents the window as 2019–2025, so the 2018 row looks like a stale or misdated insert
  worth deleting.

Suggestion: a uniqueness constraint on `(model_version, scope, run_date)` — or documenting
which of the grain columns a consumer is expected to pin — would make the "read the latest
run" instruction safe to follow literally.

## What cfb-app changed in response

- **The hardcoded accuracy constant is gone.** `get_season_outlook` reads
  `api.model_backtest` live, pinned to `scope='fbs'`, newest `run_date`. `n` is surfaced as
  `n_team_seasons` and the interval as `interval_80_pct` from `resid_p10`/`resid_p90`, both
  renamed against the misreads you flagged. No row, or a failed read, yields `accuracy: null`
  plus a caveat saying the error is **unmeasured** — never zero, never a silently missing key.
- **`is_projection` replaces the derived completed-season logic**, and `classification`
  replaces the required team-or-conference argument: the tool now defaults to
  `classification='fbs'` and can answer a national question safely.
- **New caveats** for `p_bowl_eligible` being NULL outside FBS, for DII/DIII
  `schedule_complete` being unconfirmed (your §7 open item — we surface it as unverified
  rather than asserting those schedules are short), and for row-cap truncation.
- **The bot no longer restates error figures.** It defers to the live `accuracy` block, since
  a number in the prompt would silently contradict the payload after any re-run. It also
  carries your §4 correction: the first-year effect is a penalty for an *unproven* hire, not
  for changing coaches, and a proven hire projects roughly as though nothing happened.
