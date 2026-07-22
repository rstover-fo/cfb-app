/**
 * Unit tests for TeamCard's rank badge. Ranks (team_epa_season.off_epa_rank)
 * are partitioned by season + classification, so a bare "#1" is ambiguous
 * once /teams' "All Divisions" filter mixes FBS and FCS teams -- the badge
 * must qualify the rank with the team's own classification.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TeamCard } from '../TeamCard'
import type { Team } from '@/lib/types/database'
import type { TeamMetrics } from '../TeamList'

function team(overrides: Partial<Team> = {}): Team {
  return {
    id: 1,
    school: 'Oklahoma',
    mascot: 'Sooners',
    abbreviation: 'OU',
    conference: 'SEC',
    division: null,
    classification: 'fbs',
    color: '#841617',
    alt_color: null,
    logo: null,
    alt_logo: null,
    ...overrides,
  }
}

function metrics(overrides: Partial<TeamMetrics> = {}): TeamMetrics {
  return { epa: 0.25, rank: 1, wins: 9, losses: 1, ...overrides }
}

describe('TeamCard rank badge', () => {
  it('qualifies an FBS team\'s rank with "FBS"', () => {
    render(<TeamCard team={team({ classification: 'fbs' })} metrics={metrics({ rank: 1 })} />)

    expect(screen.getByText('#1 FBS')).toBeInTheDocument()
  })

  it('qualifies an FCS team\'s rank with "FCS", distinguishing it from an FBS #1', () => {
    render(<TeamCard team={team({ school: 'Montana', classification: 'fcs' })} metrics={metrics({ rank: 1 })} />)

    expect(screen.getByText('#1 FCS')).toBeInTheDocument()
    expect(screen.queryByText('#1 FBS')).not.toBeInTheDocument()
  })

  it('renders a bare rank when classification is missing', () => {
    render(<TeamCard team={team({ classification: null })} metrics={metrics({ rank: 5 })} />)

    expect(screen.getByText('#5')).toBeInTheDocument()
  })

  it('renders the "--" placeholder when there is no rank', () => {
    render(<TeamCard team={team()} metrics={undefined} />)

    expect(screen.getAllByText('--').length).toBeGreaterThan(0)
  })
})
