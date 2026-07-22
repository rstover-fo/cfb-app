/**
 * Unit tests for ComparePlayersSection (the server-fetched core of
 * /players/compare): query fan-out for the ?p1=&p2= ids, picker slots in
 * every state, and the compare view only rendering with a complete pairing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const getPlayerComparison = vi.fn()

vi.mock('@/lib/queries/players', () => ({
  getPlayerComparison: (...args: unknown[]) => getPlayerComparison(...args),
}))

vi.mock('@/app/players/actions', () => ({
  fetchSearchPlayers: vi.fn().mockResolvedValue([]),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/players/compare',
  useSearchParams: () => new URLSearchParams(),
}))

import { ComparePlayersSection } from '../ComparePlayersSection'
import { createPlayerComparisonRow } from '@/lib/queries/__tests__/fixtures/players'

const QB1 = createPlayerComparisonRow()
const QB2 = createPlayerComparisonRow({ player_id: 'athlete-2', name: 'Arch Manning', team: 'Texas' })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ComparePlayersSection', () => {
  it('renders both empty picker slots and the pick-two prompt without ids', async () => {
    render(await ComparePlayersSection({}))

    expect(screen.getByRole('combobox', { name: 'Search Player 1' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Search Player 2' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Pick two players to compare')
    expect(getPlayerComparison).not.toHaveBeenCalled()
  })

  it('renders a selected chip and the one-more prompt with only p1', async () => {
    getPlayerComparison.mockResolvedValueOnce(QB1)

    render(await ComparePlayersSection({ p1: 'athlete-1' }))

    expect(getPlayerComparison).toHaveBeenCalledTimes(1)
    expect(getPlayerComparison).toHaveBeenCalledWith('athlete-1')

    // Slot 1 is a chip (clearable), slot 2 still a search input.
    expect(screen.getByText('Jackson Arnold')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear Player 1' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Search Player 2' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('One more to go')
  })

  it('renders the compare view when both ids resolve', async () => {
    getPlayerComparison.mockImplementation(async (id: unknown) =>
      id === 'athlete-1' ? QB1 : QB2
    )

    render(await ComparePlayersSection({ p1: 'athlete-1', p2: 'athlete-2' }))

    expect(getPlayerComparison).toHaveBeenCalledWith('athlete-1')
    expect(getPlayerComparison).toHaveBeenCalledWith('athlete-2')

    // PlayerCompareView identity headers + the percentile chart.
    expect(screen.getByRole('link', { name: 'Jackson Arnold' })).toHaveAttribute('href', '/players/athlete-1')
    expect(screen.getByRole('link', { name: 'Arch Manning' })).toHaveAttribute('href', '/players/athlete-2')
    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.queryByText('Pick two players to compare — search each slot above.')).not.toBeInTheDocument()
  })

  it('flags a slot whose id has no comparison row', async () => {
    getPlayerComparison.mockResolvedValueOnce(null)

    render(await ComparePlayersSection({ p1: 'nobody' }))

    expect(screen.getByText(/No comparison data for the selected player/)).toBeInTheDocument()
    // The slot falls back to the search input so the user can re-pick.
    expect(screen.getByRole('combobox', { name: 'Search Player 1' })).toBeInTheDocument()
  })
})
