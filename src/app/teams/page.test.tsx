import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamsPage from './page'

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

vi.mock('@/components/TeamList', () => ({
  TeamList: ({ teams }: { teams: unknown[] }) => (
    <div data-testid="team-list">{teams.length} teams</div>
  ),
}))

describe('Teams page', () => {
  it('renders the Teams heading', async () => {
    const jsx = await TeamsPage()
    render(jsx)
    expect(screen.getByText('Teams')).toBeInTheDocument()
  })
})
