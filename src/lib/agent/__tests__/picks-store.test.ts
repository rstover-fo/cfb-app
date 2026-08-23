import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getBotSchemaClientMock } = vi.hoisted(() => ({ getBotSchemaClientMock: vi.fn() }))
vi.mock('@/lib/agent/bot-data', () => ({ getBotSchemaClient: getBotSchemaClientMock }))

import { insertPick, listPicks, type NewPick } from '../picks-store'

interface QueryResult {
  data: unknown
  error: { message: string } | null
}

/** Minimal chainable stub matching the .select/.eq/.gte/.order surface listPicks uses. */
function makeSelectChain(resolve: () => QueryResult) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'gte', 'order']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled, onRejected)
  return chain
}

function makeFakeClient(opts: {
  selectResult?: QueryResult
  insertResult?: { error: { message: string } | null }
}) {
  const selectResult = opts.selectResult ?? { data: [], error: null }
  const insertResult = opts.insertResult ?? { error: null }
  const insert = vi.fn(() => Promise.resolve(insertResult))
  const select = vi.fn(() => makeSelectChain(() => selectResult))
  const from = vi.fn(() => ({ select, insert }))
  return { from, insert, select }
}

const NEW_PICK: NewPick = {
  userId: 'u1',
  guildId: 'g1',
  kind: 'game_winner',
  team: 'Oklahoma',
  opponent: 'Texas',
  gameId: 401,
  season: 2025,
  week: 6,
  direction: 'win',
  pickHome: false,
  statement: 'we beat Texas',
}

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('insertPick', () => {
  it('maps a NewPick onto snake_case columns and returns true on success', async () => {
    const client = makeFakeClient({})
    getBotSchemaClientMock.mockReturnValue(client)

    const ok = await insertPick(NEW_PICK)

    expect(ok).toBe(true)
    expect(client.from).toHaveBeenCalledWith('picks')
    expect(client.insert).toHaveBeenCalledWith({
      user_id: 'u1',
      guild_id: 'g1',
      kind: 'game_winner',
      team: 'Oklahoma',
      opponent: 'Texas',
      game_id: 401,
      season: 2025,
      week: 6,
      direction: 'win',
      line: null,
      pick_home: false,
      statement: 'we beat Texas',
    })
  })

  it('nulls out absent optional fields rather than sending undefined', async () => {
    const client = makeFakeClient({})
    getBotSchemaClientMock.mockReturnValue(client)

    await insertPick({
      userId: 'u1',
      kind: 'season_total',
      team: 'Oklahoma',
      season: 2025,
      direction: 'over',
      line: 9.5,
      statement: 'OU wins 10',
    })

    expect(client.insert).toHaveBeenCalledWith(
      expect.objectContaining({ guild_id: null, opponent: null, game_id: null, week: null, pick_home: null })
    )
  })

  it('returns false and logs when the write fails', async () => {
    const client = makeFakeClient({ insertResult: { error: { message: 'constraint violation' } } })
    getBotSchemaClientMock.mockReturnValue(client)

    const ok = await insertPick(NEW_PICK)

    expect(ok).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns false without writing when the bot-schema client is unconfigured', async () => {
    getBotSchemaClientMock.mockReturnValue(null)

    const ok = await insertPick(NEW_PICK)

    expect(ok).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('listPicks', () => {
  it('normalizes PostgREST rows (numeric-string line) into Pick objects', async () => {
    const client = makeFakeClient({
      selectResult: {
        data: [
          {
            id: 'p1',
            user_id: 'u1',
            guild_id: 'g1',
            kind: 'ats',
            team: 'Oklahoma',
            opponent: 'Texas',
            game_id: 401,
            season: 2025,
            week: 6,
            direction: 'cover',
            line: '-3.5',
            pick_home: false,
            statement: 'we cover',
            status: 'open',
            created_at: '2025-10-01T00:00:00Z',
          },
        ],
        error: null,
      },
    })
    getBotSchemaClientMock.mockReturnValue(client)

    const picks = await listPicks('u1')

    expect(picks).toEqual([
      {
        id: 'p1',
        userId: 'u1',
        guildId: 'g1',
        kind: 'ats',
        team: 'Oklahoma',
        opponent: 'Texas',
        gameId: 401,
        season: 2025,
        week: 6,
        direction: 'cover',
        line: -3.5,
        pickHome: false,
        statement: 'we cover',
        status: 'open',
        createdAt: '2025-10-01T00:00:00Z',
      },
    ])
  })

  it('applies the createdAfter filter via .gte on created_at', async () => {
    const client = makeFakeClient({ selectResult: { data: [], error: null } })
    getBotSchemaClientMock.mockReturnValue(client)

    await listPicks('u1', { createdAfter: '2025-10-01T00:00:00Z' })

    // .select() is invoked once per call; the chain it returned carries the .gte() call.
    const producedChain = client.select.mock.results.at(-1)!.value as { gte: ReturnType<typeof vi.fn> }
    expect(producedChain.gte).toHaveBeenCalledWith('created_at', '2025-10-01T00:00:00Z')
  })

  it('omits the .gte filter when no createdAfter is given', async () => {
    const client = makeFakeClient({ selectResult: { data: [], error: null } })
    getBotSchemaClientMock.mockReturnValue(client)

    await listPicks('u1')

    const producedChain = client.select.mock.results.at(-1)!.value as { gte: ReturnType<typeof vi.fn> }
    expect(producedChain.gte).not.toHaveBeenCalled()
  })

  it('returns [] and logs on a db error', async () => {
    const client = makeFakeClient({ selectResult: { data: null, error: { message: 'timeout' } } })
    getBotSchemaClientMock.mockReturnValue(client)

    const picks = await listPicks('u1')

    expect(picks).toEqual([])
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns [] without a warn-worthy error when the client is unconfigured (logged as a warning)', async () => {
    getBotSchemaClientMock.mockReturnValue(null)

    const picks = await listPicks('u1')

    expect(picks).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
  })

  it('returns [] on an empty result set', async () => {
    const client = makeFakeClient({ selectResult: { data: [], error: null } })
    getBotSchemaClientMock.mockReturnValue(client)

    await expect(listPicks('u1')).resolves.toEqual([])
  })
})
