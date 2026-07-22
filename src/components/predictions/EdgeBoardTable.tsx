'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { ChartLineDown } from '@phosphor-icons/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { EmptyState } from '@/components/EmptyState'
import { fetchScoredMatchupEdges } from '@/app/predictions/actions'
import type { ScoredMatchupEdge } from '@/app/predictions/actions'
import { PREDICTION_MODEL_VERSIONS, type PredictionModelVersion } from '@/lib/queries/constants'
import { formatSpread } from '@/lib/format-odds'
import { cn } from '@/lib/utils'

// Matches Models page's MODEL_LABELS -- kept local since it's presentation
// copy, not a canonical constant (the canonical list is
// PREDICTION_MODEL_VERSIONS in constants.ts, imported below).
const MODEL_LABELS: Record<string, string> = {
  elo_v1: 'Elo (v1)',
  elo_epa_blend_v1: 'Elo + EPA blend (v1)',
}

const ALL_WEEKS_VALUE = '0'

interface EdgeBoardTableProps {
  initialEdges: ScoredMatchupEdge[]
  season: number
  availableWeeks: number[]
  defaultModelVersion: PredictionModelVersion
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Same "team by margin" phrasing as PredictionCard's formatMargin.
function formatModelMargin(margin: number, homeTeam: string, awayTeam: string): string {
  const rounded = Math.round(Math.abs(margin) * 10) / 10
  if (rounded === 0) return 'Even matchup'
  return margin > 0 ? `${homeTeam} by ${rounded}` : `${awayTeam} by ${rounded}`
}

// Full Edge Board slate: week + model-version filters (client-fetched via the
// 'use server' actions) over a shadcn Table of scored matchup edges. Rows
// arrive pre-sorted by abs_edge desc (nulls last) from the query layer --
// this component never re-sorts. Null-market rows (no line posted yet) show
// "—" for market/edge/pick per DESIGN.md; the model margin and win
// probability columns are independent of the market and always render.
export function EdgeBoardTable({
  initialEdges,
  season,
  availableWeeks,
  defaultModelVersion,
}: EdgeBoardTableProps) {
  const [edges, setEdges] = useState(initialEdges)
  const [week, setWeek] = useState(0)
  const [modelVersion, setModelVersion] = useState<PredictionModelVersion>(defaultModelVersion)
  const [isPending, startTransition] = useTransition()
  // Guards against a slower earlier request clobbering a faster later one.
  const requestIdRef = useRef(0)

  const runFetch = (nextWeek: number, nextModel: PredictionModelVersion) => {
    const currentRequestId = ++requestIdRef.current
    startTransition(async () => {
      const rows = await fetchScoredMatchupEdges(season, nextWeek || undefined, nextModel)
      if (currentRequestId === requestIdRef.current) {
        setEdges(rows)
      }
    })
  }

  const handleWeekChange = (value: string) => {
    const nextWeek = Number(value)
    setWeek(nextWeek)
    runFetch(nextWeek, modelVersion)
  }

  const handleModelChange = (value: string) => {
    const nextModel = value as PredictionModelVersion
    setModelVersion(nextModel)
    runFetch(week, nextModel)
  }

  return (
    <div>
      {/* Filters -- stay visible even when the slate is empty */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div className="space-y-1">
          <label
            htmlFor="edge-board-week"
            className="block text-[10px] uppercase tracking-wider font-normal text-[var(--text-muted)]"
          >
            Week
          </label>
          <Select value={String(week)} onValueChange={handleWeekChange}>
            <SelectTrigger id="edge-board-week" className="text-sm min-w-[140px]" aria-label="Filter by week">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_WEEKS_VALUE}>All weeks</SelectItem>
              {availableWeeks.map(w => (
                <SelectItem key={w} value={String(w)}>
                  Week {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="edge-board-model"
            className="block text-[10px] uppercase tracking-wider font-normal text-[var(--text-muted)]"
          >
            Model
          </label>
          <Select value={modelVersion} onValueChange={handleModelChange}>
            <SelectTrigger id="edge-board-model" className="text-sm min-w-[200px]" aria-label="Filter by model version">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PREDICTION_MODEL_VERSIONS.map(m => (
                <SelectItem key={m} value={m}>
                  {MODEL_LABELS[m] ?? m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isPending && (
          <p className="text-xs text-[var(--text-muted)] pb-2" role="status">
            Updating…
          </p>
        )}
      </div>

      {edges.length === 0 ? (
        <EmptyState
          icon={ChartLineDown}
          title="Lines are off the board — edges return in season."
        />
      ) : (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matchup</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Model Margin</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Edge</TableHead>
                <TableHead>Pick</TableHead>
                <TableHead className="text-right">Model Win Prob</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {edges.map(edge => {
                const hasMarket = edge.market_spread != null
                const edgeTone = edge.edge == null || edge.edge === 0 ? 'neutral' : 'positive'
                const pickTeam =
                  edge.edge_pick === 'home' ? edge.home_team : edge.edge_pick === 'away' ? edge.away_team : null
                // Pick-perspective win prob (matches EdgeBoardWidget); falls
                // back to the home team's perspective when there's no pick.
                const winProbTeam = edge.edge_pick === 'away' ? edge.away_team : edge.home_team
                const winProbPct = Math.round(
                  (edge.edge_pick === 'away' ? 1 - edge.home_win_prob : edge.home_win_prob) * 100
                )

                return (
                  <TableRow key={edge.game_id}>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/games/${edge.game_id}`} className="text-[var(--text-primary)] hover:underline">
                        {edge.away_team} @ {edge.home_team}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[var(--text-secondary)]">{formatDate(edge.start_date)}</TableCell>
                    <TableCell className="text-[var(--text-secondary)] whitespace-nowrap">
                      {formatModelMargin(edge.expected_home_margin, edge.home_team, edge.away_team)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {hasMarket ? (
                        <div>
                          <span className="text-[var(--text-secondary)]">
                            {edge.home_team} {formatSpread(edge.market_spread as number)}
                          </span>
                          {edge.market_provider && (
                            <span className="block text-[10px] normal-case text-[var(--text-muted)]">
                              {edge.market_provider}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {edge.edge == null ? (
                        <span className="text-[var(--text-muted)]">—</span>
                      ) : (
                        <Badge
                          variant="outline"
                          className={cn(
                            'tabular-nums',
                            edgeTone === 'positive' &&
                              'text-[var(--color-positive)] bg-[var(--color-positive)]/10 border-[var(--color-positive)]/30',
                            edgeTone === 'neutral' && 'text-[var(--text-muted)] border-[var(--border)]'
                          )}
                        >
                          {formatSpread(edge.edge)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[var(--text-primary)] whitespace-nowrap">
                      {pickTeam ?? <span className="text-[var(--text-muted)]">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-[var(--text-secondary)] whitespace-nowrap">
                      {winProbTeam} {winProbPct}%
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
