// cfb-app/src/lib/types/scouting.ts

export interface ScoutingReport {
  id: number
  source_url: string
  source_name: string
  summary: string | null
  sentiment_score: number | null
  published_at: string | null
  crawled_at: string
}

export interface TimelineSnapshot {
  id: number
  snapshot_date: string
  status: string | null
  sentiment_score: number | null
  grade_at_time: number | null
  traits_at_time: Record<string, number> | null
  key_narratives: string[] | null
  sources_count: number | null
}

export interface ScoutingPlayerDetail {
  id: number
  name: string
  team: string | null
  position: string | null
  class_year: number | null
  current_status: string | null
  composite_grade: number | null
  traits: Record<string, number> | null
  draft_projection: string | null
  comps: string[] | null
  last_updated: string | null
}

export interface PlayerScoutingProfile {
  player: ScoutingPlayerDetail
  timeline: TimelineSnapshot[]
  reports: ScoutingReport[]
  report_count: number
}

export interface PendingLink {
  id: number
  source_name: string
  source_team: string | null
  source_context: any
  candidate_roster_id: number | null
  match_score: number
  match_method: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}
