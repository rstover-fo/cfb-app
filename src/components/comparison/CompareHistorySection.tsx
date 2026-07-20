import { getAllTeams, resolveTeamBySlug, getTeamHistory, type TeamHistoryRow } from '@/lib/queries/compare'

interface CompareHistorySectionProps {
  t1?: string
  t2?: string
}

export interface HistoryRowPair {
  season: number
  row1: TeamHistoryRow | null
  row2: TeamHistoryRow | null
}

// Merge two teams' (possibly season-misaligned) history rows into one
// row-per-season table, most recent season first. Exported for unit testing.
export function buildSeasonRows(history1: TeamHistoryRow[], history2: TeamHistoryRow[]): HistoryRowPair[] {
  const seasons = Array.from(new Set([...history1.map(h => h.season), ...history2.map(h => h.season)])).sort((a, b) => b - a)
  const map1 = new Map(history1.map(h => [h.season, h]))
  const map2 = new Map(history2.map(h => [h.season, h]))
  return seasons.map(season => ({ season, row1: map1.get(season) ?? null, row2: map2.get(season) ?? null }))
}

export function formatRecord(row: TeamHistoryRow | null): string {
  if (!row) return '—'
  return `${row.wins ?? 0}-${row.losses ?? 0}`
}

export function formatRating(row: TeamHistoryRow | null): string {
  if (!row || row.sp_rating == null) return '—'
  return row.sp_rating.toFixed(1)
}

// Multi-season trend section for the /compare route, sourced from the
// contracted api.team_history view. Not shown on the team-page Compare tab
// (that stays scoped to the current season, matching its existing UX).
export async function CompareHistorySection({ t1, t2 }: CompareHistorySectionProps) {
  const allTeams = await getAllTeams()
  const team1 = resolveTeamBySlug(allTeams, t1)
  const team2 = resolveTeamBySlug(allTeams, t2)

  if (!team1?.school || !team2?.school) {
    return (
      <div className="card p-6 text-center text-[var(--text-muted)]">
        Select two teams above to see their multi-season history side by side.
      </div>
    )
  }

  const [history1, history2] = await Promise.all([
    getTeamHistory(team1.school),
    getTeamHistory(team2.school)
  ])

  const rows = buildSeasonRows(history1, history2)

  if (rows.length === 0) {
    return (
      <div className="card p-6 text-center text-[var(--text-muted)]">
        No historical data available for these teams.
      </div>
    )
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border)] flex-wrap gap-3">
        <h2 className="font-headline text-2xl text-[var(--text-primary)]">Historical Trend</h2>
        <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: team1.color || 'var(--color-run)' }} />
            {team1.school}
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: team2.color || 'var(--color-pass)' }} />
            {team2.school}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" role="table">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)] uppercase tracking-wider">
              <th scope="col" className="py-2 pr-4">Season</th>
              <th scope="col" className="py-2 px-4 text-right">{team1.school} W-L</th>
              <th scope="col" className="py-2 px-4 text-right">{team1.school} SP+</th>
              <th scope="col" className="py-2 px-4 text-right">{team2.school} W-L</th>
              <th scope="col" className="py-2 pl-4 text-right">{team2.school} SP+</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ season, row1, row2 }) => (
              <tr key={season} className="border-b border-[var(--border)] last:border-0">
                <td className="py-2 pr-4 text-[var(--text-primary)] font-medium tabular-nums">{season}</td>
                <td className="py-2 px-4 text-right tabular-nums text-[var(--text-secondary)]">{formatRecord(row1)}</td>
                <td className="py-2 px-4 text-right tabular-nums text-[var(--text-secondary)]">{formatRating(row1)}</td>
                <td className="py-2 px-4 text-right tabular-nums text-[var(--text-secondary)]">{formatRecord(row2)}</td>
                <td className="py-2 pl-4 text-right tabular-nums text-[var(--text-secondary)]">{formatRating(row2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
