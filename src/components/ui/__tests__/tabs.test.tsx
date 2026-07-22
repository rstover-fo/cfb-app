import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../tabs'

describe('Tabs', () => {
  it('renders tab triggers and shows the active panel', () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview panel</TabsContent>
        <TabsContent value="roster">Roster panel</TabsContent>
      </Tabs>
    )

    const overviewTab = screen.getByRole('tab', { name: 'Overview' })
    expect(overviewTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Roster' })).toHaveAttribute(
      'aria-selected',
      'false'
    )
    expect(screen.getByText('Overview panel')).toBeInTheDocument()
  })
})
