import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import GamePage from './page'
import { getGameRecap } from '@/lib/queries/games'
import { getLineMovement } from '@/lib/queries/predictions'
import { createLineMovementRows } from '@/lib/queries/__tests__/fixtures/predictions'

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
  getGameDrives: vi.fn().mockResolvedValue([]),
  getGamePlays: vi.fn().mockResolvedValue([]),
  getGameWinProbability: vi.fn().mockResolvedValue([]),
  getGameRecap: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/queries/predictions', () => ({
  getGamePrediction: vi.fn().mockResolvedValue(null),
  getLineMovement: vi.fn().mockResolvedValue([]),
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
vi.mock('@/components/game/GameRecap', () => ({
  GameRecap: ({ recap }: { recap: { headline: string } }) => (
    <div data-testid="game-recap">{recap.headline}</div>
  ),
}))
vi.mock('@/components/game/PredictionCard', () => ({
  PredictionCard: () => <div data-testid="prediction-card">Prediction Card</div>,
}))
vi.mock('@/components/game/LineMovementChart', () => ({
  LineMovementChart: () => <div data-testid="line-movement-chart">Line Movement</div>,
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

  it('renders nothing for the recap when getGameRecap resolves null (not yet generated)', async () => {
    const jsx = await GamePage({ params: Promise.resolve({ id: '1' }) })
    render(jsx)
    expect(screen.queryByTestId('game-recap')).not.toBeInTheDocument()
  })

  it('renders the GameRecap component when a recap row exists', async () => {
    vi.mocked(getGameRecap).mockResolvedValueOnce({
      headline: 'Sooners Rally Late to Stun Ohio State',
      recap: 'Oklahoma overcame a 14-point deficit in the fourth quarter.',
      wp_available: true,
      model: 'claude-sonnet',
      generated_at: '2026-07-20T04:00:00Z',
    })

    const jsx = await GamePage({ params: Promise.resolve({ id: '1' }) })
    render(jsx)

    expect(screen.getByTestId('game-recap')).toHaveTextContent('Sooners Rally Late to Stun Ohio State')
  })

  it('omits the prediction section entirely when there is no prediction and no line movement', async () => {
    const jsx = await GamePage({ params: Promise.resolve({ id: '1' }) })
    render(jsx)
    expect(screen.queryByTestId('prediction-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('line-movement-chart')).not.toBeInTheDocument()
  })

  it('renders the LineMovementChart when line movement snapshots exist (even with no prediction row)', async () => {
    vi.mocked(getLineMovement).mockResolvedValueOnce(createLineMovementRows())

    const jsx = await GamePage({ params: Promise.resolve({ id: '1' }) })
    render(jsx)

    expect(screen.getByTestId('line-movement-chart')).toBeInTheDocument()
  })
})
