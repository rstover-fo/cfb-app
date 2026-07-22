import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { CoachHistoryDialog, type SelectedCoach } from '../CoachHistoryDialog'
import { createCoachingTenureRow, createCoachingTenureRows } from '@/lib/queries/__tests__/fixtures/coaches'

const fetchCoachingHistory = vi.fn()

vi.mock('@/app/coaches/actions', () => ({
  fetchCoachingHistory: (...args: unknown[]) => fetchCoachingHistory(...args),
}))

const STOOPS: SelectedCoach = { firstName: 'Bob', lastName: 'Stoops', displayName: 'Bob Stoops' }

function getBodyRows() {
  return screen.getAllByRole('row').slice(1) // drop header row
}

describe('CoachHistoryDialog', () => {
  beforeEach(() => {
    fetchCoachingHistory.mockReset()
  })

  it('renders nothing (dialog closed) when coach is null', () => {
    render(<CoachHistoryDialog coach={null} onOpenChange={() => {}} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchCoachingHistory).not.toHaveBeenCalled()
  })

  it('fetches history for the given coach on open and titles the dialog with their name', async () => {
    fetchCoachingHistory.mockResolvedValue(createCoachingTenureRows())

    render(<CoachHistoryDialog coach={STOOPS} onOpenChange={() => {}} />)

    expect(fetchCoachingHistory).toHaveBeenCalledWith('Bob', 'Stoops')
    expect(screen.getByRole('heading', { name: 'Bob Stoops' })).toBeInTheDocument()
    expect(await screen.findByText('Florida')).toBeInTheDocument()
  })

  it('shows a loading skeleton row while the fetch is in flight', () => {
    fetchCoachingHistory.mockReturnValue(new Promise(() => {})) // never resolves

    render(<CoachHistoryDialog coach={STOOPS} onOpenChange={() => {}} />)

    expect(screen.getAllByTestId('history-loading-row').length).toBeGreaterThan(0)
  })

  it('renders one row per tenure in chronological order with school/years/record/win%/bowls', async () => {
    fetchCoachingHistory.mockResolvedValue(createCoachingTenureRows())

    render(<CoachHistoryDialog coach={STOOPS} onOpenChange={() => {}} />)

    await screen.findByText('Florida')

    const rows = getBodyRows()
    // Two tenures x (data row + optional talent row) -- Florida has no talent
    // data so it only contributes one row; Oklahoma contributes two.
    const floridaRow = rows.find(r => within(r).queryByText('Florida'))!
    expect(within(floridaRow).getByText('1996–1998')).toBeInTheDocument()
    expect(within(floridaRow).getByText('20-13')).toBeInTheDocument()
    expect(within(floridaRow).getByText('60.6%')).toBeInTheDocument()
    expect(within(floridaRow).getByText('1-1')).toBeInTheDocument() // bowl_games 2, bowl_wins 1

    const oklahomaRow = rows.find(r => within(r).queryByText('Oklahoma'))!
    expect(within(oklahomaRow).getByText('1999–2016')).toBeInTheDocument()
    expect(within(oklahomaRow).getByText('190-48')).toBeInTheDocument()
    expect(within(oklahomaRow).getByText('79.8%')).toBeInTheDocument()
  })

  it('shows the active badge for an in-progress tenure', async () => {
    fetchCoachingHistory.mockResolvedValue([createCoachingTenureRow({ team: 'Oklahoma', is_active: true })])

    render(<CoachHistoryDialog coach={STOOPS} onOpenChange={() => {}} />)

    expect(await screen.findByText('Active')).toBeInTheDocument()
  })

  it('renders a positive-token talent-improvement line when both ranks are present and rank improved', async () => {
    fetchCoachingHistory.mockResolvedValue([
      createCoachingTenureRow({ inherited_talent_rank: 34, year3_talent_rank: 12, talent_improvement: 22 }),
    ])

    render(<CoachHistoryDialog coach={STOOPS} onOpenChange={() => {}} />)

    const delta = await screen.findByTestId('talent-delta')
    expect(delta).toHaveTextContent('(+22)')
    expect(delta.className).toContain('color-positive')
  })

  it('renders a negative-token talent-improvement line when talent rank got worse', async () => {
    fetchCoachingHistory.mockResolvedValue([
      createCoachingTenureRow({ inherited_talent_rank: 12, year3_talent_rank: 34, talent_improvement: -22 }),
    ])

    render(<CoachHistoryDialog coach={STOOPS} onOpenChange={() => {}} />)

    const delta = await screen.findByTestId('talent-delta')
    expect(delta).toHaveTextContent('(-22)')
    expect(delta.className).toContain('color-negative')
  })

  it('omits the talent-improvement line when either rank is null', async () => {
    fetchCoachingHistory.mockResolvedValue([
      createCoachingTenureRow({ inherited_talent_rank: null, year3_talent_rank: null, talent_improvement: null }),
    ])

    render(<CoachHistoryDialog coach={STOOPS} onOpenChange={() => {}} />)

    await screen.findByText('Oklahoma')
    expect(screen.queryByTestId('talent-delta')).not.toBeInTheDocument()
  })

  it('shows an empty message when the coach has no tenure history', async () => {
    fetchCoachingHistory.mockResolvedValue([])

    render(<CoachHistoryDialog coach={STOOPS} onOpenChange={() => {}} />)

    expect(await screen.findByText('No tenure history available for this coach.')).toBeInTheDocument()
  })
})
