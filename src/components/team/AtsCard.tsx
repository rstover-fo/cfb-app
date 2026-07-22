import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPercent, cn } from '@/lib/utils'
import type { TeamAts } from '@/lib/queries/predictions'

interface AtsCardProps {
  ats: TeamAts | null
}

// Against-the-spread (ATS) summary card: season record as "W-L-P", cover rate
// as a percentage, and average cover margin (signed, colored). Renders nothing
// when there's no ATS coverage for this team/season (ats is null or games is 0).
export function AtsCard({ ats }: AtsCardProps) {
  if (!ats || ats.games === 0 || ats.games == null) return null

  const recordString = `${ats.ats_wins}-${ats.ats_losses}-${ats.ats_pushes}`
  const coverPercentage = ats.ats_win_pct != null ? formatPercent(ats.ats_win_pct) : '—'
  const marginTone =
    ats.avg_cover_margin == null || ats.avg_cover_margin === 0
      ? 'neutral'
      : ats.avg_cover_margin > 0
        ? 'positive'
        : 'negative'

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="font-headline text-xl text-[var(--text-primary)]">
            Against the Spread
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
              ATS Record
            </p>
            <p className="font-headline text-2xl text-[var(--text-primary)] tabular-nums">
              {recordString}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Cover Rate
            </p>
            <p className="font-headline text-2xl text-[var(--text-primary)] tabular-nums">
              {coverPercentage}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Avg Cover Margin
            </p>
            <p
              className={cn(
                'font-headline text-2xl tabular-nums',
                marginTone === 'positive' && 'text-[var(--color-positive)]',
                marginTone === 'negative' && 'text-[var(--color-negative)]',
                marginTone === 'neutral' && 'text-[var(--text-primary)]'
              )}
            >
              {ats.avg_cover_margin != null
                ? `${ats.avg_cover_margin >= 0 ? '+' : ''}${ats.avg_cover_margin.toFixed(1)}`
                : '—'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
