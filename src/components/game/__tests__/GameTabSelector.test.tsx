/**
 * Smoke tests for GameTabSelector, the shared shadcn-Tabs-backed tab strip
 * used by ScoringTimeline, DriveChart, and GameSituationalSplits. Callers
 * pass their panels as `<TabsContent value={tab.id}>` children.
 *
 * Radix's TabsTrigger selects a tab on pointerdown/mousedown, not click --
 * @testing-library/user-event isn't installed in this project, so we fire a
 * plain mousedown event (see TeamPageClient.tabs.test.tsx for the same
 * constraint on the Tabs primitive this component wraps).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GameTabSelector } from '../GameTabSelector'
import { TabsContent } from '@/components/ui/tabs'

const TABS = [
  { id: 'one', label: 'One' },
  { id: 'two', label: 'Two' },
]

function selectTab(trigger: HTMLElement) {
  fireEvent.mouseDown(trigger, { button: 0 })
}

describe('GameTabSelector', () => {
  it('renders a tablist and the active panel, calling onTabChange when a tab is selected', () => {
    const onTabChange = vi.fn()

    render(
      <GameTabSelector tabs={TABS} activeTab="one" onTabChange={onTabChange} ariaLabel="Test tabs">
        <TabsContent value="one">Panel One</TabsContent>
        <TabsContent value="two">Panel Two</TabsContent>
      </GameTabSelector>
    )

    const tablist = screen.getByRole('tablist', { name: 'Test tabs' })
    expect(tablist).toBeInTheDocument()

    expect(screen.getByText('Panel One')).toBeInTheDocument()
    expect(screen.queryByText('Panel Two')).not.toBeInTheDocument()

    const secondTab = screen.getByRole('tab', { name: 'Two' })
    selectTab(secondTab)

    expect(onTabChange).toHaveBeenCalledWith('two')
  })

  it('switches the visible panel when activeTab changes (controlled)', () => {
    const { rerender } = render(
      <GameTabSelector tabs={TABS} activeTab="one" onTabChange={() => {}} ariaLabel="Test tabs">
        <TabsContent value="one">Panel One</TabsContent>
        <TabsContent value="two">Panel Two</TabsContent>
      </GameTabSelector>
    )

    expect(screen.getByText('Panel One')).toBeInTheDocument()

    rerender(
      <GameTabSelector tabs={TABS} activeTab="two" onTabChange={() => {}} ariaLabel="Test tabs">
        <TabsContent value="one">Panel One</TabsContent>
        <TabsContent value="two">Panel Two</TabsContent>
      </GameTabSelector>
    )

    expect(screen.queryByText('Panel One')).not.toBeInTheDocument()
    expect(screen.getByText('Panel Two')).toBeInTheDocument()
  })
})
