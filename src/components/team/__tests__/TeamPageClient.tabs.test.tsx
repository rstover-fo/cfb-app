import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TeamPageClient } from '../TeamPageClient'
import type { Team } from '@/lib/types/database'
import { createTeamWeekFeatureRows } from '@/lib/queries/__tests__/fixtures/playcalling'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/teams/oklahoma',
  useSearchParams: () => new URLSearchParams(),
}))

const OKLAHOMA = { id: 1, school: 'Oklahoma', logo: null, color: '#841617', conference: 'SEC' } as unknown as Team
const TEXAS = { id: 2, school: 'Texas', logo: null, color: '#BF5700', conference: 'SEC' } as unknown as Team

const baseProps = {
  team: OKLAHOMA,
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
  returningProduction: null,
  transferPortalImpact: null,
  teamTheme: null,
  activeThemeKey: null,
  teamElo: null,
  teamEloHistory: [],
  teamAts: null,
  playcallingProfile: null,
  teamWeekFeatures: [],
}

// Radix's TabsTrigger selects a tab on pointerdown/mousedown, not click --
// @testing-library/user-event isn't installed in this project, so we fire
// a plain mousedown event to trigger the selection.
function selectTab(trigger: HTMLElement) {
  fireEvent.mouseDown(trigger, { button: 0 })
}

describe('TeamPageClient — shadcn Tabs migration', () => {
  it('renders a tablist with 7 tabs, Overview selected and visible by default', () => {
    render(<TeamPageClient {...baseProps} />)

    const tablist = screen.getByRole('tablist', { name: 'Team page sections' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs).toHaveLength(7)
    expect(tabs.map(t => t.textContent)).toEqual([
      'Overview',
      'Situational',
      'Playcalling',
      'Schedule',
      'Roster',
      'Compare',
      'Recruiting',
    ])

    const overviewTab = screen.getByRole('tab', { name: 'Overview' })
    expect(overviewTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Drive Patterns')).toBeInTheDocument()
  })

  it('unmounts the previous panel when switching tabs', () => {
    render(<TeamPageClient {...baseProps} />)

    expect(screen.getByText('Drive Patterns')).toBeInTheDocument()

    const rosterTab = screen.getByRole('tab', { name: 'Roster' })
    selectTab(rosterTab)

    expect(rosterTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('Drive Patterns')).not.toBeInTheDocument()
  })

  it('remounts a panel when switching back to it', () => {
    render(<TeamPageClient {...baseProps} />)

    const rosterTab = screen.getByRole('tab', { name: 'Roster' })
    const overviewTab = screen.getByRole('tab', { name: 'Overview' })

    selectTab(rosterTab)
    expect(screen.queryByText('Drive Patterns')).not.toBeInTheDocument()

    selectTab(overviewTab)
    expect(overviewTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Drive Patterns')).toBeInTheDocument()
  })

  it('switches to the Playcalling panel and shows its designed empty note when no profile exists', () => {
    render(<TeamPageClient {...baseProps} />)

    const playcallingTab = screen.getByRole('tab', { name: 'Playcalling' })
    selectTab(playcallingTab)

    expect(playcallingTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('Drive Patterns')).not.toBeInTheDocument()
    expect(
      screen.getByText('Playcalling profile publishes after enough plays are charted.')
    ).toBeInTheDocument()
  })

  it('gates the Opponent-Adjusted Offense section on week-feature data', () => {
    const { rerender } = render(<TeamPageClient {...baseProps} />)
    expect(screen.queryByText('Opponent-Adjusted Offense')).not.toBeInTheDocument()

    rerender(<TeamPageClient {...baseProps} teamWeekFeatures={createTeamWeekFeatureRows()} />)
    expect(screen.getByText('Opponent-Adjusted Offense')).toBeInTheDocument()
  })

  it('wires aria-controls on the active trigger to an existing panel id', () => {
    render(<TeamPageClient {...baseProps} />)

    const overviewTab = screen.getByRole('tab', { name: 'Overview' })
    const controlsId = overviewTab.getAttribute('aria-controls')
    expect(controlsId).toBeTruthy()
    expect(document.getElementById(controlsId as string)).toBeInTheDocument()

    const rosterTab = screen.getByRole('tab', { name: 'Roster' })
    selectTab(rosterTab)

    const rosterControlsId = rosterTab.getAttribute('aria-controls')
    expect(rosterControlsId).toBeTruthy()
    expect(document.getElementById(rosterControlsId as string)).toBeInTheDocument()
  })
})
