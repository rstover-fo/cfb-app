import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PlayersComparePage from './page'

vi.mock('@/components/players/ComparePlayersSection', () => ({
  ComparePlayersSection: ({ p1, p2 }: { p1?: string; p2?: string }) => (
    <div data-testid="compare-players-section" data-p1={p1 ?? ''} data-p2={p2 ?? ''}>
      Player Comparison
    </div>
  ),
}))
vi.mock('@/components/dashboard/WidgetSkeleton', () => ({
  WidgetSkeleton: ({ title }: { title: string }) => <div>{title} Loading...</div>,
}))

describe('Players compare page', () => {
  it('renders the Compare Players heading', async () => {
    const jsx = await PlayersComparePage({ searchParams: Promise.resolve({}) })
    render(jsx)
    expect(screen.getByText('Compare Players')).toBeInTheDocument()
  })

  it('renders the picker section without ids', async () => {
    const jsx = await PlayersComparePage({ searchParams: Promise.resolve({}) })
    render(jsx)
    const section = screen.getByTestId('compare-players-section')
    expect(section).toHaveAttribute('data-p1', '')
    expect(section).toHaveAttribute('data-p2', '')
  })

  it('forwards both player ids to the section', async () => {
    const jsx = await PlayersComparePage({
      searchParams: Promise.resolve({ p1: 'athlete-1', p2: 'athlete-2' }),
    })
    render(jsx)
    const section = screen.getByTestId('compare-players-section')
    expect(section).toHaveAttribute('data-p1', 'athlete-1')
    expect(section).toHaveAttribute('data-p2', 'athlete-2')
  })
})
