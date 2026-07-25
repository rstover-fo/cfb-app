import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TeamMark, teamInitials, teamLogosEnabled } from '../TeamMark'

describe('teamLogosEnabled', () => {
  it('defaults to enabled when NEXT_PUBLIC_TEAM_LOGOS is unset', () => {
    // Guards the kill switch's default. ScatterPlot draws logos as native SVG
    // <image> and consults this directly rather than rendering <TeamMark>, so a
    // regression here would leave logos on that chart when they're off sitewide.
    expect(teamLogosEnabled()).toBe(true)
  })
})

describe('teamInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(teamInitials('Ohio State')).toBe('OS')
    expect(teamInitials('Texas A&M')).toBe('TA')
  })

  it('handles single-word and extra-whitespace names', () => {
    expect(teamInitials('Alabama')).toBe('A')
    expect(teamInitials('  Notre   Dame  ')).toBe('ND')
  })
})

describe('TeamMark', () => {
  it('renders the logo when one is available', () => {
    render(
      <TeamMark
        school="Alabama"
        logo="https://a.espncdn.com/i/teamlogos/ncaa/500/333.png"
        color="#9E1B32"
        width={24}
        height={24}
      />
    )

    const img = screen.getByAltText('Alabama')
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toContain('333.png')
  })

  it('never routes logos through the Next image optimizer', () => {
    // Load-bearing: optimization would make our server fetch, re-encode, and
    // re-serve ESPN's bytes from our own origin. See the component docblock.
    render(
      <TeamMark
        school="Alabama"
        logo="https://a.espncdn.com/i/teamlogos/ncaa/500/333.png"
        width={24}
        height={24}
      />
    )

    const src = screen.getByAltText('Alabama').getAttribute('src') ?? ''
    expect(src).not.toContain('/_next/image')
    expect(src).toBe('https://a.espncdn.com/i/teamlogos/ncaa/500/333.png')
  })

  it('falls back to a color chip when no logo is available', () => {
    render(<TeamMark school="Alabama" logo={null} color="#9E1B32" width={24} height={24} />)

    expect(screen.queryByRole('img', { name: 'Alabama' })).toBeInTheDocument()
    expect(screen.queryByText('AL')).not.toBeInTheDocument() // too small for initials
  })

  it('shows initials on the fallback once there is room for them', () => {
    render(<TeamMark school="Ohio State" logo={null} color="#BB0000" width={120} height={120} />)

    expect(screen.getByText('OS')).toBeInTheDocument()
  })

  it('passes sizing classes through to both branches', () => {
    const { rerender } = render(
      <TeamMark school="Alabama" logo="https://example.test/a.png" width={24} height={24} className="w-6 h-6" />
    )
    expect(screen.getByAltText('Alabama')).toHaveClass('w-6', 'h-6')

    rerender(<TeamMark school="Alabama" logo={null} width={24} height={24} className="w-6 h-6" />)
    expect(screen.getByRole('img', { name: 'Alabama' })).toHaveClass('w-6', 'h-6')
  })

  it('honors an explicit alt override', () => {
    render(
      <TeamMark
        school="Alabama"
        alt="Alabama Crimson Tide logo"
        logo="https://example.test/a.png"
        width={24}
        height={24}
      />
    )
    expect(screen.getByAltText('Alabama Crimson Tide logo')).toBeInTheDocument()
  })
})
