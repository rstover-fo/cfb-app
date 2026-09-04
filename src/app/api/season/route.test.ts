// @vitest-environment node
/**
 * Route test for GET /api/season. Node environment (not jsdom) since this
 * route has no DOM dependency, matching route.test.ts precedent for other
 * plain Node route handlers in this app.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/queries/season', () => ({
  getCurrentSeasonForRoute: vi.fn(async () => ({
    season: 2026,
    through_week: 2,
    is_live: true,
    source: 'games',
  })),
}))

import { GET } from './route'

describe('GET /api/season', () => {
  it('returns the resolved season state as JSON', async () => {
    const response = await GET()
    const body = await response.json()
    expect(body).toEqual({
      season: 2026,
      through_week: 2,
      is_live: true,
      source: 'games',
    })
  })

  it('sets a public cache header with a 60s max-age and 600s stale-while-revalidate', async () => {
    const response = await GET()
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60, stale-while-revalidate=600')
  })
})
