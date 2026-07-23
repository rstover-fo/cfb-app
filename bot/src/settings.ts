/**
 * Server-level bot settings, persisted to a JSON file (same lazy-load +
 * atomic write-through pattern as profiles.ts). Currently one flag:
 * whether the server-lore easter egg in the persona is enabled. This
 * exists so the persona's "drop it if anyone asks" promise is backed by
 * real state -- /lore off survives restarts and prompt caching, instead
 * of being a promise the next turn's static prompt would break.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.js'

interface SettingsFile {
  loreEnabled?: boolean
  updatedAt?: string
}

const LORE_DEFAULT = true

let cache: SettingsFile | null = null
let cachedPath: string | null = null
let pathOverride: string | null = null

function resolvedPath(): string {
  if (pathOverride) return pathOverride
  return path.resolve(process.cwd(), loadConfig().settingsPath)
}

async function load(): Promise<SettingsFile> {
  const file = resolvedPath()
  if (cache && cachedPath === file) return cache

  try {
    const raw = await fs.readFile(file, 'utf-8')
    cache = JSON.parse(raw) as SettingsFile
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[settings] failed to read settings file, using defaults:', err instanceof Error ? err.message : err)
    }
    cache = {}
  }
  cachedPath = file
  return cache
}

async function persist(data: SettingsFile): Promise<void> {
  const file = resolvedPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmpFile = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tmpFile, file)
  cache = data
  cachedPath = file
}

/** Whether the persona's server-lore easter egg is currently enabled. */
export async function getLoreEnabled(): Promise<boolean> {
  const data = await load()
  return data.loreEnabled ?? LORE_DEFAULT
}

/** Persists the lore toggle immediately (survives restarts). */
export async function setLoreEnabled(enabled: boolean): Promise<void> {
  const data = await load()
  await persist({ ...data, loreEnabled: enabled, updatedAt: new Date().toISOString() })
}

/** Test-only: drop cache; pass a temp path to redirect reads/writes. */
export function clearSettingsForTests(testPath?: string): void {
  cache = null
  cachedPath = null
  pathOverride = testPath ?? null
}
