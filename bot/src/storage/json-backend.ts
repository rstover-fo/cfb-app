/**
 * JSON-file storage backend -- the original persistence behavior of
 * profiles.ts/settings.ts, ported behind the StorageBackend interface and
 * extended with a memory-atoms file. Three files, each lazily loaded on
 * first access, cached in memory, and written through atomically (write a
 * tmp file, then rename over the real one) so a crash mid-write can never
 * leave a file truncated or corrupt.
 *
 * On-disk shapes are backward compatible with the pre-storage-layer files:
 * profiles.json entries without `memoryEnabled` parse with the default
 * (true), and settings.json is unchanged.
 */
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { loadConfig } from '../config.js'
import type { BotSettings, MemoryAtom, NewPick, Pick, PickFilter, PickPatch, StorageBackend, UserProfile } from './backend.js'

/** Pre-existing on-disk shape (profiles.json), extended with memoryEnabled. */
interface ProfileEntry {
  team?: string
  setAt?: string
  memoryEnabled?: boolean
}

type ProfilesFile = Record<string, ProfileEntry>

interface SettingsFile {
  loreEnabled?: boolean
  updatedAt?: string
}

type MemoryFile = Record<string, MemoryAtom[]>

/** Flat array, not per-user keyed: the /picks leaderboard reads cross-user. */
type PicksFile = Pick[]

export interface JsonBackendPaths {
  profilesPath?: string
  settingsPath?: string
  memoryPath?: string
  picksPath?: string
}

const LORE_DEFAULT = true

export class JsonFileBackend implements StorageBackend {
  readonly name = 'json' as const

  private readonly paths: JsonBackendPaths
  private profilesCache: ProfilesFile | null = null
  private settingsCache: SettingsFile | null = null
  private memoryCache: MemoryFile | null = null
  private picksCache: PicksFile | null = null

  /** Paths omitted here resolve from config (PROFILES_PATH/SETTINGS_PATH/MEMORY_PATH) on first use. */
  constructor(paths: JsonBackendPaths = {}) {
    this.paths = paths
  }

  // --- profiles ---

  async getProfile(userId: string): Promise<UserProfile | undefined> {
    const data = await this.loadProfiles()
    const entry = data[userId]
    if (!entry) return undefined
    return {
      favoriteTeam: entry.team,
      memoryEnabled: entry.memoryEnabled ?? true,
      setAt: entry.setAt,
    }
  }

  async upsertProfile(userId: string, patch: Partial<UserProfile>): Promise<void> {
    const data = await this.loadProfiles()
    const existing = data[userId] ?? {}
    const entry: ProfileEntry = { ...existing }
    if (patch.favoriteTeam !== undefined) entry.team = patch.favoriteTeam
    if (patch.memoryEnabled !== undefined) entry.memoryEnabled = patch.memoryEnabled
    if (patch.setAt !== undefined) entry.setAt = patch.setAt
    const next: ProfilesFile = { ...data, [userId]: entry }
    await this.persist(this.profilesFile(), next)
    this.profilesCache = next
  }

  // --- settings ---

  async getSettings(): Promise<BotSettings> {
    const data = await this.loadSettings()
    return { loreEnabled: data.loreEnabled ?? LORE_DEFAULT }
  }

  async saveSettings(patch: Partial<BotSettings>): Promise<void> {
    const data = await this.loadSettings()
    const next: SettingsFile = { ...data, updatedAt: new Date().toISOString() }
    if (patch.loreEnabled !== undefined) next.loreEnabled = patch.loreEnabled
    await this.persist(this.settingsFile(), next)
    this.settingsCache = next
  }

  // --- memory atoms ---

  async listAtoms(userId: string): Promise<MemoryAtom[]> {
    const data = await this.loadMemory()
    const atoms = data[userId] ?? []
    // No id tiebreaker: Array.sort is stable, so same-millisecond createdAt
    // ties keep their file (insertion) order -- "oldest first" stays true.
    return [...atoms].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async insertAtom(userId: string, atom: Omit<MemoryAtom, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const data = await this.loadMemory()
    const now = new Date().toISOString()
    const full: MemoryAtom = { ...atom, id: randomUUID(), createdAt: now, updatedAt: now }
    const next: MemoryFile = { ...data, [userId]: [...(data[userId] ?? []), full] }
    await this.persist(this.memoryFile(), next)
    this.memoryCache = next
  }

  async deleteAtoms(userId: string, atomIds?: string[]): Promise<number> {
    const data = await this.loadMemory()
    const atoms = data[userId] ?? []
    const remaining = atomIds ? atoms.filter(a => !atomIds.includes(a.id)) : []
    if (remaining.length === atoms.length) return 0
    const next: MemoryFile = { ...data, [userId]: remaining }
    await this.persist(this.memoryFile(), next)
    this.memoryCache = next
    return atoms.length - remaining.length
  }

  // --- picks ---

  async listPicks(filter: PickFilter = {}): Promise<Pick[]> {
    const data = await this.loadPicks()
    return data
      .filter(pick => (filter.userId === undefined || pick.userId === filter.userId))
      .filter(pick => (filter.status === undefined || pick.status === filter.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  }

  async insertPick(pick: NewPick): Promise<void> {
    const data = await this.loadPicks()
    const full: Pick = { ...pick, id: randomUUID(), status: 'open', createdAt: new Date().toISOString() }
    const next: PicksFile = [...data, full]
    await this.persist(this.picksFile(), next)
    this.picksCache = next
  }

  async updatePick(id: string, patch: PickPatch): Promise<void> {
    const data = await this.loadPicks()
    const index = data.findIndex(pick => pick.id === id)
    if (index === -1) throw new Error(`pick update failed: unknown pick id ${id}`)
    const next = [...data]
    next[index] = { ...data[index]!, ...patch }
    await this.persist(this.picksFile(), next)
    this.picksCache = next
  }

  // --- shared file plumbing ---

  private profilesFile(): string {
    return path.resolve(process.cwd(), this.paths.profilesPath ?? loadConfig().profilesPath)
  }

  private settingsFile(): string {
    return path.resolve(process.cwd(), this.paths.settingsPath ?? loadConfig().settingsPath)
  }

  private memoryFile(): string {
    return path.resolve(process.cwd(), this.paths.memoryPath ?? loadConfig().memoryPath)
  }

  private picksFile(): string {
    return path.resolve(process.cwd(), this.paths.picksPath ?? loadConfig().picksPath)
  }

  private async loadProfiles(): Promise<ProfilesFile> {
    if (this.profilesCache) return this.profilesCache
    this.profilesCache = await this.readJson<ProfilesFile>(this.profilesFile(), {})
    return this.profilesCache
  }

  private async loadSettings(): Promise<SettingsFile> {
    if (this.settingsCache) return this.settingsCache
    this.settingsCache = await this.readJson<SettingsFile>(this.settingsFile(), {})
    return this.settingsCache
  }

  private async loadMemory(): Promise<MemoryFile> {
    if (this.memoryCache) return this.memoryCache
    this.memoryCache = await this.readJson<MemoryFile>(this.memoryFile(), {})
    return this.memoryCache
  }

  private async loadPicks(): Promise<PicksFile> {
    if (this.picksCache) return this.picksCache
    this.picksCache = await this.readJson<PicksFile>(this.picksFile(), [])
    return this.picksCache
  }

  /** ENOENT silently means "empty"; any other read/parse error is logged and treated as empty. */
  private async readJson<T>(file: string, empty: T): Promise<T> {
    try {
      const raw = await fs.readFile(file, 'utf-8')
      return JSON.parse(raw) as T
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[storage] failed to read file, starting empty:', err instanceof Error ? err.message : err)
      }
      return empty
    }
  }

  /** Atomic write: write to a per-process/per-call tmp file, then rename over the real path. */
  private async persist(file: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const tmpFile = `${file}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf-8')
    await fs.rename(tmpFile, file)
  }
}
