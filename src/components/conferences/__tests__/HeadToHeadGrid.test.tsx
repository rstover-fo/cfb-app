import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HeadToHeadGrid } from '../HeadToHeadGrid'
import { createConferenceHeadToHeadRows, createConferenceHeadToHeadRow } from '@/lib/queries/__tests__/fixtures/conferences'

const fetchConferenceHeadToHead = vi.fn()

vi.mock('@/app/conferences/actions', () => ({
  fetchConferenceHeadToHead: (...args: unknown[]) => fetchConferenceHeadToHead(...args),
}))

const defaultProps = {
  conferences: ['SEC', 'Big Ten', 'Big 12'],
  defaultConf1: 'SEC',
  defaultConf2: 'Big Ten',
  seasonStart: 2016,
  seasonEnd: 2025,
}

// Radix's Select opens/selects on pointerdown, and @testing-library/user-event
// isn't installed in this project -- see EdgeBoardTable.test.tsx's precedent.
function openSelect(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
}

function chooseOption(name: string) {
  const option = screen.getByRole('option', { name })
  fireEvent.click(option)
}

describe('HeadToHeadGrid', () => {
  it('summarizes the aggregated season-by-season record, leader-first', () => {
    render(<HeadToHeadGrid {...defaultProps} initialRows={createConferenceHeadToHeadRows()} />)

    // Fixture totals: conf1_wins 2+1+3=6, conf2_wins 1+1+1=3, games 3+2+4=9
    expect(screen.getByText('SEC leads 6–3 since 2016.')).toBeInTheDocument()
    expect(screen.getByText('9 games')).toBeInTheDocument()
  })

  it('reports no meetings when the range has zero games', () => {
    render(<HeadToHeadGrid {...defaultProps} initialRows={[]} />)

    expect(screen.getByText('SEC and Big Ten have not met since 2016.')).toBeInTheDocument()
  })

  it('reports a tie when both conferences have equal wins', () => {
    render(
      <HeadToHeadGrid
        {...defaultProps}
        initialRows={[createConferenceHeadToHeadRow({ total_games: 2, conf1_wins: 1, conf2_wins: 1, ties: 0 })]}
      />
    )

    expect(screen.getByText('SEC and Big Ten are tied 1–1 since 2016.')).toBeInTheDocument()
  })

  it('shows the tie count only when there are ties', () => {
    render(
      <HeadToHeadGrid
        {...defaultProps}
        initialRows={[createConferenceHeadToHeadRow({ total_games: 3, conf1_wins: 1, conf2_wins: 1, ties: 1 })]}
      />
    )

    expect(screen.getByText('3 games, 1 tie')).toBeInTheDocument()
  })

  it('refetches via the server action when the first conference changes, excluding the second conference as an option', async () => {
    fetchConferenceHeadToHead.mockResolvedValue([
      createConferenceHeadToHeadRow({ conference_1: 'Big 12', conference_2: 'Big Ten', conf1_wins: 4, conf2_wins: 2, total_games: 6 }),
    ])

    render(<HeadToHeadGrid {...defaultProps} initialRows={createConferenceHeadToHeadRows()} />)

    openSelect(screen.getByLabelText('First conference'))
    expect(screen.getByRole('option', { name: 'Big Ten' })).toHaveAttribute('data-disabled')
    chooseOption('Big 12')

    expect(fetchConferenceHeadToHead).toHaveBeenCalledWith('Big 12', 'Big Ten', 2016, 2025)
    expect(await screen.findByText('Big 12 leads 4–2 since 2016.')).toBeInTheDocument()
  })

  it('refetches via the server action when the second conference changes', async () => {
    fetchConferenceHeadToHead.mockResolvedValue([
      createConferenceHeadToHeadRow({ conference_1: 'SEC', conference_2: 'Big 12', conf1_wins: 5, conf2_wins: 1, total_games: 6 }),
    ])

    render(<HeadToHeadGrid {...defaultProps} initialRows={createConferenceHeadToHeadRows()} />)

    openSelect(screen.getByLabelText('Second conference'))
    chooseOption('Big 12')

    expect(fetchConferenceHeadToHead).toHaveBeenCalledWith('SEC', 'Big 12', 2016, 2025)
    expect(await screen.findByText('SEC leads 5–1 since 2016.')).toBeInTheDocument()
  })
})
