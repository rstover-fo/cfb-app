/**
 * Unit tests for RecruitingROICard, including its StatBar-backed percentile
 * bars (task D1 migration) and the null-placeholder rule for Wins Over
 * Expected.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecruitingROICard } from '../RecruitingROICard'
import type { RecruitingROI } from '@/lib/types/database'

function roiRow(overrides: Partial<RecruitingROI> = {}): RecruitingROI {
  return {
    season: 2025,
    avg_class_rank_4yr: 12.5,
    avg_class_points_4yr: 250.4,
    total_blue_chips_4yr: 40,
    blue_chip_ratio: 0.62,
    wins: 10,
    losses: 2,
    win_pct: 0.833,
    sp_rating: 24.1,
    sp_rank: 8,
    epa_per_play: 0.187,
    wins_over_expected: 1.4,
    epa_over_expected: 0.05,
    recruiting_efficiency: 3.2,
    win_pct_pctl: 0.81,
    epa_pctl: 0.6,
    recruiting_efficiency_pctl: 0.4,
    ...overrides,
  }
}

describe('RecruitingROICard', () => {
  it('renders headline stats and a percentile bar per metric', () => {
    const { container } = render(<RecruitingROICard roi={roiRow()} />)

    expect(screen.getByText('Recruiting ROI')).toBeInTheDocument()
    expect(screen.getByText('#12.5')).toBeInTheDocument()
    expect(screen.getByText('62%')).toBeInTheDocument()
    expect(screen.getByText('10-2')).toBeInTheDocument()
    expect(screen.getByText('+1.4')).toBeInTheDocument()

    expect(screen.getByText('Win %')).toBeInTheDocument()
    expect(screen.getByText('81th')).toBeInTheDocument()
    expect(screen.getByText('EPA/Play')).toBeInTheDocument()
    expect(screen.getByText('60th')).toBeInTheDocument()
    expect(screen.getByText('Recruiting Efficiency')).toBeInTheDocument()
    expect(screen.getByText('40th')).toBeInTheDocument()

    // Three StatBar tracks, one per percentile row.
    const tracks = container.querySelectorAll('.bg-\\[var\\(--bg-surface-alt\\)\\].rounded-full')
    expect(tracks).toHaveLength(3)
  })

  it('colors the percentile bar fill by threshold tier', () => {
    const { container } = render(<RecruitingROICard roi={roiRow()} />)
    const fills = Array.from(
      container.querySelectorAll('.bg-\\[var\\(--bg-surface-alt\\)\\].rounded-full > div'),
    ) as HTMLElement[]

    // Win % 81st -> positive, EPA/Play 60th -> neutral, Recruiting Eff 40th -> negative
    expect(fills[0].style.backgroundColor).toBe('var(--color-positive)')
    expect(fills[1].style.backgroundColor).toBe('var(--color-neutral)')
    expect(fills[2].style.backgroundColor).toBe('var(--color-negative)')
  })

  it('omits a percentile bar when that metric has no percentile', () => {
    render(<RecruitingROICard roi={roiRow({ epa_pctl: null })} />)

    expect(screen.getByText('Win %')).toBeInTheDocument()
    expect(screen.queryByText('60th')).not.toBeInTheDocument()
  })

  it('omits a metric row entirely when the underlying value is null', () => {
    render(<RecruitingROICard roi={roiRow({ recruiting_efficiency: null })} />)

    expect(screen.queryByText('Recruiting Efficiency')).not.toBeInTheDocument()
  })

  it('renders the house em dash for a null Wins Over Expected, never the legacy --', () => {
    render(<RecruitingROICard roi={roiRow({ wins_over_expected: null })} />)

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('--')).not.toBeInTheDocument()
  })

  it('renders an unavailable message when roi is null', () => {
    render(<RecruitingROICard roi={null} />)

    expect(screen.getByText('Recruiting ROI')).toBeInTheDocument()
    expect(screen.getByText('Recruiting ROI metrics available from 2002 onward.')).toBeInTheDocument()
  })
})
