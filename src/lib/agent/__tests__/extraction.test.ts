import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUserProfileMock } = vi.hoisted(() => ({ getUserProfileMock: vi.fn() }))
vi.mock('@/lib/agent/bot-data', () => ({ getUserProfile: getUserProfileMock }))

const { getMemoriesMock, rememberMemoryMock, forgetMemoriesMock } = vi.hoisted(() => ({
  getMemoriesMock: vi.fn(),
  rememberMemoryMock: vi.fn(),
  forgetMemoriesMock: vi.fn(),
}))
vi.mock('@/lib/memory/client', () => ({
  getMemories: getMemoriesMock,
  rememberMemory: rememberMemoryMock,
  forgetMemories: forgetMemoriesMock,
}))

const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }))
vi.mock('ai', () => ({ generateText: generateTextMock }))

const { resolvePickCandidatesMock } = vi.hoisted(() => ({ resolvePickCandidatesMock: vi.fn() }))
vi.mock('../pick-resolve', () => ({ resolvePickCandidates: resolvePickCandidatesMock }))

const { insertPickMock, listPicksMock } = vi.hoisted(() => ({ insertPickMock: vi.fn(), listPicksMock: vi.fn() }))
vi.mock('../picks-store', () => ({ insertPick: insertPickMock, listPicks: listPicksMock }))

import { runTurnExtraction } from '../extraction'

function textResult(body: unknown, usage = { inputTokens: 100, outputTokens: 20 }) {
  return { text: typeof body === 'string' ? body : JSON.stringify(body), usage }
}

let logSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  getUserProfileMock.mockResolvedValue({ memoryEnabled: true })
  getMemoriesMock.mockResolvedValue([])
  resolvePickCandidatesMock.mockResolvedValue([])
  listPicksMock.mockResolvedValue([])
  insertPickMock.mockResolvedValue(true)
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('runTurnExtraction', () => {
  it('happy path: stores atoms, honors replaces, resolves+stores picks, logs one structured line', async () => {
    getMemoriesMock.mockResolvedValue([
      { id: 'm1', kind: 'preference', content: 'Likes Texas', context: null, createdAt: 't0', updatedAt: 't0' },
    ])
    const pickCandidate = {
      type: 'season_total' as const,
      team: 'OU',
      direction: 'over' as const,
      threshold: 10,
      seasonRef: 'current' as const,
      quote: 'OU wins 10 this year',
    }
    generateTextMock.mockResolvedValue(
      textResult({
        atoms: [{ content: 'Hates Texas', kind: 'preference', replaces: 'm1' }],
        picks: [pickCandidate],
      })
    )
    const resolvedPick = {
      userId: 'u1',
      guildId: undefined,
      kind: 'season_total' as const,
      team: 'Oklahoma',
      season: 2025,
      direction: 'over' as const,
      line: 9.5,
      statement: 'OU wins 10 this year',
    }
    resolvePickCandidatesMock.mockResolvedValue([resolvedPick])
    forgetMemoriesMock.mockResolvedValue(1)
    rememberMemoryMock.mockResolvedValue({ id: 'm2', kind: 'preference', content: 'Hates Texas', context: null, createdAt: 't1', updatedAt: 't1' })

    await runTurnExtraction({ userId: 'u1', guildId: 'g1', question: 'why is Texas bad?', answer: 'because...' })

    expect(forgetMemoriesMock).toHaveBeenCalledWith('u1', 'm1')
    expect(rememberMemoryMock).toHaveBeenCalledWith({ userId: 'u1', kind: 'preference', content: 'Hates Texas' })
    expect(resolvePickCandidatesMock).toHaveBeenCalledWith('u1', [pickCandidate], 'g1')
    expect(listPicksMock).toHaveBeenCalledWith('u1', { createdAfter: expect.any(String) })
    expect(insertPickMock).toHaveBeenCalledWith(resolvedPick)

    const logged = JSON.parse((logSpy.mock.calls[0]![0] as string))
    expect(logged).toEqual({
      evt: 'memory_extract',
      inserted: 1,
      replaced: 1,
      existing: 1,
      picks_candidates: 1,
      picks_stored: 1,
      usage: { input_tokens: 100, output_tokens: 20 },
    })
  })

  it('shows the model existing atoms in the prompt', async () => {
    getMemoriesMock.mockResolvedValue([
      { id: 'm1', kind: 'preference', content: 'Likes Texas', context: null, createdAt: 't0', updatedAt: 't0' },
    ])
    generateTextMock.mockResolvedValue(textResult({ atoms: [] }))

    await runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })

    const call = generateTextMock.mock.calls[0]![0] as { prompt: string }
    expect(call.prompt).toContain('m1: Likes Texas')
  })

  it('handles the common empty-atoms/empty-picks case as a no-op with zero counts', async () => {
    generateTextMock.mockResolvedValue(textResult({ atoms: [] }))
    await runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })
    expect(rememberMemoryMock).not.toHaveBeenCalled()
    expect(resolvePickCandidatesMock).toHaveBeenCalledWith('u1', [], undefined)
    expect(insertPickMock).not.toHaveBeenCalled()
    const logged = JSON.parse(logSpy.mock.calls[0]![0] as string)
    expect(logged).toMatchObject({ inserted: 0, replaced: 0, picks_candidates: 0, picks_stored: 0 })
  })

  it('tolerates a ```json fence around the response', async () => {
    generateTextMock.mockResolvedValue(
      textResult('```json\n{"atoms":[{"content":"Went to OU","kind":"fact","replaces":null}]}\n```')
    )
    rememberMemoryMock.mockResolvedValue({ id: 'm3', kind: 'fact', content: 'Went to OU', context: null, createdAt: 't', updatedAt: 't' })

    await runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })

    expect(rememberMemoryMock).toHaveBeenCalledWith({ userId: 'u1', kind: 'fact', content: 'Went to OU' })
  })

  it('memory off: no LLM call, no memory reads, no pick resolution', async () => {
    getUserProfileMock.mockResolvedValue({ memoryEnabled: false })

    await runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })

    expect(getMemoriesMock).not.toHaveBeenCalled()
    expect(generateTextMock).not.toHaveBeenCalled()
    expect(resolvePickCandidatesMock).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('treats malformed JSON as a logged no-op', async () => {
    generateTextMock.mockResolvedValue(textResult('not json at all'))

    await expect(runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })).resolves.toBeUndefined()

    expect(rememberMemoryMock).not.toHaveBeenCalled()
    expect(resolvePickCandidatesMock).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('rejects a response with more than 3 atoms (zod) as a no-op', async () => {
    const atoms = Array.from({ length: 4 }, (_, i) => ({ content: `atom ${i}`, kind: 'fact', replaces: null }))
    generateTextMock.mockResolvedValue(textResult({ atoms }))

    await runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })

    expect(rememberMemoryMock).not.toHaveBeenCalled()
  })

  it('never throws when the LLM call itself fails (e.g. no ANTHROPIC_API_KEY)', async () => {
    generateTextMock.mockRejectedValue(new Error('missing API key'))

    await expect(runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('truncates a runaway answer before sending it', async () => {
    generateTextMock.mockResolvedValue(textResult({ atoms: [] }))
    await runTurnExtraction({ userId: 'u1', question: 'q', answer: 'x'.repeat(10_000) })
    const call = generateTextMock.mock.calls[0]![0] as { prompt: string }
    expect(call.prompt.length).toBeLessThan(2_500)
  })

  it('pick idempotency guard: skips a resolved pick whose statement matches a recent pick', async () => {
    generateTextMock.mockResolvedValue(textResult({ atoms: [], picks: [{ type: 'ats', team: 'OU', quote: 'we cover' }] }))
    const resolvedPick = {
      userId: 'u1',
      kind: 'ats' as const,
      team: 'Oklahoma',
      season: 2025,
      direction: 'cover' as const,
      statement: 'we cover',
    }
    resolvePickCandidatesMock.mockResolvedValue([resolvedPick])
    listPicksMock.mockResolvedValue([
      { id: 'p0', userId: 'u1', kind: 'ats', team: 'Oklahoma', season: 2025, statement: 'we cover', status: 'open', createdAt: new Date().toISOString() },
    ])

    await runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })

    expect(insertPickMock).not.toHaveBeenCalled()
    const logged = JSON.parse(logSpy.mock.calls[0]![0] as string)
    expect(logged).toMatchObject({ picks_candidates: 1, picks_stored: 0 })
  })

  it('pick idempotency guard: does not skip when no recent pick shares the statement', async () => {
    generateTextMock.mockResolvedValue(textResult({ atoms: [], picks: [{ type: 'ats', team: 'OU', quote: 'we cover' }] }))
    const resolvedPick = {
      userId: 'u1',
      kind: 'ats' as const,
      team: 'Oklahoma',
      season: 2025,
      direction: 'cover' as const,
      statement: 'we cover',
    }
    resolvePickCandidatesMock.mockResolvedValue([resolvedPick])
    listPicksMock.mockResolvedValue([])

    await runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })

    expect(insertPickMock).toHaveBeenCalledWith(resolvedPick)
    expect(listPicksMock).not.toHaveBeenCalledTimes(0)
  })

  it('does not call listPicks/insertPick when nothing resolved', async () => {
    generateTextMock.mockResolvedValue(textResult({ atoms: [], picks: [{ type: 'ats', team: 'OU', quote: 'we cover' }] }))
    resolvePickCandidatesMock.mockResolvedValue([])

    await runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })

    expect(listPicksMock).not.toHaveBeenCalled()
    expect(insertPickMock).not.toHaveBeenCalled()
  })

  it('an unknown replaces id is ignored (plain insert, no forget call)', async () => {
    getMemoriesMock.mockResolvedValue([])
    generateTextMock.mockResolvedValue(
      textResult({ atoms: [{ content: 'Hates Texas', kind: 'preference', replaces: 'does-not-exist' }] })
    )
    rememberMemoryMock.mockResolvedValue({ id: 'm9', kind: 'preference', content: 'Hates Texas', context: null, createdAt: 't', updatedAt: 't' })

    await runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })

    expect(forgetMemoriesMock).not.toHaveBeenCalled()
    expect(rememberMemoryMock).toHaveBeenCalled()
  })

  it('replace stores the new atom BEFORE forgetting the old one', async () => {
    getMemoriesMock.mockResolvedValue([
      { id: 'm1', kind: 'preference', content: 'Likes Texas', context: null, createdAt: 't0', updatedAt: 't0' },
    ])
    generateTextMock.mockResolvedValue(
      textResult({ atoms: [{ content: 'Hates Texas', kind: 'preference', replaces: 'm1' }] })
    )
    rememberMemoryMock.mockResolvedValue({ id: 'm2', kind: 'preference', content: 'Hates Texas', context: null, createdAt: 't1', updatedAt: 't1' })
    forgetMemoriesMock.mockResolvedValue(1)

    await runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })

    expect(rememberMemoryMock.mock.invocationCallOrder[0]!).toBeLessThan(
      forgetMemoriesMock.mock.invocationCallOrder[0]!
    )
    expect(forgetMemoriesMock).toHaveBeenCalledWith('u1', 'm1')
  })

  it('a failed replacement write preserves the old atom (no forget)', async () => {
    getMemoriesMock.mockResolvedValue([
      { id: 'm1', kind: 'preference', content: 'Likes Texas', context: null, createdAt: 't0', updatedAt: 't0' },
    ])
    generateTextMock.mockResolvedValue(
      textResult({ atoms: [{ content: 'Hates Texas', kind: 'preference', replaces: 'm1' }] })
    )
    rememberMemoryMock.mockResolvedValue(null)

    await runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })

    expect(forgetMemoriesMock).not.toHaveBeenCalled()
    const logged = JSON.parse(logSpy.mock.calls[0]![0] as string)
    expect(logged).toMatchObject({ inserted: 0, replaced: 0 })
  })

  it('skips the forget when dedup merged the new content onto the replaced node (same id)', async () => {
    getMemoriesMock.mockResolvedValue([
      { id: 'm1', kind: 'preference', content: 'Hates Texas', context: null, createdAt: 't0', updatedAt: 't0' },
    ])
    generateTextMock.mockResolvedValue(
      textResult({ atoms: [{ content: 'Hates Texas!!', kind: 'preference', replaces: 'm1' }] })
    )
    rememberMemoryMock.mockResolvedValue({ id: 'm1', kind: 'preference', content: 'Hates Texas!!', context: null, createdAt: 't0', updatedAt: 't1' })

    await runTurnExtraction({ userId: 'u1', question: 'q', answer: 'a' })

    expect(forgetMemoriesMock).not.toHaveBeenCalled()
    const logged = JSON.parse(logSpy.mock.calls[0]![0] as string)
    expect(logged).toMatchObject({ inserted: 1, replaced: 0 })
  })
})
