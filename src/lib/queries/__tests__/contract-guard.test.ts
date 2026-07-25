import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Phase 0 contract guard (A0.7): all reads must go through the contracted
// `api` schema (PostgREST views), never straight at dlt-loaded `core` (or
// other internal) tables/schemas. This test recursively scans
// src/lib/queries and src/app for `.schema('core')` (or the double-quoted
// equivalent) and fails the build if any file still uses it.
//
// Add an entry here -- WITH a comment explaining why -- if a file must
// legitimately query the core schema directly. Empty today: every known
// core-schema access was migrated to an api.* view in A0.1-A0.6.
const ALLOWLIST: string[] = []

// Directories to scan, relative to this file.
const SCAN_ROOTS = [
  path.resolve(__dirname, '../../queries'), // src/lib/queries
  path.resolve(__dirname, '../../../app'),  // src/app
  path.resolve(__dirname, '../../mcp'),     // src/lib/mcp (MCP tool layer)
]

const SOURCE_FILE_PATTERN = /\.tsx?$/
const SKIP_DIRS = new Set(['node_modules', '.next', '.git'])

// Allowlist, not a denylist. The previous version matched exactly
// `.schema('core')`, which meant `.schema('core_staging')`, `.schema('app')`,
// and any typo all passed silently. Only these schemas may be addressed from
// app code:
//   api -- the contracted warehouse read surface (cfb-database-owned)
//   app -- cfb-app's own account/entitlement state (see
//          docs/plans/2026-07-24-phase1-auth-entitlements.md)
// Everything else, notably core/core_staging, is banned.
//
// `auth` is deliberately absent: user identity comes from
// supabase.auth.getUser(), never a PostgREST read. Keep it that way.
const ALLOWED_SCHEMAS = new Set(['api', 'app'])

// Global flag so a line with two .schema() calls reports both.
const SCHEMA_CALL_PATTERN = /\.schema\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/g

// Exclude this guard file itself from the scan -- its own source discusses
// and documents the forbidden pattern by name.
const SELF_PATH = path.resolve(__filename)

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(path.join(dir, entry.name), files)
    } else if (entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name)) {
      files.push(path.join(dir, entry.name))
    }
  }
  return files
}

describe('contract guard: only contracted schemas may be addressed', () => {
  it('scans src/lib/queries, src/app and src/lib/mcp for non-allowlisted .schema() usage', () => {
    const files = SCAN_ROOTS.flatMap(root => walk(root))
      .filter(file => file !== SELF_PATH)

    // Guard against a misconfigured scan silently finding nothing.
    expect(files.length).toBeGreaterThan(0)

    const offenders: { file: string; line: number; schema: string; text: string }[] = []

    for (const file of files) {
      const relativePath = path.relative(process.cwd(), file)
      if (ALLOWLIST.includes(relativePath)) continue

      const lines = fs.readFileSync(file, 'utf-8').split('\n')
      lines.forEach((line, idx) => {
        for (const match of line.matchAll(SCHEMA_CALL_PATTERN)) {
          const schema = match[1]
          if (ALLOWED_SCHEMAS.has(schema)) continue
          offenders.push({
            file: relativePath,
            line: idx + 1,
            schema,
            text: line.trim(),
          })
        }
      })
    }

    if (offenders.length > 0) {
      const message = offenders
        .map(o => `  ${o.file}:${o.line}  .schema('${o.schema}')  ${o.text}`)
        .join('\n')
      throw new Error(
        `Found disallowed schema access. Allowed: ${[...ALLOWED_SCHEMAS].join(', ')}. ` +
          `Reads of dlt-loaded data (core / core_staging) must go through the contracted api.* views; ` +
          `add a documented ALLOWLIST entry only if a file must genuinely bypass this:\n${message}`
      )
    }

    expect(offenders).toHaveLength(0)
  })

  it('rejects a schema outside the allowlist', () => {
    // Exercises the matcher itself, so a future refactor of the regex cannot
    // silently turn the guard into a no-op that passes because it matches
    // nothing.
    const sample = `supabase.schema('core').from('games')`
    const found = [...sample.matchAll(SCHEMA_CALL_PATTERN)].map(m => m[1])

    expect(found).toEqual(['core'])
    expect(found.every(s => ALLOWED_SCHEMAS.has(s))).toBe(false)
  })

  it('accepts the contracted schemas', () => {
    const sample = `supabase.schema('api').from('team_detail'); supabase.schema('app').from('entitlements')`
    const found = [...sample.matchAll(SCHEMA_CALL_PATTERN)].map(m => m[1])

    expect(found).toEqual(['api', 'app'])
    expect(found.every(s => ALLOWED_SCHEMAS.has(s))).toBe(true)
  })
})
