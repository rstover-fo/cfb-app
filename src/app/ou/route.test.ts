import { describe, it, expect } from 'vitest'
import { GET } from './route'

describe('GET /ou', () => {
  it('redirects to the Oklahoma team page with the theme param', () => {
    const response = GET(new Request('https://example.com/ou'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://example.com/teams/oklahoma?theme=ou')
  })

  it('sets the team-theme cookie to ou', () => {
    const response = GET(new Request('https://example.com/ou'))
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('cfb-team-theme=ou')
    expect(setCookie).toContain('Path=/')
  })
})
