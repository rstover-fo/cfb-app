/**
 * Smoke test for EmptyState after switching its className merge to cn()
 * (clsx + tailwind-merge) -- verifies the base layout classes and a caller's
 * override className are both present, and dedup doesn't drop content.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CalendarBlank } from '@phosphor-icons/react'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  it('renders title, description, and a status role for assistive tech', () => {
    render(
      <EmptyState
        icon={CalendarBlank}
        title="No games found"
        description="There are no games recorded for this week yet."
      />
    )

    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
    expect(screen.getByText('No games found')).toBeInTheDocument()
    expect(screen.getByText('There are no games recorded for this week yet.')).toBeInTheDocument()
  })

  it('merges a caller-supplied className with the base layout classes', () => {
    render(<EmptyState icon={CalendarBlank} title="Empty" className="mt-8" />)

    const status = screen.getByRole('status')
    expect(status.className).toContain('mt-8')
    expect(status.className).toContain('flex-col')
  })

  it('invokes the action and secondary action callbacks', () => {
    const onAction = vi.fn()
    const onSecondary = vi.fn()

    render(
      <EmptyState
        icon={CalendarBlank}
        title="Empty"
        action={{ label: 'Clear filters', onClick: onAction }}
        secondaryAction={{ label: 'View all weeks', onClick: onSecondary }}
      />
    )

    screen.getByText('Clear filters').click()
    screen.getByText('View all weeks').click()

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onSecondary).toHaveBeenCalledTimes(1)
  })
})
