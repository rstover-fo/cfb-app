import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Home from './page'

// Mock all async dashboard widgets with simple div stubs
vi.mock('@/components/dashboard/TopMoversWidget', () => ({
  TopMoversWidget: () => <div data-testid="top-movers">Top Movers</div>,
}))
vi.mock('@/components/dashboard/RecentGamesWidget', () => ({
  RecentGamesWidget: () => <div data-testid="recent-games">Recent Games</div>,
}))
vi.mock('@/components/dashboard/StandingsWidget', () => ({
  StandingsWidget: () => <div data-testid="standings">Standings</div>,
}))
vi.mock('@/components/dashboard/StatLeadersWidget', () => ({
  StatLeadersWidget: () => <div data-testid="stat-leaders">Stat Leaders</div>,
}))
vi.mock('@/components/dashboard/WidgetSkeleton', () => ({
  WidgetSkeleton: ({ title }: { title: string }) => <div>{title} Loading...</div>,
}))

describe('Home page', () => {
  it('renders the dashboard heading', () => {
    render(<Home />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('renders the subtitle', () => {
    render(<Home />)
    expect(screen.getByText('College football analytics at a glance')).toBeInTheDocument()
  })
})
