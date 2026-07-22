import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PredictionsPage from './page'
import {
  createScoredMatchupEdgeRows,
} from '@/lib/queries/__tests__/fixtures/predictions'

const getScoredMatchupEdges = vi.fn()
const getAvailableWeeks = vi.fn()

vi.mock('@/lib/queries/predictions', () => ({
  getScoredMatchupEdges: (...args: unknown[]) => getScoredMatchupEdges(...args),
}))

vi.mock('@/lib/queries/games', () => ({
  getAvailableWeeks: (...args: unknown[]) => getAvailableWeeks(...args),
}))

describe('Predictions page (Edge Board)', () => {
  it('renders the Edge Board heading, intro copy with a Models link, and the table', async () => {
    getScoredMatchupEdges.mockResolvedValue(createScoredMatchupEdgeRows())
    getAvailableWeeks.mockResolvedValue([13, 14])

    const jsx = await PredictionsPage()
    render(jsx)

    expect(screen.getByRole('heading', { name: 'Edge Board' })).toBeInTheDocument()
    expect(screen.getByText(/How good is this model\?/)).toBeInTheDocument()
    const modelsLink = screen.getByRole('link', { name: 'Models' })
    expect(modelsLink).toHaveAttribute('href', '/models')

    // Fixture's scored row: Michigan @ Ohio State
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Michigan @ Ohio State')).toBeInTheDocument()
  })

  it('renders the designed empty state when the slate is empty (off-season)', async () => {
    getScoredMatchupEdges.mockResolvedValue([])
    getAvailableWeeks.mockResolvedValue([])

    const jsx = await PredictionsPage()
    render(jsx)

    expect(screen.getByRole('heading', { name: 'Edge Board' })).toBeInTheDocument()
    expect(
      screen.getByText('Lines are off the board — edges return in season.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    // Filters stay visible even when the slate is empty
    expect(screen.getByLabelText('Filter by week')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by model version')).toBeInTheDocument()
  })
})
