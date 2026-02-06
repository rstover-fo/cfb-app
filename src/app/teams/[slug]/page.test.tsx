import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamPage from './page'

const mockNotFound = vi.fn()
vi.mock('next/navigation', () => ({
  notFound: () => {
    mockNotFound()
    throw new Error('NEXT_NOT_FOUND')
  },
}))

// Build a chainable query builder that supports arbitrary chaining
function chainable(data: unknown = [], single = false) {
  const resolved = single
    ? { data: Array.isArray(data) ? data[0] ?? null : data, error: null }
    : { data, error: null }

  const builder: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'neq', 'in', 'not', 'or', 'order', 'limit', 'range', 'lte', 'gte']
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder.single = vi.fn().mockResolvedValue(resolved)
  // Make the builder itself awaitable
  builder.then = (resolve: (v: unknown) => void) => resolve({ data, error: null })
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'teams_with_logos') {
        return chainable([
          {
            school: 'Alabama',
            abbreviation: 'ALA',
            conference: 'SEC',
            classification: 'fbs',
            color: '#9E1B32',
            alt_color: '#FFFFFF',
            logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500/333.png',
          },
        ])
      }
      return chainable()
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  }),
}))

vi.mock('@/components/team/TeamPageClient', () => ({
  TeamPageClient: ({ team }: { team: { school: string } }) => (
    <div data-testid="team-page-client">{team.school}</div>
  ),
}))

describe('Team detail page', () => {
  it('renders team data for a valid slug', async () => {
    const jsx = await TeamPage({ params: Promise.resolve({ slug: 'alabama' }), searchParams: Promise.resolve({}) })
    render(jsx)
    expect(screen.getByText('Alabama')).toBeInTheDocument()
  })

  it('calls notFound for an unknown slug', async () => {
    mockNotFound.mockClear()
    await expect(
      TeamPage({ params: Promise.resolve({ slug: 'nonexistent-team-xyz' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })
})
