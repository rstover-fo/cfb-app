'use client'

import { RecruitingROI } from '@/lib/types/database'

interface RecruitingROICardProps {
  roi: RecruitingROI | null
}

function PercentileBar({ label, value, percentile, format }: {
  label: string
  value: number | null
  percentile: number | null
  format: (v: number) => string
}) {
  if (value === null) return null
  const pct = percentile !== null ? Math.round(percentile * 100) : null

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="text-[var(--text-primary)] font-medium">{format(value)}</span>
      </div>
      {pct !== null && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-[var(--bg-surface-alt)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                backgroundColor: pct >= 75 ? 'var(--color-positive)' : pct >= 50 ? 'var(--color-run)' : 'var(--color-negative)',
              }}
            />
          </div>
          <span className="text-xs text-[var(--text-muted)] w-10 text-right">{pct}th</span>
        </div>
      )}
    </div>
  )
}

export function RecruitingROICard({ roi }: RecruitingROICardProps) {
  if (!roi) {
    return (
      <section>
        <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Recruiting ROI</h2>
        <p className="text-[var(--text-muted)] text-sm">
          Recruiting ROI metrics available from 2002 onward.
        </p>
      </section>
    )
  }

  return (
    <section>
      <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-4">Recruiting ROI</h2>
      <div className="border border-[var(--border)] rounded-sm bg-[var(--bg-surface)] p-5">
        {/* Headline stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-4 border-b border-[var(--border)]">
          <div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">4yr Avg Rank</div>
            <div className="text-2xl font-headline text-[var(--text-primary)]">
              #{Number(roi.avg_class_rank_4yr).toFixed(1)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Blue Chip Ratio</div>
            <div className="text-2xl font-headline text-[var(--text-primary)]">
              {(Number(roi.blue_chip_ratio) * 100).toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Record</div>
            <div className="text-2xl font-headline text-[var(--text-primary)]">
              {roi.wins}-{roi.losses}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Wins Over Expected</div>
            <div className={`text-2xl font-headline ${
              roi.wins_over_expected !== null && Number(roi.wins_over_expected) >= 0
                ? 'text-[var(--color-positive)]'
                : 'text-[var(--color-negative)]'
            }`}>
              {roi.wins_over_expected !== null
                ? (Number(roi.wins_over_expected) >= 0 ? '+' : '') + Number(roi.wins_over_expected).toFixed(1)
                : '--'
              }
            </div>
          </div>
        </div>

        {/* Percentile bars */}
        <div className="space-y-4">
          <PercentileBar
            label="Win %"
            value={roi.win_pct !== null ? Number(roi.win_pct) : null}
            percentile={roi.win_pct_pctl !== null ? Number(roi.win_pct_pctl) : null}
            format={v => `${(v * 100).toFixed(0)}%`}
          />
          <PercentileBar
            label="EPA/Play"
            value={roi.epa_per_play !== null ? Number(roi.epa_per_play) : null}
            percentile={roi.epa_pctl !== null ? Number(roi.epa_pctl) : null}
            format={v => v.toFixed(3)}
          />
          <PercentileBar
            label="Recruiting Efficiency"
            value={roi.recruiting_efficiency !== null ? Number(roi.recruiting_efficiency) : null}
            percentile={roi.recruiting_efficiency_pctl !== null ? Number(roi.recruiting_efficiency_pctl) : null}
            format={v => v.toFixed(1)}
          />
        </div>
      </div>
    </section>
  )
}
