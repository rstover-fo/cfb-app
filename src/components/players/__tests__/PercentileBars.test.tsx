/**
 * Unit tests for PercentileBars' rendering paths:
 *  - mirrored rows: one row per position-relevant stat, player 1 left /
 *    player 2 right, raw values + ordinal percentile tip labels
 *  - position-group filtering: QB pairing shows the passing set only; a
 *    mixed QB-vs-RB pairing shows the union of both sets
 *  - null handling: both-null rows are skipped entirely; one-null rows are
 *    single-sided with a muted "no data" note on the empty side
 *  - designed empty state when no row survives filtering
 *  - theme flip re-runs the rough draw (colors are baked in at draw time)
 *
 * Fixture shapes mirror api.player_comparison via
 * src/lib/queries/__tests__/fixtures/players.ts.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PercentileBars } from '../PercentileBars'
import { createPlayerComparisonRow } from '@/lib/queries/__tests__/fixtures/players'
import type { PlayerComparisonRow } from '@/lib/queries/players'

// Default fixture is a QB. Second QB for the happy-path pairing.
const QB1 = createPlayerComparisonRow()
const QB2 = createPlayerComparisonRow({
  player_id: 'athlete-2',
  name: 'Arch Manning',
  team: 'Texas',
  pass_yds: 2954,
  pass_td: 27,
  pass_pct: 0.671,
  ppa_avg: 0.312,
  pass_yds_pctl: 0.79,
  pass_td_pctl: 0.86,
  pass_pct_pctl: 0.82,
  ppa_avg_pctl: 0.93,
})

function createRbRow(overrides: Partial<PlayerComparisonRow> = {}): PlayerComparisonRow {
  return createPlayerComparisonRow({
    player_id: 'athlete-4',
    name: 'Kaytron Allen',
    team: 'Penn State',
    position: 'RB',
    position_group: 'RB',
    pass_att: null, pass_cmp: null, pass_yds: null, pass_td: null, pass_int: null, pass_pct: null,
    pass_yds_pctl: null, pass_td_pctl: null, pass_pct_pctl: null,
    rush_car: 220, rush_yds: 1108, rush_td: 12, rush_ypc: 5.0,
    rush_yds_pctl: 0.91, rush_td_pctl: 0.84, rush_ypc_pctl: 0.7,
    rec: 28, rec_yds: 204, rec_td: 1, rec_ypr: 7.3,
    rec_yds_pctl: 0.6, rec_td_pctl: 0.4,
    ppa_avg: 0.19, ppa_avg_pctl: 0.77,
    ...overrides,
  })
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

describe('PercentileBars', () => {
  it('renders one mirrored row per QB-relevant stat with values and ordinal percentiles at the tips', () => {
    render(<PercentileBars player1={QB1} player2={QB2} />)

    const svg = screen.getByRole('img')
    expect(svg).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Jackson Arnold')
    )
    expect(svg).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Arch Manning')
    )

    // QB set: passing stats + PPA/Play, nothing else.
    expect(screen.getByTestId('pctl-row-pass_yds')).toBeInTheDocument()
    expect(screen.getByTestId('pctl-row-pass_td')).toBeInTheDocument()
    expect(screen.getByTestId('pctl-row-pass_pct')).toBeInTheDocument()
    expect(screen.getByTestId('pctl-row-ppa_avg')).toBeInTheDocument()
    expect(screen.queryByTestId('pctl-row-rush_yds')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pctl-row-tackles')).not.toBeInTheDocument()

    // Raw stat values at the bar tips (player 1 left, player 2 right).
    expect(screen.getByText('3,182')).toBeInTheDocument()
    expect(screen.getByText('2,954')).toBeInTheDocument()
    expect(screen.getByText('65.2%')).toBeInTheDocument()
    expect(screen.getByText('67.1%')).toBeInTheDocument()
    // PPA/play follows the house signed three-decimal treatment.
    expect(screen.getByText('+0.287')).toBeInTheDocument()
    expect(screen.getByText('+0.312')).toBeInTheDocument()

    // Ordinal percentile captions under the values.
    expect(screen.getByText('88th pctl')).toBeInTheDocument()
    expect(screen.getByText('79th pctl')).toBeInTheDocument()

    // 50th-percentile reference captions.
    expect(screen.getAllByText('50th pctl')).toHaveLength(2)

    // Rough bars drawn: 2 bars per full row (4 rows). Player names render in
    // the HTML ChartLegend above the SVG, not as in-SVG text or rough swatches.
    const roughLayer = screen.getByTestId('rough-layer')
    expect(roughLayer.childNodes.length).toBe(4 * 2)
    expect(screen.getByText('Jackson Arnold')).toBeInTheDocument()
    expect(screen.getByText('Arch Manning')).toBeInTheDocument()
  })

  it('shows the union of both stat sets for a mixed QB vs RB pairing', () => {
    render(<PercentileBars player1={QB1} player2={createRbRow()} />)

    // Passing rows survive via the QB, rushing/receiving via the RB.
    expect(screen.getByTestId('pctl-row-pass_yds')).toBeInTheDocument()
    expect(screen.getByTestId('pctl-row-rush_yds')).toBeInTheDocument()
    expect(screen.getByTestId('pctl-row-rush_ypc')).toBeInTheDocument()
    expect(screen.getByTestId('pctl-row-rec_yds')).toBeInTheDocument()
    expect(screen.getByTestId('pctl-row-ppa_avg')).toBeInTheDocument()
    // Defense is in neither set.
    expect(screen.queryByTestId('pctl-row-tackles')).not.toBeInTheDocument()
  })

  it('renders single-sided bars with a muted "no data" note when one side has a null percentile', () => {
    // RB has null passing percentiles, QB null receiving percentiles: those
    // union rows are one-sided.
    render(<PercentileBars player1={QB1} player2={createRbRow()} />)

    // 3 passing rows lack an RB side + 2 receiving rows lack a QB side.
    expect(screen.getAllByText('no data')).toHaveLength(5)
    // The populated side of those rows still renders its values.
    expect(screen.getByText('3,182')).toBeInTheDocument()
    expect(screen.getByText('204')).toBeInTheDocument()
  })

  it('skips rows where both percentiles are null', () => {
    // Second QB with a null Comp% percentile on both sides.
    const qb1 = createPlayerComparisonRow({ pass_pct_pctl: null })
    const qb2 = createPlayerComparisonRow({ player_id: 'athlete-2', name: 'Arch Manning', pass_pct_pctl: null })

    render(<PercentileBars player1={qb1} player2={qb2} />)

    expect(screen.queryByTestId('pctl-row-pass_pct')).not.toBeInTheDocument()
    expect(screen.getByTestId('pctl-row-pass_yds')).toBeInTheDocument()
  })

  it('uses the defensive stat set for defender position groups', () => {
    const def1 = createRbRow({
      player_id: 'athlete-7', name: 'Sam Defender', position: 'LB', position_group: 'LB',
      rush_yds_pctl: null, rush_td_pctl: null, rush_ypc_pctl: null,
      rec_yds_pctl: null, rec_td_pctl: null, ppa_avg: null, ppa_avg_pctl: null,
      tackles: 88, sacks: 4.5, tfl: 11.5,
      tackles_pctl: 0.9, sacks_pctl: 0.75, tfl_pctl: 0.85,
    })
    const def2 = createRbRow({
      player_id: 'athlete-8', name: 'Max Backer', position: 'LB', position_group: 'LB',
      rush_yds_pctl: null, rush_td_pctl: null, rush_ypc_pctl: null,
      rec_yds_pctl: null, rec_td_pctl: null, ppa_avg: null, ppa_avg_pctl: null,
      tackles: 71, sacks: 7, tfl: 14,
      tackles_pctl: 0.7, sacks_pctl: 0.92, tfl_pctl: 0.94,
    })

    render(<PercentileBars player1={def1} player2={def2} />)

    expect(screen.getByTestId('pctl-row-tackles')).toBeInTheDocument()
    expect(screen.getByTestId('pctl-row-sacks')).toBeInTheDocument()
    expect(screen.getByTestId('pctl-row-tfl')).toBeInTheDocument()
    // ppa_avg is in the DEF set but null on both sides -- skipped.
    expect(screen.queryByTestId('pctl-row-ppa_avg')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pctl-row-rush_yds')).not.toBeInTheDocument()

    // Sacks/TFL render with one decimal.
    expect(screen.getByText('4.5')).toBeInTheDocument()
    expect(screen.getByText('11.5')).toBeInTheDocument()
  })

  it('renders the designed empty state when no stat has a percentile on either side', () => {
    const empty1 = createPlayerComparisonRow({
      pass_yds_pctl: null, pass_td_pctl: null, pass_pct_pctl: null, ppa_avg_pctl: null,
    })
    const empty2 = createPlayerComparisonRow({
      player_id: 'athlete-2', name: 'Arch Manning',
      pass_yds_pctl: null, pass_td_pctl: null, pass_pct_pctl: null, ppa_avg_pctl: null,
    })

    render(<PercentileBars player1={empty1} player2={empty2} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No percentile data for this pairing')
  })

  it('re-draws the rough layer when the document theme flips', async () => {
    render(<PercentileBars player1={QB1} player2={QB2} />)

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
