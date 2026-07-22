import type { Metadata } from 'next'
import { Target } from '@phosphor-icons/react/dist/ssr'
import { getPredictionAccuracy, type PredictionAccuracyRow } from '@/lib/queries/predictions'
import { PREDICTION_MODEL_VERSIONS } from '@/lib/queries/constants'
import { formatPercent } from '@/lib/utils'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { AccuracyTrendChart } from '@/components/models/AccuracyTrendChart'

export const metadata: Metadata = {
  title: 'Models | CFB Team 360',
  description: 'How good are the house prediction models -- walk-forward backtest accuracy, against-the-spread hit rates, and calibration.',
}

const MODEL_LABELS: Record<string, string> = {
  elo_v1: 'Elo (v1)',
  elo_epa_blend_v1: 'Elo + EPA blend (v1)',
}

function formatModel(model: string): string {
  return MODEL_LABELS[model] ?? model
}

function formatMargin(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)} pts`
}

function formatAtsRecord(row: PredictionAccuracyRow): string {
  if (row.ats_wins == null || row.ats_losses == null) return '—'
  return `${row.ats_wins}-${row.ats_losses}-${row.ats_pushes ?? 0}`
}

function formatPct(v: number | null): string {
  return v == null ? '—' : formatPercent(v)
}

function formatBrier(v: number | null): string {
  return v == null ? '—' : v.toFixed(3)
}

// Base rows (edge_threshold = 0, i.e. no minimum-conviction filter), grouped
// by model_version (canonical order from constants.ts) then season desc --
// higher-conviction edge_threshold splits are omitted from the main table
// (see the footnote below it) rather than nested in a secondary section,
// since no accordion/disclosure primitive exists in src/components/ui/ yet.
function baseRowsByModel(rows: PredictionAccuracyRow[]): PredictionAccuracyRow[] {
  const baseRows = rows.filter(r => r.edge_threshold === 0)
  return PREDICTION_MODEL_VERSIONS.flatMap(model =>
    baseRows
      .filter(r => r.model_version === model)
      .sort((a, b) => b.season - a.season)
  )
}

export default async function ModelsPage() {
  const rows = await getPredictionAccuracy()
  const tableRows = baseRowsByModel(rows)
  const hasThresholdRows = rows.some(r => r.edge_threshold !== 0)

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Models
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          How good are the house prediction models, reported the way we&apos;d want a rival to report theirs
        </p>
      </header>

      <section className="max-w-3xl mb-10 space-y-4 font-body text-[var(--text-secondary)]">
        <p className="text-sm sm:text-base leading-relaxed">
          Two models sit behind every prediction on this site. <strong className="text-[var(--text-primary)] font-medium">elo_v1</strong> is
          a pure Elo rating system -- transparent, well-understood math that updates a team&apos;s rating after every
          game based on the result and the opponent&apos;s strength. <strong className="text-[var(--text-primary)] font-medium">elo_epa_blend_v1</strong> keeps
          that same Elo-based win probability but blends the projected margin 0.6 parts Elo to 0.4 parts a
          ridge-regression-adjusted EPA rating, an attempt to fold in-season efficiency into a system that
          otherwise only sees final scores.
        </p>
        <p className="text-sm sm:text-base leading-relaxed">
          Every number below comes from a walk-forward backtest: for each game, the model only ever sees data
          that would have been available before kickoff, then is scored against what actually happened. No
          season retroactively benefits from information the model didn&apos;t have at the time -- that is the
          entire point of testing this way, and it is a stricter bar than a model that is simply fit to the
          whole season at once and graded on the same data.
        </p>
        <p className="text-sm sm:text-base leading-relaxed">
          We are publishing this page because a prediction model that only shows you when it&apos;s right isn&apos;t
          worth trusting. Straight-up win prediction is meaningfully better than a coin flip; against-the-spread
          performance -- the harder test, since the market has already priced in most of what a public model
          knows -- lands close to a coin flip most seasons. That is not a bug in the presentation. It is the
          honest result, and it is also roughly what the published literature on public point-spread models
          would predict.
        </p>
      </section>

      {rows.length === 0 ? (
        // EmptyState is a client component and an icon function isn't
        // RSC-serializable across the server/client boundary, so this
        // mirrors EdgeBoardWidget's inline convention instead of importing it.
        <div className="flex flex-col items-center gap-2 py-12 text-center" role="status" aria-live="polite">
          <Target size={40} weight="thin" className="text-[var(--text-muted)]" aria-hidden="true" />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Backtest metrics publish with the warehouse&apos;s next refresh.
          </p>
        </div>
      ) : (
        <>
          <section className="mb-10">
            <h2 className="font-headline text-xl text-[var(--text-primary)] mb-1">Backtest Accuracy</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              One row per model per season, at the base edge threshold (no minimum-conviction filter). Lower is
              better for MAE, RMSE, and both Brier columns. CFBD Brier is CFBD&apos;s own published win-probability
              model, shown as an external benchmark, not a house metric.
            </p>
            <div className="border border-[var(--border)] rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Season</TableHead>
                    <TableHead className="text-right">Games</TableHead>
                    <TableHead className="text-right">MAE</TableHead>
                    <TableHead className="text-right">RMSE</TableHead>
                    <TableHead className="text-right">ATS W-L-P</TableHead>
                    <TableHead className="text-right">ATS Hit Rate</TableHead>
                    <TableHead className="text-right">Brier</TableHead>
                    <TableHead className="text-right">CFBD Brier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.map(row => (
                    <TableRow key={`${row.model_version}-${row.season}`}>
                      <TableCell className="text-[var(--text-primary)] font-medium">{formatModel(row.model_version)}</TableCell>
                      <TableCell>{row.season}</TableCell>
                      <TableCell className="text-right">{row.n_games}</TableCell>
                      <TableCell className="text-right">{formatMargin(row.margin_mae)}</TableCell>
                      <TableCell className="text-right">{formatMargin(row.margin_rmse)}</TableCell>
                      <TableCell className="text-right">{formatAtsRecord(row)}</TableCell>
                      <TableCell className="text-right">{formatPct(row.ats_hit_rate)}</TableCell>
                      <TableCell className="text-right">{formatBrier(row.brier)}</TableCell>
                      <TableCell className="text-right">{formatBrier(row.cfbd_brier)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {hasThresholdRows && (
              <p className="text-xs text-[var(--text-muted)] mt-3">
                Higher-conviction splits -- the same backtest filtered to games where the model&apos;s edge over
                the market exceeds a minimum threshold -- also exist in the warehouse but are omitted here for
                readability. Those thresholds are what power the Edge Board&apos;s scored slate at game time.
              </p>
            )}
          </section>

          <section>
            <h2 className="font-headline text-xl text-[var(--text-primary)] mb-1">Accuracy Over Time</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Against-the-spread hit rate by season, one line per model, against a coin-flip reference.
            </p>
            <AccuracyTrendChart rows={rows} />
          </section>
        </>
      )}
    </div>
  )
}
