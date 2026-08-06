import { describe, it, expect, afterEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseBackend } from '../supabase-backend.js'

/**
 * Hand-rolled chainable fake for the slice of supabase-js the backend uses.
 * Each from() call consumes the next queued response; every chained method
 * is recorded so tests can assert tables, filters, and row shapes. The
 * chain is thenable (awaiting it resolves the queued response) and also
 * resolves via maybeSingle().
 */
interface QueuedResponse {
  data?: unknown
  error?: { message: string } | null
}

interface RecordedCall {
  table: string
  ops: Array<[string, unknown[]]>
}

function fakeClient(responses: QueuedResponse[]) {
  const calls: RecordedCall[] = []
  let index = 0
  const client = {
    from(table: string) {
      const record: RecordedCall = { table, ops: [] }
      calls.push(record)
      const response = responses[index++] ?? { data: null, error: null }
      const result = { data: response.data ?? null, error: response.error ?? null }
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'in', 'order', 'delete', 'upsert', 'insert']) {
        chain[method] = (...args: unknown[]) => {
          record.ops.push([method, args])
          return chain
        }
      }
      chain.maybeSingle = () => {
        record.ops.push(['maybeSingle', []])
        return Promise.resolve(result)
      }
      chain.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled, onRejected)
      return chain
    },
  }
  return { calls, client: client as unknown as SupabaseClient }
}

function opNames(call: RecordedCall): string[] {
  return call.ops.map(([name]) => name)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('profiles', () => {
  it('maps a row to UserProfile and caches it (one network call for two reads)', async () => {
    const { calls, client } = fakeClient([
      { data: { user_id: 'u1', favorite_team: 'Oklahoma', memory_enabled: false, set_at: '2026-01-01T00:00:00Z' } },
    ])
    const backend = new SupabaseBackend(client)

    await expect(backend.getProfile('u1')).resolves.toEqual({
      favoriteTeam: 'Oklahoma',
      memoryEnabled: false,
      setAt: '2026-01-01T00:00:00Z',
    })
    await backend.getProfile('u1')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.table).toBe('user_profiles')
    expect(calls[0]!.ops).toContainEqual(['eq', ['user_id', 'u1']])
  })

  it('caches "no row" too, returning undefined without re-querying', async () => {
    const { calls, client } = fakeClient([{ data: null }])
    const backend = new SupabaseBackend(client)

    await expect(backend.getProfile('u1')).resolves.toBeUndefined()
    await expect(backend.getProfile('u1')).resolves.toBeUndefined()
    expect(calls).toHaveLength(1)
  })

  it('read errors log and return undefined instead of throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient([{ error: { message: 'connection refused' } }])
    const backend = new SupabaseBackend(client)

    await expect(backend.getProfile('u1')).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('upsert merges the patch with the existing profile and writes the full row', async () => {
    const { calls, client } = fakeClient([
      { data: { user_id: 'u1', favorite_team: 'Oklahoma', memory_enabled: false, set_at: null } },
      {}, // upsert response
    ])
    const backend = new SupabaseBackend(client)

    await backend.upsertProfile('u1', { favoriteTeam: 'Texas' })

    const upsertCall = calls[1]!
    expect(upsertCall.table).toBe('user_profiles')
    const [payload] = upsertCall.ops.find(([name]) => name === 'upsert')![1] as [Record<string, unknown>]
    expect(payload).toMatchObject({ user_id: 'u1', favorite_team: 'Texas', memory_enabled: false })
  })

  it('a successful write updates the cache (later reads skip the network)', async () => {
    const { calls, client } = fakeClient([{ data: null }, {}])
    const backend = new SupabaseBackend(client)

    await backend.upsertProfile('u1', { favoriteTeam: 'Oklahoma' })
    await expect(backend.getProfile('u1')).resolves.toMatchObject({ favoriteTeam: 'Oklahoma', memoryEnabled: true })
    expect(calls).toHaveLength(2) // read + upsert only, the getProfile hit the cache
  })

  it('write errors throw', async () => {
    const { client } = fakeClient([{ data: null }, { error: { message: 'permission denied' } }])
    const backend = new SupabaseBackend(client)

    await expect(backend.upsertProfile('u1', { favoriteTeam: 'Oklahoma' })).rejects.toThrow(/permission denied/)
  })
})

describe('settings', () => {
  it('defaults loreEnabled to true when no row exists, and caches', async () => {
    const { calls, client } = fakeClient([{ data: null }])
    const backend = new SupabaseBackend(client)

    await expect(backend.getSettings()).resolves.toEqual({ loreEnabled: true })
    await backend.getSettings()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.table).toBe('app_settings')
  })

  it('read errors fall back to the default instead of throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient([{ error: { message: 'timeout' } }])
    const backend = new SupabaseBackend(client)

    await expect(backend.getSettings()).resolves.toEqual({ loreEnabled: true })
  })

  it('saveSettings writes the singleton row and write errors throw', async () => {
    const { calls, client } = fakeClient([{ data: { lore_enabled: true } }, {}])
    const backend = new SupabaseBackend(client)
    await backend.saveSettings({ loreEnabled: false })
    const [payload] = calls[1]!.ops.find(([name]) => name === 'upsert')![1] as [Record<string, unknown>]
    expect(payload).toMatchObject({ key: 'global', lore_enabled: false })

    const failing = new SupabaseBackend(fakeClient([{ data: null }, { error: { message: 'nope' } }]).client)
    await expect(failing.saveSettings({ loreEnabled: true })).rejects.toThrow(/nope/)
  })
})

describe('memory atoms', () => {
  it('lists atoms mapped to MemoryAtom, ordered by the query', async () => {
    const { calls, client } = fakeClient([
      {
        data: [
          { id: 'a', content: 'Hates Texas', kind: 'preference', source: 'extraction', created_at: 't1', updated_at: 't1' },
        ],
      },
    ])
    const backend = new SupabaseBackend(client)

    await expect(backend.listAtoms('u1')).resolves.toEqual([
      { id: 'a', content: 'Hates Texas', kind: 'preference', source: 'extraction', createdAt: 't1', updatedAt: 't1' },
    ])
    expect(calls[0]!.table).toBe('memory_atoms')
    expect(opNames(calls[0]!)).toEqual(expect.arrayContaining(['select', 'eq', 'order']))
  })

  it('read errors return [] instead of throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient([{ error: { message: 'down' } }])
    const backend = new SupabaseBackend(client)
    await expect(backend.listAtoms('u1')).resolves.toEqual([])
  })

  it('insertAtom writes the row shape and throws on error', async () => {
    const { calls, client } = fakeClient([{}])
    const backend = new SupabaseBackend(client)
    await backend.insertAtom('u1', { content: 'Went to OU', kind: 'fact', source: 'extraction' })
    const [payload] = calls[0]!.ops.find(([name]) => name === 'insert')![1] as [Record<string, unknown>]
    expect(payload).toEqual({ user_id: 'u1', content: 'Went to OU', kind: 'fact', source: 'extraction' })

    const failing = new SupabaseBackend(fakeClient([{ error: { message: 'bad' } }]).client)
    await expect(failing.insertAtom('u1', { content: 'x', kind: 'fact', source: 'extraction' })).rejects.toThrow(/bad/)
  })

  it('deleteAtoms counts deleted rows, scopes to the user, and filters by ids when given', async () => {
    const { calls, client } = fakeClient([{ data: [{ id: 'a' }, { id: 'b' }] }])
    const backend = new SupabaseBackend(client)

    await expect(backend.deleteAtoms('u1', ['a', 'b'])).resolves.toBe(2)
    expect(calls[0]!.ops).toContainEqual(['eq', ['user_id', 'u1']])
    expect(calls[0]!.ops).toContainEqual(['in', ['id', ['a', 'b']]])
  })

  it('deleteAtoms without ids wipes the user without an id filter', async () => {
    const { calls, client } = fakeClient([{ data: [] }])
    const backend = new SupabaseBackend(client)

    await expect(backend.deleteAtoms('u1')).resolves.toBe(0)
    expect(opNames(calls[0]!)).not.toContain('in')
  })
})
