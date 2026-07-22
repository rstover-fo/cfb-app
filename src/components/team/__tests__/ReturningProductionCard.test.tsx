/**
 * Unit tests for ReturningProductionCard. Fixture shapes mirror the
 * query-layer type from src/lib/queries/roster-context.ts (ReturningProduction).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReturningProductionCard } from '../ReturningProductionCard'
import type { ReturningProduction } from '@/lib/queries/roster-context'

function productionRow(overrides: Partial<ReturningProduction> = {}): ReturningProduction {
  return {
    team: 'Ohio State',
    season: 2025,
    conference: 'Big Ten',
    total_ppa: 142.7,
    total_passing_ppa: 61.2,
    total_receiving_ppa: 48.9,
    total_rushing_ppa: 32.6,
    returning_ppa_pct: 0.612,
    returning_passing_ppa_pct: 0.548,
    returning_receiving_ppa_pct: 0.671,
    returning_rushing_ppa_pct: 0.593,
    usage: 0.588,
    passing_usage: 0.521,
    receiving_usage: 0.634,
    rushing_usage: 0.577,
    returning_rank: 34,
    ...overrides,
  }
}

describe('ReturningProductionCard', () => {
  it('renders headline returning PPA share, FBS rank, and pass/rush/receiving splits', () => {
    render(<ReturningProductionCard production={productionRow()} />)

    expect(screen.getByText('Returning Production')).toBeInTheDocument()
    expect(screen.getByText('61.2%')).toBeInTheDocument() // returning_ppa_pct headline
    expect(screen.getByText('#34 in FBS')).toBeInTheDocument()

    expect(screen.getByText('Passing')).toBeInTheDocument()
    expect(screen.getByText('54.8%')).toBeInTheDocument()
    expect(screen.getByText('Rushing')).toBeInTheDocument()
    expect(screen.getByText('59.3%')).toBeInTheDocument()
    expect(screen.getByText('Receiving')).toBeInTheDocument()
    expect(screen.getByText('67.1%')).toBeInTheDocument()
  })

  it('omits the FBS rank line when returning_rank is null', () => {
    render(<ReturningProductionCard production={productionRow({ returning_rank: null })} />)

    expect(screen.queryByText(/in FBS/)).not.toBeInTheDocument()
  })

  it('shows a dash headline when returning_ppa_pct is null', () => {
    render(<ReturningProductionCard production={productionRow({ returning_ppa_pct: null })} />)

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('omits a split row entirely when that split is null', () => {
    render(<ReturningProductionCard production={productionRow({ returning_passing_ppa_pct: null })} />)

    expect(screen.queryByText('Passing')).not.toBeInTheDocument()
    expect(screen.getByText('Rushing')).toBeInTheDocument()
  })

  it('renders null when production is null (offseason build has not run yet)', () => {
    const { container } = render(<ReturningProductionCard production={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
