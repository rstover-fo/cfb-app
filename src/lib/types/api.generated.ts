/**
 * Hand-generated stand-in for `supabase gen types` output, scoped to the
 * `api` Postgres schema (PostgREST-exposed contracted views).
 *
 * PROVENANCE (read before trusting a column): the task this file was
 * produced under called for generating it from a live PostgREST OpenAPI
 * introspection request:
 *   curl "$VITE_SUPABASE_URL/rest/v1/" -H "Accept-Profile: api" ...
 * That request was attempted repeatedly and failed in this sandbox: the
 * outbound egress proxy returns "502 upstream dial failed" for CONNECT to
 * *.supabase.co (confirmed non-project-specific -- a random nonsense
 * *.supabase.co subdomain fails identically, while supabase.com itself
 * resolves fine), and the same failure reproduces via Node's fetch, not
 * just curl. No Supabase CLI access token or DB password was available
 * either (see task constraints), so `supabase gen types` was not an option.
 *
 * Given both introspection paths were blocked, these Row shapes were
 * instead transcribed directly from the authoritative CREATE VIEW SQL in
 * the sibling cfb-database repo (read-only, same machine):
 *   /workspace/cfb-database/src/schemas/api/0XX_<view>.sql
 * cross-checked against that repo's docs/SCHEMA_CONTRACT.md (updated
 * 2026-07-22, the same day this file was written) for column lists and
 * per-view deploy status. For the five views that are thin `SELECT *`
 * passthroughs of a marts materialized view (team_wepa_season,
 * player_wepa_leaders, team_returning_production, player_usage_leaders,
 * team_ats), the source marts/*.sql definition was read instead of the
 * api/*.sql wrapper to get real column names. This is arguably more
 * precise than OpenAPI introspection would have been (it's the literal
 * source SQL, not a reflected schema) but it is NOT a substitute for the
 * real thing: it can't see server-side grants/RLS-driven column hiding,
 * and it was authored by transcription, not machine-generated, so it can
 * contain a transcription mistake OpenAPI introspection wouldn't.
 *
 * Regenerate for real the moment credentials exist:
 *   supabase gen types typescript --project-id <id> --schema api > src/lib/types/api.generated.ts
 * or, if only REST credentials return, retry the curl above and regenerate
 * from the OpenAPI `definitions` block.
 *
 * Nullability: every column below is typed `| null`, matching how
 * `supabase gen types` treats Postgres views in this codebase's own
 * database.generated.ts (public schema) -- views don't carry the
 * underlying tables' NOT NULL constraints, so the generator marks every
 * view column nullable regardless of whether it's realistically ever
 * null. Follow the same convention here rather than guessing which
 * columns a real introspection would mark required.
 *
 * Deploy status per docs/SCHEMA_CONTRACT.md as of 2026-07-22 (all views
 * below exist as CREATE VIEW statements in cfb-database; "Pending deploy"
 * means the contract itself says the view may not be live in production
 * yet -- querying it should degrade gracefully, not throw):
 *   Pending deploy : api.coach_records, api.game_win_probability
 *   Deployed/Live  : everything else listed below
 */

import type { Json } from './database.generated'

export type { Json }

export type ApiSchema = {
  Tables: {
    [_ in never]: never
  }
  Views: {
    team_detail: {
      Row: {
        school: string | null
        mascot: string | null
        abbreviation: string | null
        color: string | null
        alternate_color: string | null
        logo_url: string | null
        conference: string | null
        classification: string | null
        current_season: number | null
        games: number | null
        wins: number | null
        losses: number | null
        conf_wins: number | null
        conf_losses: number | null
        ppg: number | null
        opp_ppg: number | null
        avg_margin: number | null
        sp_rating: number | null
        sp_rank: number | null
        sp_offense: number | null
        sp_defense: number | null
        elo: number | null
        fpi: number | null
        // Added 2026-08-08 (CFBD CORE handoff): opponent/situation-adjusted
        // ratings, 2016+. NULL = not rated, never 0. core_defense is
        // LOWER-better. Confirmed by live introspection same day.
        core_overall: number | null
        core_offense: number | null
        core_defense: number | null
        epa_per_play: number | null
        epa_tier: string | null
        success_rate: number | null
        explosiveness: number | null
        recruiting_rank: number | null
        recruiting_points: number | null
      }
      Relationships: []
    }
    // CORRECTION (2026-07-26): `sp_offense` / `sp_defense` were missing here
    // while genuinely present on the live view -- confirmed against
    // information_schema.columns for api.team_history, and they carry values
    // back to 2015 for every FBS team. They were the columns the
    // `team-metric-trend` chart's metric enum needed
    // (src/lib/charts/metrics.ts), so the omission would have read as
    // "SP+ splits are only per-season current data", which is false.
    team_history: {
      Row: {
        team: string | null
        season: number | null
        conference: string | null
        games: number | null
        wins: number | null
        losses: number | null
        conf_wins: number | null
        conf_losses: number | null
        ppg: number | null
        opp_ppg: number | null
        avg_margin: number | null
        sp_rating: number | null
        sp_rank: number | null
        sp_offense: number | null
        sp_defense: number | null
        elo: number | null
        fpi: number | null
        // Added 2026-08-08 (CFBD CORE handoff): NULL for seasons < 2016 =
        // not rated, never 0. core_defense is LOWER-better.
        core_overall: number | null
        core_offense: number | null
        core_defense: number | null
        epa_per_play: number | null
        epa_tier: string | null
        success_rate: number | null
        explosiveness: number | null
        total_plays: number | null
        recruiting_rank: number | null
        recruiting_points: number | null
      }
      Relationships: []
    }
    // CFBD CORE (Context & Opponent-Relative Efficiency): situation- and
    // opponent-adjusted team ratings, retrospective from 2016. One row per
    // (team, season); per-100-qualifying-plays point margins vs average with
    // overall = offense - defense (up to 0.01 rounding drift from the 2dp
    // columns). defense is LOWER-better. In-season rows are snapshots
    // advanced in place -- through_week/through_season_type are the as-of
    // markers. Columns confirmed by live introspection of
    // information_schema.columns on 2026-08-08 (CFBD CORE handoff).
    core_ratings: {
      Row: {
        season: number | null
        team: string | null
        conference: string | null
        overall: number | null
        offense: number | null
        defense: number | null
        offense_plays: number | null
        defense_plays: number | null
        through_week: number | null
        through_season_type: string | null
        model_version: string | null
        overall_rank: number | null
        offense_rank: number | null
        defense_rank: number | null
      }
      Relationships: []
    }
    game_detail: {
      Row: {
        game_id: number | null
        season: number | null
        week: number | null
        season_type: string | null
        start_date: string | null
        start_time_tbd: boolean | null
        completed: boolean | null
        neutral_site: boolean | null
        conference_game: boolean | null
        home_team: string | null
        home_conference: string | null
        home_points: number | null
        home_pregame_elo: number | null
        home_epa: number | null
        home_success_rate: number | null
        away_team: string | null
        away_conference: string | null
        away_points: number | null
        away_pregame_elo: number | null
        away_epa: number | null
        away_success_rate: number | null
        winner: string | null
        point_diff: number | null
        home_spread: number | null
        over_under: number | null
        line_provider: string | null
        spread_result: string | null
        ou_result: string | null
        pregame_home_win_prob: number | null
        venue: string | null
        venue_id: number | null
        attendance: number | null
        excitement_index: number | null
      }
      Relationships: []
    }
    matchup: {
      Row: {
        team1: string | null
        team2: string | null
        total_games: number | null
        team1_wins: number | null
        team2_wins: number | null
        ties: number | null
        first_meeting: number | null
        last_meeting: number | null
        recent_results: Json | null
        team1_season: number | null
        team1_wins_season: number | null
        team1_losses_season: number | null
        team1_sp_rank: number | null
        team1_epa: number | null
        team1_epa_tier: string | null
        team2_season: number | null
        team2_wins_season: number | null
        team2_losses_season: number | null
        team2_sp_rank: number | null
        team2_epa: number | null
        team2_epa_tier: string | null
      }
      Relationships: []
    }
    // One row per game (2000+): blended pregame forecast, component model
    // probabilities, market lines, actual result, and season context --
    // columns transcribed from the live api.matchup_forecast view.
    matchup_forecast: {
      Row: {
        game_id: number | null
        season: number | null
        week: number | null
        season_type: string | null
        start_date: string | null
        completed: boolean | null
        neutral_site: boolean | null
        conference_game: boolean | null
        home_team: string | null
        away_team: string | null
        market_spread: number | null
        market_over_under: number | null
        home_win_probability: number | null
        away_win_probability: number | null
        projected_winner: string | null
        projected_margin: number | null
        confidence_tier: string | null
        cfbd_home_win_prob: number | null
        market_home_win_prob: number | null
        elo_home_win_prob: number | null
        sp_home_win_prob: number | null
        model_version: string | null
        home_points: number | null
        away_points: number | null
        actual_winner: string | null
        brier_loss: number | null
        home_expected_wins: number | null
        home_bowl_eligibility_prob: number | null
        home_ten_plus_win_prob: number | null
        away_expected_wins: number | null
        away_bowl_eligibility_prob: number | null
        away_ten_plus_win_prob: number | null
      }
      Relationships: []
    }
    // classification landed 2026-07-22 alongside the FBS rank-scoping fix
    // (wins_rank/ppg_rank/defense_ppg_rank/epa_rank are now
    // PARTITION BY season, classification -- see SCHEMA_CONTRACT.md's
    // 2026-07-22 changelog entry). All rows are still returned regardless
    // of classification; consumers filter client-side (or via .eq()).
    leaderboard_teams: {
      Row: {
        team: string | null
        conference: string | null
        season: number | null
        classification: string | null
        games: number | null
        wins: number | null
        losses: number | null
        win_pct: number | null
        conf_wins: number | null
        conf_losses: number | null
        ppg: number | null
        opp_ppg: number | null
        avg_margin: number | null
        sp_rating: number | null
        sp_rank: number | null
        sp_offense: number | null
        sp_defense: number | null
        elo: number | null
        fpi: number | null
        epa_per_play: number | null
        epa_tier: string | null
        success_rate: number | null
        explosiveness: number | null
        total_plays: number | null
        recruiting_rank: number | null
        recruiting_points: number | null
        wins_rank: number | null
        ppg_rank: number | null
        defense_ppg_rank: number | null
        epa_rank: number | null
      }
      Relationships: []
    }
    roster_lookup: {
      Row: {
        id: string | null
        first_name: string | null
        last_name: string | null
        team: string | null
        position: string | null
        height: number | null
        weight: number | null
        year: number | null
        jersey: number | null
        home_city: string | null
        home_state: string | null
        home_country: string | null
      }
      Relationships: []
    }
    recruit_lookup: {
      Row: {
        id: number | null
        athlete_id: string | null
        recruit_type: string | null
        year: number | null
        ranking: number | null
        name: string | null
        school: string | null
        committed_to: string | null
        position: string | null
        height: number | null
        weight: number | null
        stars: number | null
        rating: number | null
        city: string | null
        state_province: string | null
        country: string | null
      }
      Relationships: []
    }
    player_season_leaders: {
      Row: {
        season: number | null
        category: string | null
        player_id: string | null
        player_name: string | null
        team: string | null
        yards: number | null
        touchdowns: number | null
        interceptions: number | null
        pct: number | null
        attempts: number | null
        completions: number | null
        carries: number | null
        yards_per_carry: number | null
        receptions: number | null
        yards_per_reception: number | null
        longest: number | null
        total_tackles: number | null
        solo_tackles: number | null
        sacks: number | null
        tackles_for_loss: number | null
        passes_defended: number | null
        yards_rank: number | null
      }
      Relationships: []
    }
    player_detail: {
      Row: {
        player_id: string | null
        name: string | null
        team: string | null
        position: string | null
        season: number | null
        height: number | null
        weight: number | null
        jersey: number | null
        home_city: string | null
        home_state: string | null
        stars: number | null
        recruit_rating: number | null
        national_ranking: number | null
        recruit_class: number | null
        pass_att: number | null
        pass_cmp: number | null
        pass_yds: number | null
        pass_td: number | null
        pass_int: number | null
        pass_pct: number | null
        rush_car: number | null
        rush_yds: number | null
        rush_td: number | null
        rush_ypc: number | null
        rec: number | null
        rec_yds: number | null
        rec_td: number | null
        rec_ypr: number | null
        tackles: number | null
        sacks: number | null
        tfl: number | null
        pass_def: number | null
        ppa_avg: number | null
        ppa_total: number | null
      }
      Relationships: []
    }
    game_player_leaders: {
      Row: {
        game_id: number | null
        season: number | null
        team: string | null
        conference: string | null
        home_away: string | null
        category: string | null
        stat_type: string | null
        player_id: string | null
        player_name: string | null
        stat: string | null
      }
      Relationships: []
    }
    game_box_score: {
      Row: {
        game_id: number | null
        season: number | null
        team: string | null
        home_away: string | null
        category: string | null
        stat_value: string | null
      }
      Relationships: []
    }
    game_line_scores: {
      Row: {
        game_id: number | null
        season: number | null
        home_q1: number | null
        home_q2: number | null
        home_q3: number | null
        home_q4: number | null
        home_ot: number | null
        away_q1: number | null
        away_q2: number | null
        away_q3: number | null
        away_q4: number | null
        away_ot: number | null
      }
      Relationships: []
    }
    player_comparison: {
      Row: {
        player_id: string | null
        name: string | null
        team: string | null
        position: string | null
        position_group: string | null
        season: number | null
        height: number | null
        weight: number | null
        jersey: number | null
        home_city: string | null
        home_state: string | null
        stars: number | null
        recruit_rating: number | null
        national_ranking: number | null
        recruit_class: number | null
        pass_att: number | null
        pass_cmp: number | null
        pass_yds: number | null
        pass_td: number | null
        pass_int: number | null
        pass_pct: number | null
        rush_car: number | null
        rush_yds: number | null
        rush_td: number | null
        rush_ypc: number | null
        rec: number | null
        rec_yds: number | null
        rec_td: number | null
        rec_ypr: number | null
        tackles: number | null
        sacks: number | null
        tfl: number | null
        pass_def: number | null
        ppa_avg: number | null
        ppa_total: number | null
        pass_yds_pctl: number | null
        pass_td_pctl: number | null
        pass_pct_pctl: number | null
        rush_yds_pctl: number | null
        rush_td_pctl: number | null
        rush_ypc_pctl: number | null
        rec_yds_pctl: number | null
        rec_td_pctl: number | null
        tackles_pctl: number | null
        sacks_pctl: number | null
        tfl_pctl: number | null
        ppa_avg_pctl: number | null
      }
      Relationships: []
    }
    team_playcalling_profile: {
      Row: {
        team: string | null
        season: number | null
        conference: string | null
        games_played: number | null
        overall_run_rate: number | null
        early_down_run_rate: number | null
        third_down_pass_rate: number | null
        red_zone_run_rate: number | null
        overall_success_rate: number | null
        overall_avg_epa: number | null
        third_down_success_rate: number | null
        red_zone_success_rate: number | null
        leading_run_rate: number | null
        trailing_run_rate: number | null
        run_rate_delta: number | null
        pace_plays_per_game: number | null
        overall_run_rate_pctl: number | null
        early_down_run_rate_pctl: number | null
        third_down_pass_rate_pctl: number | null
        overall_epa_pctl: number | null
        third_down_success_pctl: number | null
        red_zone_success_pctl: number | null
        run_rate_delta_pctl: number | null
        pace_pctl: number | null
      }
      Relationships: []
    }
    coaching_history: {
      Row: {
        coach_name: string | null
        first_name: string | null
        last_name: string | null
        team: string | null
        tenure_start: number | null
        tenure_end: number | null
        seasons_count: number | null
        total_games: number | null
        total_wins: number | null
        total_losses: number | null
        total_ties: number | null
        win_pct: number | null
        conf_wins: number | null
        conf_losses: number | null
        conf_win_pct: number | null
        best_season_wins: number | null
        worst_season_wins: number | null
        avg_sp_rating: number | null
        peak_sp_rating: number | null
        best_preseason_rank: number | null
        best_postseason_rank: number | null
        avg_recruiting_rank: number | null
        best_recruiting_rank: number | null
        inherited_talent_rank: number | null
        year3_talent_rank: number | null
        talent_improvement: number | null
        bowl_games: number | null
        bowl_wins: number | null
        is_active: boolean | null
      }
      Relationships: []
    }
    // Pending deploy per SCHEMA_CONTRACT.md as of 2026-07-22 -- career-at-
    // school grain (distinct from coaching_history's per-tenure grain).
    coach_records: {
      Row: {
        coach_name: string | null
        first_name: string | null
        last_name: string | null
        team: string | null
        first_season: number | null
        last_season: number | null
        seasons_count: number | null
        games: number | null
        wins: number | null
        losses: number | null
        ties: number | null
        win_pct: number | null
        ats_games: number | null
        ats_wins: number | null
        ats_losses: number | null
        ats_pushes: number | null
        ats_win_pct: number | null
        seasons_with_ats_data: number | null
      }
      Relationships: []
    }
    recruiting_roi: {
      Row: {
        team: string | null
        season: number | null
        conference: string | null
        avg_class_rank_4yr: number | null
        avg_class_points_4yr: number | null
        total_blue_chips_4yr: number | null
        blue_chip_ratio: number | null
        wins: number | null
        losses: number | null
        win_pct: number | null
        sp_rating: number | null
        sp_rank: number | null
        epa_per_play: number | null
        success_rate: number | null
        players_drafted: number | null
        draft_picks_value: number | null
        wins_over_expected: number | null
        epa_over_expected: number | null
        recruiting_efficiency: number | null
        win_pct_pctl: number | null
        epa_pctl: number | null
        recruiting_efficiency_pctl: number | null
      }
      Relationships: []
    }
    transfer_portal_impact: {
      Row: {
        team: string | null
        season: number | null
        conference: string | null
        transfers_in: number | null
        transfers_out: number | null
        net_transfers: number | null
        avg_incoming_stars: number | null
        avg_incoming_rating: number | null
        incoming_high_stars: number | null
        prior_season_wins: number | null
        prior_season_sp_rating: number | null
        current_wins: number | null
        current_sp_rating: number | null
        win_delta: number | null
        sp_delta: number | null
        portal_dependency: number | null
        win_delta_per_transfer_in: number | null
        net_transfers_pctl: number | null
        win_delta_pctl: number | null
        portal_dependency_pctl: number | null
      }
      Relationships: []
    }
    conference_comparison: {
      Row: {
        conference: string | null
        season: number | null
        member_count: number | null
        avg_wins: number | null
        avg_sp_rating: number | null
        median_sp_rating: number | null
        best_team: string | null
        best_team_sp: number | null
        worst_team: string | null
        worst_team_sp: number | null
        std_dev_sp: number | null
        avg_epa_per_play: number | null
        avg_success_rate: number | null
        avg_recruiting_rank: number | null
        total_blue_chips: number | null
        avg_blue_chip_ratio: number | null
        non_conf_win_pct: number | null
        ranked_team_count: number | null
        avg_sp_pctl: number | null
        avg_epa_pctl: number | null
        avg_recruiting_pctl: number | null
        non_conf_win_pct_pctl: number | null
      }
      Relationships: []
    }
    // Thin `SELECT *` passthrough of marts.team_wepa_season -- columns
    // transcribed from src/schemas/marts/029_team_wepa_season.sql, not the
    // api/019 wrapper (which is just `SELECT * FROM marts.team_wepa_season`).
    team_wepa_season: {
      Row: {
        season: number | null
        team_id: number | null
        team: string | null
        conference: string | null
        epa_total: number | null
        epa_passing: number | null
        epa_rushing: number | null
        epa_allowed_total: number | null
        epa_allowed_passing: number | null
        epa_allowed_rushing: number | null
        success_rate_total: number | null
        success_rate_standard_downs: number | null
        success_rate_passing_downs: number | null
        success_rate_allowed_total: number | null
        success_rate_allowed_standard_downs: number | null
        success_rate_allowed_passing_downs: number | null
        rushing_line_yards: number | null
        rushing_second_level_yards: number | null
        rushing_open_field_yards: number | null
        rushing_highlight_yards: number | null
        rushing_allowed_line_yards: number | null
        rushing_allowed_second_level_yards: number | null
        rushing_allowed_open_field_yards: number | null
        rushing_allowed_highlight_yards: number | null
        explosiveness: number | null
        explosiveness_allowed: number | null
        epa_rank: number | null
        defense_rank: number | null
      }
      Relationships: []
    }
    // Thin `SELECT *` passthrough of marts.player_wepa_season -- columns
    // transcribed from src/schemas/marts/030_player_wepa_season.sql.
    player_wepa_leaders: {
      Row: {
        season: number | null
        athlete_id: string | null
        athlete_name: string | null
        position: string | null
        team: string | null
        conference: string | null
        category: string | null
        wepa: number | null
        paar: number | null
        metric: number | null
        plays: number | null
        season_rank: number | null
      }
      Relationships: []
    }
    // Thin `SELECT *` passthrough of marts.returning_production -- columns
    // transcribed from src/schemas/marts/031_returning_production.sql.
    team_returning_production: {
      Row: {
        season: number | null
        team: string | null
        conference: string | null
        total_ppa: number | null
        total_passing_ppa: number | null
        total_receiving_ppa: number | null
        total_rushing_ppa: number | null
        returning_ppa_pct: number | null
        returning_passing_ppa_pct: number | null
        returning_receiving_ppa_pct: number | null
        returning_rushing_ppa_pct: number | null
        usage: number | null
        passing_usage: number | null
        receiving_usage: number | null
        rushing_usage: number | null
        returning_rank: number | null
      }
      Relationships: []
    }
    // Thin `SELECT *` passthrough of marts.player_usage -- columns
    // transcribed from src/schemas/marts/032_player_usage.sql.
    player_usage_leaders: {
      Row: {
        season: number | null
        athlete_id: string | null
        player_name: string | null
        position: string | null
        team: string | null
        conference: string | null
        usage_overall: number | null
        usage_pass: number | null
        usage_rush: number | null
        usage_first_down: number | null
        usage_second_down: number | null
        usage_third_down: number | null
        usage_standard_downs: number | null
        usage_passing_downs: number | null
      }
      Relationships: []
    }
    // Thin `SELECT *` passthrough of marts.team_ats_records -- columns
    // transcribed from src/schemas/marts/033_team_ats_records.sql.
    team_ats: {
      Row: {
        season: number | null
        team_id: number | null
        team: string | null
        conference: string | null
        games: number | null
        ats_wins: number | null
        ats_losses: number | null
        ats_pushes: number | null
        avg_cover_margin: number | null
        ats_win_pct: number | null
      }
      Relationships: []
    }
    line_movement: {
      Row: {
        captured_at: string | null
        game_id: number | null
        season: number | null
        week: number | null
        home_team: string | null
        away_team: string | null
        provider: string | null
        spread: number | null
        formatted_spread: string | null
        over_under: number | null
        home_moneyline: number | null
        away_moneyline: number | null
        line_hash: string | null
      }
      Relationships: []
    }
    game_drives: {
      Row: {
        game_id: number | null
        season: number | null
        drive_number: number | null
        offense: string | null
        defense: string | null
        start_period: number | null
        start_yards_to_goal: number | null
        end_yards_to_goal: number | null
        plays: number | null
        yards: number | null
        drive_result: string | null
        scoring: boolean | null
        start_offense_score: number | null
        end_offense_score: number | null
        start_defense_score: number | null
        end_defense_score: number | null
        start_time_minutes: number | null
        start_time_seconds: number | null
        elapsed_minutes: number | null
        elapsed_seconds: number | null
        is_home_offense: boolean | null
      }
      Relationships: []
    }
    game_plays: {
      Row: {
        game_id: number | null
        season: number | null
        drive_number: number | null
        play_number: number | null
        offense: string | null
        defense: string | null
        period: number | null
        clock_minutes: number | null
        clock_seconds: number | null
        down: number | null
        distance: number | null
        yards_to_goal: number | null
        yards_gained: number | null
        play_type: string | null
        play_text: string | null
        ppa: number | null
        scoring: boolean | null
        offense_score: number | null
        defense_score: number | null
      }
      Relationships: []
    }
    poll_rankings: {
      Row: {
        season: number | null
        season_type: string | null
        week: number | null
        poll: string | null
        rank: number | null
        school: string | null
        conference: string | null
        first_place_votes: number | null
        points: number | null
      }
      Relationships: []
    }
    team_elo: {
      Row: {
        team: string | null
        season: number | null
        season_end_elo: number | null
        elo_rank: number | null
        games_played: number | null
        low_confidence: boolean | null
        cfbd_elo: number | null
      }
      Relationships: []
    }
    game_elo_history: {
      Row: {
        game_id: number | null
        season: number | null
        week: number | null
        season_type: string | null
        start_date: string | null
        neutral_site: boolean | null
        home_team: string | null
        away_team: string | null
        home_pregame_elo: number | null
        away_pregame_elo: number | null
        home_postgame_elo: number | null
        away_postgame_elo: number | null
        home_win_prob: number | null
        expected_home_margin: number | null
        actual_home_margin: number | null
        mov_multiplier: number | null
        cfbd_home_pregame_elo: number | null
        cfbd_away_pregame_elo: number | null
        margin_error: number | null
        abs_margin_error: number | null
      }
      Relationships: []
    }
    scored_matchup_edges: {
      Row: {
        game_id: number | null
        season: number | null
        week: number | null
        season_type: string | null
        start_date: string | null
        home_team: string | null
        away_team: string | null
        neutral_site: boolean | null
        model_version: string | null
        prediction_date: string | null
        home_elo_pregame: number | null
        away_elo_pregame: number | null
        elo_margin: number | null
        epa_margin: number | null
        expected_home_margin: number | null
        home_win_prob: number | null
        market_provider: string | null
        market_spread: number | null
        market_home_margin: number | null
        market_captured_at: string | null
        edge: number | null
        edge_pick: string | null
        abs_edge: number | null
      }
      Relationships: []
    }
    prediction_accuracy: {
      Row: {
        model_version: string | null
        season: number | null
        edge_threshold: number | null
        n_games: number | null
        n_with_market: number | null
        margin_mae: number | null
        margin_rmse: number | null
        ats_wins: number | null
        ats_losses: number | null
        ats_pushes: number | null
        ats_hit_rate: number | null
        brier: number | null
        cfbd_brier: number | null
        n_scored_win_prob: number | null
      }
      Relationships: []
    }
    // Unlike the rest of this file (hand-transcribed from cfb-database's
    // CREATE VIEW SQL), these columns were confirmed by live introspection of
    // information_schema.columns on 2026-07-26. Grain is
    // DISTINCT ON (season, team, model_version) ORDER BY projection_date DESC
    // -- i.e. already the latest snapshot per team-season; a query that does
    // not pin model_version gets one row per version, not one row per team.
    // projection_id is bigint, typed `string` per this file's int8-as-string
    // convention (see game_win_probability below). playoff_prob is NULL on
    // every row by design and is not a column to fill in.
    season_outlook: {
      Row: {
        projection_id: string | null
        computed_at: string | null
        projection_date: string | null
        model_version: string | null
        season: number | null
        team: string | null
        conference: string | null
        games_scheduled: number | null
        games_simulated: number | null
        games_unscored: number | null
        games_completed: number | null
        actual_wins: number | null
        schedule_complete: boolean | null
        projected_wins: number | null
        projected_losses: number | null
        median_wins: number | null
        wins_p10: number | null
        wins_p25: number | null
        wins_p75: number | null
        wins_p90: number | null
        p_win_dist: Record<string, number> | null
        p_bowl_eligible: number | null
        p_ten_plus: number | null
        sos_rating: number | null
        sos_rank: number | null
        conf_title_prob: number | null
        playoff_prob: number | null
        n_sims: number | null
        residual_sigma: number | null
        strength_share: number | null
        // Added 2026-07-27 (cfb-database PR #56). classification is derived
        // season-accurately, so a team that changed division carries the right
        // label per season; NULL means CFBD could not place the team and is NOT
        // a synonym for fbs. is_projection is `games_simulated >
        // games_completed` -- false marks a row that is a final record rather
        // than a forecast, and it is the authoritative answer to that question.
        classification: string | null
        is_projection: boolean | null
      }
      Relationships: []
    }
    // Backtest accuracy per model. Confirmed by live introspection 2026-07-27.
    // Grain is DISTINCT ON (model_version, scope, season_start, season_end,
    // strength_share) ORDER BY ... run_date DESC -- so a query that does not pin
    // `scope` returns one row PER SCOPE, not one row overall. `n` counts
    // TEAM-SEASONS, not games. Use resid_p10/resid_p90 as the 80% interval; it
    // is asymmetric, and +/- win_mae spans only ~58% of the error distribution.
    model_backtest: {
      Row: {
        backtest_id: string | null
        computed_at: string | null
        run_date: string | null
        model_version: string | null
        feature_build_version: string | null
        scope: string | null
        season_start: number | null
        season_end: number | null
        seasons_covered: number[] | null
        train_through_min: number | null
        train_through_max: number | null
        n_sims: number | null
        seed: number | null
        strength_share: number | null
        max_games_played_to_date: number | null
        games_dropped_outcome_dependent: number | null
        n: number | null
        win_mae: number | null
        rmse: number | null
        bias: number | null
        coverage: number | null
        baseline_prior_mae: number | null
        baseline_flat_mae: number | null
        beats_prior_baseline: boolean | null
        beats_flat_baseline: boolean | null
        resid_p05: number | null
        resid_p10: number | null
        resid_p25: number | null
        resid_p50: number | null
        resid_p75: number | null
        resid_p90: number | null
        resid_p95: number | null
        bowl_brier: number | null
        ten_plus_brier: number | null
        calibration: Record<string, unknown> | null
        respectable_win_mae: number | null
      }
      Relationships: []
    }
    // prediction_id's real PostgREST wire type (uuid vs bigint, stringified
    // per PostgREST's int8-as-string convention -- see the game_win_probability
    // Row below for the established pattern in this codebase) is UNCONFIRMED
    // -- this view is not currently queried anywhere in cfb-app's query layer,
    // so there's no existing hand-typed usage to cross-check against. Typed
    // as `string` (the safer of the two for an opaque id never used
    // arithmetically); confirm against a real row before relying on it.
    game_predictions: {
      Row: {
        prediction_id: string | null
        computed_at: string | null
        prediction_date: string | null
        model_version: string | null
        game_id: number | null
        season: number | null
        week: number | null
        season_type: string | null
        home_team: string | null
        away_team: string | null
        neutral_site: boolean | null
        home_elo_pregame: number | null
        away_elo_pregame: number | null
        elo_margin: number | null
        epa_margin: number | null
        expected_home_margin: number | null
        home_win_prob: number | null
        market_provider: string | null
        market_home_margin: number | null
        market_spread: number | null
        market_captured_at: string | null
        edge: number | null
        edge_pick: string | null
      }
      Relationships: []
    }
    // Pending deploy per SCHEMA_CONTRACT.md as of 2026-07-22. play_id is
    // stringified by PostgREST (int8 -> string, to avoid JS precision loss)
    // per the existing hand-typed GameWinProbabilityRow in games.ts, which
    // this Row shape matches.
    game_win_probability: {
      Row: {
        game_id: number | null
        season: number | null
        play_id: string | null
        home_team: string | null
        away_team: string | null
        home_win_probability: number | null
        down: number | null
        distance: number | null
        yard_line: number | null
        play_text: string | null
        period: number | null
        clock_minutes: number | null
        clock_seconds: number | null
      }
      Relationships: []
    }
    team_week_features: {
      Row: {
        season: number | null
        season_type: string | null
        week: number | null
        week_index: number | null
        team: string | null
        conference: string | null
        game_id: number | null
        games_played_to_date: number | null
        elo_pregame: number | null
        adj_epa_off: number | null
        adj_epa_def: number | null
        adj_epa_net: number | null
        adj_epa_hfa: number | null
        adj_epa_source: string | null
        off_epa_per_play: number | null
        off_success_rate: number | null
        off_explosiveness_rate: number | null
        off_plays_per_game: number | null
        def_epa_per_play_allowed: number | null
        def_success_rate_allowed: number | null
        def_explosiveness_rate_allowed: number | null
        havoc_rate_defense: number | null
        havoc_rate_offense_allowed: number | null
        returning_ppa_pct: number | null
        returning_passing_ppa_pct: number | null
        returning_rushing_ppa_pct: number | null
        returning_usage: number | null
        preseason_sp_rating: number | null
        preseason_sp_offense: number | null
        preseason_sp_defense: number | null
        computed_at: string | null
        feature_build_version: string | null
      }
      Relationships: []
    }
    live_scoreboard: {
      Row: {
        game_id: number | null
        season: number | null
        week: number | null
        season_type: string | null
        status: string | null
        period: number | null
        clock: string | null
        seconds_remaining: number | null
        home_team: string | null
        away_team: string | null
        home_points: number | null
        away_points: number | null
        possession: string | null
        spread: number | null
        over_under: number | null
        cfbd_home_wp: number | null
        house_live_home_wp: number | null
        pregame_expected_margin: number | null
        captured_at: string | null
      }
      Relationships: []
    }
    adjusted_epa_week: {
      Row: {
        team: string | null
        season: number | null
        week_index: number | null
        off_coef: number | null
        def_coef: number | null
        hfa_coef: number | null
        mu: number | null
        plays: number | null
        lambda: number | null
        n_teams: number | null
      }
      Relationships: []
    }
    game_recaps: {
      Row: {
        game_id: number | null
        season: number | null
        week: number | null
        headline: string | null
        recap: string | null
        wp_available: boolean | null
        model: string | null
        generated_at: string | null
      }
      Relationships: []
    }
    // The house expected-points model ("house EP v1.5": Goldner-basis drive
    // EP from the solved play-by-play Markov chain). One row per (era, state)
    // -- NOT per team or game: state encodes down x distance bucket x
    // field-position decile ('d1|standard|z8'), which the view parses into
    // the typed columns below. Columns confirmed by live introspection of
    // information_schema.columns on 2026-08-08 and reconciled against
    // cfb-database's docs/handoffs/2026-08-08-expected-points-handoff.md.
    // Traps: down=4 rows are go-for-it-conditional (can price above d3);
    // bucket boundaries are down-aware (d1 standard(=10)/short(<10)/
    // long(>10)/goal; d2-4 short(<=3)/med(4-6)/long(7-10)/xlong(>10)/goal);
    // ep_drive (drive basis) and ep_net (net next-score basis, CFBD-ppa-
    // comparable, can be negative, NULL = not computed) are different bases;
    // se_boot NULL = no interval, not +/-0; n_obs can be 1 on oddball
    // states; never average eras. p_turnover includes defensive-TD
    // turnovers. analytics.ep_states and analytics.drive_chain_transitions
    // are contract-internal -- never read them directly.
    expected_points: {
      Row: {
        era: string | null
        state: string | null
        down: number | null
        distance_bucket: string | null
        field_zone: number | null
        yards_to_goal_min: number | null
        yards_to_goal_max: number | null
        // int8 in the view; typed number (not string) to match how this
        // file's other bigint counters (n_obs-like columns) are consumed
        // through PostgREST's JSON serialization.
        n_obs: number | null
        ep_drive: number | null
        ep_net: number | null
        p_td: number | null
        p_fg: number | null
        p_punt: number | null
        p_turnover: number | null
        se_boot: number | null
        computed_at: string | null
      }
      Relationships: []
    }
    // penalty_log / team_penalties: unlike the views above, these two were
    // NOT transcribed from cfb-database's api/*.sql (added after this file
    // was written) -- their column lists and types were verified against the
    // live views via information_schema.columns on 2026-07-23.
    penalty_log: {
      Row: {
        play_id: string | null
        game_id: number | null
        season: number | null
        week: number | null
        season_type: string | null
        period: number | null
        down: number | null
        distance: number | null
        offense: string | null
        defense: string | null
        play_type: string | null
        is_penalty_play_type: boolean | null
        penalized_team: string | null
        benefiting_team: string | null
        infraction: string | null
        penalty_yards: number | null
        declined: boolean | null
        offsetting: boolean | null
        no_play: boolean | null
        multi_penalty: boolean | null
        yards_gained: number | null
        ppa: number | null
        play_text: string | null
        parse_ok: boolean | null
      }
      Relationships: []
    }
    team_penalties: {
      Row: {
        game_id: number | null
        season: number | null
        week: number | null
        season_type: string | null
        team: string | null
        opponent: string | null
        home_away: string | null
        penalties: number | null
        penalty_yards: number | null
        opponent_penalties: number | null
        opponent_penalty_yards: number | null
      }
      Relationships: []
    }
  }
  Functions: {
    [_ in never]: never
  }
  Enums: {
    [_ in never]: never
  }
  CompositeTypes: {
    [_ in never]: never
  }
}
