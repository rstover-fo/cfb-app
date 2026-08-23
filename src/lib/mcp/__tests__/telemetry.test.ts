import { describe, it, expect, vi, afterEach } from 'vitest'
import { withToolTelemetry, TOOL_DEADLINE_MS, ARGS_LOG_MAX_CHARS } from '../telemetry'

function lastLogEntry(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const call = spy.mock.calls.at(-1)
  expect(call).toBeDefined()
  return JSON.parse(call![0] as string) as Record<string, unknown>
}

describe('withToolTelemetry', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('passes the return value through byte-identical and logs one line', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const inner = vi.fn(async (args: { team: string }) => `rows for ${args.team}`)
    const wrapped = withToolTelemetry('query_team', inner)

    const result = await wrapped({ team: 'Oklahoma' })

    expect(result).toBe('rows for Oklahoma')
    expect(inner).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledTimes(1)
    const entry = lastLogEntry(log)
    expect(entry.evt).toBe('tool')
    expect(entry.tool).toBe('query_team')
    expect(entry.ok).toBe(true)
    expect(entry.errish).toBeUndefined()
    expect(typeof entry.ms).toBe('number')
    expect(entry.args).toBe('{"team":"Oklahoma"}')
  })

  it("flags returned 'Error:' strings as errish without altering them", async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const wrapped = withToolTelemetry('get_rankings', async () => 'Error: api.poll_rankings request failed: boom')

    const result = await wrapped()

    expect(result).toBe('Error: api.poll_rankings request failed: boom')
    expect(lastLogEntry(log).errish).toBe(true)
  })

  it('truncates long args in the log line', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const wrapped = withToolTelemetry('run_sql', async (_args: { sql: string }) => 'ok')

    await wrapped({ sql: 'select '.repeat(100) })

    const args = lastLogEntry(log).args as string
    expect(args.length).toBeLessThanOrEqual(ARGS_LOG_MAX_CHARS + 1) // +1 for the ellipsis
    expect(args.endsWith('…')).toBe(true)
  })

  it('redacts arg values when asked, logging key names only', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const wrapped = withToolTelemetry('memory_store', async (_args: { content: string }) => 'ok', {
      redactArgs: true,
    })

    await wrapped({ content: 'user secret' })

    const args = lastLogEntry(log).args as string
    expect(args).toBe('[redacted keys: content]')
    expect(args).not.toContain('user secret')
  })

  it('returns the friendly timeout string when the deadline fires', async () => {
    vi.useFakeTimers()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const wrapped = withToolTelemetry('slow_tool', () => new Promise<string>(() => {}), { timeoutMs: 5_000 })

    const pending = wrapped()
    await vi.advanceTimersByTimeAsync(5_001)
    const result = await pending

    expect(result).toBe('Error: slow_tool timed out after 5s.')
    const entry = lastLogEntry(log)
    expect(entry.timedOut).toBe(true)
    expect(entry.errish).toBe(true)
  })

  it('logs ok:false and rethrows when the tool throws (abnormal path)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const wrapped = withToolTelemetry('render_chart', async () => {
      throw new Error('kaboom')
    })

    await expect(wrapped()).rejects.toThrow('kaboom')
    const entry = lastLogEntry(log)
    expect(entry.ok).toBe(false)
    expect(entry.err).toBe('kaboom')
  })

  it('has a generous default deadline above every inner I/O bound', () => {
    expect(TOOL_DEADLINE_MS).toBeGreaterThan(20_000)
  })
})
