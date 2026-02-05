export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      defensive_havoc: {
        Row: {
          defensive_plays: number | null
          fumbles: number | null
          havoc_plays: number | null
          havoc_rate: number | null
          interceptions: number | null
          opp_epa_per_play: number | null
          opp_success_rate: number | null
          sacks: number | null
          season: number | null
          stuff_rate: number | null
          stuffs: number | null
          team: string | null
          tfls: number | null
          turnovers_forced: number | null
        }
        Relationships: []
      }
      games: {
        Row: {
          away_points: number | null
          away_team: string | null
          completed: boolean | null
          conference_game: boolean | null
          home_points: number | null
          home_team: string | null
          id: number | null
          neutral_site: boolean | null
          season: number | null
          start_date: string | null
          week: number | null
        }
        Insert: {
          away_points?: number | null
          away_team?: string | null
          completed?: boolean | null
          conference_game?: boolean | null
          home_points?: number | null
          home_team?: string | null
          id?: number | null
          neutral_site?: boolean | null
          season?: number | null
          start_date?: string | null
          week?: number | null
        }
        Update: {
          away_points?: number | null
          away_team?: string | null
          completed?: boolean | null
          conference_game?: boolean | null
          home_points?: number | null
          home_team?: string | null
          id?: number | null
          neutral_site?: boolean | null
          season?: number | null
          start_date?: string | null
          week?: number | null
        }
        Relationships: []
      }
      roster: {
        Row: {
          first_name: string | null
          height: number | null
          home_city: string | null
          home_state: string | null
          id: string | null
          jersey: number | null
          last_name: string | null
          position: string | null
          team: string | null
          weight: number | null
          year: number | null
        }
        Insert: {
          first_name?: string | null
          height?: number | null
          home_city?: string | null
          home_state?: string | null
          id?: string | null
          jersey?: number | null
          last_name?: string | null
          position?: string | null
          team?: string | null
          weight?: number | null
          year?: number | null
        }
        Update: {
          first_name?: string | null
          height?: number | null
          home_city?: string | null
          home_state?: string | null
          id?: string | null
          jersey?: number | null
          last_name?: string | null
          position?: string | null
          team?: string | null
          weight?: number | null
          year?: number | null
        }
        Relationships: []
      }
      team_epa_season: {
        Row: {
          def_epa_rank: number | null
          epa_per_play: number | null
          explosiveness: number | null
          games: number | null
          off_epa_rank: number | null
          season: number | null
          success_rate: number | null
          team: string | null
          total_epa: number | null
          total_plays: number | null
        }
        Relationships: []
      }
      team_season_epa: {
        Row: {
          epa_per_play: number | null
          epa_tier: string | null
          explosiveness: number | null
          games_played: number | null
          season: number | null
          success_rate: number | null
          team: string | null
          total_plays: number | null
        }
        Relationships: []
      }
      team_season_trajectory: {
        Row: {
          def_epa_rank: number | null
          epa_delta: number | null
          epa_per_play: number | null
          era_code: string | null
          era_name: string | null
          games: number | null
          off_epa_rank: number | null
          prev_epa: number | null
          recruiting_rank: number | null
          season: number | null
          success_rate: number | null
          team: string | null
          win_pct: number | null
          wins: number | null
        }
        Relationships: []
      }
      team_special_teams_sos: {
        Row: {
          fpi_st_efficiency: number | null
          season: number | null
          sos_rank: number | null
          sp_st_rating: number | null
          team: string | null
        }
        Relationships: []
      }
      team_style_profile: {
        Row: {
          def_epa_vs_pass: number | null
          def_epa_vs_run: number | null
          epa_passing: number | null
          epa_rushing: number | null
          offensive_identity: string | null
          pass_rate: number | null
          plays_per_game: number | null
          run_rate: number | null
          season: number | null
          team: string | null
          tempo_category: string | null
        }
        Relationships: []
      }
      team_tempo_metrics: {
        Row: {
          epa_per_play: number | null
          explosiveness: number | null
          games: number | null
          plays_per_game: number | null
          season: number | null
          success_rate: number | null
          team: string | null
          tempo_tier: string | null
          total_plays: number | null
        }
        Relationships: []
      }
      teams: {
        Row: {
          _dlt_id: string | null
          _dlt_load_id: string | null
          abbreviation: string | null
          alternate_color: string | null
          classification: string | null
          color: string | null
          conference: string | null
          division: string | null
          id: number | null
          location__capacity: number | null
          location__city: string | null
          location__construction_year: number | null
          location__country_code: string | null
          location__dome: boolean | null
          location__elevation: string | null
          location__grass: boolean | null
          location__id: number | null
          location__latitude: number | null
          location__longitude: number | null
          location__name: string | null
          location__state: string | null
          location__timezone: string | null
          location__zip: string | null
          mascot: string | null
          school: string | null
          twitter: string | null
        }
        Insert: {
          _dlt_id?: string | null
          _dlt_load_id?: string | null
          abbreviation?: string | null
          alternate_color?: string | null
          classification?: string | null
          color?: string | null
          conference?: string | null
          division?: string | null
          id?: number | null
          location__capacity?: number | null
          location__city?: string | null
          location__construction_year?: number | null
          location__country_code?: string | null
          location__dome?: boolean | null
          location__elevation?: string | null
          location__grass?: boolean | null
          location__id?: number | null
          location__latitude?: number | null
          location__longitude?: number | null
          location__name?: string | null
          location__state?: string | null
          location__timezone?: string | null
          location__zip?: string | null
          mascot?: string | null
          school?: string | null
          twitter?: string | null
        }
        Update: {
          _dlt_id?: string | null
          _dlt_load_id?: string | null
          abbreviation?: string | null
          alternate_color?: string | null
          classification?: string | null
          color?: string | null
          conference?: string | null
          division?: string | null
          id?: number | null
          location__capacity?: number | null
          location__city?: string | null
          location__construction_year?: number | null
          location__country_code?: string | null
          location__dome?: boolean | null
          location__elevation?: string | null
          location__grass?: boolean | null
          location__id?: number | null
          location__latitude?: number | null
          location__longitude?: number | null
          location__name?: string | null
          location__state?: string | null
          location__timezone?: string | null
          location__zip?: string | null
          mascot?: string | null
          school?: string | null
          twitter?: string | null
        }
        Relationships: []
      }
      teams_with_logos: {
        Row: {
          abbreviation: string | null
          alt_color: string | null
          alt_logo: string | null
          classification: string | null
          color: string | null
          conference: string | null
          division: string | null
          id: number | null
          logo: string | null
          mascot: string | null
          school: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_available_seasons: { Args: never; Returns: number[] }
      get_available_weeks: { Args: { p_season: number }; Returns: number[] }
      get_conference_splits: {
        Args: { p_season: number; p_team: string }
        Returns: {
          epa_per_play: number
          games: number
          margin_per_game: number
          opponent_type: string
          points_allowed_per_game: number
          points_per_game: number
          success_rate: number
          win_pct: number
          wins: number
        }[]
      }
      get_down_distance_splits: {
        Args: { p_season: number; p_team: string }
        Returns: {
          conversion_rate: number
          distance_bucket: string
          down: number
          epa_per_play: number
          play_count: number
          side: string
          success_rate: number
        }[]
      }
      get_drive_patterns: {
        Args: { p_season: number; p_team: string }
        Returns: {
          avg_plays: number
          avg_yards: number
          count: number
          end_yard: number
          outcome: string
          start_yard: number
        }[]
      }
      get_field_position_splits: {
        Args: { p_season: number; p_team: string }
        Returns: {
          epa_per_play: number
          play_count: number
          scoring_rate: number
          side: string
          success_rate: number
          yards_per_play: number
          zone: string
          zone_label: string
        }[]
      }
      get_home_away_splits: {
        Args: { p_season: number; p_team: string }
        Returns: {
          epa_per_play: number
          games: number
          location: string
          points_allowed_per_game: number
          points_per_game: number
          success_rate: number
          win_pct: number
          wins: number
          yards_per_play: number
        }[]
      }
      get_player_season_stats_pivoted: {
        Args: { p_season: number; p_team: string }
        Returns: {
          fg_att: number
          fg_made: number
          interceptions: number
          pass_att: number
          pass_comp: number
          pass_int: number
          pass_td: number
          pass_yds: number
          pd: number
          player: string
          player_id: string
          points: number
          position: string
          rec: number
          rec_td: number
          rec_yds: number
          rush_car: number
          rush_td: number
          rush_yds: number
          sacks: number
          solo: number
          tackles: number
          tfl: number
          xp_att: number
          xp_made: number
        }[]
      }
      get_red_zone_splits: {
        Args: { p_season: number; p_team: string }
        Returns: {
          epa_per_play: number
          fg_rate: number
          field_goals: number
          points_per_trip: number
          scoring_rate: number
          side: string
          td_rate: number
          touchdowns: number
          trips: number
          turnovers: number
        }[]
      }
      get_trajectory_averages: {
        Args: {
          p_conference: string
          p_season_end?: number
          p_season_start?: number
        }
        Returns: {
          conf_def_epa_rank: number
          conf_epa_per_play: number
          conf_off_epa_rank: number
          conf_recruiting_rank: number
          conf_success_rate: number
          conf_win_pct: number
          conf_wins: number
          fbs_def_epa_rank: number
          fbs_epa_per_play: number
          fbs_off_epa_rank: number
          fbs_recruiting_rank: number
          fbs_success_rate: number
          fbs_win_pct: number
          fbs_wins: number
          season: number
        }[]
      }
      is_garbage_time: {
        Args: { period: number; score_diff: number }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
