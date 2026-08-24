/**
 * One-time migration: bot.memory_atoms (the flat per-user atom store) into
 * the memory graph via the cfb-agent-memory service. Run manually with the
 * production env available:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   MEMORY_ENDPOINT=... MEMORY_JWT_SECRET=... \
 *   npx tsx scripts/migrate-memory-atoms.ts
 *
 * Idempotent by design: every migrated memory carries
 * metadata.source='atom-migration' + the source atom id, and the memory
 * service dedups semantically, so re-runs converge instead of duplicating.
 * The memory_atoms table is left untouched (read-only until Phase 4
 * archives it) -- the bot keeps using it until its cutover.
 */
import { createClient } from '@supabase/supabase-js'
import { rememberMemory, memoryConfigured } from '../src/lib/memory/client'

interface AtomRow {
  id: string
  user_id: string
  content: string
  kind: 'preference' | 'fact' | 'take'
  created_at: string
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  if (!memoryConfigured()) throw new Error('MEMORY_ENDPOINT and MEMORY_JWT_SECRET are required')

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'bot' },
  })

  const { data, error } = await supabase
    .from('memory_atoms')
    .select('id, user_id, content, kind, created_at')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new Error(`memory_atoms read failed: ${error.message}`)

  const atoms = (data ?? []) as AtomRow[]
  console.log(`migrating ${atoms.length} atoms...`)

  let migrated = 0
  let failed = 0
  for (const atom of atoms) {
    const stored = await rememberMemory({
      userId: atom.user_id,
      kind: atom.kind,
      content: atom.content,
      metadata: { source: 'atom-migration', atomId: atom.id, atomCreatedAt: atom.created_at },
    })
    if (stored) migrated++
    else failed++
  }

  console.log(JSON.stringify({ evt: 'atom_migration', total: atoms.length, migrated, failed }))
  if (failed > 0) process.exitCode = 1
}

main().catch(err => {
  console.error('migration failed:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
