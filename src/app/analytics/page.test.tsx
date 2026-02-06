import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AnalyticsPage from './page'

// Chainable query builder
function chainable(data: unknown = []) {
  const builder: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'neq', 'in', 'not', 'or', 'order', 'limit', 'range', 'lte', 'gte']
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder.single = vi.fn().mockResolvedValue({ data: null, error: null })
  builder.then = (resolve: (v: unknown) => void) => resolve({ data, error: null })
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue(chainable()),
  }),
}))

vi.mock('@/components/analytics/ScatterPlotClient', () => ({
  ScatterPlotClient: () => <div data-testid="scatter-plot">Scatter Plot</div>,
}))

describe('Analytics page', () => {
  it('renders the Team Analytics heading', async () => {
    const jsx = await AnalyticsPage()
    render(jsx)
    expect(screen.getByText('Team Analytics')).toBeInTheDocument()
  })

  it('renders the season subtitle', async () => {
    const jsx = await AnalyticsPage()
    render(jsx)
    expect(screen.getByText(/2025 Season/)).toBeInTheDocument()
  })
})
