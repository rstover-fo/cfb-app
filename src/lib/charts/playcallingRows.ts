/**
 * Row derivation for the playcalling profile chart -- which situations get a
 * diverging bar, and the run share each one reads at.
 *
 * DOM-free and free of `'use client'` on purpose: both the interactive client
 * chart (`src/components/team/PlaycallingProfile.tsx`) and the server-side PNG
 * renderer (`src/lib/charts/server/`) derive their rows here, so the two can
 * never disagree about what the chart says.
 */
import type { PlaycallingProfile } from '@/lib/queries/playcalling'

export interface PlaycallingRow {
  key: string
  label: string
  /** Run share of plays in this situation, 0..1. */
  runRate: number
  /** FBS percentile of the tendency, 0..1, with the direction it ranks. */
  pctl: { value: number; lean: 'run-heavy' | 'pass-heavy' } | null
  /** Extra stat lines surfaced in the hover tooltip (client only). */
  extras: { label: string; value: string }[]
}

function pct1(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function signed3(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(3)
}

/**
 * Builds the situation rows, dropping any whose run rate the view did not
 * publish (small-sample seasons yield nulls, not zeros -- a zero bar would be
 * a fake data render, spec §5).
 */
export function buildPlaycallingRows(profile: PlaycallingProfile): PlaycallingRow[] {
  const candidates: (Omit<PlaycallingRow, 'runRate'> & { runRate: number | null })[] = [
    {
      key: 'overall',
      label: 'Overall',
      runRate: profile.overall_run_rate,
      pctl: profile.overall_run_rate_pctl !== null
        ? { value: profile.overall_run_rate_pctl, lean: 'run-heavy' }
        : null,
      extras: [
        ...(profile.overall_success_rate !== null
          ? [{ label: 'Success rate', value: pct1(profile.overall_success_rate) }] : []),
        ...(profile.overall_avg_epa !== null
          ? [{ label: 'EPA/play', value: signed3(profile.overall_avg_epa) }] : []),
      ],
    },
    {
      key: 'early',
      label: 'Early downs',
      runRate: profile.early_down_run_rate,
      pctl: profile.early_down_run_rate_pctl !== null
        ? { value: profile.early_down_run_rate_pctl, lean: 'run-heavy' }
        : null,
      extras: [],
    },
    {
      key: 'third',
      label: 'Third down',
      // The view publishes third down as a pass rate; the bar reads run-left,
      // pass-right, so invert to the run share.
      runRate: profile.third_down_pass_rate !== null ? 1 - profile.third_down_pass_rate : null,
      pctl: profile.third_down_pass_rate_pctl !== null
        ? { value: profile.third_down_pass_rate_pctl, lean: 'pass-heavy' }
        : null,
      extras: profile.third_down_success_rate !== null
        ? [{ label: 'Success rate', value: pct1(profile.third_down_success_rate) }] : [],
    },
    {
      key: 'redzone',
      label: 'Red zone',
      runRate: profile.red_zone_run_rate,
      pctl: null,
      extras: profile.red_zone_success_rate !== null
        ? [{ label: 'Success rate', value: pct1(profile.red_zone_success_rate) }] : [],
    },
    { key: 'leading', label: 'Leading', runRate: profile.leading_run_rate, pctl: null, extras: [] },
    { key: 'trailing', label: 'Trailing', runRate: profile.trailing_run_rate, pctl: null, extras: [] },
  ]

  return candidates.filter((r): r is PlaycallingRow => r.runRate !== null)
}
