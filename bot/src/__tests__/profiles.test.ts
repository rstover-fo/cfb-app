import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getFavoriteTeam, setFavoriteTeam, clearProfilesForTests } from '../profiles.js'

let tmpDir: string
let profilesPath: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfb-bot-profiles-'))
  profilesPath = path.join(tmpDir, 'profiles.json')
  clearProfilesForTests(profilesPath)
})

afterEach(async () => {
  clearProfilesForTests()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('getFavoriteTeam', () => {
  it('returns undefined when no profiles file exists yet', async () => {
    await expect(getFavoriteTeam('user-1')).resolves.toBeUndefined()
  })

  it('returns undefined for a user with no saved team', async () => {
    await setFavoriteTeam('user-1', 'Oklahoma')
    await expect(getFavoriteTeam('user-2')).resolves.toBeUndefined()
  })
})

describe('setFavoriteTeam / getFavoriteTeam round-trip', () => {
  it('persists a favorite team to disk and reads it back', async () => {
    await setFavoriteTeam('user-1', 'Oklahoma')
    await expect(getFavoriteTeam('user-1')).resolves.toBe('Oklahoma')

    // Re-read from a cold cache (simulates a process restart).
    clearProfilesForTests(profilesPath)
    await expect(getFavoriteTeam('user-1')).resolves.toBe('Oklahoma')
  })

  it('writes valid, parseable JSON to the configured path', async () => {
    await setFavoriteTeam('user-1', 'Oklahoma')
    const raw = await fs.readFile(profilesPath, 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed['user-1']).toMatchObject({ team: 'Oklahoma' })
    expect(typeof parsed['user-1'].setAt).toBe('string')
  })

  it('overwrites an existing favorite team for the same user', async () => {
    await setFavoriteTeam('user-1', 'Oklahoma')
    await setFavoriteTeam('user-1', 'Texas')
    await expect(getFavoriteTeam('user-1')).resolves.toBe('Texas')
  })

  it('keeps separate users independent', async () => {
    await setFavoriteTeam('user-1', 'Oklahoma')
    await setFavoriteTeam('user-2', 'Texas')

    await expect(getFavoriteTeam('user-1')).resolves.toBe('Oklahoma')
    await expect(getFavoriteTeam('user-2')).resolves.toBe('Texas')
  })
})

describe('atomic write', () => {
  it('never leaves a .tmp file behind after a successful write', async () => {
    await setFavoriteTeam('user-1', 'Oklahoma')
    const files = await fs.readdir(tmpDir)
    expect(files).toEqual(['profiles.json'])
  })

  it('creates the destination directory if it does not exist yet', async () => {
    const nestedPath = path.join(tmpDir, 'nested', 'dir', 'profiles.json')
    clearProfilesForTests(nestedPath)

    await setFavoriteTeam('user-1', 'Oklahoma')

    await expect(fs.readFile(nestedPath, 'utf-8')).resolves.toContain('Oklahoma')
  })
})
