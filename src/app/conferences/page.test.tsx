import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import ConferencesPage from './page'
import {
  createConferenceComparisonRows,
  createConferenceHeadToHeadRows,
} from '@/lib/queries/__tests__/fixtures/conferences'

const getConferenceComparison = vi.fn()
const getConferenceHeadToHead = vi.fn()

vi.mock('@/lib/queries/conferences', () => ({
  getConferenceComparison: (...args: unknown[]) => getConferenceComparison(...args),
  getConferenceHeadToHead: (...args: unknown[]) => getConferenceHeadToHead(...args),
}))

describe('Conferences page', () => {
  it('renders the header and the comparison table for the current season', async () => {
    getConferenceComparison.mockResolvedValue(createConferenceComparisonRows())
    getConferenceHeadToHead.mockResolvedValue(createConferenceHeadToHeadRows())

    const jsx = await ConferencesPage()
    render(jsx)

    expect(screen.getByRole('heading', { name: 'Conferences' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    // "SEC" also appears in the head-to-head select's current value, so
    // scope conference-name assertions to the table rows.
    expect(within(rows[0]).getByText('SEC')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Big Ten')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Big 12')).toBeInTheDocument()

    // No fallback-season caption when the current season has data.
    expect(screen.queryByText(/data isn't available yet/)).not.toBeInTheDocument()

    // Head-to-head section renders with the top-two-by-SP+ defaults.
    expect(screen.getByRole('heading', { name: 'Head-to-Head' })).toBeInTheDocument()
    expect(screen.getByLabelText('First conference')).toBeInTheDocument()
    expect(screen.getByLabelText('Second conference')).toBeInTheDocument()
  })

  it('falls back to the previous season when the current season has no computed aggregates yet, and notes it', async () => {
    getConferenceComparison.mockImplementation(async (season: number) =>
      season === 2025 ? [] : createConferenceComparisonRows()
    )
    getConferenceHeadToHead.mockResolvedValue([])

    const jsx = await ConferencesPage()
    render(jsx)

    expect(screen.getByRole('heading', { name: 'Conferences' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText(/Showing 2024/)).toBeInTheDocument()
  })

  it('renders a designed empty state when no season has data', async () => {
    getConferenceComparison.mockResolvedValue([])

    const jsx = await ConferencesPage()
    render(jsx)

    expect(screen.getByRole('heading', { name: 'Conferences' })).toBeInTheDocument()
    expect(
      screen.getByText("Conference aggregates publish with the warehouse's next refresh.")
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Head-to-Head' })).not.toBeInTheDocument()
  })
})
