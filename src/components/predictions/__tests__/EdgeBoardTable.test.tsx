import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { EdgeBoardTable } from '../EdgeBoardTable'
import {
  createScoredMatchupEdgeRow,
  createScoredMatchupEdgeRows,
  createScoredMatchupEdgeRowNoMarket,
} from '@/lib/queries/__tests__/fixtures/predictions'

const fetchScoredMatchupEdges = vi.fn()

vi.mock('@/app/predictions/actions', () => ({
  fetchScoredMatchupEdges: (...args: unknown[]) => fetchScoredMatchupEdges(...args),
}))

function getBodyRows() {
  return screen.getAllByRole('row').slice(1)
}

const defaultProps = {
  season: 2025,
  availableWeeks: [13, 14],
  defaultModelVersion: 'elo_epa_blend_v1' as const,
}

describe('EdgeBoardTable', () => {
  it('renders a row per edge with matchup link, model margin, market, edge badge, pick, and win prob', () => {
    render(<EdgeBoardTable {...defaultProps} initialEdges={createScoredMatchupEdgeRows()} />)

    const rows = getBodyRows()
    expect(rows).toHaveLength(2)

    const scoredRow = rows[0]
    expect(within(scoredRow).getByText('Michigan @ Ohio State')).toBeInTheDocument()
    const link = within(scoredRow).getByText('Michigan @ Ohio State').closest('a')
    expect(link).toHaveAttribute('href', '/games/401752873')

    // expected_home_margin 4.0 => "Ohio State by 4"
    expect(within(scoredRow).getByText('Ohio State by 4')).toBeInTheDocument()
    // market_spread -2.5 => "Ohio State -2.5", provider DraftKings
    expect(within(scoredRow).getByText('Ohio State -2.5')).toBeInTheDocument()
    expect(within(scoredRow).getByText('DraftKings')).toBeInTheDocument()
    // signed edge 1.5 => "+1.5"
    expect(within(scoredRow).getByText('+1.5')).toBeInTheDocument()
    // edge_pick 'home' => Ohio State
    expect(within(scoredRow).getByText('Ohio State')).toBeInTheDocument()
    // home_win_prob 0.62 => "Ohio State 62%"
    expect(within(scoredRow).getByText('Ohio State 62%')).toBeInTheDocument()
  })

  it('renders em dashes for market, edge, and pick on a null-market row, while still showing model margin and win prob', () => {
    render(
      <EdgeBoardTable
        {...defaultProps}
        initialEdges={[createScoredMatchupEdgeRowNoMarket()]}
      />
    )

    const row = getBodyRows()[0]
    expect(within(row).getByText('Air Force @ Boise State')).toBeInTheDocument()
    // Three "—" cells: market, edge, pick
    expect(within(row).getAllByText('—')).toHaveLength(3)
    // expected_home_margin 5.2 => "Boise State by 5.2" (model margin unaffected by null market)
    expect(within(row).getByText('Boise State by 5.2')).toBeInTheDocument()
    // No pick -> win prob falls back to home team's perspective: "Boise State 71%"
    expect(within(row).getByText('Boise State 71%')).toBeInTheDocument()
  })

  it('shows the negative-side edge with the positive token, never the negative token', () => {
    render(
      <EdgeBoardTable
        {...defaultProps}
        initialEdges={[
          createScoredMatchupEdgeRow({
            edge_pick: 'away',
            edge: -1.5,
            abs_edge: 1.5,
            market_spread: 2.5,
          }),
        ]}
      />
    )

    const badge = screen.getByText('-1.5')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('color-positive')
    expect(badge.className).not.toContain('color-negative')
  })

  it('renders the designed off-season empty state when the slate is empty, keeping filters visible', () => {
    render(<EdgeBoardTable {...defaultProps} initialEdges={[]} />)

    expect(
      screen.getByText('Lines are off the board — edges return in season.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Filter by week')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by model version')).toBeInTheDocument()
  })

  // Radix's Select opens/selects on pointerdown, and @testing-library/user-event
  // isn't installed in this project (see TeamPageClient.tabs.test.tsx's Tabs
  // precedent) -- so we drive it with plain pointer/mouse events too.
  function openSelect(trigger: HTMLElement) {
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  }

  function chooseOption(name: string) {
    const option = screen.getByRole('option', { name })
    // Item selection fires on click when the item's own pointer-type ref is
    // still its "touch" default (never having received a mouse pointerdown
    // on the item itself) -- see @radix-ui/react-select's SelectItem.
    fireEvent.click(option)
  }

  it('refetches via the server action when the week filter changes', async () => {
    fetchScoredMatchupEdges.mockResolvedValue([createScoredMatchupEdgeRowNoMarket({ week: 13 })])

    render(<EdgeBoardTable {...defaultProps} initialEdges={createScoredMatchupEdgeRows()} />)

    openSelect(screen.getByLabelText('Filter by week'))
    chooseOption('Week 13')

    expect(fetchScoredMatchupEdges).toHaveBeenCalledWith(2025, 13, 'elo_epa_blend_v1')
    expect(await screen.findByText('Air Force @ Boise State')).toBeInTheDocument()
  })

  it('refetches via the server action when the model filter changes', async () => {
    fetchScoredMatchupEdges.mockResolvedValue(createScoredMatchupEdgeRows())

    render(<EdgeBoardTable {...defaultProps} initialEdges={createScoredMatchupEdgeRows()} />)

    openSelect(screen.getByLabelText('Filter by model version'))
    chooseOption('Elo (v1)')

    await screen.findByText('Michigan @ Ohio State')
    expect(fetchScoredMatchupEdges).toHaveBeenCalledWith(2025, undefined, 'elo_v1')
  })
})
