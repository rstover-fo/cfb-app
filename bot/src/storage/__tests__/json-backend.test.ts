import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JsonFileBackend } from '../json-backend.js'

let tmpDir: string
let backend: JsonFileBackend

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfb-bot-storage-'))
  backend = new JsonFileBackend({
    profilesPath: path.join(tmpDir, 'profiles.json'),
    settingsPath: path.join(tmpDir, 'settings.json'),
    memoryPath: path.join(tmpDir, 'memory.json'),
  })
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('profiles', () => {
  it('returns undefined when no file exists', async () => {
    await expect(backend.getProfile('user-1')).resolves.toBeUndefined()
  })

  it('round-trips a profile patch and applies the memoryEnabled default', async () => {
    await backend.upsertProfile('user-1', { favoriteTeam: 'Oklahoma', setAt: '2026-01-01T00:00:00.000Z' })
    await expect(backend.getProfile('user-1')).resolves.toEqual({
      favoriteTeam: 'Oklahoma',
      memoryEnabled: true,
      setAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('merges patches instead of replacing the entry', async () => {
    await backend.upsertProfile('user-1', { favoriteTeam: 'Oklahoma' })
    await backend.upsertProfile('user-1', { memoryEnabled: false })
    await expect(backend.getProfile('user-1')).resolves.toMatchObject({
      favoriteTeam: 'Oklahoma',
      memoryEnabled: false,
    })
  })

  it('parses a legacy pre-storage-layer profiles.json (no memoryEnabled field)', async () => {
    const file = path.join(tmpDir, 'profiles.json')
    await fs.writeFile(file, JSON.stringify({ 'user-1': { team: 'Oklahoma', setAt: '2025-09-01T00:00:00.000Z' } }))
    await expect(backend.getProfile('user-1')).resolves.toEqual({
      favoriteTeam: 'Oklahoma',
      memoryEnabled: true,
      setAt: '2025-09-01T00:00:00.000Z',
    })
  })

  it('treats a corrupt file as empty and logs instead of throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await fs.writeFile(path.join(tmpDir, 'profiles.json'), 'not json {')
    await expect(backend.getProfile('user-1')).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('settings', () => {
  it('defaults loreEnabled to true with no file', async () => {
    await expect(backend.getSettings()).resolves.toEqual({ loreEnabled: true })
  })

  it('round-trips the lore toggle', async () => {
    await backend.saveSettings({ loreEnabled: false })
    await expect(backend.getSettings()).resolves.toEqual({ loreEnabled: false })
  })
})

describe('memory atoms', () => {
  it('returns [] with no file', async () => {
    await expect(backend.listAtoms('user-1')).resolves.toEqual([])
  })

  it('inserts atoms with generated ids and lists them oldest first', async () => {
    await backend.insertAtom('user-1', { content: 'Hates Texas', kind: 'preference', source: 'extraction' })
    await backend.insertAtom('user-1', { content: 'Went to OU', kind: 'fact', source: 'extraction' })

    const atoms = await backend.listAtoms('user-1')
    expect(atoms).toHaveLength(2)
    expect(atoms.map(a => a.content)).toEqual(['Hates Texas', 'Went to OU'])
    expect(atoms[0]!.id).not.toBe(atoms[1]!.id)
    expect(atoms[0]!.createdAt <= atoms[1]!.createdAt).toBe(true)
  })

  it('keeps users independent', async () => {
    await backend.insertAtom('user-1', { content: 'Hates Texas', kind: 'preference', source: 'extraction' })
    await expect(backend.listAtoms('user-2')).resolves.toEqual([])
  })

  it('deletes specific atoms by id and reports the count', async () => {
    await backend.insertAtom('user-1', { content: 'a', kind: 'fact', source: 'extraction' })
    await backend.insertAtom('user-1', { content: 'b', kind: 'fact', source: 'extraction' })
    // Same-millisecond inserts tie on createdAt and fall back to (random) id
    // order, so delete whichever listed first and assert the other survived.
    const [first, second] = await backend.listAtoms('user-1')

    await expect(backend.deleteAtoms('user-1', [first!.id])).resolves.toBe(1)
    const remaining = await backend.listAtoms('user-1')
    expect(remaining.map(a => a.content)).toEqual([second!.content])
  })

  it('wipes all of a user\'s atoms when no ids are given', async () => {
    await backend.insertAtom('user-1', { content: 'a', kind: 'fact', source: 'extraction' })
    await backend.insertAtom('user-1', { content: 'b', kind: 'fact', source: 'extraction' })

    await expect(backend.deleteAtoms('user-1')).resolves.toBe(2)
    await expect(backend.listAtoms('user-1')).resolves.toEqual([])
  })

  it('returns 0 when nothing matches', async () => {
    await expect(backend.deleteAtoms('user-1', ['nope'])).resolves.toBe(0)
  })
})

describe('atomic writes', () => {
  it('leaves no .tmp files behind', async () => {
    await backend.upsertProfile('user-1', { favoriteTeam: 'Oklahoma' })
    await backend.saveSettings({ loreEnabled: false })
    await backend.insertAtom('user-1', { content: 'a', kind: 'fact', source: 'extraction' })
    const files = await fs.readdir(tmpDir)
    expect(files.sort()).toEqual(['memory.json', 'profiles.json', 'settings.json'])
  })

  it('survives a cold restart (new backend instance reads the same files)', async () => {
    await backend.upsertProfile('user-1', { favoriteTeam: 'Oklahoma' })
    await backend.insertAtom('user-1', { content: 'a', kind: 'fact', source: 'extraction' })

    const fresh = new JsonFileBackend({
      profilesPath: path.join(tmpDir, 'profiles.json'),
      settingsPath: path.join(tmpDir, 'settings.json'),
      memoryPath: path.join(tmpDir, 'memory.json'),
    })
    await expect(fresh.getProfile('user-1')).resolves.toMatchObject({ favoriteTeam: 'Oklahoma' })
    await expect(fresh.listAtoms('user-1')).resolves.toHaveLength(1)
  })
})
