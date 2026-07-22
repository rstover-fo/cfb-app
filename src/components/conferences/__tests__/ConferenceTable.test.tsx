import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ConferenceTable } from '../ConferenceTable'
import {
  createConferenceComparisonRow,
  createConferenceComparisonRows,
} from '@/lib/queries/__tests__/fixtures/conferences'

function getBodyRows() {
  return screen.getAllByRole('row').slice(1)
}

describe('ConferenceTable', () => {
  it('renders one row per conference with formatted stat columns', () => {
    render(<ConferenceTable rows={createConferenceComparisonRows()} />)

    const rows = getBodyRows()
    expect(rows).toHaveLength(3)

    const secRow = rows[0]
    expect(within(secRow).getByText('SEC')).toBeInTheDocument()
    expect(within(secRow).getByText('16')).toBeInTheDocument()
    expect(within(secRow).getByText('8.4')).toBeInTheDocument() // avg_wins
    expect(within(secRow).getByText('15.2')).toBeInTheDocument() // avg_sp_rating
    expect(within(secRow).getByText('0.118')).toBeInTheDocument() // avg_epa_per_play
    expect(within(secRow).getByText('18th')).toBeInTheDocument() // avg_recruiting_rank formatRank(18.3 -> 18)
    expect(within(secRow).getByText('71.2%')).toBeInTheDocument() // non_conf_win_pct
  })

  it('bolds the top value per column -- highest SP+/wins/EPA/non-conf win%, lowest (best) recruiting rank', () => {
    render(<ConferenceTable rows={createConferenceComparisonRows()} />)

    const rows = getBodyRows()
    const secRow = rows[0]

    // SEC leads every column in the fixture -- its cells should carry the
    // emphasis class, Big Ten/Big 12's should not.
    const secSp = within(secRow).getByText('15.2')
    expect(secSp.className).toContain('font-semibold')

    const bigTenRow = rows[1]
    const bigTenSp = within(bigTenRow).getByText('13.6')
    expect(bigTenSp.className).not.toContain('font-semibold')
  })

  it('renders em dashes for null stat values', () => {
    render(
      <ConferenceTable
        rows={[
          createConferenceComparisonRow({
            conference: 'Independent',
            avg_wins: null,
            avg_sp_rating: null,
            avg_epa_per_play: null,
            avg_recruiting_rank: null,
            non_conf_win_pct: null,
          }),
        ]}
      />
    )

    const row = getBodyRows()[0]
    expect(within(row).getAllByText('—')).toHaveLength(5)
  })
})
