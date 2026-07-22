/**
 * Unit tests for EloHistoryChart. Fixture shapes mirror the query-layer
 * TeamEloGamePoint type from src/lib/queries/predictions.ts.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EloHistoryChart } from '../EloHistoryChart'
import type { TeamEloGamePoint } from '@/lib/queries/predictions'

function historyPoint(overrides: Partial<TeamEloGamePoint> = {}): TeamEloGamePoint {
  return {
    game_id: 401752860,
    week: 12,
    season_type: 'regular',
    start_date: '2025-11-15T18:00:00+00:00',
    opponent: 'Purdue',
    is_home: true,
    pregame_elo: 1875.0,
    postgame_elo: 1892.4,
    team_win_prob: 0.88,
    ...overrides,
  }
}

const history: TeamEloGamePoint[] = [
  historyPoint({ game_id: 1, week: 12, pregame_elo: 1875.0, postgame_elo: 1892.4, opponent: 'Purdue', is_home: true }),
  historyPoint({ game_id: 2, week: 14, pregame_elo: 1875.1, postgame_elo: 1855.0, opponent: 'Michigan', is_home: false, team_win_prob: 0.38 }),
  historyPoint({ game_id: 3, week: 16, pregame_elo: 1912.9, postgame_elo: 1930.0, opponent: 'Oregon', is_home: true, team_win_prob: 0.55 }),
]

describe('EloHistoryChart', () => {
  it('renders an accessible svg chart with fixture history', () => {
    render(<EloHistoryChart history={history} teamName="Ohio State" />)

    const svg = screen.getByRole('img', { name: /Elo rating by game for Ohio State/ })
    expect(svg).toBeInTheDocument()
    expect(svg.tagName.toLowerCase()).toBe('svg')
  })

  it('renders null when history is empty', () => {
    const { container } = render(<EloHistoryChart history={[]} teamName="Ohio State" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows an opponent tooltip on hover', () => {
    const { container } = render(<EloHistoryChart history={history} teamName="Ohio State" />)

    const hoverRects = container.querySelectorAll('rect[fill="transparent"]')
    expect(hoverRects.length).toBe(history.length)

    fireEvent.mouseEnter(hoverRects[1])

    expect(screen.getByText(/Week 14/)).toBeInTheDocument()
    expect(screen.getByText(/@ Michigan/)).toBeInTheDocument()
  })
})
