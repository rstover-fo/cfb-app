'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { ChartLineUp } from '@phosphor-icons/react'
import { fetchWepaLeaders } from '@/app/players/actions'
import type { WepaCategory, WepaLeader, UsageLeader } from '@/app/players/actions'
import { teamNameToSlug, formatPercent } from '@/lib/utils'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const WEPA_CATEGORIES: { key: WepaCategory; label: string }[] = [
  { key: 'passing', label: 'Passing' },
  { key: 'rushing', label: 'Rushing' },
  { key: 'kicking', label: 'Kicking' },
]

function formatStat(value: number | null, digits = 1): string {
  return value != null ? value.toFixed(digits) : '—'
}

function formatPct(value: number | null): string {
  return value != null ? formatPercent(value) : '—'
}

interface AdvancedLeadersProps {
  initialWepaLeaders: WepaLeader[]
  initialUsageLeaders: UsageLeader[]
  season: number
}

/**
 * "Advanced Leaders" section: WEPA (weighted EPA) and usage-rate
 * leaderboards, sourced from api.player_wepa_leaders / api.player_usage_leaders.
 * Only meaningful from PBP_MIN_SEASON onward -- the page only ever calls this
 * with CURRENT_SEASON, which is always above that floor (see
 * src/lib/queries/players.ts's getWepaLeaders/getUsageLeaders header comments
 * for the underlying data-availability convention), so an empty result here
 * means the season's play-by-play charting hasn't produced WEPA/usage rows
 * yet, not that the season predates PBP coverage.
 */
export function AdvancedLeaders({
  initialWepaLeaders,
  initialUsageLeaders,
  season,
}: AdvancedLeadersProps) {
  const [wepaCategory, setWepaCategory] = useState<WepaCategory>('passing')
  const [wepaLeaders, setWepaLeaders] = useState(initialWepaLeaders)
  const [isPending, startTransition] = useTransition()
  const requestIdRef = useRef(0)

  const handleCategoryChange = (value: string) => {
    const category = value as WepaCategory
    setWepaCategory(category)
    const currentRequestId = ++requestIdRef.current

    startTransition(async () => {
      const data = await fetchWepaLeaders(season, category)
      if (currentRequestId === requestIdRef.current) {
        setWepaLeaders(data)
      }
    })
  }

  return (
    <section className="mt-10">
      <h2 className="font-headline text-xl text-[var(--text-primary)] mb-4">
        Advanced Leaders
      </h2>

      <Card>
        <CardHeader>
          <CardTitle>WEPA &amp; Usage</CardTitle>
          <CardDescription>
            Weighted EPA and snap-share usage leaders for the {season} season,
            derived from charted play-by-play.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="wepa">
            <TabsList aria-label="Advanced leaderboard type">
              <TabsTrigger value="wepa">WEPA</TabsTrigger>
              <TabsTrigger value="usage">Usage</TabsTrigger>
            </TabsList>

            <TabsContent value="wepa" className="mt-4">
              <div className="mb-4 flex items-center gap-3">
                <Select value={wepaCategory} onValueChange={handleCategoryChange}>
                  <SelectTrigger aria-label="WEPA category" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEPA_CATEGORIES.map(({ key, label }) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isPending && (
                  <span className="text-xs text-[var(--text-muted)]">Loading&hellip;</span>
                )}
              </div>

              {wepaLeaders.length === 0 ? (
                <EmptyState
                  icon={ChartLineUp}
                  title="No WEPA leaders yet"
                  description="Advanced leaders publish once play-by-play is charted for this season."
                />
              ) : (
                <div className={isPending ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Player</TableHead>
                        <TableHead>Team</TableHead>
                        <TableHead>Pos</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">WEPA</TableHead>
                        <TableHead className="text-right">PAAR</TableHead>
                        <TableHead className="text-right">Plays</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wepaLeaders.map(row => (
                        <TableRow key={`${row.athlete_id}-${row.category}`}>
                          <TableCell className="text-[var(--text-muted)]">
                            {row.season_rank}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/players/${row.athlete_id}`}
                              className="text-[var(--text-primary)] hover:underline"
                            >
                              {row.athlete_name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/teams/${teamNameToSlug(row.team)}`}
                              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline"
                            >
                              {row.team}
                            </Link>
                          </TableCell>
                          <TableCell className="text-[var(--text-muted)]">
                            {row.position ?? '—'}
                          </TableCell>
                          <TableCell className="capitalize text-[var(--text-muted)]">
                            {row.category}
                          </TableCell>
                          <TableCell className="text-right">{formatStat(row.wepa)}</TableCell>
                          <TableCell className="text-right">{formatStat(row.paar)}</TableCell>
                          <TableCell className="text-right">{row.plays ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="usage" className="mt-4">
              {initialUsageLeaders.length === 0 ? (
                <EmptyState
                  icon={ChartLineUp}
                  title="No usage leaders yet"
                  description="Advanced leaders publish once play-by-play is charted for this season."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Pos</TableHead>
                      <TableHead className="text-right">Overall</TableHead>
                      <TableHead className="text-right">Pass</TableHead>
                      <TableHead className="text-right">Rush</TableHead>
                      <TableHead className="text-right">3rd Down</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {initialUsageLeaders.map(row => (
                      <TableRow key={row.athlete_id}>
                        <TableCell>
                          <Link
                            href={`/players/${row.athlete_id}`}
                            className="text-[var(--text-primary)] hover:underline"
                          >
                            {row.player_name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/teams/${teamNameToSlug(row.team)}`}
                            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline"
                          >
                            {row.team}
                          </Link>
                        </TableCell>
                        <TableCell className="text-[var(--text-muted)]">
                          {row.position ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">{formatPct(row.usage_overall)}</TableCell>
                        <TableCell className="text-right">{formatPct(row.usage_pass)}</TableCell>
                        <TableCell className="text-right">{formatPct(row.usage_rush)}</TableCell>
                        <TableCell className="text-right">{formatPct(row.usage_third_down)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </section>
  )
}
