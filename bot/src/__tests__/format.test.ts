import { describe, it, expect } from 'vitest'
import {
  errorEmbed,
  buildRankingsEmbed,
  buildScoresEmbed,
  buildTeamEmbed,
  buildMatchupEmbed,
  buildEdgesEmbed,
  buildLeadersEmbed,
  buildPlayerEmbed,
  buildHelpEmbed,
  splitMessage,
  type PollRankingRow,
  type LiveScoreboardRow,
  type TeamDetailRow,
  type TeamHistoryRow,
  type MatchupRow,
  type MatchupGameRow,
  type MatchupEdgeRow,
  type LeaderRow,
  type PlayerSearchRow,
  type PlayerDetailRow,
} from '../format.js'

describe('errorEmbed', () => {
  it('sets title and description', () => {
    const json = errorEmbed('Something went wrong', 'Try again later.').toJSON()
    expect(json.title).toBe('Something went wrong')
    expect(json.description).toBe('Try again later.')
  })

  it('falls back to a default hint when none is given', () => {
    const json = errorEmbed('Oops', '').toJSON()
    expect(json.description).toBe('No further details available.')
  })

  it('truncates an oversized hint to the 4096-char description limit', () => {
    const json = errorEmbed('Oops', 'x'.repeat(5000)).toJSON()
    expect(json.description?.length).toBeLessThanOrEqual(4096)
  })
})

describe('buildRankingsEmbed', () => {
  const rows: PollRankingRow[] = [
    { season: 2025, season_type: 'regular', week: 8, poll: 'AP Top 25', rank: 1, school: 'Ohio State', conference: 'Big Ten', first_place_votes: 60, points: 1550 },
    { season: 2025, season_type: 'regular', week: 8, poll: 'AP Top 25', rank: 2, school: 'Texas', conference: 'SEC', first_place_votes: 3, points: 1490 },
    { season: 2025, season_type: 'regular', week: 8, poll: 'Coaches Poll', rank: 1, school: 'Ohio State', conference: 'Big Ten', first_place_votes: 58, points: 1540 },
  ]

  it('groups rows by poll into fields', () => {
    const json = buildRankingsEmbed(rows, { season: 2025, week: 8, source: 'api.poll_rankings' }).toJSON()
    expect(json.fields).toHaveLength(2)
    expect(json.fields?.[0]?.name).toBe('AP Top 25')
    expect(json.fields?.[0]?.value).toContain('Ohio State')
    expect(json.fields?.[1]?.name).toBe('Coaches Poll')
  })

  it('cites source and season in the footer', () => {
    const json = buildRankingsEmbed(rows, { season: 2025, week: 8, source: 'api.poll_rankings' }).toJSON()
    expect(json.footer?.text).toBe('api.poll_rankings · season 2025')
  })

  it('handles an empty result set without throwing', () => {
    const json = buildRankingsEmbed([], { season: 2025, source: 'api.poll_rankings' }).toJSON()
    expect(json.fields?.[0]?.value).toBe('No rows to display.')
  })
})

describe('buildScoresEmbed', () => {
  it('renders the friendly empty-state message for zero live games', () => {
    const json = buildScoresEmbed([]).toJSON()
    expect(json.description).toBe('No live games right now — scoreboard fills up on game days.')
    expect(json.fields ?? []).toHaveLength(0)
  })

  it('renders one field per game', () => {
    const rows: LiveScoreboardRow[] = [
      {
        game_id: 1,
        status: 'in_progress',
        period: 3,
        clock: '5:12',
        home_team: 'Oklahoma',
        away_team: 'Texas',
        home_points: 21,
        away_points: 17,
        possession: 'Oklahoma',
        house_live_home_wp: 0.63,
      },
    ]
    const json = buildScoresEmbed(rows).toJSON()
    expect(json.fields).toHaveLength(1)
    expect(json.fields?.[0]?.name).toBe('Texas @ Oklahoma')
    expect(json.fields?.[0]?.value).toContain('17–21')
    expect(json.fields?.[0]?.value).toContain('Q3 5:12')
    expect(json.fields?.[0]?.value).toContain('63.0%')
  })
})

describe('buildTeamEmbed', () => {
  const detail: TeamDetailRow = {
    school: 'Oklahoma',
    mascot: 'Sooners',
    conference: 'SEC',
    classification: 'fbs',
    current_season: 2025,
    wins: 9,
    losses: 1,
    conf_wins: 6,
    conf_losses: 1,
    ppg: 34.2,
    opp_ppg: 15.1,
    sp_rating: 24.5,
    sp_rank: 4,
    elo: 1900,
    fpi: 20.1,
    epa_per_play: 0.21,
    recruiting_rank: 5,
  }
  const history: TeamHistoryRow[] = [
    { season: 2025, wins: 9, losses: 1, sp_rating: 24.5, sp_rank: 4 },
    { season: 2024, wins: 10, losses: 3, sp_rating: 18.2, sp_rank: 12 },
  ]

  it('renders the team title, record, and ratings', () => {
    const json = buildTeamEmbed(detail, history, 'Oklahoma').toJSON()
    expect(json.title).toBe('Oklahoma Sooners')
    expect(json.description).toContain('9-1 (6-1 conf)')
    expect(json.description).toContain('SP+ 24.5')
    expect(json.fields?.[0]?.name).toBe('Recent Seasons')
    expect(json.fields?.[0]?.value).toContain('2025')
  })

  it('falls back to the query name when detail is null', () => {
    const json = buildTeamEmbed(null, [], 'Nobody State').toJSON()
    expect(json.title).toBe('Nobody State')
    expect(json.description ?? '').toBe('')
  })
})

describe('buildMatchupEmbed', () => {
  const matchup: MatchupRow = {
    team1: 'Oklahoma',
    team2: 'Texas',
    total_games: 118,
    team1_wins: 63,
    team2_wins: 52,
    ties: 5,
    first_meeting: 1900,
    last_meeting: 2024,
    team1_season: 2025,
    team1_wins_season: 9,
    team1_losses_season: 1,
    team1_sp_rank: 4,
    team2_season: 2025,
    team2_wins_season: 7,
    team2_losses_season: 3,
    team2_sp_rank: 15,
  }
  const games: MatchupGameRow[] = [
    { season: 2024, home_team: 'Texas', away_team: 'Oklahoma', home_points: 34, away_points: 3, start_date: '2024-10-12' },
  ]

  it('renders the series record and recent meetings', () => {
    const json = buildMatchupEmbed(matchup, games, 'Oklahoma', 'Texas').toJSON()
    expect(json.title).toBe('Oklahoma vs Texas')
    expect(json.description).toContain('63–52')
    expect(json.description).toContain('5 ties')
    expect(json.fields?.[0]?.name).toBe('Recent Meetings')
    expect(json.fields?.[0]?.value).toContain('2024')
  })

  it('handles a pair with no recorded meetings', () => {
    const empty: MatchupRow = { ...matchup, total_games: 0, team1_wins: 0, team2_wins: 0, ties: 0 }
    const json = buildMatchupEmbed(empty, [], 'Oklahoma', 'Rutgers').toJSON()
    expect(json.description).toContain('no recorded meetings')
  })
})

describe('buildEdgesEmbed', () => {
  it('renders the friendly empty-state message', () => {
    const json = buildEdgesEmbed([], { season: 2025 }).toJSON()
    expect(json.description).toContain('No scored matchup edges')
  })

  it('renders an edge line per game', () => {
    const rows: MatchupEdgeRow[] = [
      {
        game_id: 1,
        season: 2025,
        week: 9,
        start_date: '2025-10-25',
        home_team: 'Oklahoma',
        away_team: 'Texas',
        expected_home_margin: 6.5,
        home_win_prob: 0.68,
        market_spread: 3,
        edge: 3.5,
        edge_pick: 'home',
        abs_edge: 3.5,
      },
    ]
    const json = buildEdgesEmbed(rows, { season: 2025, week: 9 }).toJSON()
    expect(json.title).toBe('Matchup Edges — Week 9')
    expect(json.description).toContain('Texas @ Oklahoma')
    expect(json.description).toContain('edge +3.5')
  })
})

describe('buildLeadersEmbed', () => {
  const rows: LeaderRow[] = [
    { team: 'Ohio State', conference: 'Big Ten', wins: 10, losses: 0, ppg: 41.2, opp_ppg: 10.1, epa_per_play: 0.31, sp_rating: 30.1, sp_rank: 1, epa_total: 120.4, epa_rank: 1 },
  ]

  it('renders a numbered list using the metric-specific stat', () => {
    const json = buildLeadersEmbed(rows, { season: 2025, metric: 'ppg', source: 'api.leaderboard_teams' }).toJSON()
    expect(json.title).toBe('Leaders — Points Per Game')
    expect(json.description).toContain('**1.** Ohio State (Big Ten) — 41.2 PPG')
  })

  it('renders the wepa metric from the alternate source', () => {
    const json = buildLeadersEmbed(rows, { season: 2025, metric: 'wepa', source: 'api.team_wepa_season' }).toJSON()
    expect(json.description).toContain('120.4 adj. EPA (#1)')
    expect(json.footer?.text).toBe('api.team_wepa_season · season 2025')
  })
})

describe('buildPlayerEmbed', () => {
  const search: PlayerSearchRow[] = [
    { player_id: '1', name: 'Caleb Williams', team: 'Oklahoma', position: 'QB', season: 2025 },
    { player_id: '2', name: 'Caleb Smith', team: 'Texas', position: 'WR', season: 2025 },
  ]
  const detail: PlayerDetailRow = {
    player_id: '1',
    name: 'Caleb Williams',
    team: 'Oklahoma',
    position: 'QB',
    jersey: 13,
    height: 73,
    weight: 215,
    year: 3,
    season: 2025,
    stars: 5,
    recruit_rating: 0.99,
    pass_yds: 3200,
    pass_td: 28,
    pass_int: 6,
    rush_yds: null,
    rush_td: null,
    rec: null,
    rec_yds: null,
    rec_td: null,
    tackles: null,
    sacks: null,
    def_int: null,
  }

  it('renders the top hit detail and other matches', () => {
    const json = buildPlayerEmbed(search, detail).toJSON()
    expect(json.title).toBe('Caleb Williams — Oklahoma')
    expect(json.description).toContain('3200 pass yds, 28 TD, 6 INT')
    expect(json.fields?.[0]?.name).toBe('Other matches')
    expect(json.fields?.[0]?.value).toContain('Caleb Smith')
  })

  it('renders a no-players-found state', () => {
    const json = buildPlayerEmbed([], null).toJSON()
    expect(json.description).toBe('No players found.')
  })
})

describe('buildHelpEmbed', () => {
  it('lists every deterministic command plus /ask', () => {
    const json = buildHelpEmbed().toJSON()
    for (const cmd of ['/rankings', '/scores', '/team', '/matchup', '/edges', '/leaders', '/player', '/ask']) {
      expect(json.description).toContain(cmd)
    }
    expect(json.description).toContain('@-mention')
  })
})

describe('splitMessage', () => {
  it('returns a single chunk unchanged when under the cap', () => {
    expect(splitMessage('short reply')).toEqual(['short reply'])
  })

  it('returns an empty array for blank input', () => {
    expect(splitMessage('   ')).toEqual([])
  })

  it('prefers a paragraph break when present', () => {
    const p1 = 'A'.repeat(1000)
    const p2 = 'B'.repeat(1000)
    expect(splitMessage(`${p1}\n\n${p2}`)).toEqual([p1, p2])
  })

  it('falls back to a hard cut for exactly-2000 chars with no separators', () => {
    const text = 'x'.repeat(2000)
    const chunks = splitMessage(text)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(1900)
    expect(chunks[1]).toBe('x'.repeat(100))
    expect(chunks.join('')).toBe(text)
  })

  it('splits long sentence-separated text (no paragraph breaks) under the cap', () => {
    const text = 'Sentence number goes here. '.repeat(150) // ~4200 chars, one long paragraph
    const chunks = splitMessage(text)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.length).toBeLessThanOrEqual(3)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1900)
  })

  it('caps output at 3 chunks and marks the last as truncated', () => {
    const text = (`${'x'.repeat(1900)}\n\n`).repeat(5)
    const chunks = splitMessage(text)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(1900)
    expect(chunks[1]).toHaveLength(1900)
    expect(chunks[2]).toMatch(/truncated/)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1900)
  })
})
