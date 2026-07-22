import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import ModelsPage from './page'
import {
  createPredictionAccuracyRow,
  createPredictionAccuracyRows,
} from '@/lib/queries/__tests__/fixtures/predictions'

const getPredictionAccuracy = vi.fn()

vi.mock('@/lib/queries/predictions', () => ({
  getPredictionAccuracy: (...args: unknown[]) => getPredictionAccuracy(...args),
}))

function getBodyRows() {
  return screen.getAllByRole('row').slice(1)
}

describe('Models page', () => {
  it('renders the Models heading and methodology prose', async () => {
    getPredictionAccuracy.mockResolvedValue([])
    const jsx = await ModelsPage()
    render(jsx)

    expect(screen.getByText('Models')).toBeInTheDocument()
    expect(screen.getByText(/pure Elo rating system/)).toBeInTheDocument()
    expect(screen.getByText(/walk-forward backtest/)).toBeInTheDocument()
  })

  it('renders an empty state when the warehouse has no backtest rows yet', async () => {
    getPredictionAccuracy.mockResolvedValue([])
    const jsx = await ModelsPage()
    render(jsx)

    expect(
      screen.getByText("Backtest metrics publish with the warehouse's next refresh.")
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders one table row per model/season at the base edge threshold, grouped by model then season desc', async () => {
    getPredictionAccuracy.mockResolvedValue(createPredictionAccuracyRows())
    const jsx = await ModelsPage()
    render(jsx)

    // Fixture has 4 rows total (2 models x edge_threshold 0/6); only the
    // edge_threshold=0 rows (one per model) belong in the main table, in
    // PREDICTION_MODEL_VERSIONS order (elo_v1 first, then elo_epa_blend_v1).
    const rows = getBodyRows()
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Elo (v1)')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Elo + EPA blend (v1)')).toBeInTheDocument()
  })

  it('formats MAE, ATS record, hit rate, and Brier columns for a row', async () => {
    getPredictionAccuracy.mockResolvedValue([
      createPredictionAccuracyRow({
        model_version: 'elo_epa_blend_v1',
        season: 2025,
        edge_threshold: 0,
        n_games: 780,
        margin_mae: 10.8,
        ats_wins: 380,
        ats_losses: 350,
        ats_pushes: 12,
        ats_hit_rate: 0.5236,
        brier: 0.201,
        cfbd_brier: 0.198,
      }),
    ])
    const jsx = await ModelsPage()
    render(jsx)

    const row = getBodyRows()[0]
    expect(within(row).getByText('780')).toBeInTheDocument()
    expect(within(row).getByText('10.8 pts')).toBeInTheDocument()
    expect(within(row).getByText('380-350-12')).toBeInTheDocument()
    expect(within(row).getByText('52.4%')).toBeInTheDocument()
    expect(within(row).getByText('0.201')).toBeInTheDocument()
    expect(within(row).getByText('0.198')).toBeInTheDocument()
  })

  it('renders a null-value row with em dashes instead of crashing', async () => {
    getPredictionAccuracy.mockResolvedValue([
      createPredictionAccuracyRow({
        margin_mae: null,
        margin_rmse: null,
        ats_wins: null,
        ats_losses: null,
        ats_pushes: null,
        ats_hit_rate: null,
        brier: null,
        cfbd_brier: null,
      }),
    ])
    const jsx = await ModelsPage()
    render(jsx)

    const row = getBodyRows()[0]
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('shows the edge-threshold footnote only when threshold-filtered rows exist', async () => {
    getPredictionAccuracy.mockResolvedValue(createPredictionAccuracyRows())
    let jsx = await ModelsPage()
    const { unmount } = render(jsx)
    expect(screen.getByText(/Higher-conviction splits/)).toBeInTheDocument()
    unmount()

    getPredictionAccuracy.mockResolvedValue([createPredictionAccuracyRow({ edge_threshold: 0 })])
    jsx = await ModelsPage()
    render(jsx)
    expect(screen.queryByText(/Higher-conviction splits/)).not.toBeInTheDocument()
  })
})
