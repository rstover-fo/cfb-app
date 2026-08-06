/**
 * Settlement loop for the prediction ledger: on an hourly tick (plus once at
 * boot), resolve every open pick that has a final result. Uses only the free
 * deterministic MCP tools -- zero LLM cost -- and makes ZERO MCP calls when
 * there are no open picks.
 *
 * Grading rules (empirically verified against real 2025 games):
 * - home_spread is negative when home is favored; home covered iff
 *   (home_points - away_points) + home_spread > 0, exactly 0 is a push.
 * - point_diff in the data is the WINNER's absolute margin -- never use it;
 *   compute home_points - away_points from the raw scores.
 * - Game fetches go by (season, team): ~16 rows, always complete. Fetching
 *   by week risks the 100-row cap truncating a busy week, and postseason
 *   weeks restart at 1.
 * - Season totals settle from get_season_outlook: actual_wins is monotone,
 *   so actual_wins > line settles the safe direction early; the final
 *   record is authoritative only when is_projection === false. The
 *   "mathematically eliminated" side is deliberately NOT early-settled:
 *   games_scheduled grows when title games/bowls get added.
 */
import { callCfbTool } from './mcp-client.js'
import { listOpenPicks, settlePick, backfillLine } from './pick-store.js'
import { tryParseJson } from './commands/errors.js'
import type { Pick } from './storage/backend.js'

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000

interface GameRow {
  game_id: number
  completed: boolean
  home_team: string
  away_team: string
  home_points: number | null
  away_points: number | null
  winner: string | null
  home_spread: number | null
}

interface OutlookRow {
  season: number
  team: string
  actual_wins: number | null
  schedule_complete: boolean | null
  is_projection: boolean | null
}

interface OutlookPayload {
  rows?: OutlookRow[]
}

interface RunStats {
  open: number
  settled: number
  won: number
  lost: number
  push: number
  voided: number
  lines_backfilled: number
  mcp_calls: number
}

function fmtLine(line: number): string {
  return line > 0 ? `+${line}` : `${line}`
}

/**
 * Settles one completed game pick. Returns the outcome recorded, or null
 * when the pick must stay open (winner not yet stamped, line still pending
 * pregame, ...).
 */
async function settleGamePick(pick: Pick, row: GameRow, stats: RunStats): Promise<void> {
  const score =
    row.home_points !== null && row.away_points !== null
      ? `${row.home_team} ${row.home_points}–${row.away_points} ${row.away_team}`
      : `${row.home_team} vs ${row.away_team}`

  // settlePick is a conditional open->settled transition: false means the
  // pick stopped being open mid-run (user void/supersede) -- count nothing.
  if (pick.kind === 'game_winner') {
    if (row.winner === null) return // completed but winner not stamped yet: data lag, retry next tick
    const won = row.winner === pick.team
    if (!(await settlePick(pick.id, won ? 'won' : 'lost', score))) return
    stats.settled++
    won ? stats.won++ : stats.lost++
    return
  }

  // ats
  let line = pick.line
  if (line === undefined) {
    if (row.home_spread === null) {
      // Game is final and no market line ever existed: nothing to grade.
      if (!(await settlePick(pick.id, 'void', 'no market line ever posted'))) return
      stats.settled++
      stats.voided++
      return
    }
    line = row.home_spread
    if (!(await backfillLine(pick.id, line))) return
    stats.lines_backfilled++
  }
  if (row.home_points === null || row.away_points === null) return

  const homeMargin = row.home_points - row.away_points
  const adjusted = homeMargin + line
  const favorite = line < 0 ? row.home_team : row.away_team
  const detail = `${score} (${favorite} ${fmtLine(-Math.abs(line))})`

  if (adjusted === 0) {
    if (!(await settlePick(pick.id, 'push', `${detail}: push`))) return
    stats.settled++
    stats.push++
    return
  }
  const homeCovered = adjusted > 0
  const won = (pick.pickHome ?? false) === homeCovered
  const margin = Math.abs(adjusted)
  if (!(await settlePick(pick.id, won ? 'won' : 'lost', `${detail}: ${won ? 'covered' : 'missed'} by ${margin}`))) return
  stats.settled++
  won ? stats.won++ : stats.lost++
}

async function settleSeasonTotal(pick: Pick, row: OutlookRow, stats: RunStats): Promise<void> {
  if (pick.line === undefined || pick.direction === undefined) return
  const actual = row.actual_wins
  if (actual === null || actual === undefined) return

  const isFinal = row.is_projection === false && row.schedule_complete === true

  // Early settlement, safe direction only: actual_wins is monotone.
  if (actual > pick.line) {
    const won = pick.direction === 'over'
    if (!(await settlePick(pick.id, won ? 'won' : 'lost', `${pick.team} reached ${actual} wins (line ${pick.line})`))) return
    stats.settled++
    won ? stats.won++ : stats.lost++
    return
  }

  if (!isFinal) return
  // Final record, and actual <= line means actual < line (half-point lines).
  const won = pick.direction === 'under'
  if (!(await settlePick(pick.id, won ? 'won' : 'lost', `${pick.team} finished with ${actual} wins (line ${pick.line})`))) return
  stats.settled++
  won ? stats.won++ : stats.lost++
}

/** One full settlement pass. Exported for tests; never throws. */
export async function runSettlementOnce(): Promise<void> {
  const stats: RunStats = { open: 0, settled: 0, won: 0, lost: 0, push: 0, voided: 0, lines_backfilled: 0, mcp_calls: 0 }
  try {
    const open = await listOpenPicks()
    stats.open = open.length
    if (open.length === 0) return // zero MCP calls in the idle case

    // --- game picks, one query_games fetch per (season, team), memoized ---
    const gamePicks = open.filter(pick => pick.kind !== 'season_total' && pick.gameId !== undefined)
    const scheduleCache = new Map<string, GameRow[] | null>()
    for (const pick of gamePicks) {
      const cacheKey = `${pick.season}:${pick.team}`
      if (!scheduleCache.has(cacheKey)) {
        try {
          stats.mcp_calls++
          const result = await callCfbTool('query_games', { season: pick.season, team: pick.team, limit: 100 })
          scheduleCache.set(cacheKey, result.kind === 'rows' ? (result.rows as GameRow[]) : null)
        } catch (err) {
          console.error('[settlement] schedule fetch failed:', err instanceof Error ? err.message : err)
          scheduleCache.set(cacheKey, null)
        }
      }
      const rows = scheduleCache.get(cacheKey)
      if (!rows) continue // group unresolvable this tick; run survives
      const row = rows.find(r => r.game_id === pick.gameId)
      if (!row) continue
      try {
        if (row.completed !== true) {
          // Pregame: the only useful work is backfilling a pending ATS line
          // once the market posts one.
          if (pick.kind === 'ats' && pick.line === undefined && row.home_spread !== null) {
            await backfillLine(pick.id, row.home_spread)
            stats.lines_backfilled++
          }
          continue
        }
        await settleGamePick(pick, row, stats)
      } catch (err) {
        console.error('[settlement] settling a game pick failed:', err instanceof Error ? err.message : err)
      }
    }

    // --- season totals, one get_season_outlook per (team, season) ---
    const seasonPicks = open.filter(pick => pick.kind === 'season_total')
    const outlookCache = new Map<string, OutlookRow | null>()
    for (const pick of seasonPicks) {
      const cacheKey = `${pick.team}:${pick.season}`
      if (!outlookCache.has(cacheKey)) {
        try {
          stats.mcp_calls++
          const result = await callCfbTool('get_season_outlook', { team: pick.team, season: pick.season })
          // Composite payload: arrives as kind 'message' and must be parsed.
          const payload = result.kind === 'message' ? tryParseJson<OutlookPayload>(result.text) : null
          const row = payload?.rows?.find(r => r.team === pick.team && r.season === pick.season) ?? null
          outlookCache.set(cacheKey, row)
        } catch (err) {
          console.error('[settlement] outlook fetch failed:', err instanceof Error ? err.message : err)
          outlookCache.set(cacheKey, null)
        }
      }
      const row = outlookCache.get(cacheKey)
      if (!row) continue
      try {
        await settleSeasonTotal(pick, row, stats)
      } catch (err) {
        console.error('[settlement] settling a season total failed:', err instanceof Error ? err.message : err)
      }
    }
  } catch (err) {
    console.error('[settlement] run failed:', err instanceof Error ? err.message : err)
  } finally {
    if (stats.open > 0) {
      console.log(JSON.stringify({ evt: 'settlement', ...stats }))
    }
  }
}

/**
 * Starts the loop: one immediate pass, then every `intervalMs`. The interval
 * is unref()'d so it can never hold the process open. Returns a stop().
 */
export function startSettlementLoop(intervalMs = DEFAULT_INTERVAL_MS): () => void {
  void runSettlementOnce()
  const interval = setInterval(() => void runSettlementOnce(), intervalMs)
  interval.unref()
  return () => clearInterval(interval)
}
