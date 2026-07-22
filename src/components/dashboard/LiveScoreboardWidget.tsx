'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Football } from '@phosphor-icons/react'
import { EmptyState } from '@/components/EmptyState'
import { fetchLiveScoreboard, type LiveScoreboardGame } from '@/app/live/actions'
import { formatSpread } from '@/lib/format-odds'

// Matches the warehouse's live poller cadence (see src/lib/queries/live.ts).
const POLL_INTERVAL_MS = 5 * 60 * 1000

// Months (1-12) the live poller can plausibly have a slate running --
// August through January, spanning kickoff week through the postseason/CFP.
const IN_SEASON_MONTHS = new Set([8, 9, 10, 11, 12, 1])

/**
 * Pure gating predicate for the dashboard's live scoreboard strip.
 *
 * Visible when either:
 *   (a) the server-provided initial rows are non-empty -- there's something
 *       to show regardless of what day it happens to be, or
 *   (b) it's a Saturday in US Eastern time during the Aug-Jan window the
 *       live poller runs in -- so the widget (and its "no games yet"
 *       fallback) appears ahead of that day's slate posting.
 *
 * Outside both conditions (e.g. an off-season Tuesday with no rows) the
 * widget renders null and the dashboard looks exactly as it does today.
 * Exported standalone so it's unit-testable without mounting the component.
 */
export function isLiveWindow(date: Date, hasRows: boolean): boolean {
  if (hasRows) return true

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'numeric',
  }).formatToParts(date)

  const weekday = parts.find((p) => p.type === 'weekday')?.value
  const month = Number(parts.find((p) => p.type === 'month')?.value)

  return weekday === 'Sat' && IN_SEASON_MONTHS.has(month)
}

function isFinalStatus(status: string): boolean {
  return status === 'final'
}

/** Status line: pregame context, in-progress clock/possession/win-prob, or final result. */
function StatusLine({ game }: { game: LiveScoreboardGame }) {
  if (isFinalStatus(game.status)) {
    const homePts = game.home_points ?? 0
    const awayPts = game.away_points ?? 0
    const winner = homePts > awayPts ? game.home_team : awayPts > homePts ? game.away_team : null

    return (
      <span className="text-xs text-[var(--text-muted)]">
        Final
        {winner && (
          <>
            {' · '}
            <span className="font-semibold text-[var(--text-primary)]">{winner}</span>
          </>
        )}
      </span>
    )
  }

  if (game.status === 'in_progress') {
    const homeWp = game.house_live_home_wp ?? game.cfbd_home_wp
    let wpText: string | null = null
    if (homeWp != null) {
      const homeLeads = homeWp >= 0.5
      const leader = homeLeads ? game.home_team : game.away_team
      const pct = Math.round((homeLeads ? homeWp : 1 - homeWp) * 100)
      wpText = `${leader} ${pct}%`
    }

    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <span className="tabular-nums">
          {game.period != null ? `Q${game.period}` : '—'}{game.clock ? ` ${game.clock}` : ''}
        </span>
        {game.possession && (
          <Football
            size={12}
            weight="fill"
            className="text-[var(--color-run)]"
            aria-label={`${game.possession} has the ball`}
          />
        )}
        {wpText && <span>· {wpText}</span>}
      </span>
    )
  }

  // Pregame / scheduled -- start context (week) plus market lines, if posted.
  const parts: string[] = [`Week ${game.week}`]
  if (game.spread != null) {
    const favoredTeam = game.spread < 0 ? game.home_team : game.away_team
    const favoredLine = game.spread < 0 ? game.spread : -game.spread
    parts.push(`${favoredTeam} ${formatSpread(favoredLine)}`)
  }
  if (game.over_under != null) {
    parts.push(`O/U ${game.over_under}`)
  }

  return <span className="text-xs text-[var(--text-muted)]">{parts.join(' · ')}</span>
}

function GameRow({ game }: { game: LiveScoreboardGame }) {
  const isFinalGame = isFinalStatus(game.status)
  const homePts = game.home_points ?? 0
  const awayPts = game.away_points ?? 0
  const homeWon = isFinalGame && homePts > awayPts
  const awayWon = isFinalGame && awayPts > homePts

  return (
    <Link
      href={`/games/${game.game_id}`}
      className="flex flex-col gap-0.5 py-2 px-1 -mx-1 rounded hover:bg-[var(--bg-surface-alt)] transition-colors"
    >
      <p className="text-sm truncate">
        <span className={awayWon ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
          {game.away_team}
        </span>
        {game.away_points != null && (
          <span className="tabular-nums text-[var(--text-primary)]"> {game.away_points}</span>
        )}
        <span className="text-[var(--text-muted)]"> @ </span>
        <span className={homeWon ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
          {game.home_team}
        </span>
        {game.home_points != null && (
          <span className="tabular-nums text-[var(--text-primary)]"> {game.home_points}</span>
        )}
      </p>
      <StatusLine game={game} />
    </Link>
  )
}

interface LiveScoreboardWidgetProps {
  initialGames: LiveScoreboardGame[]
}

export function LiveScoreboardWidget({ initialGames }: LiveScoreboardWidgetProps) {
  const [games, setGames] = useState(initialGames)

  // Gating uses only the server-provided initial rows -- not the polled
  // state -- so a mid-session refetch can't newly gate the widget on/off.
  const visible = isLiveWindow(new Date(), initialGames.length > 0)
  const hasNonFinalRows = games.some((game) => !isFinalStatus(game.status))

  useEffect(() => {
    if (!visible || games.length === 0 || !hasNonFinalRows) return

    const id = setInterval(() => {
      fetchLiveScoreboard()
        .then(setGames)
        .catch(() => {
          // Transient fetch failure -- keep showing the last good snapshot.
        })
    }, POLL_INTERVAL_MS)

    return () => clearInterval(id)
  }, [visible, games.length, hasNonFinalRows])

  if (!visible) return null

  return (
    <div className="card p-4 mb-6">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-medium text-[var(--text-muted)]">Live Scoreboard</h2>
      </div>

      {games.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
          {games.map((game) => (
            <GameRow key={game.game_id} game={game} />
          ))}
        </div>
      ) : (
        // This is a client component, so the house EmptyState is usable
        // directly (the inline copies in EdgeBoardWidget / models page exist
        // only because icon functions aren't RSC-serializable).
        <EmptyState
          icon={Football}
          title="No games on the board right now — check back at kickoff."
        />
      )}
    </div>
  )
}
