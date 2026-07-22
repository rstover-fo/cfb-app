/**
 * Unit tests for AccuracyTrendChart. Fixture shapes mirror the query-layer
 * PredictionAccuracyRow type from src/lib/queries/predictions.ts.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccuracyTrendChart } from '../AccuracyTrendChart'
import { createPredictionAccuracyRow } from '@/lib/queries/__tests__/fixtures/predictions'

describe('AccuracyTrendChart', () => {
  it('renders an accessible svg chart with fixture rows', () => {
    const rows = [
      createPredictionAccuracyRow({ model_version: 'elo_epa_blend_v1', season: 2024, ats_hit_rate: 0.51 }),
      createPredictionAccuracyRow({ model_version: 'elo_epa_blend_v1', season: 2025, ats_hit_rate: 0.5205 }),
      createPredictionAccuracyRow({ model_version: 'elo_v1', season: 2024, ats_hit_rate: 0.49 }),
      createPredictionAccuracyRow({ model_version: 'elo_v1', season: 2025, ats_hit_rate: 0.5 }),
    ]

    render(<AccuracyTrendChart rows={rows} />)

    const svg = screen.getByRole('img', { name: /Against-the-spread hit rate by season/ })
    expect(svg).toBeInTheDocument()
    expect(svg.tagName.toLowerCase()).toBe('svg')

    // Legend shows both model labels
    expect(screen.getByText('Elo + EPA blend (v1)')).toBeInTheDocument()
    expect(screen.getByText('Elo (v1)')).toBeInTheDocument()
  })

  it('renders a framed empty state when there are no rows', () => {
    // The models page renders this section unconditionally once `rows` is
    // non-empty overall (its own gate is on the unfiltered array), so an
    // empty `baseRows` here must still render a framed EmptyState rather
    // than bare null -- an ungated bare `null` would leave the "Accuracy
    // Over Time" heading orphaned above nothing.
    render(<AccuracyTrendChart rows={[]} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('No accuracy trend to show')).toBeInTheDocument()
  })

  it('renders a framed empty state when every row is edge-threshold-filtered or missing a hit rate', () => {
    const rows = [
      createPredictionAccuracyRow({ edge_threshold: 6 }),
      createPredictionAccuracyRow({ edge_threshold: 0, ats_hit_rate: null }),
    ]
    render(<AccuracyTrendChart rows={rows} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('No accuracy trend to show')).toBeInTheDocument()
  })

  it('draws the coin-flip and break-even reference lines', () => {
    const rows = [
      createPredictionAccuracyRow({ model_version: 'elo_v1', season: 2025, ats_hit_rate: 0.5 }),
    ]
    render(<AccuracyTrendChart rows={rows} />)

    expect(screen.getByText('Coin flip (50%)')).toBeInTheDocument()
    expect(screen.getByText('Break-even at -110 (52.4%)')).toBeInTheDocument()
  })
})
