import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { CoachesClient } from '../CoachesClient'
import type { CoachRecord } from '@/lib/queries/coaches'

const fetchCoachingHistory = vi.fn()

vi.mock('@/app/coaches/actions', () => ({
  fetchCoachingHistory: (...args: unknown[]) => fetchCoachingHistory(...args),
}))

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
    ats_win_pct: 0.552,
    seasons_with_ats_data: 18,
    logo: null,
    color: null,
    ...overrides,
  }
}

const STOOPS = coach({ coach_name: 'Bob Stoops', team: 'Oklahoma', win_pct: 0.798, ats_win_pct: 0.4 })
const SABAN = coach({ coach_name: 'Nick Saban', team: 'Alabama', win_pct: 0.75, ats_win_pct: 0.6 })

// Server-side ordering: byWinPct has Stoops first (higher SU win%), byAtsWinPct
// has Saban first (higher ATS win%) -- CoachesClient just switches which
// pre-sorted array it renders.
const BY_WIN_PCT = [STOOPS, SABAN]
const BY_ATS_WIN_PCT = [SABAN, STOOPS]

// Helper: render with the same lists for active and all-time unless a test
// cares about the distinction (the client defaults to the Active scope).
function renderClient(props: Partial<Parameters<typeof CoachesClient>[0]> = {}) {
  return render(
    <CoachesClient
      byWinPct={BY_WIN_PCT}
      byAtsWinPct={BY_ATS_WIN_PCT}
      activeByWinPct={BY_WIN_PCT}
      activeByAtsWinPct={BY_ATS_WIN_PCT}
      {...props}
    />
  )
}

function getBodyRows() {
  return screen.getAllByRole('row').slice(1) // drop header row
}

describe('CoachesClient', () => {
  beforeEach(() => {
    fetchCoachingHistory.mockReset()
    fetchCoachingHistory.mockResolvedValue([])
  })

  it('opens the coaching history dialog with the coach name when a row is clicked', async () => {
    renderClient()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(getBodyRows()[0]) // Bob Stoops row

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bob Stoops' })).toBeInTheDocument()
    expect(fetchCoachingHistory).toHaveBeenCalledWith('Bob', 'Stoops')
  })

  it('does not open the dialog when a coach row has no first/last name', () => {
    const noName = coach({ coach_name: 'Interim Coach', first_name: null, last_name: null })
    renderClient({ byWinPct: [noName], byAtsWinPct: [noName], activeByWinPct: [noName], activeByAtsWinPct: [noName] })

    fireEvent.click(getBodyRows()[0])

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchCoachingHistory).not.toHaveBeenCalled()
  })

  it('renders coaches ranked by SU win% by default', () => {
    renderClient()

    const rows = getBodyRows()
    expect(within(rows[0]).getByText('Bob Stoops')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Nick Saban')).toBeInTheDocument()
  })

  it('switches to ATS win% ordering when the ATS tab is selected', () => {
    renderClient()

    fireEvent.click(screen.getByRole('button', { name: 'ATS Win%' }))

    const rows = getBodyRows()
    expect(within(rows[0]).getByText('Nick Saban')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Bob Stoops')).toBeInTheDocument()
  })

  it('shows the partial-ATS-data note only when a coach has fewer ATS seasons than seasons coached', () => {
    const partial = [coach({ seasons_count: 18, seasons_with_ats_data: 10 })]
    renderClient({ byWinPct: partial, byAtsWinPct: partial, activeByWinPct: partial, activeByAtsWinPct: partial })

    expect(screen.getByText(/only available for part of this coach/)).toBeInTheDocument()
  })

  it('omits the partial-ATS-data note when ATS coverage matches seasons coached', () => {
    const full = [coach({ seasons_count: 18, seasons_with_ats_data: 18 })]
    renderClient({ byWinPct: full, byAtsWinPct: full, activeByWinPct: full, activeByAtsWinPct: full })

    expect(screen.queryByText(/only available for part of this coach/)).not.toBeInTheDocument()
  })

  it('renders an empty state when there are no coaches', () => {
    renderClient({ byWinPct: [], byAtsWinPct: [], activeByWinPct: [], activeByAtsWinPct: [] })

    expect(screen.getByText('No coach data available')).toBeInTheDocument()
  })

  it('defaults to Active scope and switches to the all-time lists on the All-time toggle', () => {
    // Active list only contains Saban; all-time list has both.
    renderClient({ activeByWinPct: [SABAN], activeByAtsWinPct: [SABAN] })

    let rows = getBodyRows()
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('Nick Saban')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'All-time' }))

    rows = getBodyRows()
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Bob Stoops')).toBeInTheDocument()
  })
})
