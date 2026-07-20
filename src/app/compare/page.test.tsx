import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ComparePage from './page'

vi.mock('@/components/comparison/CompareTeamsSection', () => ({
  CompareTeamsSection: () => <div data-testid="compare-teams-section">Head to Head</div>,
}))
vi.mock('@/components/comparison/CompareHistorySection', () => ({
  CompareHistorySection: () => <div data-testid="compare-history-section">Compare History</div>,
}))
vi.mock('@/components/dashboard/WidgetSkeleton', () => ({
  WidgetSkeleton: ({ title }: { title: string }) => <div>{title} Loading...</div>,
}))
vi.mock('@/lib/queries/constants', () => ({
  CURRENT_SEASON: 2025,
}))

describe('Compare page', () => {
  it('renders the Compare Teams heading', async () => {
    const jsx = await ComparePage({ searchParams: Promise.resolve({}) })
    render(jsx)
    expect(screen.getByText('Compare Teams')).toBeInTheDocument()
  })

  it('renders the season subtitle', async () => {
    const jsx = await ComparePage({ searchParams: Promise.resolve({}) })
    render(jsx)
    expect(screen.getByText(/2025 Season/)).toBeInTheDocument()
  })

  it('renders both the head-to-head and history sections', async () => {
    const jsx = await ComparePage({ searchParams: Promise.resolve({ t1: 'oklahoma', t2: 'texas' }) })
    render(jsx)
    expect(screen.getByTestId('compare-teams-section')).toBeInTheDocument()
    expect(screen.getByTestId('compare-history-section')).toBeInTheDocument()
  })
})
