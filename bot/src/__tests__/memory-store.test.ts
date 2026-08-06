import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resetStorageForTests, getStorage } from '../storage/index.js'
import { listAtoms, applyExtraction, forgetAtoms, MAX_ATOMS_PER_USER } from '../memory-store.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfb-bot-memstore-'))
  resetStorageForTests({ memoryPath: path.join(tmpDir, 'memory.json') })
})

afterEach(async () => {
  resetStorageForTests()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('applyExtraction', () => {
  it('inserts new atoms', async () => {
    const result = await applyExtraction('u1', [
      { content: 'Hates Texas', kind: 'preference' },
      { content: 'Went to OU', kind: 'fact' },
    ])
    expect(result).toEqual({ inserted: 2, replaced: 0 })
    const atoms = await listAtoms('u1')
    expect(atoms.map(a => a.content).sort()).toEqual(['Hates Texas', 'Went to OU'])
  })

  it('is a no-op for an empty extraction', async () => {
    await expect(applyExtraction('u1', [])).resolves.toEqual({ inserted: 0, replaced: 0 })
    await expect(listAtoms('u1')).resolves.toEqual([])
  })

  it('replaces an existing atom when `replaces` matches', async () => {
    await applyExtraction('u1', [{ content: 'Likes Texas', kind: 'preference' }])
    const [old] = await listAtoms('u1')

    const result = await applyExtraction('u1', [{ content: 'Hates Texas', kind: 'preference', replaces: old!.id }])
    expect(result).toEqual({ inserted: 1, replaced: 1 })

    const atoms = await listAtoms('u1')
    expect(atoms).toHaveLength(1)
    expect(atoms[0]!.content).toBe('Hates Texas')
  })

  it('treats an unknown `replaces` id as a plain insert', async () => {
    await applyExtraction('u1', [{ content: 'a', kind: 'fact' }])
    const result = await applyExtraction('u1', [{ content: 'b', kind: 'fact', replaces: 'no-such-id' }])
    expect(result).toEqual({ inserted: 1, replaced: 0 })
    await expect(listAtoms('u1')).resolves.toHaveLength(2)
  })

  it('evicts oldest atoms past the per-user cap', async () => {
    for (let i = 0; i < MAX_ATOMS_PER_USER; i++) {
      // Distinct createdAt per insert so "oldest" is well-defined.
      await applyExtraction('u1', [{ content: `atom ${i}`, kind: 'fact' }])
      await new Promise(resolve => setTimeout(resolve, 2))
    }
    await applyExtraction('u1', [{ content: 'the newest one', kind: 'fact' }])

    const atoms = await listAtoms('u1')
    expect(atoms).toHaveLength(MAX_ATOMS_PER_USER)
    expect(atoms.map(a => a.content)).not.toContain('atom 0')
    expect(atoms.map(a => a.content)).toContain('the newest one')
  })
})

describe('forgetAtoms', () => {
  it('wipes everything when no index is given', async () => {
    await applyExtraction('u1', [
      { content: 'a', kind: 'fact' },
      { content: 'b', kind: 'fact' },
    ])
    await expect(forgetAtoms('u1')).resolves.toEqual({ deleted: 2 })
    await expect(listAtoms('u1')).resolves.toEqual([])
  })

  it('deletes one atom by 1-based index and echoes its content', async () => {
    await applyExtraction('u1', [{ content: 'first' , kind: 'fact' }])
    await new Promise(resolve => setTimeout(resolve, 2))
    await applyExtraction('u1', [{ content: 'second', kind: 'fact' }])

    await expect(forgetAtoms('u1', 1)).resolves.toEqual({ deleted: 1, content: 'first' })
    const remaining = await listAtoms('u1')
    expect(remaining.map(a => a.content)).toEqual(['second'])
  })

  it('deletes nothing for an out-of-range index', async () => {
    await applyExtraction('u1', [{ content: 'only', kind: 'fact' }])
    await expect(forgetAtoms('u1', 5)).resolves.toEqual({ deleted: 0 })
    await expect(listAtoms('u1')).resolves.toHaveLength(1)
  })
})

describe('listAtoms', () => {
  it('delegates to the storage backend and keeps users separate', async () => {
    await applyExtraction('u1', [{ content: 'mine', kind: 'fact' }])
    await expect(listAtoms('u2')).resolves.toEqual([])
    expect(getStorage().name).toBe('json')
  })
})
