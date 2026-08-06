/**
 * Per-user long-term profile: the favorite team set explicitly via /myteam
 * (never inferred silently) and the /memory on|off toggle. Thin delegate
 * over the storage layer (src/storage/) -- Supabase when configured, the
 * original JSON file otherwise -- so these APIs survive redeploys when the
 * Supabase env vars are set without any call-site changes.
 */
import { getStorage, resetStorageForTests } from './storage/index.js'

/** Returns the user's saved favorite team, or undefined if none is set. */
export async function getFavoriteTeam(userId: string): Promise<string | undefined> {
  const profile = await getStorage().getProfile(userId)
  return profile?.favoriteTeam
}

/** Sets (or overwrites) a user's favorite team and persists it immediately. */
export async function setFavoriteTeam(userId: string, team: string): Promise<void> {
  await getStorage().upsertProfile(userId, { favoriteTeam: team, setAt: new Date().toISOString() })
}

/** Whether long-term memory is enabled for this user (/memory on|off). Defaults to true. */
export async function getMemoryEnabled(userId: string): Promise<boolean> {
  const profile = await getStorage().getProfile(userId)
  return profile?.memoryEnabled ?? true
}

/** Persists the user's memory toggle immediately. */
export async function setMemoryEnabled(userId: string, enabled: boolean): Promise<void> {
  await getStorage().upsertProfile(userId, { memoryEnabled: enabled })
}

/**
 * Test-only: drops storage state. Pass `testPath` to redirect profile
 * reads/writes to a temp file for the rest of the test (bypassing config);
 * omit it to fall back to config-driven storage selection again.
 */
export function clearProfilesForTests(testPath?: string): void {
  resetStorageForTests({ profilesPath: testPath })
}
