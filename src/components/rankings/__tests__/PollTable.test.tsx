/**
 * Smoke test for PollTable's movement badge after switching off the
 * text-green-600/dark: token drift and the #dc2626 hex fallback onto
 * var(--color-positive)/var(--color-negative).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PollTable } from '../PollTable'
import type { EnrichedPollRanking } from '@/lib/types/database'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

function ranking(overrides: Partial<EnrichedPollRanking> = {}): EnrichedPollRanking {
  return {
    rank: 1,
    school: 'Oklahoma',
    conference: 'SEC',
    first_place_votes: 10,
    points: 1500,
    season: 2025,
    week: 5,
    poll: 'AP Top 25',
    logo: null,
    color: '#841617',
    wins: 5,
    losses: 0,
    prev_rank: 3,
    movement: 2,
    ...overrides,
  }
}

describe('PollTable', () => {
  it('renders the up-movement badge using the positive color token', () => {
    render(<PollTable rankings={[ranking({ movement: 2 })]} poll="AP Top 25" />)

    const badge = screen.getByLabelText('Up 2')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveStyle({ color: 'var(--color-positive)' })
  })

  it('renders the down-movement badge using the negative color token, not a hex fallback', () => {
    render(<PollTable rankings={[ranking({ movement: -3 })]} poll="AP Top 25" />)

    const badge = screen.getByLabelText('Down 3')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveStyle({ color: 'var(--color-negative)' })
  })

  it('renders the empty state when there are no rankings', () => {
    render(<PollTable rankings={[]} poll="AP Top 25" />)

    expect(screen.getByText('No rankings for this week')).toBeInTheDocument()
  })
})
