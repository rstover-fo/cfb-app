import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RivalsPage from './page'

// Mock the data layer used by the page.
vi.mock('@/lib/queries/shared', () => ({
  getFBSTeams: vi.fn().mockResolvedValue(['Alabama', 'Auburn', 'Oklahoma', 'Texas']),
  getTeamLookup: vi
    .fn()
    .mockResolvedValue(new Map([['Oklahoma', { logo: null, color: '#841617', conference: 'SEC' }]])),
}))

vi.mock('@/lib/queries/matchups', () => ({
  getMatchup: vi.fn().mockResolvedValue(null),
  getMatchupGames: vi.fn().mockResolvedValue([]),
}))

// Client components render as lightweight stubs.
vi.mock('@/components/rivals', () => ({
  RivalSelector: () => <div data-testid="rival-selector">selector</div>,
  H2HRecordSummary: () => <div>record</div>,
  MatchupGamesTable: () => <div>games</div>,
  ScoringTrendChart: () => <div>chart</div>,
}))

describe('Rivals page', () => {
  it('renders the Rivals heading and selector', async () => {
    const jsx = await RivalsPage({ searchParams: Promise.resolve({}) })
    render(jsx)
    expect(screen.getByText('Rivals')).toBeInTheDocument()
    expect(screen.getByTestId('rival-selector')).toBeInTheDocument()
  })

  it('shows the classic-rivalry landing links when no pair is selected', async () => {
    const jsx = await RivalsPage({ searchParams: Promise.resolve({}) })
    render(jsx)
    expect(screen.getByText('Red River Rivalry')).toBeInTheDocument()
    expect(screen.getByText('Iron Bowl')).toBeInTheDocument()
  })
})
