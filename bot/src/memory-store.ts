/**
 * Policy layer over the storage backend for long-term memory atoms: the
 * per-user cap, the extraction `replaces` semantics, and index-based
 * forgetting for /memory. Deliberately named apart from memory.ts, which is
 * the short-lived per-channel conversation ring buffer -- the two are
 * unrelated. The backends themselves stay dumb CRUD; every rule lives here
 * so the JSON and Supabase paths can't drift.
 */
import { getStorage } from './storage/index.js'
import type { MemoryAtom } from './storage/backend.js'

export const MAX_ATOMS_PER_USER = 20

export interface ExtractedAtom {
  content: string
  kind: MemoryAtom['kind']
  /** Id of an existing atom this one updates/duplicates, per the extraction contract. */
  replaces?: string | null
}

/** The user's atoms, oldest first -- the stable order /memory show numbers against. */
export async function listAtoms(userId: string): Promise<MemoryAtom[]> {
  return getStorage().listAtoms(userId)
}

/**
 * Applies one extraction result: atoms with a valid `replaces` id delete
 * that atom first (an unknown id is ignored -- plain insert), then inserts,
 * then evicts oldest-first down to MAX_ATOMS_PER_USER. Throws on storage
 * write failure -- the caller (memory-extract.ts) treats any throw as a
 * logged no-op.
 */
export async function applyExtraction(
  userId: string,
  atoms: ExtractedAtom[]
): Promise<{ inserted: number; replaced: number }> {
  if (atoms.length === 0) return { inserted: 0, replaced: 0 }
  const storage = getStorage()
  const existingIds = new Set((await storage.listAtoms(userId)).map(a => a.id))

  let replaced = 0
  for (const atom of atoms) {
    if (atom.replaces && existingIds.has(atom.replaces)) {
      replaced += await storage.deleteAtoms(userId, [atom.replaces])
      existingIds.delete(atom.replaces)
    }
    await storage.insertAtom(userId, { content: atom.content, kind: atom.kind, source: 'extraction' })
  }

  const after = await storage.listAtoms(userId)
  if (after.length > MAX_ATOMS_PER_USER) {
    const overflow = after.slice(0, after.length - MAX_ATOMS_PER_USER).map(a => a.id)
    await storage.deleteAtoms(userId, overflow)
  }

  return { inserted: atoms.length, replaced }
}

/**
 * Forgets atoms for /memory: `index` is 1-based against listAtoms() order;
 * omitted means wipe everything. Returns how many were deleted plus, for a
 * single-index delete, the deleted atom's content so the reply can echo it.
 * An out-of-range index deletes nothing.
 */
export async function forgetAtoms(userId: string, index?: number): Promise<{ deleted: number; content?: string }> {
  const storage = getStorage()
  if (index === undefined) {
    const deleted = await storage.deleteAtoms(userId)
    return { deleted }
  }
  const atoms = await storage.listAtoms(userId)
  const target = atoms[index - 1]
  if (!target) return { deleted: 0 }
  const deleted = await storage.deleteAtoms(userId, [target.id])
  return { deleted, content: target.content }
}
