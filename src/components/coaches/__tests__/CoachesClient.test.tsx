import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { CoachesClient } from '../CoachesClient'
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

function getBodyRows() {
  return screen.getAllByRole('row').slice(1) // drop header row
}

describe('CoachesClient', () => {
  it('renders coaches ranked by SU win% by default', () => {
    render(<CoachesClient byWinPct={BY_WIN_PCT} byAtsWinPct={BY_ATS_WIN_PCT} />)

    const rows = getBodyRows()
    expect(within(rows[0]).getByText('Bob Stoops')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Nick Saban')).toBeInTheDocument()
  })

  it('switches to ATS win% ordering when the ATS tab is selected', () => {
    render(<CoachesClient byWinPct={BY_WIN_PCT} byAtsWinPct={BY_ATS_WIN_PCT} />)

    fireEvent.click(screen.getByRole('button', { name: 'ATS Win%' }))

    const rows = getBodyRows()
    expect(within(rows[0]).getByText('Nick Saban')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Bob Stoops')).toBeInTheDocument()
  })

  it('shows the partial-ATS-data note only when a coach has fewer ATS seasons than seasons coached', () => {
    render(
      <CoachesClient
        byWinPct={[coach({ seasons_count: 18, seasons_with_ats_data: 10 })]}
        byAtsWinPct={[coach({ seasons_count: 18, seasons_with_ats_data: 10 })]}
      />
    )

    expect(screen.getByText(/only available for part of this coach/)).toBeInTheDocument()
  })

  it('omits the partial-ATS-data note when ATS coverage matches seasons coached', () => {
    render(
      <CoachesClient
        byWinPct={[coach({ seasons_count: 18, seasons_with_ats_data: 18 })]}
        byAtsWinPct={[coach({ seasons_count: 18, seasons_with_ats_data: 18 })]}
      />
    )

    expect(screen.queryByText(/only available for part of this coach/)).not.toBeInTheDocument()
  })

  it('renders an empty state when there are no coaches', () => {
    render(<CoachesClient byWinPct={[]} byAtsWinPct={[]} />)

    expect(screen.getByText('No coach data available')).toBeInTheDocument()
  })
})
