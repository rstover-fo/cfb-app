import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import CoachesPage from './page'
import type { CoachRecord } from '@/lib/queries/coaches'

function coach(overrides: Partial<CoachRecord> = {}): CoachRecord {
  return {
    coach_name: 'Bob Stoops',
    first_name: 'Bob',
    last_name: 'Stoops',
    team: 'Oklahoma',
    first_season: 1999,
    last_season: 2016,
    seasons_count: 18,
    games: 200,
    wins: 190,
    losses: 48,
    ties: 0,
    win_pct: 0.798,
    ats_games: 150,
    ats_wins: 80,
    ats_losses: 65,
    ats_pushes: 5,
    ats_win_pct: 0.4,
    seasons_with_ats_data: 18,
    logo: null,
    color: null,
    ...overrides,
  }
}

const STOOPS = coach({ coach_name: 'Bob Stoops', team: 'Oklahoma', win_pct: 0.798, ats_win_pct: 0.4 })
const SABAN = coach({ coach_name: 'Nick Saban', team: 'Alabama', win_pct: 0.75, ats_win_pct: 0.6 })

const getCoachRecords = vi.fn()

vi.mock('@/lib/queries/coaches', () => ({
  getCoachRecords: (...args: unknown[]) => getCoachRecords(...args),
}))

function getBodyRows() {
  return screen.getAllByRole('row').slice(1)
}

describe('Coaches page', () => {
  it('renders the Coaches heading', async () => {
    getCoachRecords.mockResolvedValue([])
    const jsx = await CoachesPage()
    render(jsx)
    expect(screen.getByText('Coaches')).toBeInTheDocument()
  })

  it('fetches both SU and ATS orderings server-side', async () => {
    getCoachRecords.mockResolvedValue([])
    await CoachesPage()

    expect(getCoachRecords).toHaveBeenCalledWith({ sortBy: 'win_pct' })
    expect(getCoachRecords).toHaveBeenCalledWith({ sortBy: 'ats_win_pct' })
  })

  it('renders coaches by SU win% rank order by default, and switches on the ATS toggle', async () => {
    getCoachRecords.mockImplementation(({ sortBy }: { sortBy: string }) =>
      Promise.resolve(sortBy === 'win_pct' ? [STOOPS, SABAN] : [SABAN, STOOPS])
    )

    const jsx = await CoachesPage()
    render(jsx)

    let rows = getBodyRows()
    expect(within(rows[0]).getByText('Bob Stoops')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Nick Saban')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ATS Win%' }))

    rows = getBodyRows()
    expect(within(rows[0]).getByText('Nick Saban')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Bob Stoops')).toBeInTheDocument()
  })
})
