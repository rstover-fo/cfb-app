/**
 * Unit tests for PortalActivityPanel's league-context enrichment (plan 2.4):
 * net transfers / portal dependency / win delta percentiles sourced from
 * src/lib/queries/roster-context.ts's getTransferPortalImpact, additive to
 * the existing RPC-based transfer list.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PortalActivityPanel } from '../PortalActivityPanel'
import type { TransferPortalImpact } from '@/lib/queries/roster-context'
import type { PortalActivity } from '@/lib/types/database'

function impactRow(overrides: Partial<TransferPortalImpact> = {}): TransferPortalImpact {
  return {
    team: 'Ohio State',
    season: 2025,
    conference: 'Big Ten',
    transfers_in: 14,
    transfers_out: 9,
    net_transfers: 5,
    avg_incoming_stars: 3.4,
    avg_incoming_rating: 0.891,
    incoming_high_stars: 3,
    prior_season_wins: 8,
    prior_season_sp_rating: 21.3,
    current_wins: 11,
    current_sp_rating: 27.8,
    win_delta: 3,
    sp_delta: 6.5,
    portal_dependency: 0.284,
    win_delta_per_transfer_in: 0.214,
    net_transfers_pctl: 0.81,
    win_delta_pctl: 0.88,
    portal_dependency_pctl: 0.42,
    ...overrides,
  }
}

const emptyActivity: PortalActivity = {
  summary: null,
  transfers_in: [],
  transfers_out: [],
}

describe('PortalActivityPanel — league percentile context', () => {
  it('renders net transfers, portal dependency, and win delta with percentile captions', () => {
    render(<PortalActivityPanel activity={emptyActivity} impact={impactRow()} season={2025} />)

    expect(screen.getByText('FBS Percentile Context')).toBeInTheDocument()
    expect(screen.getByText('Net Transfers')).toBeInTheDocument()
    expect(screen.getByText('+5')).toBeInTheDocument()
    expect(screen.getByText('81st percentile')).toBeInTheDocument()

    expect(screen.getByText('Portal Dependency')).toBeInTheDocument()
    expect(screen.getByText('28.4%')).toBeInTheDocument()
    expect(screen.getByText('42nd percentile')).toBeInTheDocument()

    expect(screen.getByText('Win Δ')).toBeInTheDocument()
    expect(screen.getByText('+3')).toBeInTheDocument()
    expect(screen.getByText('88th percentile')).toBeInTheDocument()
  })

  it('still renders the league context row when activity is null', () => {
    render(<PortalActivityPanel activity={null} impact={impactRow()} season={2025} />)

    expect(screen.getByText('FBS Percentile Context')).toBeInTheDocument()
    expect(screen.getByText('Transfer portal data available from 2021 onward.')).toBeInTheDocument()
  })

  it('renders no league-context section when impact is null (RPC list stays intact)', () => {
    render(<PortalActivityPanel activity={emptyActivity} impact={null} season={2025} />)

    expect(screen.queryByText('FBS Percentile Context')).not.toBeInTheDocument()
    expect(screen.getByText('No transfer portal activity for 2025.')).toBeInTheDocument()
  })

  it('omits a percentile caption when that stat has no percentile yet', () => {
    render(
      <PortalActivityPanel
        activity={emptyActivity}
        impact={impactRow({ net_transfers_pctl: null })}
        season={2025}
      />
    )

    expect(screen.getByText('Net Transfers')).toBeInTheDocument()
    expect(screen.getByText('+5')).toBeInTheDocument()
    // Only 2 of the 3 percentile captions should render.
    expect(screen.getByText('42nd percentile')).toBeInTheDocument()
    expect(screen.getByText('88th percentile')).toBeInTheDocument()
  })
})
