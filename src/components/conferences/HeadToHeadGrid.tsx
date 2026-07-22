'use client'

import { useRef, useState, useTransition } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchConferenceHeadToHead } from '@/app/conferences/actions'
import type { ConferenceHeadToHeadRow } from '@/app/conferences/actions'

interface HeadToHeadGridProps {
  /** All conference names available for either select (from the comparison table). */
  conferences: string[]
  defaultConf1: string
  defaultConf2: string
  seasonStart: number
  seasonEnd: number
  initialRows: ConferenceHeadToHeadRow[]
}

interface Totals {
  games: number
  conf1Wins: number
  conf2Wins: number
  ties: number
}

function sumTotals(rows: ConferenceHeadToHeadRow[]): Totals {
  return rows.reduce(
    (acc, r) => ({
      games: acc.games + r.total_games,
      conf1Wins: acc.conf1Wins + r.conf1_wins,
      conf2Wins: acc.conf2Wins + r.conf2_wins,
      ties: acc.ties + r.ties,
    }),
    { games: 0, conf1Wins: 0, conf2Wins: 0, ties: 0 }
  )
}

function summarize(conf1: string, conf2: string, seasonStart: number, totals: Totals): string {
  if (totals.games === 0) return `${conf1} and ${conf2} have not met since ${seasonStart}.`

  if (totals.conf1Wins > totals.conf2Wins) {
    return `${conf1} leads ${totals.conf1Wins}–${totals.conf2Wins} since ${seasonStart}.`
  }
  if (totals.conf2Wins > totals.conf1Wins) {
    return `${conf2} leads ${totals.conf2Wins}–${totals.conf1Wins} since ${seasonStart}.`
  }
  return `${conf1} and ${conf2} are tied ${totals.conf1Wins}–${totals.conf2Wins} since ${seasonStart}.`
}

// Pick-two conference head-to-head panel: two shadcn Selects (mutually
// exclusive -- picking a conference in one disables it in the other) drive a
// server-action refetch of the season-by-season RPC, summarized into one
// headline record line. Defaults to the top two conferences by SP+ over a
// trailing "recent era" range set by the page (seasonStart..seasonEnd).
export function HeadToHeadGrid({
  conferences,
  defaultConf1,
  defaultConf2,
  seasonStart,
  seasonEnd,
  initialRows,
}: HeadToHeadGridProps) {
  const [conf1, setConf1] = useState(defaultConf1)
  const [conf2, setConf2] = useState(defaultConf2)
  const [rows, setRows] = useState(initialRows)
  const [isPending, startTransition] = useTransition()
  // Guards against a slower earlier request clobbering a faster later one.
  const requestIdRef = useRef(0)

  const runFetch = (nextConf1: string, nextConf2: string) => {
    const currentRequestId = ++requestIdRef.current
    startTransition(async () => {
      const result = await fetchConferenceHeadToHead(nextConf1, nextConf2, seasonStart, seasonEnd)
      if (currentRequestId === requestIdRef.current) {
        setRows(result)
      }
    })
  }

  const handleConf1Change = (value: string) => {
    setConf1(value)
    runFetch(value, conf2)
  }

  const handleConf2Change = (value: string) => {
    setConf2(value)
    runFetch(conf1, value)
  }

  const totals = sumTotals(rows)

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div className="space-y-1">
          <label
            htmlFor="h2h-conf1"
            className="block text-[10px] uppercase tracking-wider font-normal text-[var(--text-muted)]"
          >
            Conference
          </label>
          <Select value={conf1} onValueChange={handleConf1Change}>
            <SelectTrigger id="h2h-conf1" className="text-sm min-w-[180px]" aria-label="First conference">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {conferences.map(c => (
                <SelectItem key={c} value={c} disabled={c === conf2}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="pb-2 text-sm text-[var(--text-muted)]">vs</span>

        <div className="space-y-1">
          <label
            htmlFor="h2h-conf2"
            className="block text-[10px] uppercase tracking-wider font-normal text-[var(--text-muted)]"
          >
            Conference
          </label>
          <Select value={conf2} onValueChange={handleConf2Change}>
            <SelectTrigger id="h2h-conf2" className="text-sm min-w-[180px]" aria-label="Second conference">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {conferences.map(c => (
                <SelectItem key={c} value={c} disabled={c === conf1}>
                  {c}
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

      <div className="card p-4 max-w-md">
        <p className="text-base text-[var(--text-primary)]">
          {summarize(conf1, conf2, seasonStart, totals)}
        </p>
        {totals.games > 0 && (
          <p className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
            {totals.games} game{totals.games === 1 ? '' : 's'}
            {totals.ties > 0 && `, ${totals.ties} tie${totals.ties === 1 ? '' : 's'}`}
          </p>
        )}
      </div>
    </div>
  )
}
