import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPercent } from '@/lib/utils'
import type { ReturningProduction } from '@/lib/queries/roster-context'

interface ReturningProductionCardProps {
  production: ReturningProduction | null
}

interface SplitRowProps {
  label: string
  value: number | null
}

// A single labeled split row -- percentage + a simple CSS fill bar (not a
// roughjs chart; this is card chrome). Omits its own row entirely when the
// split is null (zero qualifying returners for that split is common).
function SplitRow({ label, value }: SplitRowProps) {
  if (value == null) return null
  const pct = Math.min(100, Math.max(0, Math.round(value * 100)))

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="text-[var(--text-primary)] tabular-nums font-medium">{formatPercent(value)}</span>
      </div>
      <div className="h-2 bg-[var(--bg-surface-alt)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--color-run)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// Returning Production summary card: headline returning-PPA share + FBS rank
// from api.team_returning_production, plus pass/rush/receiving returning
// splits as compact bars. This is an offseason-strength signal -- renders
// nothing when the current season's row hasn't been produced yet (normal
// early in the season, not an error state), matching the team page's
// convention of omitting absent sections rather than showing an empty card.
export function ReturningProductionCard({ production }: ReturningProductionCardProps) {
  if (!production) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="font-headline text-xl text-[var(--text-primary)]">
            Returning Production
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
            Returning PPA
          </p>
          <p className="font-headline text-3xl text-[var(--text-primary)] tabular-nums underline-sketch inline-block">
            {production.returning_ppa_pct != null ? formatPercent(production.returning_ppa_pct) : '—'}
          </p>
          {production.returning_rank != null && (
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              #{production.returning_rank} in FBS
            </p>
          )}
        </div>

        <div className="space-y-3 pt-3 border-t border-[var(--border)]">
          <SplitRow label="Passing" value={production.returning_passing_ppa_pct} />
          <SplitRow label="Rushing" value={production.returning_rushing_ppa_pct} />
          <SplitRow label="Receiving" value={production.returning_receiving_ppa_pct} />
        </div>
      </CardContent>
    </Card>
  )
}
