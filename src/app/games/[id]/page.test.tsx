import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import GamePage from './page'

const mockNotFound = vi.fn()
vi.mock('next/navigation', () => ({
  notFound: () => {
    mockNotFound()
    throw new Error('NEXT_NOT_FOUND')
  },
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/lib/queries/games', () => ({
  getGameById: vi.fn().mockResolvedValue({
    id: 1,
    season: 2025,
    week: 1,
    start_date: '2025-08-30T00:00:00Z',
    home_team: 'Alabama',
    away_team: 'Ohio State',
    home_points: 28,
    away_points: 21,
    conference_game: false,
    completed: true,
    homeLogo: null,
    homeColor: null,
    awayLogo: null,
    awayColor: null,
  }),
  getGameBoxScore: vi.fn().mockResolvedValue(null),
  getGamePlayerLeaders: vi.fn().mockResolvedValue(null),
  getGameLineScores: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/components/game/GameScoreHeader', () => ({
  GameScoreHeader: ({ game }: { game: { home_team: string } }) => (
    <div data-testid="score-header">{game.home_team}</div>
  ),
}))
vi.mock('@/components/game/GameBoxScore', () => ({
  GameBoxScore: () => <div data-testid="box-score">Box Score</div>,
}))
vi.mock('@/components/game/PlayerLeaders', () => ({
  PlayerLeaders: () => <div data-testid="player-leaders">Leaders</div>,
}))
vi.mock('@/components/game/QuarterScores', () => ({
  QuarterScores: () => <div data-testid="quarter-scores">Quarter Scores</div>,
}))

describe('Game detail page', () => {
  it('renders game data for a valid ID', async () => {
    const jsx = await GamePage({ params: Promise.resolve({ id: '1' }) })
    render(jsx)
    expect(screen.getByText('Alabama')).toBeInTheDocument()
    expect(screen.getByText(/Back to Games/)).toBeInTheDocument()
  })

  it('shows fallback text when box score is null', async () => {
    const jsx = await GamePage({ params: Promise.resolve({ id: '1' }) })
    render(jsx)
    expect(screen.getByText('Stats unavailable for this game.')).toBeInTheDocument()
  })

  it('calls notFound for non-numeric ID', async () => {
    mockNotFound.mockClear()
    await expect(
      GamePage({ params: Promise.resolve({ id: 'abc' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })
})
