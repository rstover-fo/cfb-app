import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamThemeToggle } from '../TeamThemeToggle'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim()
    if (name) document.cookie = `${name}=; max-age=0; path=/`
  })
}

describe('TeamThemeToggle', () => {
  beforeEach(() => {
    clearCookies()
    document.documentElement.removeAttribute('data-team-theme')
    refresh.mockClear()
  })

  afterEach(() => {
    clearCookies()
    document.documentElement.removeAttribute('data-team-theme')
  })

  it('renders inactive by default', () => {
    render(<TeamThemeToggle themeKey="ou" label="Sooner Mode" active={false} />)
    const button = screen.getByRole('button', { name: 'Sooner Mode' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('activates the theme on click: sets the cookie and the data attribute', () => {
    render(<TeamThemeToggle themeKey="ou" label="Sooner Mode" active={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sooner Mode' }))

    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.getAttribute('data-team-theme')).toBe('ou')
    expect(document.cookie).toContain('cfb-team-theme=ou')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('deactivates the theme on a second click: clears the cookie and the data attribute', () => {
    render(<TeamThemeToggle themeKey="ou" label="Sooner Mode" active={true} />)
    document.documentElement.setAttribute('data-team-theme', 'ou')
    document.cookie = 'cfb-team-theme=ou; path=/'

    fireEvent.click(screen.getByRole('button', { name: 'Sooner Mode' }))

    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
    expect(document.documentElement.hasAttribute('data-team-theme')).toBe(false)
    expect(document.cookie).not.toContain('cfb-team-theme=ou')
  })
})
