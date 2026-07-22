import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MatchupGamesTable } from '../MatchupGamesTable'
import type { MatchupGame } from '@/lib/queries/matchups'

const TEAM_A = { name: 'Oklahoma', logo: null, color: '#841617' }
const TEAM_B = { name: 'Texas', logo: null, color: '#BF5700' }

function game(overrides: Partial<MatchupGame> = {}): MatchupGame {
  return {
    gameId: 1,
    season: 2024,
    week: 6,
    seasonType: 'regular',
    startDate: '2024-10-12',
    neutralSite: true,
    teamAScore: 3,
    teamBScore: 34,
    teamAHome: false,
    winner: 'Texas',
    result: 'L',
    venue: null,
    ...overrides,
  }
}

describe('MatchupGamesTable', () => {
  it('renders a muted venue line under the site label when venue is present', () => {
    render(
      <MatchupGamesTable
        games={[game({ venue: 'Cotton Bowl' })]}
        teamAMeta={TEAM_A}
        teamBMeta={TEAM_B}
      />
    )

    expect(screen.getByText('Cotton Bowl')).toBeInTheDocument()
  })

  it('omits the venue line entirely when venue is null', () => {
    render(
      <MatchupGamesTable
        games={[game({ venue: null })]}
        teamAMeta={TEAM_A}
        teamBMeta={TEAM_B}
      />
    )

    // No stray venue text should render for a null venue.
    expect(screen.queryByText('Cotton Bowl')).not.toBeInTheDocument()
  })

  it('labels a neutral-site game as "Neutral"', () => {
    render(
      <MatchupGamesTable
        games={[game({ neutralSite: true, teamAHome: false })]}
        teamAMeta={TEAM_A}
        teamBMeta={TEAM_B}
      />
    )

    expect(screen.getByText('Neutral')).toBeInTheDocument()
  })

  it('labels a game at teamA\'s stadium as "<teamA> home"', () => {
    render(
      <MatchupGamesTable
        games={[game({ neutralSite: false, teamAHome: true })]}
        teamAMeta={TEAM_A}
        teamBMeta={TEAM_B}
      />
    )

    expect(screen.getByText('Oklahoma home')).toBeInTheDocument()
  })

  it('labels a game at teamB\'s stadium as "<teamB> home"', () => {
    render(
      <MatchupGamesTable
        games={[game({ neutralSite: false, teamAHome: false })]}
        teamAMeta={TEAM_A}
        teamBMeta={TEAM_B}
      />
    )

    expect(screen.getByText('Texas home')).toBeInTheDocument()
  })

  it('renders the empty state when there are no games', () => {
    render(<MatchupGamesTable games={[]} teamAMeta={TEAM_A} teamBMeta={TEAM_B} />)

    expect(screen.getByText('No completed games on record')).toBeInTheDocument()
  })
})
