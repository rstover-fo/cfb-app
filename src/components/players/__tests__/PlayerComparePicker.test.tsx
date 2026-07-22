/**
 * Regression tests for PlayerComparePicker's stale-search invalidation:
 * clearing the query below two characters while a search is in flight must
 * invalidate that request so its late response can't reopen the results
 * dropdown for the obsolete query.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const fetchSearchPlayers = vi.fn()

vi.mock('@/app/players/actions', () => ({
  fetchSearchPlayers: (...args: unknown[]) => fetchSearchPlayers(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/players/compare',
  useSearchParams: () => new URLSearchParams(),
}))

import { PlayerComparePicker } from '../PlayerComparePicker'

const RESULT = {
  player_id: 'athlete-1',
  name: 'Caleb Downs',
  team: 'Ohio State',
  position: 'S',
  season: 2025,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PlayerComparePicker stale-search invalidation', () => {
  it('ignores an in-flight response after the query is cleared below two characters', async () => {
    let resolveSearch: (value: unknown) => void = () => {}
    fetchSearchPlayers.mockImplementation(
      () => new Promise((resolve) => { resolveSearch = resolve })
    )

    render(<PlayerComparePicker slot="p1" label="Player One" selected={null} />)
    const input = screen.getByRole('combobox')

    // Type a valid query and let the debounce fire the (pending) search.
    fireEvent.change(input, { target: { value: 'Caleb' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(fetchSearchPlayers).toHaveBeenCalledTimes(1)

    // Clear below two characters before the response arrives.
    fireEvent.change(input, { target: { value: '' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    // Now the stale response lands -- it must not reopen results.
    await act(async () => { resolveSearch([RESULT]) })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Caleb Downs')).not.toBeInTheDocument()
  })

  it('still shows results for a search that is not superseded', async () => {
    fetchSearchPlayers.mockResolvedValue([RESULT])

    render(<PlayerComparePicker slot="p1" label="Player One" selected={null} />)
    const input = screen.getByRole('combobox')

    fireEvent.change(input, { target: { value: 'Caleb' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('Caleb Downs')).toBeInTheDocument()
  })
})
