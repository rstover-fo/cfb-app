import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../table'

describe('Table', () => {
  it('renders rows and cells with the newspaper-style header treatment', () => {
    render(
      <Table aria-label="Rankings">
        <TableHeader>
          <TableRow>
            <TableHead>Team</TableHead>
            <TableHead>Record</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Oklahoma</TableCell>
            <TableCell>10-2</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )

    expect(screen.getByRole('table', { name: 'Rankings' })).toBeInTheDocument()
    expect(screen.getByText('Oklahoma')).toBeInTheDocument()

    const header = screen.getByText('Team')
    expect(header).toHaveClass('uppercase')
    expect(header).toHaveClass('text-muted-foreground')
  })
})
