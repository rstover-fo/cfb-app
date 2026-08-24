/**
 * Per-call telemetry + deadline for model-facing tools. Every exported tool
 * function (the 25 in tools.ts, plus the Firecrawl-backed web tools) is
 * wrapped at its export site with withToolTelemetry, so BOTH consumers -- the
 * hosted MCP server and the eve agent -- go through one instrumented path.
 *
 * The wrapper is a byte-identical pass-through of the tool's return value.
 * Tools are total functions by contract (friendly strings, never throws), so:
 *  - a throw here is abnormal: it is logged (`ok:false`) and rethrown for the
 *    transport to surface;
 *  - the deadline does not throw either -- it RETURNS the same friendly
 *    'Error: ...' string shape the query layer produces, keeping the
 *    total-function contract.
 *
 * One JSON log line per call, following the bot's structured-logging
 * convention (one `{evt:...}` object, no free-form user text):
 *   {evt:'tool', tool, ms, ok, args, errish?, timedOut?}
 * `errish` flags a returned string that starts with 'Error:' -- the cheap
 * failure signal that doesn't change the model-facing contract. `args` is
 * JSON truncated to ARGS_LOG_MAX_CHARS; tools carrying user-derived content
 * (Phase 2 memory tools) must pass {redactArgs:true} to log key names only.
 */

/** Default hard deadline per tool call. Generous by design: the Supabase
 * client aborts at 10s and Firecrawl at 20s, so this fires only when
 * something upstream forgot its own bound. */
export const TOOL_DEADLINE_MS = 25_000
export const ARGS_LOG_MAX_CHARS = 200

const TIMED_OUT = Symbol('tool-timed-out')

export interface ToolTelemetryOptions {
  /** Override the hard deadline for this tool. */
  timeoutMs?: number
  /** Log argument key names only, never values (user-derived content). */
  redactArgs?: boolean
}

function summarizeArgs(args: unknown[], redact: boolean): string {
  const payload = args.length === 0 ? {} : args.length === 1 ? args[0] : args
  try {
    if (redact) {
      const keys =
        payload !== null && typeof payload === 'object' && !Array.isArray(payload)
          ? Object.keys(payload as Record<string, unknown>)
          : []
      return `[redacted keys: ${keys.join(',')}]`
    }
    const json = JSON.stringify(payload) ?? '{}'
    return json.length > ARGS_LOG_MAX_CHARS ? `${json.slice(0, ARGS_LOG_MAX_CHARS)}…` : json
  } catch {
    return '[unserializable]'
  }
}

function logCall(entry: {
  tool: string
  ms: number
  ok: boolean
  args: string
  errish?: boolean
  timedOut?: boolean
  err?: string
}): void {
  // undefined fields are dropped by JSON.stringify, keeping the common
  // success line compact.
  console.log(
    JSON.stringify({
      evt: 'tool',
      tool: entry.tool,
      ms: entry.ms,
      ok: entry.ok,
      args: entry.args,
      errish: entry.errish || undefined,
      timedOut: entry.timedOut || undefined,
      err: entry.err,
    })
  )
}

/**
 * Wraps a tool function with the per-call log line and the hard deadline.
 * Single invocation, no retries; the inner return value is passed through
 * untouched. The deadline race never cancels the inner promise -- underlying
 * I/O is bounded by its own AbortSignal (Supabase 10s, Firecrawl 20s); this
 * is the belt-and-suspenders bound for tools that forgot one.
 */
export function withToolTelemetry<A extends unknown[]>(
  tool: string,
  fn: (...args: A) => Promise<string>,
  options: ToolTelemetryOptions = {}
): (...args: A) => Promise<string> {
  return async (...args: A): Promise<string> => {
    const startedAt = Date.now()
    const argsSummary = summarizeArgs(args, options.redactArgs ?? false)
    const timeoutMs = options.timeoutMs ?? TOOL_DEADLINE_MS

    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<typeof TIMED_OUT>(resolve => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs)
    })

    try {
      const result = await Promise.race([fn(...args), deadline])
      const ms = Date.now() - startedAt
      if (result === TIMED_OUT) {
        logCall({ tool, ms, ok: true, args: argsSummary, errish: true, timedOut: true })
        return `Error: ${tool} timed out after ${Math.round(timeoutMs / 1000)}s.`
      }
      logCall({ tool, ms, ok: true, args: argsSummary, errish: result.startsWith('Error:') || undefined })
      return result
    } catch (err) {
      logCall({
        tool,
        ms: Date.now() - startedAt,
        ok: false,
        args: argsSummary,
        err: err instanceof Error ? err.message : String(err),
      })
      throw err
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
}
