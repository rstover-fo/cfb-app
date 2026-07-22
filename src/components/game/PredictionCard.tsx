import { Info } from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { GamePrediction } from '@/lib/queries/predictions'

interface PredictionCardProps {
  prediction: GamePrediction | null
  homeTeam: string
  awayTeam: string
}

// Signed spread formatter -- always shows the sign so "Ohio State -2.5" /
// "Michigan +2.5" read unambiguously regardless of favorite/underdog.
function formatSpread(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

function formatMargin(margin: number, homeTeam: string, awayTeam: string): string {
  const rounded = Math.round(Math.abs(margin) * 10) / 10
  if (rounded === 0) return 'Even matchup'
  return margin > 0 ? `${homeTeam} by ${rounded}` : `${awayTeam} by ${rounded}`
}

function formatPredictionDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// House prediction summary: model expected margin, Elo-only home win
// probability, the market line (when posted), and the model's edge vs that
// line. Renders nothing when there's no prediction row for this game/model
// (normal for old seasons or before the model has run) -- the game page's
// convention is to omit absent sections rather than show an empty card.
export function PredictionCard({ prediction, homeTeam, awayTeam }: PredictionCardProps) {
  if (!prediction) return null

  const { expected_home_margin, home_win_prob, market_provider, market_spread, edge, edge_pick } = prediction
  const hasMarket = market_spread != null
  const homeWinPct = Math.round(home_win_prob * 100)

  const pickTeam = edge_pick === 'home' ? homeTeam : awayTeam
  const pickNumber = edge_pick != null && market_spread != null
    ? (edge_pick === 'home' ? market_spread : -market_spread)
    : null

  const edgeTone = edge == null || edge === 0 ? 'neutral' : edge > 0 ? 'positive' : 'negative'

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="font-headline text-xl text-[var(--text-primary)]">
            House Prediction
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Model expected margin + win probability */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Model Margin
            </p>
            <p className="font-headline text-lg text-[var(--text-primary)] tabular-nums">
              {formatMargin(expected_home_margin, homeTeam, awayTeam)}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                Home Win Probability
              </p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger aria-label="About home win probability">
                    <Info size={14} className="text-[var(--text-muted)]" />
                  </TooltipTrigger>
                  <TooltipContent>
                    home_win_prob is Elo-only, even for the EPA-blended margin model.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="font-headline text-lg text-[var(--text-primary)] tabular-nums">
              {homeTeam} {homeWinPct}%
            </p>
          </div>
        </div>

        {/* Market line */}
        {hasMarket ? (
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Market{market_provider ? ` (${market_provider})` : ''}
            </p>
            <p className="text-sm text-[var(--text-secondary)] tabular-nums">
              {homeTeam} {formatSpread(market_spread as number)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)] italic">
            No market line posted for this game.
          </p>
        )}

        {/* Edge -- headline takeaway */}
        {hasMarket && edge_pick != null && pickNumber != null ? (
          <Badge
            variant="outline"
            className={cn(
              'text-sm font-medium px-3 py-1',
              edgeTone === 'positive' && 'text-[var(--color-positive)] bg-[var(--color-positive)]/10 border-[var(--color-positive)]/30',
              edgeTone === 'negative' && 'text-[var(--color-negative)] bg-[var(--color-negative)]/10 border-[var(--color-negative)]/30',
              edgeTone === 'neutral' && 'text-[var(--text-muted)] border-[var(--border)]'
            )}
          >
            Edge: {pickTeam} {formatSpread(pickNumber)} ({Math.abs(edge as number).toFixed(1)} pts)
          </Badge>
        ) : hasMarket ? (
          <p className="text-sm text-[var(--text-muted)] italic">No edge -- expected margin matches the market.</p>
        ) : null}

        {/* Footer caption */}
        <p className="pt-2 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
          {prediction.model_version} &middot; {formatPredictionDate(prediction.prediction_date)}
        </p>
      </CardContent>
    </Card>
  )
}
