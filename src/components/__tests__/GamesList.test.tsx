/**
 * Smoke tests for GamesList's migration of its season/conference/team
 * filters from native <select> to shadcn Select.
 *
 * Radix's Select opens/selects on pointerdown, and
 * @testing-library/user-event isn't installed in this project (see
 * TeamPageClient.tabs.test.tsx's Tabs precedent) -- so we drive it with
 * plain pointer/mouse events too (see EdgeBoardTable.test.tsx for the same
 * pattern).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GamesList } from '../GamesList'
import type { GameWithTeams } from '@/app/games/actions'

const fetchGames = vi.fn()
const fetchAvailableWeeks = vi.fn()
const fetchDefaultWeek = vi.fn()

vi.mock('@/app/games/actions', () => ({
  fetchGames: (...args: unknown[]) => fetchGames(...args),
  fetchAvailableWeeks: (...args: unknown[]) => fetchAvailableWeeks(...args),
  fetchDefaultWeek: (...args: unknown[]) => fetchDefaultWeek(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

function openSelect(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
}

function chooseOption(name: string) {
  fireEvent.click(screen.getByRole('option', { name }))
}

const game: GameWithTeams = {
  id: 1,
  season: 2025,
  week: 3,
  start_date: '2025-09-13T00:00:00Z',
  home_team: 'Oklahoma',
  away_team: 'Houston',
  home_points: 28,
  away_points: 14,
  conference_game: true,
  completed: true,
  homeLogo: null,
  homeColor: '#841617',
  awayLogo: null,
  awayColor: '#666666',
}

const defaultProps = {
  initialGames: [game],
  initialWeek: 3,
  initialSeason: 2025,
  initialPhase: 'regular' as const,
  availableWeeks: [1, 2, 3],
  conferences: ['SEC', 'Big 12'],
  teams: ['Oklahoma', 'Houston'],
  availableSeasons: [2025, 2024],
}

describe('GamesList', () => {
  it('renders the season, conference, and team selects with their current values', () => {
    render(<GamesList {...defaultProps} />)

    expect(screen.getByLabelText('Select season')).toHaveTextContent('2025')
    expect(screen.getByLabelText('Select conference')).toHaveTextContent('All Conferences')
    expect(screen.getByLabelText('Select team')).toHaveTextContent('All Teams')
  })

  it('refetches with the chosen conference and clears back to "All Conferences"', async () => {
    fetchGames.mockResolvedValue([])

    render(<GamesList {...defaultProps} />)

    openSelect(screen.getByLabelText('Select conference'))
    chooseOption('SEC')

    expect(await screen.findByLabelText('Select conference')).toHaveTextContent('SEC')
    expect(fetchGames).toHaveBeenCalledWith(
      expect.objectContaining({ conference: 'SEC' })
    )

    openSelect(screen.getByLabelText('Select conference'))
    chooseOption('All Conferences')

    expect(await screen.findByLabelText('Select conference')).toHaveTextContent('All Conferences')
    expect(fetchGames).toHaveBeenLastCalledWith(
      expect.objectContaining({ conference: undefined })
    )
  })
})
