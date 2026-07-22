import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { AdvancedLeaders } from '../AdvancedLeaders'
import { createWepaLeaderRows, createUsageLeaderRows } from '@/lib/queries/__tests__/fixtures/players'

const fetchWepaLeaders = vi.fn()

vi.mock('@/app/players/actions', () => ({
  fetchWepaLeaders: (...args: unknown[]) => fetchWepaLeaders(...args),
}))

// Radix's TabsTrigger selects a tab on pointerdown/mousedown, not click --
// @testing-library/user-event isn't installed in this project, so we fire a
// plain mousedown event (see TeamPageClient.tabs.test.tsx's selectTab).
function selectTab(trigger: HTMLElement) {
  fireEvent.mouseDown(trigger, { button: 0 })
}

// Same story for Radix's Select (see EdgeBoardTable.test.tsx's precedent).
function openSelect(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
}

function chooseOption(name: string) {
  const option = screen.getByRole('option', { name })
  fireEvent.click(option)
}

const defaultProps = {
  initialWepaLeaders: createWepaLeaderRows(),
  initialUsageLeaders: createUsageLeaderRows(),
  season: 2025,
}

describe('AdvancedLeaders', () => {
  beforeEach(() => {
    fetchWepaLeaders.mockReset()
  })

  it('renders the WEPA panel by default with rank, player, team, category, WEPA, PAAR, plays', () => {
    render(<AdvancedLeaders {...defaultProps} />)

    const wepaTab = screen.getByRole('tab', { name: 'WEPA' })
    expect(wepaTab).toHaveAttribute('aria-selected', 'true')

    const rows = screen.getAllByRole('row').slice(1) // drop header row
    expect(rows).toHaveLength(3)

    const firstRow = rows[0]
    expect(within(firstRow).getByText('Jackson Arnold')).toBeInTheDocument()
    expect(within(firstRow).getByText('Jackson Arnold').closest('a')).toHaveAttribute(
      'href',
      '/players/athlete-1'
    )
    expect(within(firstRow).getByText('Oklahoma')).toBeInTheDocument()
    expect(within(firstRow).getByText('42.8')).toBeInTheDocument() // WEPA
    expect(within(firstRow).getByText('18.3')).toBeInTheDocument() // PAAR
    expect(within(firstRow).getByText('385')).toBeInTheDocument() // plays
  })

  it('fetches a new WEPA category via the server action when the category select changes', async () => {
    fetchWepaLeaders.mockResolvedValue([
      { ...createWepaLeaderRows()[0], category: 'rushing', athlete_name: 'Kaytron Allen' },
    ])

    render(<AdvancedLeaders {...defaultProps} />)

    openSelect(screen.getByLabelText('WEPA category'))
    chooseOption('Rushing')

    expect(fetchWepaLeaders).toHaveBeenCalledWith(2025, 'rushing')
    expect(await screen.findByText('Kaytron Allen')).toBeInTheDocument()
  })

  it('switches to the Usage panel and shows overall/pass/rush/third-down percent columns', () => {
    render(<AdvancedLeaders {...defaultProps} />)

    const usageTab = screen.getByRole('tab', { name: 'Usage' })
    selectTab(usageTab)

    expect(usageTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Kaytron Allen')).toBeInTheDocument()

    const rows = screen.getAllByRole('row').slice(1)
    const firstRow = rows[0]
    // usage_overall 0.284 -> "28.4%"
    expect(within(firstRow).getByText('28.4%')).toBeInTheDocument()
  })

  it('renders the designed empty state when there are no WEPA leaders', () => {
    render(<AdvancedLeaders {...defaultProps} initialWepaLeaders={[]} />)

    expect(
      screen.getByText('Advanced leaders publish once play-by-play is charted for this season.')
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders the designed empty state when there are no usage leaders', () => {
    render(<AdvancedLeaders {...defaultProps} initialUsageLeaders={[]} />)

    const usageTab = screen.getByRole('tab', { name: 'Usage' })
    selectTab(usageTab)

    expect(
      screen.getByText('Advanced leaders publish once play-by-play is charted for this season.')
    ).toBeInTheDocument()
  })
})
