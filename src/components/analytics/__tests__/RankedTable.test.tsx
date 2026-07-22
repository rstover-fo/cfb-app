import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RankedTable } from '../RankedTable'

const data = [
  {
    rank: 1,
    team: 'Oklahoma',
    logo: null,
    color: '#841617',
    compositeScore: 92.5,
    offenseScore: 88.2,
    defenseScore: 90.1,
    specialTeamsScore: 75.4,
    conference: 'SEC',
    offRank: 3,
    defRank: 5,
    stRank: 20,
    sosRank: 10,
    compositeRank: 1,
    wins: 10,
    losses: 1,
    confWins: 7,
    confLosses: 1,
  },
  {
    rank: 2,
    team: 'Houston',
    logo: null,
    color: '#C8102E',
    compositeScore: 80.1,
    offenseScore: 70.0,
    defenseScore: 65.0,
    conference: 'Big 12',
    wins: 8,
    losses: 4,
    confWins: 5,
    confLosses: 3,
  },
]

describe('RankedTable', () => {
  it('renders a sortable table of ranked teams', () => {
    render(<RankedTable data={data} />)

    expect(screen.getByRole('table', { name: 'Composite Rankings' })).toBeInTheDocument()
    expect(screen.getByText('Oklahoma')).toBeInTheDocument()
    expect(screen.getByText('Houston')).toBeInTheDocument()
    expect(screen.getByText('92.50')).toBeInTheDocument()
  })

  it('uses tabular-nums numerals instead of font-mono', () => {
    const { container } = render(<RankedTable data={data} />)
    expect(container.querySelectorAll('.font-mono').length).toBe(0)
    expect(container.querySelectorAll('.tabular-nums').length).toBeGreaterThan(0)
  })

  it('never references the retired token names', () => {
    const { container } = render(<RankedTable data={data} />)
    expect(container.innerHTML).not.toMatch(/--text-tertiary/)
    expect(container.innerHTML).not.toMatch(/--bg-tertiary/)
    expect(container.innerHTML).not.toMatch(/--bg-hover/)
    expect(container.innerHTML).not.toMatch(/--color-accent/)
  })

  it('shows an em dash for teams missing a record', () => {
    const noRecord = [{ ...data[0], wins: null, losses: null }]
    render(<RankedTable data={noRecord} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
