import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RankingsPage from './page'

// Mock all query functions used by RankingsPage
vi.mock('@/lib/queries/rankings', () => ({
  getRankingsForWeek: vi.fn().mockResolvedValue([]),
  getRankingsAllWeeks: vi.fn().mockResolvedValue([]),
  getAvailablePolls: vi.fn().mockResolvedValue(['AP Top 25']),
  getLatestRankingWeek: vi.fn().mockResolvedValue(1),
  getAvailableRankingSeasons: vi.fn().mockResolvedValue([2025, 2024]),
}))

vi.mock('@/lib/queries/constants', () => ({
  CURRENT_SEASON: 2025,
}))

// Mock the client component
vi.mock('@/components/rankings/RankingsClient', () => ({
  RankingsClient: () => <div data-testid="rankings-client">Rankings Client</div>,
}))

describe('Rankings page', () => {
  it('renders the Rankings heading', async () => {
    const jsx = await RankingsPage()
    render(jsx)
    expect(screen.getByText('Rankings')).toBeInTheDocument()
  })

  it('renders the RankingsClient component', async () => {
    const jsx = await RankingsPage()
    render(jsx)
    expect(screen.getByTestId('rankings-client')).toBeInTheDocument()
  })
})
