'use client'

import { Fragment, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { formatPercent, formatRank } from '@/lib/utils'
import { fetchCoachingHistory, type CoachingTenure } from '@/app/coaches/actions'

export interface SelectedCoach {
  firstName: string
  lastName: string
  /** Display name for the dialog title -- coach_records' coach_name. */
  displayName: string
}

interface CoachHistoryDialogProps {
  /** The coach whose history to show, or null to keep the dialog closed. */
  coach: SelectedCoach | null
  onOpenChange: (open: boolean) => void
}

function formatSeasons(start: number, end: number): string {
  return start === end ? String(start) : `${start}–${end}`
}

function formatWL(wins: number | null, losses: number | null): string {
  if (wins == null || losses == null) return '—'
  return `${wins}-${losses}`
}

function formatBowls(games: number | null, wins: number | null): string {
  if (!games) return '—'
  const losses = wins != null ? games - wins : null
  return wins != null && losses != null ? `${wins}-${losses}` : String(games)
}

/** Talent-improvement line for one tenure -- only rendered when both ranks are present. */
function TalentImprovementRow({ tenure }: { tenure: CoachingTenure }) {
  if (tenure.inherited_talent_rank == null || tenure.year3_talent_rank == null) return null

  // Rank 1 is best, so a falling rank number is improvement.
  const delta = tenure.inherited_talent_rank - tenure.year3_talent_rank
  const improved = delta >= 0

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={5} className="whitespace-normal py-1 text-xs text-[var(--text-muted)]">
        Talent: {formatRank(tenure.inherited_talent_rank)} recruit class → {formatRank(tenure.year3_talent_rank)} by year 3{' '}
        <span
          className={improved ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}
          data-testid="talent-delta"
        >
          ({improved ? '+' : ''}{delta})
        </span>
      </TableCell>
    </TableRow>
  )
}

function LoadingRows() {
  return (
    <>
      {[0, 1, 2].map(i => (
        <TableRow key={i} className="hover:bg-transparent" data-testid="history-loading-row">
          <TableCell colSpan={5}>
            <Skeleton className="h-5 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

function coachKey(coach: SelectedCoach | null): string | null {
  return coach ? `${coach.firstName}|${coach.lastName}` : null
}

// Per-coach tenure history, fetched on demand when the dialog opens (not
// server-rendered with the page -- see src/app/coaches/actions.ts). Coach
// identity is looked up via first_name + last_name, the only join key
// api.coaching_history shares with api.coach_records.
export function CoachHistoryDialog({ coach, onOpenChange }: CoachHistoryDialogProps) {
  // Result is tagged with the coach key it was fetched for, and loading/
  // tenures are *derived* from comparing that tag to the current coach below
  // -- rather than separate setLoading/setTenures(null) calls synchronously
  // at the top of the effect -- so the only setState call in this component
  // happens inside the fetch's `.then()` callback (an actual response from
  // the external system), not synchronously mirroring a prop into state.
  const [result, setResult] = useState<{ key: string; tenures: CoachingTenure[] } | null>(null)
  const key = coachKey(coach)

  useEffect(() => {
    if (!coach) return
    let cancelled = false

    fetchCoachingHistory(coach.firstName, coach.lastName).then(rows => {
      if (cancelled) return
      setResult({ key: coachKey(coach)!, tenures: rows })
    })

    return () => {
      cancelled = true
    }
  }, [coach])

  const tenures = result?.key === key ? result.tenures : null
  const loading = coach !== null && tenures === null

  return (
    <Dialog open={coach !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-headline">{coach?.displayName ?? 'Coaching History'}</DialogTitle>
        </DialogHeader>

        <Table aria-label={coach ? `${coach.displayName} coaching tenure history` : 'Coaching tenure history'}>
          <TableHeader>
            <TableRow>
              <TableHead>School</TableHead>
              <TableHead>Years</TableHead>
              <TableHead className="text-right">Record</TableHead>
              <TableHead className="text-right">Win%</TableHead>
              <TableHead className="text-right">Bowls</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <LoadingRows />}
            {!loading && tenures !== null && tenures.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-4 text-center text-sm text-[var(--text-muted)]">
                  No tenure history available for this coach.
                </TableCell>
              </TableRow>
            )}
            {!loading && tenures?.map(tenure => (
              <Fragment key={`${tenure.team}-${tenure.tenure_start}`}>
                <TableRow>
                  <TableCell className="text-[var(--text-primary)]">
                    {tenure.team}
                    {tenure.is_active && (
                      <Badge variant="outline" className="ml-2 align-middle">
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-[var(--text-muted)]">
                    {formatSeasons(tenure.tenure_start, tenure.tenure_end)}
                  </TableCell>
                  <TableCell className="text-right">{formatWL(tenure.total_wins, tenure.total_losses)}</TableCell>
                  <TableCell className="text-right">
                    {tenure.win_pct != null ? formatPercent(tenure.win_pct) : '—'}
                  </TableCell>
                  <TableCell className="text-right">{formatBowls(tenure.bowl_games, tenure.bowl_wins)}</TableCell>
                </TableRow>
                <TalentImprovementRow tenure={tenure} />
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  )
}
