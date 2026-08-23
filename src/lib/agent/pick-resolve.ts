/**
 * Deterministic resolution of LLM pick candidates into storable ledger picks:
 * team-name normalization (exact -> alias -> unique prefix), game matching
 * against the real schedule via the query_games MCP tool, and line capture
 * at pick time. Ported from bot/src/pick-resolve.ts with two swaps: team
 * data comes from the copied src/lib/agent/data/teams.json, and the schedule
 * lookup calls src/lib/mcp/tools.ts's queryGamesTool directly (in-process)
 * instead of going through the bot's MCP client transport.
 *
 * Resolution only -- this module never sees the LLM (it consumes structured
 * PickCandidate objects) and never touches storage (picks-store.ts does
 * that); extraction.ts wires the two together. Never throws -- the caller is
 * a fire-and-forget post-turn hook; unresolvable candidates are dropped
 * silently, because a false public pick is worse than a missed one.
 */
import teams from './data/teams.json'
import { queryGamesTool } from '@/lib/mcp/tools'
import { CURRENT_SEASON } from '@/lib/queries/constants'
import type { NewPick, PickDirection, PickKind } from './picks-store'

export interface PickCandidate {
  type: PickKind
  team: string
  opponent?: string | null
  direction?: PickDirection | null
  threshold?: number | null
  seasonRef?: 'current' | 'next' | null
  quote: string
}

const TEAM_NAMES: readonly string[] = teams as string[]
const TEAM_BY_LOWER = new Map(TEAM_NAMES.map(name => [name.toLowerCase(), name]))

/**
 * Hand-maintained aliases, skewed toward the bot server's usage this was
 * ported from. `null` marks a deliberately ambiguous alias (osu: Ohio State
 * vs Oklahoma State) that must never resolve. Refresh alongside
 * data/teams.json each offseason.
 */
const TEAM_ALIASES: Record<string, string | null> = {
  ou: 'Oklahoma',
  sooners: 'Oklahoma',
  boomer: 'Oklahoma',
  horns: 'Texas',
  longhorns: 'Texas',
  ut: 'Texas',
  bama: 'Alabama',
  tide: 'Alabama',
  'roll tide': 'Alabama',
  aggies: 'Texas A&M',
  'a&m': 'Texas A&M',
  tamu: 'Texas A&M',
  uga: 'Georgia',
  dawgs: 'Georgia',
  tigers: null, // LSU? Auburn? Missouri? Clemson? never guess
  osu: null, // Ohio State vs Oklahoma State -- never guess
  buckeyes: 'Ohio State',
  pokes: 'Oklahoma State',
  frogs: 'TCU',
  rebels: 'Ole Miss',
  huskers: 'Nebraska',
  irish: 'Notre Dame',
  ducks: 'Oregon',
  wolverines: 'Michigan',
  vols: 'Tennessee',
}

/**
 * Normalizes a spoken team name to the exact DB school name, or null when
 * it can't be done unambiguously: exact case-insensitive match, then the
 * alias map, then a UNIQUE case-insensitive prefix match ("Ohio St" ->
 * Ohio State); zero or multiple prefix hits -> null.
 */
export function normalizeTeam(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase()
  if (cleaned.length === 0) return null

  const exact = TEAM_BY_LOWER.get(cleaned)
  if (exact) return exact

  if (cleaned in TEAM_ALIASES) return TEAM_ALIASES[cleaned]!

  const prefixMatches = TEAM_NAMES.filter(name => name.toLowerCase().startsWith(cleaned))
  return prefixMatches.length === 1 ? prefixMatches[0]! : null
}

/** The query_games row fields resolution reads (unchecked cast, like the bot's command handlers). */
interface GameRow {
  game_id: number
  season: number
  week: number
  start_date: string
  completed: boolean
  home_team: string
  away_team: string
  home_spread: number | null
}

/**
 * queryGamesTool is a total function (friendly strings, never throws by
 * contract) that returns either a JSON envelope {_source, count, rows} on
 * success, or a plain-text message ("No games found matching the given
 * filters." / "Error: ...") when there's nothing to resolve against. A
 * failed JSON.parse on the plain-text cases is the expected discriminator,
 * not a bug -- so it is not logged as a failure; only a genuine call
 * rejection (the tool threw, e.g. an abnormal telemetry-layer error) is.
 */
async function fetchSchedule(season: number, team: string): Promise<GameRow[] | null> {
  let raw: string
  try {
    raw = await queryGamesTool({ season, team, limit: 100 })
  } catch (err) {
    console.error('[agent/pick-resolve] schedule fetch failed:', err instanceof Error ? err.message : err)
    return null
  }
  try {
    const parsed = JSON.parse(raw) as { rows?: unknown }
    return Array.isArray(parsed.rows) ? (parsed.rows as GameRow[]) : null
  } catch {
    return null
  }
}

/**
 * Resolves one game-pick candidate to a scheduled game: with an opponent,
 * the earliest uncompleted game against that opponent; without one (ATS
 * "we cover Saturday"), the team's next uncompleted game.
 */
function matchGame(rows: GameRow[], team: string, opponent: string | null): GameRow | null {
  const upcoming = rows
    .filter(row => row.completed === false)
    .filter(row => row.home_team === team || row.away_team === team)
    .filter(row => {
      if (!opponent) return true
      const other = row.home_team === team ? row.away_team : row.home_team
      return other === opponent
    })
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  return upcoming[0] ?? null
}

async function resolveOne(userId: string, candidate: PickCandidate, guildId?: string): Promise<NewPick | null> {
  const team = normalizeTeam(candidate.team)
  if (!team) return null

  const season = CURRENT_SEASON + (candidate.seasonRef === 'next' ? 1 : 0)
  const statement = candidate.quote.slice(0, 200)

  if (candidate.type === 'season_total') {
    const threshold = candidate.threshold
    if (threshold === undefined || threshold === null || threshold <= 0) return null
    // Half-point line so pushes can't exist: "wins 10" (over) wins iff
    // actual > 9.5; "doesn't get to 8" (under) wins iff actual < 7.5.
    const line = Number.isInteger(threshold) ? threshold - 0.5 : threshold
    const direction = candidate.direction === 'under' ? 'under' : 'over'
    return { userId, guildId, kind: 'season_total', team, season, direction, line, statement }
  }

  // Game picks need a real scheduled game.
  const opponent = candidate.opponent ? normalizeTeam(candidate.opponent) : null
  if (candidate.opponent && !opponent) return null

  const rows = await fetchSchedule(season, team)
  if (!rows) return null
  const game = matchGame(rows, team, opponent)
  if (!game) return null

  const base = {
    userId,
    guildId,
    team,
    opponent: game.home_team === team ? game.away_team : game.home_team,
    gameId: game.game_id,
    season,
    week: game.week,
    pickHome: game.home_team === team,
    statement,
  }

  if (candidate.type === 'game_winner') {
    return { ...base, kind: 'game_winner', direction: 'win' }
  }
  // ats: the DB line at pick time is canonical (one sign convention); a
  // null line is stored as pending and backfilled by settlement.
  return { ...base, kind: 'ats', direction: 'cover', line: game.home_spread ?? undefined }
}

/**
 * Resolves candidates to storable NewPick objects, dropping anything
 * unresolvable (unknown/ambiguous team, no matching scheduled game, missing
 * threshold, etc). Never throws -- a rejection resolving one candidate
 * (e.g. the MCP call itself failing) just drops that candidate.
 */
export async function resolvePickCandidates(
  userId: string,
  candidates: PickCandidate[],
  guildId?: string
): Promise<NewPick[]> {
  const resolved: NewPick[] = []
  for (const candidate of candidates) {
    try {
      const pick = await resolveOne(userId, candidate, guildId)
      if (pick) resolved.push(pick)
    } catch (err) {
      console.error('[agent/pick-resolve] failed to resolve a pick candidate:', err instanceof Error ? err.message : err)
    }
  }
  return resolved
}
