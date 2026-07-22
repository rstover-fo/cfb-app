/**
 * Unit tests for AdjustedEpaChart. Fixture rows come from the shared
 * query-layer fixtures mirroring api.team_week_features.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdjustedEpaChart } from '../AdjustedEpaChart'
import { createTeamWeekFeatureRows, createTeamWeekFeatureRow } from '@/lib/queries/__tests__/fixtures/playcalling'

describe('AdjustedEpaChart', () => {
  it('renders an accessible svg chart with both series and a legend', () => {
    render(<AdjustedEpaChart features={createTeamWeekFeatureRows()} teamName="Ohio State" />)

    const svg = screen.getByRole('img', { name: /Raw and opponent-adjusted offensive EPA per play by week for Ohio State/ })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    // Legend: two labeled strokes
    expect(screen.getByText('Raw')).toBeInTheDocument()
    expect(screen.getByText('Opponent-adjusted')).toBeInTheDocument()
  })

  it('draws a zero baseline', () => {
    render(<AdjustedEpaChart features={createTeamWeekFeatureRows()} teamName="Ohio State" />)

    expect(screen.getByTestId('zero-baseline')).toBeInTheDocument()
  })

  it('shows raw, adjusted, and defensive-adjusted values in the hover tooltip', () => {
    const { container } = render(
      <AdjustedEpaChart features={createTeamWeekFeatureRows()} teamName="Ohio State" />
    )

    const hoverRects = container.querySelectorAll('rect[fill="transparent"]')
    expect(hoverRects.length).toBe(4)

    fireEvent.mouseEnter(hoverRects[1])

    expect(screen.getByText('Week 2')).toBeInTheDocument()
    expect(screen.getByText('0.198')).toBeInTheDocument() // raw off_epa_per_play
    expect(screen.getByText('+0.158')).toBeInTheDocument() // adj_epa_off
    expect(screen.getByText('-0.093')).toBeInTheDocument() // adj_epa_def tooltip extra
  })

  it('renders the framed empty state when features are empty', () => {
    render(<AdjustedEpaChart features={[]} teamName="Ohio State" />)

    expect(screen.getByRole('status')).toHaveTextContent('No adjusted EPA data yet')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders the framed empty state when no week has either EPA series', () => {
    const features = [
      createTeamWeekFeatureRow({ week_index: 1, adj_epa_off: null, off_epa_per_play: null }),
      createTeamWeekFeatureRow({ week_index: 2, adj_epa_off: null, off_epa_per_play: null }),
    ]
    render(<AdjustedEpaChart features={features} teamName="Ohio State" />)

    expect(screen.getByRole('status')).toHaveTextContent('No adjusted EPA data yet')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
