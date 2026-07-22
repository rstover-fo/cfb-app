/**
 * Per-user long-term memory: a favorite team set explicitly via /myteam
 * (never inferred silently), persisted to a JSON file so it survives a
 * restart. Loaded lazily on first access and cached in memory; every write
 * is write-through (persisted immediately) and atomic (write a tmp file,
 * then rename over the real one) so a crash mid-write can never leave
 * profiles.json truncated or corrupt.
 *
 * The path defaults to config's PROFILES_PATH (data/profiles.json, relative
 * to process.cwd()) but can be overridden directly for tests via
 * clearProfilesForTests(), bypassing the full env-parsing loadConfig() needs.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.js'

export interface ProfileEntry {
  team: string
  setAt: string
}

type ProfilesFile = Record<string, ProfileEntry>

let cache: ProfilesFile | null = null
let cachedPath: string | null = null
let pathOverride: string | null = null

function resolvedPath(): string {
  if (pathOverride) return pathOverride
  return path.resolve(process.cwd(), loadConfig().profilesPath)
}

async function load(): Promise<ProfilesFile> {
  const file = resolvedPath()
  if (cache && cachedPath === file) return cache

  try {
    const raw = await fs.readFile(file, 'utf-8')
    cache = JSON.parse(raw) as ProfilesFile
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[profiles] failed to read profiles file, starting empty:', err instanceof Error ? err.message : err)
    }
    cache = {}
  }
  cachedPath = file
  return cache
}

/** Atomic write: write to a per-process/per-call tmp file, then rename over the real path. */
async function persist(data: ProfilesFile): Promise<void> {
  const file = resolvedPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmpFile = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tmpFile, file)
  cache = data
  cachedPath = file
}

/** Returns the user's saved favorite team, or undefined if none is set. */
export async function getFavoriteTeam(userId: string): Promise<string | undefined> {
  const data = await load()
  return data[userId]?.team
}

/** Sets (or overwrites) a user's favorite team and persists it immediately. */
export async function setFavoriteTeam(userId: string, team: string): Promise<void> {
  const data = await load()
  const next: ProfilesFile = { ...data, [userId]: { team, setAt: new Date().toISOString() } }
  await persist(next)
}

/**
 * Test-only: drops the in-memory cache. Pass `testPath` to redirect all
 * reads/writes to a temp file for the rest of the test (bypassing config);
 * omit it to fall back to config's PROFILES_PATH again.
 */
export function clearProfilesForTests(testPath?: string): void {
  cache = null
  cachedPath = null
  pathOverride = testPath ?? null
}
