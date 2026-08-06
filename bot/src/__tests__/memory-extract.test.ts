import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { createMock, betaCreateMock, resolveAndRecordPicksMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  betaCreateMock: vi.fn(),
  resolveAndRecordPicksMock: vi.fn(),
}))

vi.mock('../pick-resolve.js', () => ({ resolveAndRecordPicks: resolveAndRecordPicksMock }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock }
    beta = { messages: { create: betaCreateMock } }
  },
}))

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(() => ({
    anthropicApiKey: 'sk-ant-test',
    modelRouter: 'claude-haiku-4-5',
  })),
}))

import { extractMemories, runExtraction } from '../memory-extract.js'
import { listAtoms, applyExtraction } from '../memory-store.js'
import { setMemoryEnabled } from '../profiles.js'
import { resetStorageForTests } from '../storage/index.js'
import { resetAnthropicClientForTests } from '../anthropic-client.js'

function jsonResponse(body: unknown) {
  return {
    content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body) }],
    usage: { input_tokens: 100, output_tokens: 20 },
  }
}

let tmpDir: string
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  vi.clearAllMocks()
  resetAnthropicClientForTests()
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfb-bot-extract-'))
  resetStorageForTests({
    profilesPath: path.join(tmpDir, 'profiles.json'),
    memoryPath: path.join(tmpDir, 'memory.json'),
  })
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  resolveAndRecordPicksMock.mockResolvedValue([])
})

afterEach(async () => {
  vi.restoreAllMocks()
  resetStorageForTests()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('runExtraction', () => {
  it('stores atoms from a valid extraction response', async () => {
    createMock.mockResolvedValue(jsonResponse({ atoms: [{ content: 'Hates Texas', kind: 'preference', replaces: null }] }))

    await runExtraction({ userId: 'u1', question: 'why is Texas bad?', answer: 'because...' })

    const atoms = await listAtoms('u1')
    expect(atoms).toHaveLength(1)
    expect(atoms[0]).toMatchObject({ content: 'Hates Texas', kind: 'preference', source: 'extraction' })
  })

  it('handles the common empty-atoms case as a no-op', async () => {
    createMock.mockResolvedValue(jsonResponse({ atoms: [] }))
    await runExtraction({ userId: 'u1', question: 'q', answer: 'a' })
    await expect(listAtoms('u1')).resolves.toEqual([])
  })

  it('tolerates a ```json fence around the response', async () => {
    createMock.mockResolvedValue(
      jsonResponse('```json\n{"atoms":[{"content":"Went to OU","kind":"fact","replaces":null}]}\n```')
    )
    await runExtraction({ userId: 'u1', question: 'q', answer: 'a' })
    await expect(listAtoms('u1')).resolves.toHaveLength(1)
  })

  it('shows the model existing atoms and honors replaces', async () => {
    await applyExtraction('u1', [{ content: 'Likes Texas', kind: 'preference' }])
    const [existing] = await listAtoms('u1')
    createMock.mockResolvedValue(
      jsonResponse({ atoms: [{ content: 'Hates Texas', kind: 'preference', replaces: existing!.id }] })
    )

    await runExtraction({ userId: 'u1', question: 'q', answer: 'a' })

    const prompt = (createMock.mock.calls[0]![0] as { messages: [{ content: string }] }).messages[0].content
    expect(prompt).toContain(existing!.id)
    const atoms = await listAtoms('u1')
    expect(atoms).toHaveLength(1)
    expect(atoms[0]!.content).toBe('Hates Texas')
  })

  it('skips silently when the user has memory off (no LLM call at all)', async () => {
    await setMemoryEnabled('u1', false)
    await runExtraction({ userId: 'u1', question: 'q', answer: 'a' })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('treats malformed JSON as a logged no-op', async () => {
    createMock.mockResolvedValue(jsonResponse('not json at all'))
    await runExtraction({ userId: 'u1', question: 'q', answer: 'a' })
    await expect(listAtoms('u1')).resolves.toEqual([])
    expect(errorSpy).toHaveBeenCalled()
  })

  it('rejects a response with more than 3 atoms (zod) as a no-op', async () => {
    const atoms = Array.from({ length: 4 }, (_, i) => ({ content: `atom ${i}`, kind: 'fact', replaces: null }))
    createMock.mockResolvedValue(jsonResponse({ atoms }))
    await runExtraction({ userId: 'u1', question: 'q', answer: 'a' })
    await expect(listAtoms('u1')).resolves.toEqual([])
  })

  it('never throws when the API call itself fails', async () => {
    createMock.mockRejectedValue(new Error('network down'))
    await expect(runExtraction({ userId: 'u1', question: 'q', answer: 'a' })).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('truncates a runaway answer before sending it', async () => {
    createMock.mockResolvedValue(jsonResponse({ atoms: [] }))
    await runExtraction({ userId: 'u1', question: 'q', answer: 'x'.repeat(10_000) })
    const prompt = (createMock.mock.calls[0]![0] as { messages: [{ content: string }] }).messages[0].content
    expect(prompt.length).toBeLessThan(2_500)
  })
})

describe('pick extraction', () => {
  const PICK_CANDIDATE = { type: 'season_total', team: 'OU', direction: 'over', threshold: 10, seasonRef: 'current', quote: 'OU wins 10 this year' }
  const STORED_PICK = { id: 'p1', userId: 'u1', kind: 'season_total', team: 'Oklahoma', season: 2026, statement: 'OU wins 10 this year', status: 'open', createdAt: 'now' }

  it('passes pick candidates to resolveAndRecordPicks alongside atoms', async () => {
    createMock.mockResolvedValue(
      jsonResponse({ atoms: [{ content: 'Hates Texas', kind: 'preference', replaces: null }], picks: [PICK_CANDIDATE] })
    )

    await runExtraction({ userId: 'u1', guildId: 'guild-1', question: 'q', answer: 'a' })

    expect(resolveAndRecordPicksMock).toHaveBeenCalledWith('u1', [PICK_CANDIDATE], 'guild-1')
    await expect(listAtoms('u1')).resolves.toHaveLength(1)
  })

  it('a response without a picks key still validates (backward-compatible default)', async () => {
    createMock.mockResolvedValue(jsonResponse({ atoms: [] }))
    await runExtraction({ userId: 'u1', question: 'q', answer: 'a' })
    expect(resolveAndRecordPicksMock).toHaveBeenCalledWith('u1', [], undefined)
  })

  it('more than 2 picks fails zod and the whole extraction no-ops', async () => {
    createMock.mockResolvedValue(jsonResponse({ atoms: [], picks: [PICK_CANDIDATE, PICK_CANDIDATE, PICK_CANDIDATE] }))
    await runExtraction({ userId: 'u1', question: 'q', answer: 'a' })
    expect(resolveAndRecordPicksMock).not.toHaveBeenCalled()
  })

  it('fires onPicksRecorded with stored picks and swallows its errors', async () => {
    createMock.mockResolvedValue(jsonResponse({ atoms: [], picks: [PICK_CANDIDATE] }))
    resolveAndRecordPicksMock.mockResolvedValue([STORED_PICK])
    const onPicksRecorded = vi.fn().mockRejectedValue(new Error('discord hiccup'))

    await expect(runExtraction({ userId: 'u1', question: 'q', answer: 'a', onPicksRecorded })).resolves.toBeUndefined()

    expect(onPicksRecorded).toHaveBeenCalledWith([STORED_PICK])
    expect(errorSpy).toHaveBeenCalled()
  })

  it('does not fire onPicksRecorded when nothing was stored', async () => {
    createMock.mockResolvedValue(jsonResponse({ atoms: [], picks: [PICK_CANDIDATE] }))
    resolveAndRecordPicksMock.mockResolvedValue([])
    const onPicksRecorded = vi.fn()

    await runExtraction({ userId: 'u1', question: 'q', answer: 'a', onPicksRecorded })

    expect(onPicksRecorded).not.toHaveBeenCalled()
  })

  it('memory off skips pick capture too (no LLM call, no resolution)', async () => {
    await setMemoryEnabled('u1', false)
    await runExtraction({ userId: 'u1', question: 'q', answer: 'a' })
    expect(createMock).not.toHaveBeenCalled()
    expect(resolveAndRecordPicksMock).not.toHaveBeenCalled()
  })
})

describe('extractMemories (fire-and-forget wrapper)', () => {
  it('returns synchronously and completes the extraction in the background', async () => {
    createMock.mockResolvedValue(jsonResponse({ atoms: [{ content: 'Hates Texas', kind: 'preference', replaces: null }] }))

    extractMemories({ userId: 'u1', question: 'q', answer: 'a' })

    await vi.waitFor(async () => {
      expect(await listAtoms('u1')).toHaveLength(1)
    })
  })
})
