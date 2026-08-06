/**
 * Server-level bot settings. Currently one flag: whether the server-lore
 * easter egg in the persona is enabled. This exists so the persona's "drop
 * it if anyone asks" promise is backed by real state -- /lore off survives
 * restarts and prompt caching, instead of being a promise the next turn's
 * static prompt would break. Thin delegate over the storage layer
 * (src/storage/): Supabase when configured, the original JSON file otherwise.
 */
import { getStorage, resetStorageForTests } from './storage/index.js'

/** Whether the persona's server-lore easter egg is currently enabled. */
export async function getLoreEnabled(): Promise<boolean> {
  const settings = await getStorage().getSettings()
  return settings.loreEnabled
}

/** Persists the lore toggle immediately (survives restarts). */
export async function setLoreEnabled(enabled: boolean): Promise<void> {
  await getStorage().saveSettings({ loreEnabled: enabled })
}

/** Test-only: drop storage state; pass a temp path to redirect settings reads/writes. */
export function clearSettingsForTests(testPath?: string): void {
  resetStorageForTests({ settingsPath: testPath })
}
