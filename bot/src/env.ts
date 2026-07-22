/**
 * Minimal .env loader for the documented local flow (`cp .env.example .env`
 * then `npm run dev` / `npm run register` / `npm run eval`). Called only from
 * process entrypoints -- never from loadConfig() -- so tests stay hermetic:
 * a developer's local .env can't leak into test runs.
 *
 * Semantics match Node's --env-file: real environment variables always win
 * over file values; missing file is a silent no-op (deploy hosts like
 * Railway inject env directly and have no .env file).
 */
import { readFileSync } from 'node:fs'

const LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/

export function loadEnvFileIfPresent(path = '.env', env: NodeJS.ProcessEnv = process.env): void {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return
  }

  for (const line of raw.split('\n')) {
    if (line.trimStart().startsWith('#')) continue
    const match = LINE.exec(line)
    if (!match) continue

    const key = match[1]!
    let value = match[2]!
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }

    if (!(key in env)) env[key] = value
  }
}
