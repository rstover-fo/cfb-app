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
]

const SOURCE_FILE_PATTERN = /\.tsx?$/
const SKIP_DIRS = new Set(['node_modules', '.next', '.git'])

// Matches .schema('core') / .schema("core"), with or without inner whitespace.
const FORBIDDEN_PATTERN = /\.schema\(\s*['"]core['"]\s*\)/

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

describe('contract guard: no direct core schema access', () => {
  it('scans src/lib/queries and src/app for banned .schema(\'core\') usage', () => {
    const files = SCAN_ROOTS.flatMap(root => walk(root))
      .filter(file => file !== SELF_PATH)

    // Guard against a misconfigured scan silently finding nothing.
    expect(files.length).toBeGreaterThan(0)

    const offenders: { file: string; line: number; text: string }[] = []

    for (const file of files) {
      const relativePath = path.relative(process.cwd(), file)
      if (ALLOWLIST.includes(relativePath)) continue

      const lines = fs.readFileSync(file, 'utf-8').split('\n')
      lines.forEach((line, idx) => {
        if (FORBIDDEN_PATTERN.test(line)) {
          offenders.push({ file: relativePath, line: idx + 1, text: line.trim() })
        }
      })
    }

    if (offenders.length > 0) {
      const message = offenders
        .map(o => `  ${o.file}:${o.line}  ${o.text}`)
        .join('\n')
      throw new Error(
        `Found disallowed .schema('core') usage (query the contracted api.* view instead, or add a documented ALLOWLIST entry):\n${message}`
      )
    }

    expect(offenders).toHaveLength(0)
  })
})
