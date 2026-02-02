# Data Audit: Special Teams & Strength of Schedule

**Date:** 2026-02-02
**Author:** Claude (Task 7 Research)
**Purpose:** Determine data availability for Special Teams and SOS features

---

## Executive Summary

**Good news:** We have substantial data for both Special Teams and Strength of Schedule metrics already in the database. The data is sufficient to proceed with analytics features without building a new pipeline.

| Category | Status | Recommendation |
|----------|--------|----------------|
| Special Teams Ratings | **Available** | Use existing SP+/FPI ratings |
| Special Teams Raw Stats | **Available** | Aggregate from plays + player stats |
| Strength of Schedule | **Available** | Use FPI SOS rank (best coverage) |
| ELO Ratings | **Available** | Game-level pre/post ELO exists |

**Recommendation:** Skip Task 8 (ST Pipeline) - proceed directly to UI integration using existing data.

---

## 1. Available Special Teams Data

### 1.1 Pre-Computed Ratings (Best Option)

#### SP+ Special Teams Rating
- **Table:** `ratings.sp_ratings`
- **Column:** `special_teams__rating` (double precision)
- **Coverage:** 2006-2025 (gaps in 2004-2005, 2020-2021)
- **Value Range:** Typically -3.0 to +3.0 (points above/below average)

```sql
-- Example: Top ST ratings for 2024
SELECT team, special_teams__rating
FROM ratings.sp_ratings
WHERE year = 2024
ORDER BY special_teams__rating DESC
LIMIT 5;
-- Results: Ole Miss (2.1), Georgia (1.9), Miami (1.8), Alabama (1.7), Tennessee (1.7)
```

#### FPI Special Teams Efficiency
- **Table:** `ratings.fpi_ratings`
- **Column:** `efficiencies__special_teams` (double precision)
- **Coverage:** 2005-2025 (complete coverage)
- **Value Range:** 0-100 percentile scale

```sql
-- Example: 2024 FPI Special Teams
SELECT team, efficiencies__special_teams
FROM ratings.fpi_ratings WHERE year = 2024
ORDER BY efficiencies__special_teams DESC LIMIT 5;
-- Results: Louisville (61.5), Alabama (59.6), Georgia (59.6), SMU (56.0), Oregon (53.9)
```

### 1.2 Raw Play-by-Play Data

#### Special Teams Play Types Available
| Play Type | Count (All Years) | Notes |
|-----------|-------------------|-------|
| Punt | 186,494 | Includes yards_gained |
| Kickoff | 183,969 | Includes touchback detection in play_text |
| Kickoff Return (Offense) | 25,766 | Return yards in yards_gained |
| Field Goal Good | 43,974 | Distance derivable from yards_to_goal |
| Field Goal Missed | 14,682 | Distance derivable from yards_to_goal |
| Punt Return | 4,595 | Return yards available |
| Extra Point Good | 44,980 | |
| Extra Point Missed | 2,890 | |
| Blocked Field Goal | 1,157 | |
| Blocked Punt | 995 | |
| Blocked Punt Touchdown | 166 | |
| Blocked Field Goal Touchdown | 60 | |
| Blocked PAT | 35 | |
| Kickoff Return Touchdown | 577 | |
| Punt Return Touchdown | 221 | |

**Key Fields in `core.plays`:**
- `play_type` - Categorizes play
- `yards_gained` - Kick/punt distance or return yards
- `yards_to_goal` - Can derive FG distance (add 17 for snap + hold)
- `play_text` - Contains detailed info (touchbacks, fair catches, etc.)
- `scoring` - Boolean for scores

### 1.3 Aggregated Season Stats

#### Team Season Stats (`stats.team_season_stats`)
| Stat Name | Coverage | Description |
|-----------|----------|-------------|
| kickReturns | 2004-2025 | Number of kick returns |
| kickReturnYards | 2004-2025 | Total kick return yards |
| kickReturnTDs | 2004-2025 | Kick return touchdowns |
| puntReturns | 2004-2025 | Number of punt returns |
| puntReturnYards | 2004-2025 | Total punt return yards |
| puntReturnTDs | 2004-2025 | Punt return touchdowns |

**Note:** These also have `*Opponent` variants for defense.

#### Player Season Stats (`stats.player_season_stats`)
| Category | Stat Types | Records (2024) |
|----------|-----------|----------------|
| kicking | FGA, FGM, PCT, LONG, XPA, XPM, PTS | ~4,132 |
| punting | NO, YDS, YPP, LONG, In 20, TB | ~3,898 |
| kickReturns | NO, YDS, AVG, TD, LONG | ~12,797 |
| puntReturns | NO, YDS, AVG, TD, LONG | ~6,793 |

---

## 2. Available Strength of Schedule Data

### 2.1 FPI Strength of Schedule (Best Option)
- **Table:** `ratings.fpi_ratings`
- **Column:** `resume_ranks__strength_of_schedule` (rank 1-130+)
- **Coverage:** 2005-2025 (complete)
- **Additional:** `resume_ranks__remaining_strength_of_schedule` (in-season)

```sql
-- Example: 2024 SOS rankings (lower = harder schedule)
SELECT team, resume_ranks__strength_of_schedule as sos_rank
FROM ratings.fpi_ratings WHERE year = 2024
ORDER BY resume_ranks__strength_of_schedule
LIMIT 5;
-- Results: Georgia (1), South Carolina (15), Alabama (16), Texas (21), Louisville (23)
```

### 2.2 SP+ Strength of Schedule
- **Table:** `ratings.sp_ratings`
- **Column:** `sos` (double precision, 0-1 scale)
- **Coverage:** 2005-2018 only (NOT available 2019-2025)
- **Issue:** API stopped providing this field after 2018

### 2.3 Game-Level ELO Ratings
- **Table:** `core.games`
- **Columns:**
  - `home_pregame_elo` / `away_pregame_elo`
  - `home_postgame_elo` / `away_postgame_elo`
- **Coverage:** Varies by season
- **Use Case:** Can compute opponent strength from opponent ELO

### 2.4 SRS Ratings (Simple Rating System)
- **Table:** `ratings.srs_ratings`
- **Columns:** `year`, `team`, `rating`, `ranking`
- **Coverage:** ~1,258 records
- **Note:** SRS inherently accounts for SOS in its calculation

---

## 3. Gaps Identified

### 3.1 Missing Data
| Gap | Impact | Workaround |
|-----|--------|------------|
| SP+ SOS after 2018 | Medium | Use FPI SOS instead |
| SP+ ST rating 2020-2021 | Low | Use FPI ST efficiency |
| Touchback % not pre-computed | Low | Parse from play_text or compute from plays |
| Net punting not aggregated | Low | Compute: punt yards - return yards |
| FG% by distance not aggregated | Low | Compute from plays table |

### 3.2 Data Quality Notes
- Play-by-play data starts ~2004, so earlier years lack granular stats
- Some player stats have inconsistent categorization (e.g., QBs appearing in punting)
- FG distance must be derived: `yards_to_goal + 17` (snap + hold distance)

---

## 4. Recommendations

### 4.1 For Special Teams Analytics

**Primary Approach:** Use pre-computed ratings
```sql
-- Recommended view for Special Teams ratings
SELECT
    sp.year,
    sp.team,
    sp.special_teams__rating as sp_st_rating,
    fpi.efficiencies__special_teams as fpi_st_efficiency
FROM ratings.sp_ratings sp
LEFT JOIN ratings.fpi_ratings fpi
    ON sp.year = fpi.year AND sp.team = fpi.team
WHERE sp.year >= 2022;
```

**Secondary Metrics (if needed):** Aggregate from existing stats
- Kick return avg: `kickReturnYards / kickReturns`
- Punt return avg: `puntReturnYards / puntReturns`
- FG%: Query player_season_stats for kickers

### 4.2 For Strength of Schedule

**Primary Approach:** Use FPI SOS rank
```sql
-- Recommended SOS query
SELECT
    year,
    team,
    resume_ranks__strength_of_schedule as sos_rank,
    fpi as team_rating
FROM ratings.fpi_ratings
WHERE year = 2024
ORDER BY sos_rank;
```

**Alternative:** Compute from game ELO
```sql
-- Compute average opponent pregame ELO
SELECT
    g.season,
    g.home_team as team,
    AVG(g.away_pregame_elo) as avg_opponent_elo
FROM core.games g
WHERE g.season = 2024
GROUP BY g.season, g.home_team;
```

### 4.3 Task 8 Decision

**Recommendation: SKIP Task 8 (Special Teams Pipeline)**

Rationale:
1. SP+ and FPI already provide robust special teams ratings
2. Raw stats exist in team_season_stats and player_season_stats
3. Play-by-play data allows any custom aggregation needed
4. Building a new pipeline would duplicate existing data
5. Time better spent on UI integration

**Instead, proceed to:**
- Create a materialized view combining SP+ and FPI special teams data
- Add SOS rank to team profile views
- Build UI components to display these metrics

---

## 5. Proposed Schema for Analytics View

```sql
-- Suggested: Create combined special teams + SOS view
CREATE OR REPLACE VIEW public.team_special_teams_sos AS
SELECT
    COALESCE(sp.year, fpi.year) as season,
    COALESCE(sp.team, fpi.team) as team,
    -- Special Teams
    sp.special_teams__rating as sp_st_rating,
    fpi.efficiencies__special_teams as fpi_st_efficiency,
    -- Strength of Schedule
    fpi.resume_ranks__strength_of_schedule as sos_rank,
    sp.sos as sp_sos,  -- Only available through 2018
    -- ELO (for reference)
    (SELECT AVG(CASE
        WHEN g.home_team = sp.team THEN g.away_pregame_elo
        ELSE g.home_pregame_elo
    END)
    FROM core.games g
    WHERE g.season = sp.year
    AND (g.home_team = sp.team OR g.away_team = sp.team)
    ) as avg_opponent_elo
FROM ratings.sp_ratings sp
FULL OUTER JOIN ratings.fpi_ratings fpi
    ON sp.year = fpi.year AND sp.team = fpi.team
WHERE COALESCE(sp.year, fpi.year) >= 2015;
```

---

## Appendix: Data Source Summary

| Table | Schema | Key Columns | Use For |
|-------|--------|-------------|---------|
| sp_ratings | ratings | special_teams__rating, sos | ST rating, historical SOS |
| fpi_ratings | ratings | efficiencies__special_teams, resume_ranks__strength_of_schedule | ST efficiency, SOS rank |
| elo_ratings | ratings | elo | Team strength baseline |
| srs_ratings | ratings | rating, ranking | Alternative strength metric |
| games | core | home_pregame_elo, away_pregame_elo | Opponent strength |
| plays | core | play_type, yards_gained, play_text | Granular ST plays |
| team_season_stats | stats | kickReturns*, puntReturns* | Return stats |
| player_season_stats | stats | kicking, punting categories | Individual kicker/punter stats |
