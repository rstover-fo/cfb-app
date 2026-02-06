import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import GamesPage from './page'

// Mock all query functions used by GamesPage
vi.mock('@/lib/queries/games', () => ({
  getGames: vi.fn().mockResolvedValue([]),
  getDefaultWeek: vi.fn().mockResolvedValue(1),
  getAvailableWeeks: vi.fn().mockResolvedValue([1, 2, 3]),
  getAvailableSeasons: vi.fn().mockResolvedValue([2025, 2024]),
}))

vi.mock('@/lib/queries/constants', () => ({
  CURRENT_SEASON: 2025,
}))

vi.mock('@/lib/queries/shared', () => ({
  getFBSTeams: vi.fn().mockResolvedValue(['Alabama', 'Ohio State']),
  FBS_CONFERENCES: ['SEC', 'Big Ten'],
}))

// Mock the client component
vi.mock('@/components/GamesList', () => ({
  GamesList: () => <div data-testid="games-list">Games List</div>,
}))

describe('Games page', () => {
  it('renders the Games heading', async () => {
    const jsx = await GamesPage()
    render(jsx)
    expect(screen.getByText('Games')).toBeInTheDocument()
  })

  it('renders the subtitle', async () => {
    const jsx = await GamesPage()
    render(jsx)
    expect(
      screen.getByText('Browse completed FBS games by week, conference, or team')
    ).toBeInTheDocument()
  })
})
