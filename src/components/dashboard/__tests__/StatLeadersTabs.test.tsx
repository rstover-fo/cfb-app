/**
 * Smoke tests for StatLeadersTabs' migration to shadcn Tabs.
 *
 * Radix's TabsTrigger selects a tab on pointerdown/mousedown, not click --
 * see TeamPageClient.tabs.test.tsx for the same constraint.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatLeadersTabs } from '../StatLeadersTabs'
import type { StatLeadersData } from '@/lib/queries/dashboard'

function selectTab(trigger: HTMLElement) {
  fireEvent.mouseDown(trigger, { button: 0 })
}

const DATA: StatLeadersData = {
  epa: [{ team: 'Oklahoma', logo: null, color: '#841617', value: 0.32 }],
  defEpa: [{ team: 'Texas', logo: null, color: '#BF5700', value: -0.18 }],
  havoc: [],
  successRate: [{ team: 'Ohio State', logo: null, color: '#BB0000', value: 0.48 }],
  explosiveness: [],
}

describe('StatLeadersTabs', () => {
  it('defaults to the EPA · Off tab and shows its leaders', () => {
    render(<StatLeadersTabs data={DATA} />)

    const tablist = screen.getByRole('tablist', { name: 'Stat leader category' })
    expect(tablist).toBeInTheDocument()
    expect(screen.getByText('Oklahoma')).toBeInTheDocument()
    expect(screen.getByText('+0.32')).toBeInTheDocument()
  })

  it('switches panels when a different tab is selected', () => {
    render(<StatLeadersTabs data={DATA} />)

    selectTab(screen.getByRole('tab', { name: 'EPA · Def' }))

    expect(screen.queryByText('Oklahoma')).not.toBeInTheDocument()
    expect(screen.getByText('Texas')).toBeInTheDocument()
    expect(screen.getByText('-0.18')).toBeInTheDocument()
  })

  it('shows the empty note for a tab with no leaders', () => {
    render(<StatLeadersTabs data={DATA} />)

    selectTab(screen.getByRole('tab', { name: 'Havoc · Def' }))

    expect(screen.getByText('No data available')).toBeInTheDocument()
  })
})
