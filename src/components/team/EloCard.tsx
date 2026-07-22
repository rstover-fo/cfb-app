import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { TeamElo, TeamEloGamePoint } from '@/lib/queries/predictions'

interface EloCardProps {
  elo: TeamElo | null
  history: TeamEloGamePoint[]
}

// Season delta: last postgame Elo (most recent game played) minus the first
// pregame Elo (the team's rating entering the season) -- the same
// first-pregame -> last-postgame framing as getTeamEloHistory's grain.
// history is already start_date-ascending (query's own .order()), so first/
// last index reads are safe without a re-sort here.
function seasonDelta(history: TeamEloGamePoint[]): number | null {
  if (history.length === 0) return null
  return history[history.length - 1].postgame_elo - history[0].pregame_elo
}

// Elo Rating summary card: season-end rating/rank from api.team_elo, plus a
// season delta computed from the game-by-game history. Renders nothing when
// there's no Elo coverage for this team/season at all (elo null and history
// empty) -- the team page's convention is to omit absent sections rather
// than show an empty card.
export function EloCard({ elo, history }: EloCardProps) {
  if (!elo && history.length === 0) return null

  const currentElo = elo?.season_end_elo ?? history[history.length - 1]?.postgame_elo ?? null
  const delta = seasonDelta(history)
  const deltaTone = delta == null || delta === 0 ? 'neutral' : delta > 0 ? 'positive' : 'negative'

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="font-headline text-xl text-[var(--text-primary)]">
            Elo Rating
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Season Elo
            </p>
            <p className="font-headline text-2xl text-[var(--text-primary)] tabular-nums">
              {currentElo != null ? Math.round(currentElo) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Elo Rank
            </p>
            <p className="font-headline text-2xl text-[var(--text-primary)] tabular-nums">
              {elo?.elo_rank != null ? `#${elo.elo_rank}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Season Δ
            </p>
            <p
              className={cn(
                'font-headline text-2xl tabular-nums',
                deltaTone === 'positive' && 'text-[var(--color-positive)]',
                deltaTone === 'negative' && 'text-[var(--color-negative)]',
                deltaTone === 'neutral' && 'text-[var(--text-primary)]'
              )}
            >
              {delta != null ? `${delta >= 0 ? '+' : ''}${Math.round(delta)}` : '—'}
            </p>
          </div>
        </div>

        {elo?.low_confidence && (
          <p className="pt-2 border-t border-[var(--border)] text-xs text-[var(--text-muted)] italic">
            Low confidence: limited game history for this team/season.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
