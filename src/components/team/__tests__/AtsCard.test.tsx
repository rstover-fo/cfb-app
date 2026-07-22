/**
 * Unit tests for AtsCard. Fixture shapes mirror the query-layer types from
 * src/lib/queries/predictions.ts (TeamAts).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AtsCard } from '../AtsCard'
import type { TeamAts } from '@/lib/queries/predictions'

function atsRow(overrides: Partial<TeamAts> = {}): TeamAts {
  return {
    team: 'Ohio State',
    season: 2025,
    conference: 'Big Ten',
    games: 13,
    ats_wins: 8,
    ats_losses: 4,
    ats_pushes: 1,
    avg_cover_margin: 2.3,
    ats_win_pct: 0.667,
    ...overrides,
  }
}

describe('AtsCard', () => {
  it('renders ATS record, cover rate, and average cover margin', () => {
    render(<AtsCard ats={atsRow()} />)

    expect(screen.getByText('Against the Spread')).toBeInTheDocument()
    expect(screen.getByText('8-4-1')).toBeInTheDocument() // ATS record
    expect(screen.getByText('66.7%')).toBeInTheDocument() // Cover rate (0.667 -> 66.7%)
    expect(screen.getByText('+2.3')).toBeInTheDocument() // Avg cover margin
  })

  it('colors a positive average cover margin with the positive token', () => {
    render(<AtsCard ats={atsRow({ avg_cover_margin: 1.5 })} />)

    const margin = screen.getByText('+1.5')
    expect(margin).toBeInTheDocument()
    expect(margin.className).toContain('color-positive')
  })

  it('colors a negative average cover margin with the negative token', () => {
    render(<AtsCard ats={atsRow({ avg_cover_margin: -2.1 })} />)

    const margin = screen.getByText('-2.1')
    expect(margin).toBeInTheDocument()
    expect(margin.className).toContain('color-negative')
  })

  it('colors a zero average cover margin as neutral', () => {
    render(<AtsCard ats={atsRow({ avg_cover_margin: 0 })} />)

    const margin = screen.getByText('+0.0')
    expect(margin).toBeInTheDocument()
    expect(margin.className).not.toContain('color-positive')
    expect(margin.className).not.toContain('color-negative')
  })

  it('renders dashes when ats_win_pct or avg_cover_margin is null', () => {
    render(<AtsCard ats={atsRow({ ats_win_pct: null, avg_cover_margin: null })} />)

    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })

  it('renders null when ats is null', () => {
    const { container } = render(<AtsCard ats={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders null when games is 0', () => {
    const { container } = render(<AtsCard ats={atsRow({ games: 0 })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders null when games is null', () => {
    const atsWithNullGames: TeamAts = { ...atsRow(), games: null as unknown as number }
    const { container } = render(<AtsCard ats={atsWithNullGames} />)
    expect(container).toBeEmptyDOMElement()
  })
})
