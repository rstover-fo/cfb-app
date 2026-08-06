/**
 * Deterministic resolution of LLM pick candidates into stored ledger picks:
 * team-name normalization (exact -> alias -> unique prefix), game matching
 * against the real schedule via query_games, and line capture at pick time.
 * Sits between memory-extract.ts (which never sees MCP) and pick-store.ts
 * (which never sees the LLM). Never throws -- the caller is the
 * fire-and-forget extraction path; unresolvable candidates are dropped
 * silently and only counted in the log, because a false public pick is
 * worse than a missed one.
 */
import teams from './data/teams.json' with { type: 'json' }
import { callCfbTool } from './mcp-client.js'
import { getDefaultSeason } from './config.js'
import { recordPick } from './pick-store.js'
import type { NewPick, Pick, PickDirection, PickKind } from './storage/backend.js'

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
 * Hand-maintained aliases, skewed toward this server's usage. `null` marks
 * a deliberately ambiguous alias (osu: Ohio State vs Oklahoma State) that
 * must never resolve. Refresh alongside data/teams.json each offseason.
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

/** The query_games row fields resolution reads (unchecked cast, like the command handlers). */
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

async function fetchSchedule(season: number, team: string): Promise<GameRow[] | null> {
  try {
    const result = await callCfbTool('query_games', { season, team, limit: 100 })
    if (result.kind !== 'rows') return null
    return result.rows as GameRow[]
  } catch (err) {
    console.error('[pick-resolve] schedule fetch failed:', err instanceof Error ? err.message : err)
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

/**
 * Resolves candidates and records the survivors. Returns the stored picks
 * (deduped re-statements excluded) for the capture acknowledgment. Never
 * throws; drops count into the structured log only. `guildId` stamps the
 * capture guild so the public ledger views can stay per-server.
 */
export async function resolveAndRecordPicks(userId: string, candidates: PickCandidate[], guildId?: string): Promise<Pick[]> {
  const stored: Pick[] = []
  let dropped = 0

  for (const candidate of candidates) {
    try {
      const pick = await resolveOne(userId, candidate, guildId)
      if (!pick) {
        dropped++
        continue
      }
      const { stored: saved } = await recordPick(userId, pick)
      if (saved) stored.push(saved)
    } catch (err) {
      dropped++
      console.error('[pick-resolve] failed to resolve/record a pick:', err instanceof Error ? err.message : err)
    }
  }

  if (candidates.length > 0) {
    console.log(JSON.stringify({ evt: 'pick_resolve', candidates: candidates.length, stored: stored.length, dropped }))
  }
  return stored
}

async function resolveOne(userId: string, candidate: PickCandidate, guildId?: string): Promise<NewPick | null> {
  const team = normalizeTeam(candidate.team)
  if (!team) return null

  const season = getDefaultSeason() + (candidate.seasonRef === 'next' ? 1 : 0)
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
