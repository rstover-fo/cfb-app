/**
 * Backend selection, memoized once per process: SupabaseBackend when both
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured, else the
 * JSON-file backend (the original behavior -- local dev and tests stay
 * cred-free). config.ts rejects a half-configured pair at boot, so the
 * two-var check here can't silently mask a typo'd variable name.
 *
 * Test hooks mirror the old per-module helpers: path overrides force the
 * JSON backend and are stored per-domain, so clearProfilesForTests(tmpA)
 * and clearSettingsForTests(tmpB) in one test file keep their independent
 * paths (existing tests rely on that).
 */
import { loadConfig } from '../config.js'
import type { StorageBackend } from './backend.js'
import { JsonFileBackend, type JsonBackendPaths } from './json-backend.js'
import { SupabaseBackend } from './supabase-backend.js'

let backend: StorageBackend | null = null
let pathOverrides: JsonBackendPaths = {}
let injected: StorageBackend | null = null

export function getStorage(): StorageBackend {
  if (injected) return injected
  if (backend) return backend

  const hasOverrides = Boolean(pathOverrides.profilesPath || pathOverrides.settingsPath || pathOverrides.memoryPath)
  if (hasOverrides) {
    backend = new JsonFileBackend(pathOverrides)
    return backend
  }

  const config = loadConfig()
  backend = config.supabaseUrl && config.supabaseServiceRoleKey ? new SupabaseBackend() : new JsonFileBackend()
  console.log(JSON.stringify({ evt: 'storage', backend: backend.name }))
  return backend
}

/**
 * Test-only: drops the memoized backend. Path overrides (merged across
 * calls, so profiles/settings/memory helpers compose) force a JsonFileBackend
 * at those paths; calling with no argument clears every override and any
 * injected backend, restoring config-driven selection.
 */
export function resetStorageForTests(overrides?: JsonBackendPaths): void {
  backend = null
  injected = null
  if (overrides === undefined) {
    pathOverrides = {}
  } else {
    pathOverrides = { ...pathOverrides, ...overrides }
  }
}

/** Test-only: injects a fake backend (e.g. for /memory command tests). */
export function setStorageForTests(fake: StorageBackend): void {
  injected = fake
}
