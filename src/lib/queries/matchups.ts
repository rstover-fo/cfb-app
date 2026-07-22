import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Row shapes for the contracted api.* views (matchup, game_detail).
// See src/lib/types/api.generated.ts's `matchup` and `game_detail` Rows for
// the full generated shapes (every column nullable there, per view
// convention). Kept hand-typed here rather than adopted directly because
// both interfaces below select a narrower column subset than the full view
// and narrow several fields non-null (team1/team2, total_games, the win/tie
// counters, game_id/season/week/start_date/home_team/away_team) that this
// module's normalize/reorient helpers rely on being present.
// ---------------------------------------------------------------------------

// Raw element of api.matchup.recent_results (JSONB array, season DESC).
// Stored from the alphabetical (team1 < team2) perspective; re-oriented below.
interface RecentResultRaw {
  season: number
  winner: string | null
  home_team: string
  home_points: number
  away_points: number
}

// Row shape for api.matchup (pair-level H2H summary).
// team1/team2 are stored alphabetically (LEAST/GREATEST) in the view.
interface MatchupRow {
  team1: string
  team2: string
  total_games: number
  team1_wins: number
  team2_wins: number
  ties: number
  first_meeting: number | null
  last_meeting: number | null
  recent_results: RecentResultRaw[] | string | null
}

// Row shape for api.game_detail (subset of columns used by the rivals page).
interface GameDetailRow {
  game_id: number
  season: number
  week: number
  season_type: string | null
  start_date: string
  neutral_site: boolean | null
  home_team: string
  away_team: string
  home_points: number | null
  away_points: number | null
  winner: string | null
  venue: string | null
}

// ---------------------------------------------------------------------------
// Caller-facing types (re-oriented to the teamA perspective the caller asked
// for, rather than the alphabetical team1/team2 the warehouse stores).
// ---------------------------------------------------------------------------

export interface MatchupStreak {
  team: string
  count: number
}

export interface MatchupResult {
  season: number
  winner: string | null
  teamAPoints: number
  teamBPoints: number
  result: 'W' | 'L' | 'T' // from teamA's perspective
}

export interface MatchupSummary {
  teamA: string
  teamB: string
  totalGames: number
  teamAWins: number
  teamBWins: number
  ties: number
  firstMeeting: number | null
  lastMeeting: number | null
  // Current streak holder (from the most recent meetings). Null when the most
  // recent meeting was a tie or the pair has no post-2014 meetings.
  streak: MatchupStreak | null
  // Recent meetings, most recent first (post-2014, per the api.matchup view).
  recentResults: MatchupResult[]
}

export interface MatchupGame {
  gameId: number
  season: number
  week: number
  seasonType: string
  startDate: string
  neutralSite: boolean
  teamAScore: number
  teamBScore: number
  teamAHome: boolean
  winner: string | null
  result: 'W' | 'L' | 'T' // from teamA's perspective
  venue: string | null
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing).
// ---------------------------------------------------------------------------

/**
 * Normalize a user-selected pair into the alphabetical ordering the api.matchup
 * view stores (team1 = LEAST, team2 = GREATEST). `aIsTeam1` records whether the
 * caller's teamA maps onto the stored team1, so results can be re-oriented.
 */
export function normalizePair(
  teamA: string,
  teamB: string
): { team1: string; team2: string; aIsTeam1: boolean } {
  const aIsTeam1 = teamA <= teamB
  return aIsTeam1
    ? { team1: teamA, team2: teamB, aIsTeam1: true }
    : { team1: teamB, team2: teamA, aIsTeam1: false }
}

/**
 * Parse api.matchup.recent_results defensively. PostgREST usually returns JSONB
 * already decoded into an array, but tolerate a JSON string and never throw on
 * malformed data — a broken payload degrades to an empty list.
 */
export function parseRecentResults(raw: unknown): RecentResultRaw[] {
  if (raw == null) return []

  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return []
    }
  }

  if (!Array.isArray(value)) return []

  return value.filter(
    (r): r is RecentResultRaw =>
      r != null &&
      typeof r === 'object' &&
      'season' in r &&
      'home_team' in r &&
      'home_points' in r &&
      'away_points' in r
  )
}

// Re-orient a stored (alphabetical) result into the caller's teamA perspective.
function reorientResult(raw: RecentResultRaw, teamA: string): MatchupResult {
  const teamAHome = raw.home_team === teamA
  const teamAPoints = teamAHome ? raw.home_points : raw.away_points
  const teamBPoints = teamAHome ? raw.away_points : raw.home_points
  const result: 'W' | 'L' | 'T' =
    raw.winner == null ? 'T' : raw.winner === teamA ? 'W' : 'L'
  return { season: raw.season, winner: raw.winner, teamAPoints, teamBPoints, result }
}

// Compute the current streak from most-recent-first results. A leading tie means
// there is no active streak.
export function computeStreak(results: MatchupResult[]): MatchupStreak | null {
  const top = results[0]
  if (!top || top.winner == null) return null

  let count = 0
  for (const r of results) {
    if (r.winner === top.winner) count++
    else break
  }
  return { team: top.winner, count }
}

// ---------------------------------------------------------------------------
// Queries.
// ---------------------------------------------------------------------------

/**
 * Head-to-head summary for a pair of teams. Normalizes the pair into the
 * warehouse's alphabetical ordering, queries api.matchup, then re-orients the
 * record, recent results, and streak to the caller's teamA perspective.
 * Returns null when the two teams have never met.
 */
export const getMatchup = cache(
  async (teamA: string, teamB: string): Promise<MatchupSummary | null> => {
    const supabase = await createClient()
    const { team1, team2, aIsTeam1 } = normalizePair(teamA, teamB)

    const { data, error } = await supabase
      .schema('api')
      .from('matchup')
      .select(
        'team1, team2, total_games, team1_wins, team2_wins, ties, first_meeting, last_meeting, recent_results'
      )
      .eq('team1', team1)
      .eq('team2', team2)
      .maybeSingle()

    if (error || !data) return null

    const row = data as MatchupRow

    const teamAWins = aIsTeam1 ? row.team1_wins : row.team2_wins
    const teamBWins = aIsTeam1 ? row.team2_wins : row.team1_wins

    const recentResults = parseRecentResults(row.recent_results).map(r =>
      reorientResult(r, teamA)
    )

    return {
      teamA,
      teamB,
      totalGames: row.total_games ?? 0,
      teamAWins: teamAWins ?? 0,
      teamBWins: teamBWins ?? 0,
      ties: row.ties ?? 0,
      firstMeeting: row.first_meeting,
      lastMeeting: row.last_meeting,
      streak: computeStreak(recentResults),
      recentResults,
    }
  }
)

/**
 * Full game-by-game history between two teams via api.game_detail, most recent
 * first. Each game is re-oriented to the caller's teamA perspective (score,
 * home/away, W/L/T). Returns an empty array when the teams have never met.
 */
export const getMatchupGames = cache(
  async (teamA: string, teamB: string): Promise<MatchupGame[]> => {
    const supabase = await createClient()

    const qa = teamA.replace(/"/g, '""')
    const qb = teamB.replace(/"/g, '""')
    const { data, error } = await supabase
      .schema('api')
      .from('game_detail')
      .select(
        'game_id, season, week, season_type, start_date, neutral_site, home_team, away_team, home_points, away_points, winner, venue'
      )
      .or(
        // Double-quote values: ( ) , are structural in PostgREST filter syntax,
        // and team names like "Miami (OH)" would otherwise corrupt the filter.
        // Embedded double quotes are doubled per PostgREST escaping rules.
        `and(home_team.eq."${qa}",away_team.eq."${qb}"),and(home_team.eq."${qb}",away_team.eq."${qa}")`
      )
      .order('season', { ascending: false })
      .order('week', { ascending: false })

    if (error || !data) return []

    return (data as GameDetailRow[])
      .filter(g => g.home_points != null && g.away_points != null)
      .map(g => {
        const teamAHome = g.home_team === teamA
        const teamAScore = teamAHome ? (g.home_points ?? 0) : (g.away_points ?? 0)
        const teamBScore = teamAHome ? (g.away_points ?? 0) : (g.home_points ?? 0)
        const result: 'W' | 'L' | 'T' =
          g.winner == null ? 'T' : g.winner === teamA ? 'W' : 'L'

        return {
          gameId: g.game_id,
          season: g.season,
          week: g.week,
          seasonType: g.season_type ?? 'regular',
          startDate: g.start_date,
          neutralSite: g.neutral_site ?? false,
          teamAScore,
          teamBScore,
          teamAHome,
          winner: g.winner,
          result,
          venue: g.venue,
        }
      })
  }
)
