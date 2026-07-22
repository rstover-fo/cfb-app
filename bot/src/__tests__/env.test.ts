import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEnvFileIfPresent } from '../env.js'

function writeEnvFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cfb-bot-env-'))
  const path = join(dir, '.env')
  writeFileSync(path, content)
  return path
}

describe('loadEnvFileIfPresent', () => {
  it('loads KEY=VALUE pairs into the target env', () => {
    const path = writeEnvFile('DISCORD_TOKEN=abc\nMCP_URL=https://example.com/api/mcp\n')
    const env: NodeJS.ProcessEnv = {}

    loadEnvFileIfPresent(path, env)

    expect(env.DISCORD_TOKEN).toBe('abc')
    expect(env.MCP_URL).toBe('https://example.com/api/mcp')
  })

  it('never overrides variables already set in the real environment', () => {
    const path = writeEnvFile('DISCORD_TOKEN=from-file\n')
    const env: NodeJS.ProcessEnv = { DISCORD_TOKEN: 'from-shell' }

    loadEnvFileIfPresent(path, env)

    expect(env.DISCORD_TOKEN).toBe('from-shell')
  })

  it('strips matching single or double quotes and skips comments/blank/malformed lines', () => {
    const path = writeEnvFile(
      ['# a comment', '', 'QUOTED="hello world"', "SINGLE='ok'", 'not a valid line', 'TRAILING=value  '].join('\n')
    )
    const env: NodeJS.ProcessEnv = {}

    loadEnvFileIfPresent(path, env)

    expect(env.QUOTED).toBe('hello world')
    expect(env.SINGLE).toBe('ok')
    expect(env.TRAILING).toBe('value')
    expect(Object.keys(env)).toHaveLength(3)
  })

  it('is a silent no-op when the file does not exist', () => {
    const env: NodeJS.ProcessEnv = { KEEP: '1' }

    loadEnvFileIfPresent('/nonexistent/path/.env', env)

    expect(env).toEqual({ KEEP: '1' })
  })
})
