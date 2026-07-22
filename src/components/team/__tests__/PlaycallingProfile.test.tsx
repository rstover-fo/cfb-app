/**
 * Unit tests for PlaycallingProfile. Fixture rows come from the shared
 * query-layer fixtures mirroring api.team_playcalling_profile.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlaycallingProfile } from '../PlaycallingProfile'
import { createPlaycallingProfileRow } from '@/lib/queries/__tests__/fixtures/playcalling'

describe('PlaycallingProfile', () => {
  it('renders an accessible diverging-bar chart with one row per situation', () => {
    render(<PlaycallingProfile profile={createPlaycallingProfileRow()} />)

    const svg = screen.getByRole('img', { name: /Run versus pass share by situation for Ohio State, 2025 season/ })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    for (const label of ['Overall', 'Early downs', 'Third down', 'Red zone', 'Leading', 'Trailing']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    // Direct % labels at the bar ends (third down is published as a pass
    // rate, 0.671 -> run 33% / pass 67%).
    expect(screen.getByText('33%')).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('annotates FBS percentiles per situation', () => {
    render(<PlaycallingProfile profile={createPlaycallingProfileRow()} />)

    expect(screen.getByText('55th pctl run-heavy')).toBeInTheDocument()
    expect(screen.getByText('61st pctl run-heavy')).toBeInTheDocument()
    expect(screen.getByText('72nd pctl pass-heavy')).toBeInTheDocument()
  })

  it('renders the compact identity stat lines', () => {
    render(<PlaycallingProfile profile={createPlaycallingProfileRow()} />)

    // run_rate_delta 0.177 -> +17.7 pts, at the 68th percentile
    expect(screen.getByText('+17.7 pts')).toBeInTheDocument()
    expect(screen.getByText('68th pctl')).toBeInTheDocument()
    // pace 68.4 plays/game, at the 44th percentile
    expect(screen.getByText('68.4')).toBeInTheDocument()
    expect(screen.getByText('44th pctl')).toBeInTheDocument()
  })

  it('shows situational detail in a tooltip on row hover', () => {
    const { container } = render(<PlaycallingProfile profile={createPlaycallingProfileRow()} />)

    const hoverRects = container.querySelectorAll('rect[fill="transparent"]')
    expect(hoverRects.length).toBe(6)

    // First row is Overall: success rate + EPA/play extras
    fireEvent.mouseEnter(hoverRects[0])
    expect(screen.getByText('EPA/play:')).toBeInTheDocument()
    expect(screen.getByText('+0.187')).toBeInTheDocument()
    expect(screen.getByText('48.1%')).toBeInTheDocument()
  })

  it('skips situations without a published rate', () => {
    render(
      <PlaycallingProfile
        profile={createPlaycallingProfileRow({ red_zone_run_rate: null, red_zone_success_rate: null })}
      />
    )

    expect(screen.queryByText('Red zone')).not.toBeInTheDocument()
    expect(screen.getByText('Overall')).toBeInTheDocument()
  })

  it('renders the designed empty note when the profile is null', () => {
    render(<PlaycallingProfile profile={null} />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Playcalling profile publishes after enough plays are charted.')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
