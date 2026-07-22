import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EdgeBoardWidget } from '../EdgeBoardWidget'
import { getScoredMatchupEdges } from '@/lib/queries/predictions'
import {
  createScoredMatchupEdgeRow,
  createScoredMatchupEdgeRows,
} from '@/lib/queries/__tests__/fixtures/predictions'

vi.mock('@/lib/queries/predictions', () => ({
  getScoredMatchupEdges: vi.fn(),
}))

const mockGetScoredMatchupEdges = vi.mocked(getScoredMatchupEdges)

describe('EdgeBoardWidget', () => {
  it('renders a row per edge, linking to the game and showing the pick, spread, win prob, and edge badge', async () => {
    mockGetScoredMatchupEdges.mockResolvedValue(createScoredMatchupEdgeRows())

    render(await EdgeBoardWidget())

    expect(screen.getByText('Edge Board')).toBeInTheDocument()

    // Matchup: away @ home
    expect(screen.getByText('Michigan @ Ohio State')).toBeInTheDocument()

    // edge_pick 'home', market_spread -2.5 => "Ohio State -2.5"; home_win_prob 0.62 => 62%
    expect(screen.getByText('Ohio State -2.5 · model 62% win prob')).toBeInTheDocument()

    // Edge magnitude badge (abs_edge 1.5)
    expect(screen.getByText('1.5 pt edge')).toBeInTheDocument()

    // Row links to the game detail page
    const gameLink = screen.getByText('Michigan @ Ohio State').closest('a')
    expect(gameLink).toHaveAttribute('href', '/games/401752873')

    // No-market row still renders its matchup with an explicit no-line note, no edge badge
    expect(screen.getByText('Air Force @ Boise State')).toBeInTheDocument()
    expect(screen.getByText('No market line posted')).toBeInTheDocument()
  })

  it('shows the away-team pick and its win probability (1 - home_win_prob) when edge_pick is away', async () => {
    mockGetScoredMatchupEdges.mockResolvedValue([
      createScoredMatchupEdgeRow({
        edge_pick: 'away',
        market_spread: 2.5,
        home_win_prob: 0.4,
        edge: -1.5,
        abs_edge: 1.5,
      }),
    ])

    render(await EdgeBoardWidget())

    // pickSpread = -market_spread (2.5) = -2.5; pickWinProb = 1 - 0.4 = 0.6 => 60%
    expect(screen.getByText('Michigan -2.5 · model 60% win prob')).toBeInTheDocument()
  })

  it('caps the displayed rows at 6 even when more edges are returned', async () => {
    const edges = Array.from({ length: 10 }, (_, i) =>
      createScoredMatchupEdgeRow({ game_id: 1000 + i, abs_edge: 10 - i, edge: 10 - i })
    )
    mockGetScoredMatchupEdges.mockResolvedValue(edges)

    render(await EdgeBoardWidget())

    const links = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/games/'))
    expect(links).toHaveLength(6)
  })

  it('renders the designed empty state when there are no edges (off-season)', async () => {
    mockGetScoredMatchupEdges.mockResolvedValue([])

    render(await EdgeBoardWidget())

    expect(screen.getByText('Edge Board')).toBeInTheDocument()
    expect(
      screen.getByText('Lines are off the board — edges return in season.')
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()

    // Widget frame renders even when empty -- no edge rows/links present
    expect(screen.queryAllByRole('link', { name: /@/ })).toHaveLength(0)
  })
})
