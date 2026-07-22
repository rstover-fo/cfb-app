import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CompareView } from '../CompareView'
import type { Team, TeamSeasonEpa, TeamStyleProfile } from '@/lib/types/database'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  })),
}))

const OKLAHOMA = { id: 1, school: 'Oklahoma', logo: null, color: '#841617', conference: 'SEC' } as unknown as Team
const TEXAS = { id: 2, school: 'Texas', logo: null, color: '#BF5700', conference: 'SEC' } as unknown as Team
const ALL_TEAMS = [OKLAHOMA, TEXAS]

const METRICS = { team: 'Oklahoma', season: 2025, epa_per_play: 0.25, success_rate: 0.5, explosiveness: 1.2, off_epa_rank: 3, def_epa_rank: 10 } as unknown as TeamSeasonEpa
const COMPARE_METRICS = { team: 'Texas', season: 2025, epa_per_play: 0.18, success_rate: 0.44, explosiveness: 1.1, off_epa_rank: 8, def_epa_rank: 4 } as unknown as TeamSeasonEpa
const STYLE = { team: 'Oklahoma', season: 2025, run_rate: 0.45, epa_rushing: 0.1, epa_passing: 0.3 } as unknown as TeamStyleProfile
const COMPARE_STYLE = { team: 'Texas', season: 2025, run_rate: 0.4, epa_rushing: 0.05, epa_passing: 0.25 } as unknown as TeamStyleProfile

describe('CompareView -- team-page tab mode (allowTeam1Change=false)', () => {
  it('shows team 1 fixed and a prompt to select team 2', () => {
    render(
      <CompareView
        team={OKLAHOMA}
        metrics={METRICS}
        style={STYLE}
        allTeams={ALL_TEAMS}
        currentSeason={2025}
      />
    )

    expect(screen.getByText('Oklahoma')).toBeInTheDocument()
    expect(screen.getByText('Select a team to compare.')).toBeInTheDocument()
    // Only one picker (for team 2) should be present in tab mode
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
  })

  it('renders metric bars immediately when a compare team is already seeded', () => {
    render(
      <CompareView
        team={OKLAHOMA}
        metrics={METRICS}
        style={STYLE}
        allTeams={ALL_TEAMS}
        currentSeason={2025}
        compareTeam={TEXAS}
        compareMetrics={COMPARE_METRICS}
        compareStyle={COMPARE_STYLE}
      />
    )

    expect(screen.getByText('EPA/Play')).toBeInTheDocument()
    expect(screen.queryByText('Select a team to compare.')).not.toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })
})

describe('CompareView -- standalone /compare mode (allowTeam1Change=true)', () => {
  it('shows two pickers and a prompt when neither team is selected', () => {
    render(
      <CompareView
        team={null}
        metrics={null}
        style={null}
        allTeams={ALL_TEAMS}
        currentSeason={2025}
        allowTeam1Change
      />
    )

    expect(screen.getByText('Select two teams to compare.')).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
  })

  it('renders both teams and metric bars when both sides are pre-seeded from the server', () => {
    render(
      <CompareView
        team={OKLAHOMA}
        metrics={METRICS}
        style={STYLE}
        compareTeam={TEXAS}
        compareMetrics={COMPARE_METRICS}
        compareStyle={COMPARE_STYLE}
        allTeams={ALL_TEAMS}
        currentSeason={2025}
        allowTeam1Change
      />
    )

    expect(screen.getAllByText('Oklahoma').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Texas').length).toBeGreaterThan(0)
    expect(screen.getByText('EPA/Play')).toBeInTheDocument()
  })

  it('calls onSelectionChange with the initial seeded ids', () => {
    const onSelectionChange = vi.fn()

    render(
      <CompareView
        team={OKLAHOMA}
        metrics={METRICS}
        style={STYLE}
        compareTeam={TEXAS}
        compareMetrics={COMPARE_METRICS}
        compareStyle={COMPARE_STYLE}
        allTeams={ALL_TEAMS}
        currentSeason={2025}
        allowTeam1Change
        onSelectionChange={onSelectionChange}
      />
    )

    expect(onSelectionChange).toHaveBeenCalledWith(1, 2)
  })
})

// Bar widths for rank metrics (Offensive Rank / Defensive Rank) must be
// inverted relative to raw metrics: rank 1 is the *best* possible value, so
// the lower rank needs to draw the *longer* bar. Reported live in prod as
// OU #176 drawing a longer bar than OSU #24 -- the opposite of what
// higherIsBetter={false} + naive `value / max` normalization produces.
describe('CompareView -- rank metric bar widths', () => {
  function barWidths(container: HTMLElement, label: string): [number, number] {
    const labelNode = Array.from(container.querySelectorAll('div')).find(
      el => el.textContent === label && el.className.includes('text-sm')
    )
    if (!labelNode || !labelNode.parentElement) {
      throw new Error(`could not find metric row for label "${label}"`)
    }
    const bars = labelNode.parentElement.querySelectorAll<HTMLElement>('.transition-all')
    expect(bars).toHaveLength(2)
    return [parseFloat(bars[0].style.width), parseFloat(bars[1].style.width)]
  }

  it('draws a strictly wider bar for the better (lower) rank', () => {
    const metrics1 = { ...METRICS, off_epa_rank: 24 } as unknown as TeamSeasonEpa
    const metrics2 = { ...COMPARE_METRICS, off_epa_rank: 176 } as unknown as TeamSeasonEpa

    const { container } = render(
      <CompareView
        team={OKLAHOMA}
        metrics={metrics1}
        style={STYLE}
        allTeams={ALL_TEAMS}
        currentSeason={2025}
        compareTeam={TEXAS}
        compareMetrics={metrics2}
        compareStyle={COMPARE_STYLE}
      />
    )

    const [width1, width2] = barWidths(container, 'Offensive Rank')

    // Team 1 (#24, the better rank) should draw the much longer bar.
    expect(width1).toBeGreaterThan(width2)
    expect(width1).toBeGreaterThan(50)
    expect(width1).toBeCloseTo(83, -1) // ~83%, tolerant to the nearest 10
    expect(width2).toBeLessThan(5)
    expect(width2).toBeCloseTo(0.6, 0) // ~0.6%
  })

  it('draws equal-width bars for equal ranks', () => {
    const metrics1 = { ...METRICS, def_epa_rank: 50 } as unknown as TeamSeasonEpa
    const metrics2 = { ...COMPARE_METRICS, def_epa_rank: 50 } as unknown as TeamSeasonEpa

    const { container } = render(
      <CompareView
        team={OKLAHOMA}
        metrics={metrics1}
        style={STYLE}
        allTeams={ALL_TEAMS}
        currentSeason={2025}
        compareTeam={TEXAS}
        compareMetrics={metrics2}
        compareStyle={COMPARE_STYLE}
      />
    )

    const [width1, width2] = barWidths(container, 'Defensive Rank')
    expect(width1).toBe(width2)
    expect(width1).toBeGreaterThan(0)
  })

  it('keeps raw (non-rank) metric bar widths behaving as before -- higher value draws the longer bar', () => {
    const { container } = render(
      <CompareView
        team={OKLAHOMA}
        metrics={METRICS}
        style={STYLE}
        allTeams={ALL_TEAMS}
        currentSeason={2025}
        compareTeam={TEXAS}
        compareMetrics={COMPARE_METRICS}
        compareStyle={COMPARE_STYLE}
      />
    )

    // METRICS.epa_per_play (0.25) > COMPARE_METRICS.epa_per_play (0.18)
    const [width1, width2] = barWidths(container, 'EPA/Play')
    expect(width1).toBeGreaterThan(width2)
    expect(width1).toBe(100)
  })
})

describe('CompareView -- metric bar overflow guard', () => {
  it('keeps each bar half shrinkable so nothing escapes the card frame on narrow widths', () => {
    const { container } = render(
      <CompareView
        team={OKLAHOMA}
        metrics={METRICS}
        style={STYLE}
        allTeams={ALL_TEAMS}
        currentSeason={2025}
        compareTeam={TEXAS}
        compareMetrics={COMPARE_METRICS}
        compareStyle={COMPARE_STYLE}
      />
    )

    const halves = container.querySelectorAll('.flex-1')
    expect(halves.length).toBeGreaterThan(0)
    halves.forEach(half => expect(half.className).toContain('min-w-0'))

    const barTracks = container.querySelectorAll('.w-32')
    expect(barTracks.length).toBeGreaterThan(0)
    barTracks.forEach(track => {
      expect(track.className).toContain('max-w-full')
      expect(track.className).toContain('shrink')
    })
  })
})
