/**
 * Unit tests for EloCard. Fixture shapes mirror the query-layer types from
 * src/lib/queries/predictions.ts (TeamElo, TeamEloGamePoint).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EloCard } from '../EloCard'
import type { TeamElo, TeamEloGamePoint } from '@/lib/queries/predictions'

function eloRow(overrides: Partial<TeamElo> = {}): TeamElo {
  return {
    team: 'Ohio State',
    season: 2025,
    season_end_elo: 1901.7,
    elo_rank: 2,
    games_played: 13,
    low_confidence: false,
    cfbd_elo: 1955,
    ...overrides,
  }
}

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

const risingHistory: TeamEloGamePoint[] = [
  historyPoint({ game_id: 1, week: 1, pregame_elo: 1800, postgame_elo: 1820, opponent: 'Indiana' }),
  historyPoint({ game_id: 2, week: 2, pregame_elo: 1820, postgame_elo: 1850, opponent: 'Purdue' }),
  historyPoint({ game_id: 3, week: 3, pregame_elo: 1850, postgame_elo: 1901.7, opponent: 'Michigan' }),
]

describe('EloCard', () => {
  it('renders season Elo, rank, and a positive season delta', () => {
    render(<EloCard elo={eloRow()} history={risingHistory} />)

    expect(screen.getByText('Elo Rating')).toBeInTheDocument()
    expect(screen.getByText('1902')).toBeInTheDocument() // Math.round(1901.7)
    expect(screen.getByText('#2')).toBeInTheDocument()
    // delta = last postgame (1901.7) - first pregame (1800) = +101.7 -> +102
    expect(screen.getByText('+102')).toBeInTheDocument()
  })

  it('colors a negative season delta with the negative token', () => {
    const fallingHistory: TeamEloGamePoint[] = [
      historyPoint({ game_id: 1, week: 1, pregame_elo: 1900, postgame_elo: 1880, opponent: 'Indiana' }),
      historyPoint({ game_id: 2, week: 2, pregame_elo: 1880, postgame_elo: 1850, opponent: 'Purdue' }),
    ]

    render(<EloCard elo={eloRow({ season_end_elo: 1850 })} history={fallingHistory} />)

    const delta = screen.getByText('-50')
    expect(delta).toBeInTheDocument()
    expect(delta.className).toContain('color-negative')
  })

  it('shows a low-confidence caption when the flag is true', () => {
    render(<EloCard elo={eloRow({ low_confidence: true })} history={risingHistory} />)

    expect(screen.getByText(/Low confidence/)).toBeInTheDocument()
  })

  it('omits the low-confidence caption when the flag is false', () => {
    render(<EloCard elo={eloRow({ low_confidence: false })} history={risingHistory} />)

    expect(screen.queryByText(/Low confidence/)).not.toBeInTheDocument()
  })

  it('renders null when elo is null and history is empty', () => {
    const { container } = render(<EloCard elo={null} history={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('still renders using history alone when elo is null but history has rows', () => {
    render(<EloCard elo={null} history={risingHistory} />)

    expect(screen.getByText('Elo Rating')).toBeInTheDocument()
    // current Elo falls back to last postgame_elo (1901.7 -> 1902)
    expect(screen.getByText('1902')).toBeInTheDocument()
    // no rank available without the elo row
    expect(screen.getByText('—', { selector: 'p' })).toBeInTheDocument()
  })
})
