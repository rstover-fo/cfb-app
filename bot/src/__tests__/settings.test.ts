import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getLoreEnabled, setLoreEnabled, clearSettingsForTests } from '../settings.js'

function tempSettingsPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'cfb-bot-settings-')), 'settings.json')
}

beforeEach(() => {
  clearSettingsForTests(tempSettingsPath())
})

describe('settings', () => {
  it('defaults lore to enabled when no file exists', async () => {
    await expect(getLoreEnabled()).resolves.toBe(true)
  })

  it('persists the lore toggle across a cache reset (simulated restart)', async () => {
    const path = tempSettingsPath()
    clearSettingsForTests(path)

    await setLoreEnabled(false)
    await expect(getLoreEnabled()).resolves.toBe(false)

    // Simulated restart: drop the in-memory cache, same file.
    clearSettingsForTests(path)
    await expect(getLoreEnabled()).resolves.toBe(false)

    await setLoreEnabled(true)
    clearSettingsForTests(path)
    await expect(getLoreEnabled()).resolves.toBe(true)
  })
})
