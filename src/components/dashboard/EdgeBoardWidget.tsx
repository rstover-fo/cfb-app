import Link from 'next/link'
import { ArrowRight, ChartLineDown } from '@phosphor-icons/react/dist/ssr'
import { Badge } from '@/components/ui/badge'
import { getScoredMatchupEdges, type ScoredMatchupEdge } from '@/lib/queries/predictions'
import { CURRENT_SEASON } from '@/lib/queries/constants'

const TOP_EDGE_COUNT = 6

// Signed spread formatter -- always shows the sign so "Ohio State -2.5" /
// "Michigan +2.5" read unambiguously regardless of favorite/underdog. Mirrors
// PredictionCard's formatter (src/components/game/PredictionCard.tsx); kept
// local rather than shared since that file is off-limits to concurrent edits.
function formatSpread(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

function EdgeRow({ edge, index }: { edge: ScoredMatchupEdge; index: number }) {
  const hasEdge = edge.edge_pick != null && edge.market_spread != null && edge.abs_edge != null

  const pickTeam = edge.edge_pick === 'home' ? edge.home_team : edge.away_team
  const pickSpread = edge.edge_pick === 'home'
    ? edge.market_spread
    : edge.market_spread != null ? -edge.market_spread : null
  const pickWinProb = edge.edge_pick === 'away' ? 1 - edge.home_win_prob : edge.home_win_prob
  const winPct = Math.round(pickWinProb * 100)

  return (
    <Link
      href={`/games/${edge.game_id}`}
      className="flex items-center gap-3 py-2 px-1 -mx-1 rounded hover:bg-[var(--bg-surface-alt)] transition-colors"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Matchup + pick summary */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text-primary)] truncate">
          {edge.away_team} @ {edge.home_team}
        </p>
        <p className="text-xs text-[var(--text-muted)] truncate">
          {hasEdge
            ? `${pickTeam} ${formatSpread(pickSpread as number)} · model ${winPct}% win prob`
            : 'No market line posted'}
        </p>
      </div>

      {/* Edge magnitude badge */}
      {hasEdge && (
        <Badge
          variant="outline"
          className="flex-shrink-0 tabular-nums text-[var(--color-positive)] bg-[var(--color-positive)]/10 border-[var(--color-positive)]/30"
        >
          {(edge.abs_edge as number).toFixed(1)} pt edge
        </Badge>
      )}
    </Link>
  )
}

// Top model-vs-market edges for the current season, ranked by conviction
// (abs_edge desc, null-market rows last -- see getScoredMatchupEdges). Off
// season this legitimately returns [] (no games on the board yet), which is
// a designed empty state rather than an error -- see the ui-engineer agent
// definition's note on off-season betting surfaces.
export async function EdgeBoardWidget() {
  const edges = await getScoredMatchupEdges(CURRENT_SEASON)
  const topEdges = edges.slice(0, TOP_EDGE_COUNT)

  const hasData = topEdges.length > 0

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-medium text-[var(--text-muted)]">Edge Board</h2>
        <Link
          href="/predictions"
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          View All
          <ArrowRight size={12} weight="thin" />
        </Link>
      </div>

      {hasData ? (
        <div className="space-y-1">
          {topEdges.map((edge, i) => (
            <EdgeRow key={edge.game_id} edge={edge} index={i} />
          ))}
        </div>
      ) : (
        // Inline empty state: EmptyState is a client component, and passing an
        // icon function across the server->client boundary is not
        // RSC-serializable (see MatchupGamesTable's identical convention).
        <div className="flex flex-col items-center gap-2 py-8 text-center" role="status">
          <ChartLineDown size={40} weight="thin" className="text-[var(--text-muted)]" aria-hidden="true" />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Lines are off the board — edges return in season.
          </p>
        </div>
      )}
    </div>
  )
}
