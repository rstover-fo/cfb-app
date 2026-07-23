/**
 * discord.js EmbedBuilder helpers, one per deterministic command, plus a
 * shared errorEmbed and splitMessage (the latter needed by /ask in Phase B,
 * built and tested now per the plan).
 *
 * Row shapes below are hand-typed subsets of the `api.*` views/RPCs each
 * tool is backed by (see the parent app's src/lib/queries/mcp.ts and
 * src/lib/queries/predictions.ts) -- only the fields actually rendered.
 * Every builder assumes it's called with already-parsed rows (mcp-client.ts
 * or the calling command has already unwrapped the MCP envelope).
 */
import { EmbedBuilder } from 'discord.js'

// ---------------------------------------------------------------------------
// Discord embed limits
// ---------------------------------------------------------------------------

const DESCRIPTION_MAX = 4096
const FIELD_VALUE_MAX = 1024
const FIELD_NAME_MAX = 256
const FIELD_COUNT_MAX = 25

const COLOR_INFO = 0x3b6ea5
const COLOR_ERROR = 0xb33a3a

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  if (max <= 1) return text.slice(0, max)
  return `${text.slice(0, max - 1)}…`
}

function capFields(fields: { name: string; value: string; inline?: boolean }[]) {
  return fields.slice(0, FIELD_COUNT_MAX).map(f => ({
    name: truncate(f.name, FIELD_NAME_MAX),
    value: truncate(f.value || '—', FIELD_VALUE_MAX),
    inline: f.inline,
  }))
}

function footerText(source: string, season?: number): string {
  return season != null ? `${source} · season ${season}` : source
}

function fmtNum(value: number | null | undefined, digits = 1): string {
  return typeof value === 'number' ? value.toFixed(digits) : '—'
}

function fmtInt(value: number | null | undefined): string {
  return typeof value === 'number' ? String(Math.round(value)) : '—'
}

function fmtPct(value: number | null | undefined): string {
  return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '—'
}

function fmtRank(value: number | null | undefined): string {
  return typeof value === 'number' ? `#${Math.round(value)}` : 'unranked'
}

// ---------------------------------------------------------------------------
// Shared error / info embed
// ---------------------------------------------------------------------------

export function errorEmbed(title: string, hint: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_ERROR)
    .setTitle(truncate(title, FIELD_NAME_MAX))
    .setDescription(truncate(hint || 'No further details available.', DESCRIPTION_MAX))
}

// ---------------------------------------------------------------------------
// /rankings -- api.poll_rankings
// ---------------------------------------------------------------------------

export interface PollRankingRow {
  season: number | null
  season_type: string | null
  week: number | null
  poll: string | null
  rank: number | null
  school: string | null
  conference: string | null
  first_place_votes: number | null
  points: number | null
}

export interface RankingsEmbedOptions {
  season: number
  week?: number
  poll?: string
  source: string
}

export function buildRankingsEmbed(rows: PollRankingRow[], opts: RankingsEmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(`Rankings${opts.week != null ? ` — Week ${opts.week}` : ''}`)
    .setFooter({ text: footerText(opts.source, opts.season) })

  const byPoll = new Map<string, PollRankingRow[]>()
  for (const row of rows) {
    const key = row.poll ?? 'Unknown Poll'
    const list = byPoll.get(key) ?? []
    list.push(row)
    byPoll.set(key, list)
  }

  const fields = Array.from(byPoll.entries()).map(([poll, pollRows]) => {
    const lines = pollRows.map(r => {
      const votes = r.first_place_votes ? ` · ${r.first_place_votes} 1st` : ''
      return `**${r.rank ?? '—'}.** ${r.school ?? 'Unknown'}${r.conference ? ` (${r.conference})` : ''} — ${r.points ?? '—'} pts${votes}`
    })
    return { name: poll, value: lines.join('\n') }
  })

  embed.addFields(capFields(fields.length > 0 ? fields : [{ name: 'Rankings', value: 'No rows to display.' }]))
  return embed
}

// ---------------------------------------------------------------------------
// /scores -- api.live_scoreboard
// ---------------------------------------------------------------------------

export interface LiveScoreboardRow {
  game_id: number | null
  status: string | null
  period: number | null
  clock: string | null
  home_team: string | null
  away_team: string | null
  home_points: number | null
  away_points: number | null
  possession: string | null
  house_live_home_wp: number | null
}

export function buildScoresEmbed(rows: LiveScoreboardRow[]): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLOR_INFO).setTitle('Live Scoreboard')

  if (rows.length === 0) {
    return embed.setDescription('No live games right now — scoreboard fills up on game days.')
  }

  embed.setFooter({ text: footerText('api.live_scoreboard') })

  const fields = rows.map(r => {
    const statusLine =
      r.status === 'in_progress'
        ? `Q${r.period ?? '?'} ${r.clock ?? ''}`.trim()
        : (r.status ?? 'scheduled')
    const possession = r.possession ? ` · ${r.possession} ball` : ''
    const wp = typeof r.house_live_home_wp === 'number' ? ` · home WP ${fmtPct(r.house_live_home_wp)}` : ''
    return {
      name: `${r.away_team ?? 'Away'} @ ${r.home_team ?? 'Home'}`,
      value: `${r.away_points ?? 0}–${r.home_points ?? 0} · ${statusLine}${possession}${wp}`,
    }
  })

  embed.addFields(capFields(fields))
  return embed
}

// ---------------------------------------------------------------------------
// /team -- api.team_detail + api.team_history
// ---------------------------------------------------------------------------

export interface TeamDetailRow {
  school: string | null
  mascot: string | null
  conference: string | null
  classification: string | null
  current_season: number | null
  wins: number | null
  losses: number | null
  conf_wins: number | null
  conf_losses: number | null
  ppg: number | null
  opp_ppg: number | null
  sp_rating: number | null
  sp_rank: number | null
  elo: number | null
  fpi: number | null
  epa_per_play: number | null
  recruiting_rank: number | null
}

export interface TeamHistoryRow {
  season: number
  wins: number | null
  losses: number | null
  sp_rating: number | null
  sp_rank: number | null
}

export function buildTeamEmbed(detail: TeamDetailRow | null, history: TeamHistoryRow[], teamName: string): EmbedBuilder {
  const name = detail?.school ?? teamName
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(detail?.mascot ? `${name} ${detail.mascot}` : name)
    .setFooter({ text: footerText('api.team_detail + api.team_history', detail?.current_season ?? undefined) })

  if (detail) {
    const record = `${detail.wins ?? 0}-${detail.losses ?? 0}${detail.conf_wins != null ? ` (${detail.conf_wins}-${detail.conf_losses ?? 0} conf)` : ''}`
    const ratings = [
      `SP+ ${fmtNum(detail.sp_rating)} (${fmtRank(detail.sp_rank)})`,
      `Elo ${fmtInt(detail.elo)}`,
      `FPI ${fmtNum(detail.fpi)}`,
      `EPA/play ${fmtNum(detail.epa_per_play, 3)}`,
    ].join(' · ')
    const scoring = `${fmtNum(detail.ppg)} PPG scored, ${fmtNum(detail.opp_ppg)} PPG allowed`
    embed.setDescription(
      [
        `**${detail.conference ?? 'Independent'}** — ${record}`,
        ratings,
        scoring,
        detail.recruiting_rank != null ? `Recruiting rank: ${fmtRank(detail.recruiting_rank)}` : null,
      ]
        .filter((line): line is string => line != null)
        .join('\n')
    )
  }

  if (history.length > 0) {
    const lines = history
      .slice(0, 8)
      .map(h => `**${h.season}:** ${h.wins ?? 0}-${h.losses ?? 0}, SP+ ${fmtNum(h.sp_rating)} (${fmtRank(h.sp_rank)})`)
    embed.addFields(capFields([{ name: 'Recent Seasons', value: lines.join('\n') }]))
  }

  return embed
}

// ---------------------------------------------------------------------------
// /matchup -- api.matchup + api.game_detail
// ---------------------------------------------------------------------------

// api.matchup serializes camelCase (unlike the snake_case api.* table views) --
// shapes verified against a live query_matchup response, not guessed.
export interface MatchupRow {
  teamA: string | null
  teamB: string | null
  totalGames: number | null
  teamAWins: number | null
  teamBWins: number | null
  ties: number | null
  firstMeeting: number | null
  lastMeeting: number | null
  streak: { team: string | null; count: number | null } | null
}

// query_matchup's games rows are a camelCase A/B projection of
// api.game_detail (teamAScore/teamAHome), NOT the snake_case
// home_team/home_points shape query_games returns.
export interface MatchupGameRow {
  season: number
  seasonType: string | null
  teamAScore: number | null
  teamBScore: number | null
  teamAHome: boolean | null
  neutralSite: boolean | null
  winner: string | null
  venue: string | null
}

export function buildMatchupEmbed(
  matchup: MatchupRow,
  games: MatchupGameRow[],
  teamAFallback: string,
  teamBFallback: string
): EmbedBuilder {
  const teamA = matchup.teamA ?? teamAFallback
  const teamB = matchup.teamB ?? teamBFallback
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(`${teamA} vs ${teamB}`)
    .setFooter({ text: footerText('api.matchup + api.game_detail') })

  const seriesLine =
    matchup.totalGames != null && matchup.totalGames > 0
      ? `All-time: **${teamA} ${matchup.teamAWins ?? 0}–${matchup.teamBWins ?? 0} ${teamB}**` +
        `${matchup.ties ? ` (${matchup.ties} ties)` : ''} across ${matchup.totalGames} games` +
        `${matchup.firstMeeting ? ` since ${matchup.firstMeeting}` : ''}`
      : 'These teams have no recorded meetings.'

  const streakLine =
    matchup.streak?.team && (matchup.streak.count ?? 0) > 1
      ? `${matchup.streak.team} has won ${matchup.streak.count} straight`
      : null

  embed.setDescription([seriesLine, streakLine].filter((l): l is string => l != null).join('\n'))

  if (games.length > 0) {
    const lines = games.slice(0, 5).map(g => {
      const homeIsA = g.teamAHome !== false
      const [homeName, homeScore, awayName, awayScore] = homeIsA
        ? [teamA, g.teamAScore, teamB, g.teamBScore]
        : [teamB, g.teamBScore, teamA, g.teamAScore]
      const sep = g.neutralSite ? 'vs' : '@'
      return `**${g.season}:** ${awayName} ${awayScore ?? '—'} ${sep} ${homeName} ${homeScore ?? '—'}`
    })
    embed.addFields(capFields([{ name: 'Recent Meetings', value: lines.join('\n') }]))
  }

  return embed
}

// ---------------------------------------------------------------------------
// /edges -- api.scored_matchup_edges
// ---------------------------------------------------------------------------

export interface MatchupEdgeRow {
  game_id: number | null
  season: number | null
  week: number | null
  start_date: string | null
  home_team: string | null
  away_team: string | null
  expected_home_margin: number | null
  home_win_prob: number | null
  market_spread: number | null
  edge: number | null
  edge_pick: string | null
  abs_edge: number | null
}

export interface EdgesEmbedOptions {
  season: number
  week?: number
}

export function buildEdgesEmbed(rows: MatchupEdgeRow[], opts: EdgesEmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(`Matchup Edges${opts.week != null ? ` — Week ${opts.week}` : ''}`)
    .setFooter({ text: footerText('api.scored_matchup_edges', opts.season) })

  if (rows.length === 0) {
    return embed.setDescription(
      'No scored matchup edges right now — this is normal in the off-season or once the week\'s slate has locked in.'
    )
  }

  const lines = rows.map(r => {
    const marketLine = r.market_spread != null ? `market ${r.market_spread > 0 ? '+' : ''}${r.market_spread}` : 'no market line'
    const edgeLine = r.edge != null ? `edge ${r.edge > 0 ? '+' : ''}${fmtNum(r.edge)} (${r.edge_pick ?? '—'})` : 'no edge (no market line)'
    return `**${r.away_team ?? 'Away'} @ ${r.home_team ?? 'Home'}** — model margin ${fmtNum(r.expected_home_margin)}, ${marketLine}, ${edgeLine}`
  })

  embed.setDescription(truncate(lines.join('\n'), DESCRIPTION_MAX))
  return embed
}

// ---------------------------------------------------------------------------
// /leaders -- api.leaderboard_teams or api.team_wepa_season
// ---------------------------------------------------------------------------

export type LeaderboardMetric = 'wins' | 'ppg' | 'scoring_defense' | 'epa' | 'sp_rating' | 'wepa'

export interface LeaderRow {
  team: string
  conference: string | null
  wins: number | null
  losses: number | null
  ppg: number | null
  opp_ppg: number | null
  epa_per_play: number | null
  sp_rating: number | null
  sp_rank: number | null
  epa_total: number | null
}

export interface LeadersEmbedOptions {
  season: number
  metric: LeaderboardMetric
  source: string
}

const METRIC_LABEL: Record<LeaderboardMetric, string> = {
  wins: 'Wins',
  ppg: 'Points Per Game',
  scoring_defense: 'Scoring Defense',
  epa: 'EPA/Play',
  sp_rating: 'SP+ Rating',
  wepa: 'Opponent-Adjusted EPA',
}

function leaderStatLine(row: LeaderRow, metric: LeaderboardMetric): string {
  switch (metric) {
    case 'wins':
      return `${row.wins ?? 0}-${row.losses ?? 0}`
    case 'ppg':
      return `${fmtNum(row.ppg)} PPG`
    case 'scoring_defense':
      return `${fmtNum(row.opp_ppg)} PPG allowed`
    case 'epa':
      return `${fmtNum(row.epa_per_play, 3)} EPA/play`
    case 'sp_rating':
      return `${fmtNum(row.sp_rating)} (${fmtRank(row.sp_rank)})`
    case 'wepa':
      // api.team_wepa_season has no rank column -- rows arrive best-to-worst,
      // so the list's own numbering is the rank.
      return `${fmtNum(row.epa_total)} adj. EPA`
  }
}

export function buildLeadersEmbed(rows: LeaderRow[], opts: LeadersEmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(`Leaders — ${METRIC_LABEL[opts.metric]}`)
    .setFooter({ text: footerText(opts.source, opts.season) })

  const lines = rows.map((r, i) => `**${i + 1}.** ${r.team}${r.conference ? ` (${r.conference})` : ''} — ${leaderStatLine(r, opts.metric)}`)
  embed.setDescription(truncate(lines.length > 0 ? lines.join('\n') : 'No rows to display.', DESCRIPTION_MAX))
  return embed
}

// ---------------------------------------------------------------------------
// /player -- public.get_player_search + public.get_player_detail
// ---------------------------------------------------------------------------

export interface PlayerSearchRow {
  player_id: string
  name: string
  team: string
  position: string | null
  season: number
}

export interface PlayerDetailRow {
  player_id: string
  name: string
  team: string
  position: string | null
  jersey: number | null
  height: number | null
  weight: number | null
  year: number | null
  season: number
  stars: number | null
  recruit_rating: number | null
  pass_yds: number | null
  pass_td: number | null
  pass_int: number | null
  rush_yds: number | null
  rush_td: number | null
  rec: number | null
  rec_yds: number | null
  rec_td: number | null
  tackles: number | null
  sacks: number | null
  def_int: number | null
}

function playerStatLine(d: PlayerDetailRow): string {
  const parts: string[] = []
  if (d.pass_yds != null) parts.push(`${d.pass_yds} pass yds, ${d.pass_td ?? 0} TD, ${d.pass_int ?? 0} INT`)
  if (d.rush_yds != null) parts.push(`${d.rush_yds} rush yds, ${d.rush_td ?? 0} TD`)
  if (d.rec != null) parts.push(`${d.rec} rec, ${d.rec_yds ?? 0} yds, ${d.rec_td ?? 0} TD`)
  if (d.tackles != null) parts.push(`${d.tackles} tackles, ${d.sacks ?? 0} sacks, ${d.def_int ?? 0} INT`)
  return parts.length > 0 ? parts.join('\n') : 'No stat lines recorded for this season.'
}

export function buildPlayerEmbed(search: PlayerSearchRow[], detail: PlayerDetailRow | null): EmbedBuilder {
  const top = detail ?? search[0]
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(top ? `${top.name} — ${top.team}` : 'Player Search')
    .setFooter({ text: footerText('public.get_player_search + public.get_player_detail') })

  if (detail) {
    const bio = [
      detail.position ? `Position: ${detail.position}` : null,
      detail.jersey != null ? `#${detail.jersey}` : null,
      detail.height != null ? `${detail.height}" ` : null,
      detail.weight != null ? `${detail.weight} lbs` : null,
      detail.year != null ? `Year ${detail.year}` : null,
      detail.stars != null ? `${detail.stars}★ recruit` : null,
    ]
      .filter((v): v is string => v != null)
      .join(' · ')
    embed.setDescription([`**${detail.season} season**`, bio, playerStatLine(detail)].filter(Boolean).join('\n'))
  } else if (search.length === 0) {
    embed.setDescription('No players found.')
  }

  const others = search.filter(s => s.player_id !== top?.player_id).slice(0, 8)
  if (others.length > 0) {
    const lines = others.map(s => `${s.name} — ${s.team}${s.position ? ` (${s.position})` : ''}`)
    embed.addFields(capFields([{ name: 'Other matches', value: lines.join('\n') }]))
  }

  return embed
}

// ---------------------------------------------------------------------------
// /help
// ---------------------------------------------------------------------------

export function buildHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle('CFB Bot — Commands')
    .setDescription(
      [
        '**/rankings** `[week] [poll] [top]` — Poll rankings (AP / Coaches).',
        '**/scores** — Live scoreboard.',
        '**/team** `<team>` — Team snapshot + recent seasons.',
        '**/matchup** `<team1> <team2>` — Head-to-head history.',
        '**/edges** `[week] [limit]` — Model-vs-market betting edges.',
        '**/leaders** `<metric> [limit]` — Team leaderboards.',
        '**/player** `<name> [team]` — Player search + season stats.',
        '**/ask** `<question>` — Ask the AI stats analyst anything (you can also @-mention the bot).',
        '**/myteam** `<team>` — Save your favorite team as chat context.',
        '**/lore** `<on|off>` — Toggle the server-lore jokes (off persists across restarts).',
      ].join('\n')
    )
    .setFooter({ text: 'Data from the CFB Team 360 MCP server' })
}

// ---------------------------------------------------------------------------
// splitMessage -- ≤1900-char chunks for plain-text replies (Phase B's /ask),
// split at a paragraph boundary first, then a sentence boundary, hard cap 3
// chunks with the final one marked as truncated if content remains.
// ---------------------------------------------------------------------------

const CHUNK_MAX = 1900
const MAX_CHUNKS = 3
const TRUNCATION_MARKER = '\n\n…(truncated)'

function findLastSentenceBreak(window: string): number {
  const matches = [...window.matchAll(/[.!?](?=\s)/g)]
  const last = matches[matches.length - 1]
  if (!last) return -1
  return (last.index ?? -1) + 1
}

export function splitMessage(text: string): string[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) return []
  if (trimmed.length <= CHUNK_MAX) return [trimmed]

  const chunks: string[] = []
  let remaining = trimmed

  while (remaining.length > 0 && chunks.length < MAX_CHUNKS) {
    if (remaining.length <= CHUNK_MAX) {
      chunks.push(remaining)
      remaining = ''
      break
    }

    const window = remaining.slice(0, CHUNK_MAX)
    let splitAt = window.lastIndexOf('\n\n')
    if (splitAt <= 0) splitAt = findLastSentenceBreak(window)
    if (splitAt <= 0) splitAt = CHUNK_MAX

    const chunk = remaining.slice(0, splitAt).trimEnd()
    const rest = remaining.slice(splitAt).trimStart()

    chunks.push(chunk.length > 0 ? chunk : remaining.slice(0, CHUNK_MAX))
    remaining = chunk.length > 0 ? rest : remaining.slice(CHUNK_MAX)
  }

  if (remaining.length > 0 && chunks.length === MAX_CHUNKS) {
    const lastIndex = MAX_CHUNKS - 1
    const last = chunks[lastIndex] ?? ''
    chunks[lastIndex] = truncate(last, CHUNK_MAX - TRUNCATION_MARKER.length) + TRUNCATION_MARKER
  }

  return chunks
}
