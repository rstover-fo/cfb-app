import { createClient } from '@/lib/supabase/server'
import { fail, clamp, type McpResult } from './mcp'

// ---------------------------------------------------------------------------
// Query layer for the get_coach_tenure MCP tool, over api.coach_tenures
// (cfb-database PR #81, 2026-08-30). Grain: one row per
// (coach_id, team_id, tenure_start) -- a coach with two separate stints at
// the same school has two rows, which is the point.
//
// This is the first coach surface with a REAL key. The older
// api.coaching_history / api.coach_records aggregate views gained an additive
// `coach_id` in the same release, but it is sparse (measured live: 28.5% on
// coaching_history, ~31% on coach_records) because ref.coach_seasons is still
// backfilling and the column is deliberately NULL on any ambiguous
// name+team+year match. api.coach_tenures, by contrast, is 100% keyed
// (2,738/2,738) because it is built straight from ref.coach_tenures.
//
// So the rule for anything joining these surfaces is the inverse of what it
// looks like: coach_id is the DISAMBIGUATOR, not the join key. Measured over
// a 250-row sample of api.coach_records, (coach_name, team) matched a tenure
// row 99.6% of the time while coach_id matched 29%. Filtering a population on
// `coach_id IS NOT NULL` would silently drop ~70% of coaches.
//
// MCP-only module: keeps mcp.ts's McpResult error-passthrough contract and is
// deliberately NOT wrapped in React cache() -- see mcp.ts's module header.
// ---------------------------------------------------------------------------

const TENURE_DEFAULT_LIMIT = 25

export interface CoachTenureRow {
  /** CFBD coachId. Present on every row of this view, unlike the aggregate views. */
  coach_id: string
  coach_name: string | null
  /** Numeric team id -- the safe join key; ref.teams has 35 duplicate school names. */
  team_id: number | null
  team: string | null
  tenure_start: number | null
  /** NULL means the tenure is still active, not that it is unknown. */
  tenure_end: number | null
  /** Populated on only ~28% of rows (759/2,738). NULL = not recorded. */
  hire_date: string | null
  /**
   * Authoritative interim flag (63 rows). Replaces guessing from a games
   * threshold, which also drops legitimate short full-time tenures.
   */
  is_interim: boolean | null
  record_games: number | null
  record_wins: number | null
  record_losses: number | null
  record_ties: number | null
  record_win_percentage: number | null
  /** fbs / fcs / etc -- per tenure, so historically accurate across reclassification. */
  classification: string | null
}

const TENURE_COLUMNS = `
  coach_id, coach_name, team_id, team,
  tenure_start, tenure_end, hire_date, is_interim,
  record_games, record_wins, record_losses, record_ties, record_win_percentage,
  classification
` as const

export interface CoachTenureFilter {
  /** Case-insensitive substring match on coach_name. */
  coach?: string
  /** Exact school name. */
  team?: string
  /** Tenures that were active during this season (span-overlap, not start year). */
  season?: number
  /** Only currently-active tenures (tenure_end IS NULL). */
  activeOnly?: boolean
  /** Exclude interim stints. */
  excludeInterim?: boolean
  /**
   * Only interim stints. Distinct from excludeInterim rather than a tri-state
   * so the two read unambiguously at the call site; passing both yields the
   * empty set it literally describes.
   */
  interimOnly?: boolean
  /** e.g. 'fbs'. Omitted by default: filtering here would silently hide FCS coaches. */
  classification?: string
  limit?: number
}

export async function queryCoachTenures(
  filter: CoachTenureFilter
): Promise<McpResult<CoachTenureRow>> {
  const supabase = await createClient()

  let query = supabase.schema('api').from('coach_tenures').select(TENURE_COLUMNS)

  if (filter.coach) query = query.ilike('coach_name', `%${filter.coach}%`)
  if (filter.team) query = query.eq('team', filter.team)
  if (filter.classification) query = query.eq('classification', filter.classification)
  if (filter.activeOnly) query = query.is('tenure_end', null)
  if (filter.excludeInterim) query = query.not('is_interim', 'is', true)
  // Applied server-side, before .limit(): 63 interim tenures across 2,738
  // rows, so a client-side filter over the first capped page would usually
  // return nothing at all.
  if (filter.interimOnly) query = query.is('is_interim', true)

  if (filter.season != null) {
    // Span overlap: started on or before the season, and either still open or
    // ended on or after it. tenure_end IS NULL means active, so it must count
    // as covering every later season rather than being excluded as missing.
    query = query
      .lte('tenure_start', filter.season)
      .or(`tenure_end.is.null,tenure_end.gte.${filter.season}`)
  }

  const { data, error } = await query
    .order('tenure_start', { ascending: false, nullsFirst: false })
    // Deterministic tiebreak across coaches sharing a start year.
    .order('coach_id', { ascending: true })
    .limit(clamp(filter.limit, TENURE_DEFAULT_LIMIT))

  if (error) return { rows: [], error: fail('api.coach_tenures', error) }
  return { rows: (data ?? []) as unknown as CoachTenureRow[], error: null }
}
