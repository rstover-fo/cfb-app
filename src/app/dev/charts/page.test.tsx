/**
 * Smoke test for the dev chart gallery: every chart renders data-full (no
 * network), so there should be a large number of labeled chart images and
 * zero empty-state announcements anywhere on the page.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import DevChartsPage from './page'

// ScatterPlot (Analytics section) calls useRouter for its team-drilldown
// click handler -- same mock precedent as ScatterPlot.test.tsx.
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
})

describe('DevChartsPage', () => {
  it('renders the chart gallery', () => {
    render(<DevChartsPage />)
    expect(screen.getByText('Chart Gallery')).toBeInTheDocument()
  })

  it('renders at least 25 labeled chart images (data-full fixtures, every ChartFrame chart)', () => {
    render(<DevChartsPage />)
    const charts = screen.getAllByRole('img')
    expect(charts.length).toBeGreaterThanOrEqual(25)
  })

  it('renders no EmptyState anywhere -- the gallery is the data-full case', () => {
    render(<DevChartsPage />)
    expect(screen.queryAllByRole('status')).toHaveLength(0)
  })

  it('renders every section heading', () => {
    render(<DevChartsPage />)
    for (const heading of ['Team', 'Game', 'Players', 'Analytics', 'Rankings', 'Primitives']) {
      expect(screen.getByRole('heading', { name: heading, level: 2 })).toBeInTheDocument()
    }
  })
})
