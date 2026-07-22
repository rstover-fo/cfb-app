/**
 * Unit tests for LineMovementChart's rendering paths:
 *  - full chart: >= 2 plottable snapshots draw the rough time-series SVG
 *  - single snapshot: compact "line opened at ..." text row, no SVG
 *  - empty (or all-null-spread) input: framed EmptyState (spec §5) -- the
 *    game page renders this component when a prediction exists even with
 *    no snapshots, so the empty path must be designed, not blank
 *  - modelMargin sign reconciliation: market spread is home-relative
 *    (negative = home favored) while expected_home_margin is positive when
 *    home is favored, so the dashed reference plots at -modelMargin
 *  - theme flip re-runs the rough draw (colors are baked in at draw time)
 *
 * Fixture shapes mirror api.line_movement via
 * src/lib/queries/__tests__/fixtures/predictions.ts.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { LineMovementChart } from '../LineMovementChart'
import {
  createLineMovementRow,
  createLineMovementRows,
} from '@/lib/queries/__tests__/fixtures/predictions'

const HOME = 'Ohio State'
const AWAY = 'Michigan'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

describe('LineMovementChart', () => {
  it('renders the SVG chart with the 3-snapshot fixture series', () => {
    render(<LineMovementChart points={createLineMovementRows()} homeTeam={HOME} awayTeam={AWAY} />)

    const svg = screen.getByRole('img', { name: `Spread movement for ${AWAY} at ${HOME}` })
    expect(svg).toBeInTheDocument()
    // Single provider: named in the footer, but no multi-series legend needed.
    expect(screen.getByText('DraftKings')).toBeInTheDocument()
    // O/U shown as a muted first-to-last caption, not a second axis.
    expect(screen.getByText('O/U 44.5 → 45')).toBeInTheDocument()
  })

  it('renders one legend entry per provider when multiple providers are present', () => {
    const points = [
      ...createLineMovementRows(),
      createLineMovementRow({
        captured_at: '2025-11-24T09:00:00+00:00', provider: 'Bovada', spread: -2,
        formatted_spread: 'Ohio State -2',
      }),
      createLineMovementRow({
        captured_at: '2025-11-28T09:00:00+00:00', provider: 'Bovada', spread: -3.5,
        formatted_spread: 'Ohio State -3.5',
      }),
    ]

    render(<LineMovementChart points={points} homeTeam={HOME} awayTeam={AWAY} />)

    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.getByText('DraftKings')).toBeInTheDocument()
    expect(screen.getByText('Bovada')).toBeInTheDocument()
  })

  it('renders a compact "line opened at" text row (no SVG) for a single snapshot', () => {
    render(
      <LineMovementChart points={[createLineMovementRow()]} homeTeam={HOME} awayTeam={AWAY} />
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(/Line opened at/)).toBeInTheDocument()
    expect(screen.getByText('Ohio State -1.5')).toBeInTheDocument()
  })

  it('renders a framed EmptyState with no rows', () => {
    render(<LineMovementChart points={[]} homeTeam={HOME} awayTeam={AWAY} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No line movement to chart')
  })

  it('renders a framed EmptyState when every row has a null spread', () => {
    const points = [
      createLineMovementRow({ spread: null, formatted_spread: null }),
      createLineMovementRow({ captured_at: '2025-11-26T08:00:00+00:00', spread: null, formatted_spread: null }),
    ]
    render(<LineMovementChart points={points} homeTeam={HOME} awayTeam={AWAY} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No line movement to chart')
  })

  it('plots the model reference at -modelMargin (sign reconciliation onto the spread axis)', () => {
    // expected_home_margin = +4 (home favored by 4) must land at -4 on the
    // home-relative spread axis, alongside the fixture's -1.5..-3 series.
    render(
      <LineMovementChart
        points={createLineMovementRows()}
        homeTeam={HOME}
        awayTeam={AWAY}
        modelMargin={4}
      />
    )

    const refLine = screen.getByTestId('model-margin-line')
    expect(refLine).toHaveAttribute('data-spread-value', '-4')
    // Horizontal reference line, labeled with the reconciled (negative) value.
    expect(refLine.getAttribute('y1')).toBe(refLine.getAttribute('y2'))
    expect(screen.getByText('Model -4')).toBeInTheDocument()
  })

  it('omits the model reference line when modelMargin is null', () => {
    render(
      <LineMovementChart
        points={createLineMovementRows()}
        homeTeam={HOME}
        awayTeam={AWAY}
        modelMargin={null}
      />
    )
    expect(screen.queryByTestId('model-margin-line')).not.toBeInTheDocument()
  })

  it('re-draws the rough layer when the document theme flips', async () => {
    render(<LineMovementChart points={createLineMovementRows()} homeTeam={HOME} awayTeam={AWAY} />)

    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childNodes.length).toBeGreaterThan(0)

    // Plant a sentinel: a redraw clears the group, so the sentinel vanishing
    // proves drawChart re-ran after the theme mutation.
    const sentinel = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    sentinel.setAttribute('data-testid', 'redraw-sentinel')
    roughLayer.appendChild(sentinel)

    document.documentElement.setAttribute('data-theme', 'dark')

    await waitFor(() => {
      expect(roughLayer.contains(sentinel)).toBe(false)
    })
    expect(roughLayer.childNodes.length).toBeGreaterThan(0)
  })
})
