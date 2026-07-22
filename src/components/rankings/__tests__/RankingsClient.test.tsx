/**
 * Smoke tests for RankingsClient's poll/season/week filters migration from
 * native <select> to shadcn Select.
 *
 * Radix's Select opens/selects on pointerdown -- see EdgeBoardTable.test.tsx
 * for the same pattern.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RankingsClient } from '../RankingsClient'

const fetchRankingsForWeek = vi.fn()
const fetchRankingsAllWeeks = vi.fn()
const fetchAvailablePolls = vi.fn()
const fetchLatestRankingWeek = vi.fn()

vi.mock('@/app/rankings/actions', () => ({
  fetchRankingsForWeek: (...args: unknown[]) => fetchRankingsForWeek(...args),
  fetchRankingsAllWeeks: (...args: unknown[]) => fetchRankingsAllWeeks(...args),
  fetchAvailablePolls: (...args: unknown[]) => fetchAvailablePolls(...args),
  fetchLatestRankingWeek: (...args: unknown[]) => fetchLatestRankingWeek(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

function openSelect(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
}

function chooseOption(name: string) {
  fireEvent.click(screen.getByRole('option', { name }))
}

const defaultProps = {
  initialRankings: [],
  // RankingsClient derives its available weeks (and the week Select's
  // options) from initialAllWeeks, not a separate prop.
  initialAllWeeks: [
    { week: 4, rankings: [] },
    { week: 5, rankings: [] },
  ],
  initialPoll: 'AP Top 25',
  initialSeason: 2025,
  initialWeek: 5,
  availablePolls: ['AP Top 25', 'Coaches Poll'],
  availableSeasons: [2025, 2024],
}

describe('RankingsClient', () => {
  it('renders the poll, season, and week selects with their current values', () => {
    render(<RankingsClient {...defaultProps} />)

    expect(screen.getByLabelText('Select poll')).toHaveTextContent('AP Top 25')
    expect(screen.getByLabelText('Select season')).toHaveTextContent('2025')
    expect(screen.getByLabelText('Select week')).toHaveTextContent('Week 5')
  })

  it('refetches rankings via the server action when the poll changes', async () => {
    fetchLatestRankingWeek.mockResolvedValue(6)
    fetchRankingsForWeek.mockResolvedValue([])
    fetchRankingsAllWeeks.mockResolvedValue([])

    render(<RankingsClient {...defaultProps} />)

    openSelect(screen.getByLabelText('Select poll'))
    chooseOption('Coaches Poll')

    expect(await screen.findByLabelText('Select poll')).toHaveTextContent('Coaches Poll')
    expect(fetchLatestRankingWeek).toHaveBeenCalledWith(2025, 'Coaches Poll')
  })
})
