import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TeamPageClient } from '../TeamPageClient'
import type { Team } from '@/lib/types/database'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/teams/oklahoma',
  useSearchParams: () => new URLSearchParams(),
}))

const OKLAHOMA = { id: 1, school: 'Oklahoma', logo: null, color: '#841617', conference: 'SEC' } as unknown as Team
const TEXAS = { id: 2, school: 'Texas', logo: null, color: '#BF5700', conference: 'SEC' } as unknown as Team

const OU_THEME = { key: 'ou', label: 'Sooner Mode' }

const baseProps = {
  currentSeason: 2025,
  availableSeasons: [2025],
  metrics: null,
  style: null,
  trajectory: null,
  trajectoryAverages: null,
  offenseDrives: null,
  defenseDrives: null,
  downDistanceSplits: null,
  redZoneSplits: null,
  fieldPositionSplits: null,
  homeAwaySplits: null,
  conferenceSplits: null,
  roster: null,
  playerStats: null,
  schedule: null,
  allTeams: [OKLAHOMA, TEXAS],
  classHistory: null,
  roi: null,
  signees: null,
  portalActivity: null,
  teamElo: null,
  teamEloHistory: [],
}

describe('TeamPageClient — team theme UI', () => {
  it('shows the theme toggle for a team with a theme, but not the rivalry link when inactive', () => {
    render(
      <TeamPageClient
        {...baseProps}
        team={OKLAHOMA}
        teamTheme={OU_THEME}
        activeThemeKey={null}
      />
    )

    expect(screen.getByRole('button', { name: 'Sooner Mode' })).toBeInTheDocument()
    expect(screen.queryByText('Red River Rivalry')).not.toBeInTheDocument()
  })

  it('shows the Red River Rivalry quick link once the OU theme is active', () => {
    render(
      <TeamPageClient
        {...baseProps}
        team={OKLAHOMA}
        teamTheme={OU_THEME}
        activeThemeKey="ou"
      />
    )

    const link = screen.getByRole('link', { name: /Red River Rivalry/ })
    expect(link).toHaveAttribute('href', '/rivals?t1=Oklahoma&t2=Texas')
  })

  it('renders no theme toggle for a team without a theme', () => {
    render(
      <TeamPageClient
        {...baseProps}
        team={TEXAS}
        teamTheme={null}
        activeThemeKey={null}
      />
    )

    expect(screen.queryByRole('button', { name: /Sooner Mode/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Red River Rivalry')).not.toBeInTheDocument()
  })
})
