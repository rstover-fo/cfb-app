/**
 * Storage layer contract for the bot's durable state: per-user profiles
 * (/myteam favorite, /memory toggle), the global settings row (/lore), and
 * long-term memory atoms. Two implementations: SupabaseBackend (used when
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are configured) and
 * JsonFileBackend (the original JSON-file behavior, still the default for
 * cred-free local dev and tests). Selection happens once at startup in
 * storage/index.ts; callers never see which backend they got.
 *
 * Error contract both backends must honor: reads never throw (log and fall
 * back to a cached value or the default -- an answer must never be blocked
 * by storage), writes DO throw so command handlers can tell the user the
 * save didn't stick.
 */

export interface UserProfile {
  favoriteTeam?: string
  /** Whether long-term memory extraction/injection is enabled for this user. Defaults to true. */
  memoryEnabled: boolean
  /** ISO timestamp of when favoriteTeam was last set. */
  setAt?: string
}

export interface BotSettings {
  loreEnabled: boolean
}

/** One durable long-term memory fact about a user, extracted from conversation. */
export interface MemoryAtom {
  id: string
  content: string
  kind: 'preference' | 'fact' | 'take'
  source: 'extraction'
  createdAt: string
  updatedAt: string
}

export type PickKind = 'game_winner' | 'ats' | 'season_total'
export type PickStatus = 'open' | 'won' | 'lost' | 'push' | 'void'
export type PickDirection = 'win' | 'cover' | 'over' | 'under'

/** One ledger entry: a prediction the user committed to in conversation. */
export interface Pick {
  id: string
  userId: string
  kind: PickKind
  /** Exact school name; the side the user backed. */
  team: string
  opponent?: string
  gameId?: number
  season: number
  week?: number
  direction?: PickDirection
  /** ats: home_spread at pick time (undefined = pending backfill); season_total: half-point win line. */
  line?: number
  /** Game picks: whether `team` is the home side of gameId (derived once at capture). */
  pickHome?: boolean
  /** The user's words, <=200 chars. */
  statement: string
  status: PickStatus
  settledDetail?: string
  createdAt: string
  settledAt?: string
}

export interface PickFilter {
  userId?: string
  status?: PickStatus
}

export type NewPick = Omit<Pick, 'id' | 'status' | 'settledDetail' | 'createdAt' | 'settledAt'>

export interface PickPatch {
  status?: PickStatus
  settledDetail?: string
  settledAt?: string
  line?: number
}

export interface StorageBackend {
  readonly name: 'supabase' | 'json'

  /** Returns the user's profile, or undefined if none exists. Never throws. */
  getProfile(userId: string): Promise<UserProfile | undefined>
  /** Merges `patch` into the user's profile (creating it if absent). Throws on write failure. */
  upsertProfile(userId: string, patch: Partial<UserProfile>): Promise<void>

  /** Returns the global settings (defaults when unset). Never throws. */
  getSettings(): Promise<BotSettings>
  /** Merges `patch` into the global settings. Throws on write failure. */
  saveSettings(patch: Partial<BotSettings>): Promise<void>

  /** Returns the user's atoms, oldest first (createdAt asc, id asc). Never throws. */
  listAtoms(userId: string): Promise<MemoryAtom[]>
  /** Inserts one atom (id/timestamps assigned by the backend). Throws on write failure. */
  insertAtom(userId: string, atom: Omit<MemoryAtom, 'id' | 'createdAt' | 'updatedAt'>): Promise<void>
  /**
   * Deletes the given atom ids for the user (all of the user's atoms when
   * `atomIds` is omitted) and returns how many were deleted. Throws on write
   * failure.
   */
  deleteAtoms(userId: string, atomIds?: string[]): Promise<number>

  /** Picks matching the filter, oldest first (createdAt asc, id asc). Never throws (returns []). */
  listPicks(filter?: PickFilter): Promise<Pick[]>
  /** Inserts one open pick (id/createdAt/status assigned by the backend). Throws on write failure. */
  insertPick(pick: NewPick): Promise<void>
  /** Patches one pick by id (settle, void, or line backfill). Unknown id or write failure throws. */
  updatePick(id: string, patch: PickPatch): Promise<void>
}
