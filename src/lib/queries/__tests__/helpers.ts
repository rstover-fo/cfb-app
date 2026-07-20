/**
 * Shared Supabase query-builder mock for query-layer unit tests.
 *
 * Mimics the subset of the supabase-js chainable API used by
 * src/lib/queries/*: schema/from/select/eq/in/or/not/order/limit/single,
 * resolving to PostgREST-shaped { data, error } responses.
 *
 * Each `await` on a chain (or a call to `.single()`) consumes exactly one
 * queued response for its table key, so a function that queries the same
 * table twice in one call (e.g. getRankingsForWeek fetching the current AND
 * previous week from api.poll_rankings) can be given two responses that are
 * consumed in call order. `Promise.all` resolves array elements in source
 * order (it iterates the array left-to-right, invoking `.then` on each
 * entry sequentially), so the response queue lines up with the order the
 * query functions build their requests in.
 */
import { vi } from 'vitest'

export interface PostgrestError {
  message: string
  code?: string
  details?: string
  hint?: string
}

export interface QueryResult<T = unknown> {
  data: T | null
  error: PostgrestError | null
}

/** A successful PostgREST response carrying `data`. */
export function ok<T>(data: T): QueryResult<T> {
  return { data, error: null }
}

/** A failed PostgREST response (data: null, error set) — never a thrown exception. */
export function dbError(message = 'PostgREST error'): QueryResult<never> {
  return { data: null, error: { message, code: 'PGRST000' } }
}

type ResponseEntry = QueryResult | QueryResult[]
type ResponseMap = Record<string, ResponseEntry>

const CHAIN_METHODS = [
  'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'like', 'ilike', 'in', 'or', 'not', 'order', 'limit', 'range', 'match',
] as const

function makeChain(resolve: () => QueryResult) {
  const chain: Record<string, unknown> = {}
  for (const method of CHAIN_METHODS) {
    chain[method] = vi.fn(() => chain)
  }
  chain.single = vi.fn(() => Promise.resolve(resolve()))
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolve()))
  // Makes the chain itself awaitable, like the real PostgrestFilterBuilder.
  chain.then = (
    onFulfilled: (v: QueryResult) => unknown,
    onRejected?: (e: unknown) => unknown
  ) => Promise.resolve(resolve()).then(onFulfilled, onRejected)
  chain.catch = (onRejected: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).catch(onRejected)
  return chain
}

export interface SupabaseMockConfig {
  /** Responses for `.from(table)` calls (public schema), keyed by table name. */
  tables?: ResponseMap
  /** Responses for `.schema('api').from(table)` calls, keyed by table name. */
  apiTables?: ResponseMap
  /** Responses for `.rpc(name, args)` calls, keyed by function name. */
  rpc?: Record<string, ResponseEntry>
}

/**
 * Builds a stub matching the surface of the client returned by
 * `@/lib/supabase/server`'s createClient(). Cast the result with
 * `as unknown as Awaited<ReturnType<typeof createClient>>` when passing to
 * `vi.mocked(createClient).mockResolvedValue(...)` — the stub intentionally
 * implements only the chain methods the query layer actually calls.
 */
export function createSupabaseMock(config: SupabaseMockConfig = {}) {
  const cursors = new Map<string, number>()

  function resolverFor(cursorKey: string, entry: ResponseEntry | undefined): () => QueryResult {
    return () => {
      if (entry === undefined) return { data: null, error: null }
      if (!Array.isArray(entry)) return entry
      const idx = cursors.get(cursorKey) ?? 0
      cursors.set(cursorKey, idx + 1)
      return entry[Math.min(idx, entry.length - 1)]
    }
  }

  const from = vi.fn((table: string) =>
    makeChain(resolverFor(`public:${table}`, config.tables?.[table]))
  )

  const schema = vi.fn((schemaName: string) => ({
    from: vi.fn((table: string) =>
      makeChain(resolverFor(`${schemaName}:${table}`, config.apiTables?.[table]))
    ),
  }))

  const rpc = vi.fn((fnName: string) => {
    const resolve = resolverFor(`rpc:${fnName}`, config.rpc?.[fnName])
    return Promise.resolve(resolve())
  })

  return { from, schema, rpc }
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>
