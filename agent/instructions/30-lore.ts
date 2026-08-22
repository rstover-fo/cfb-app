import { defineDynamic, defineInstructions } from 'eve/instructions'
import { getLoreEnabled } from '@/lib/agent/bot-data'
import { LORE_BLOCK } from '@/lib/agent/prompts'

// The /lore toggle is honored by prompt construction itself, not by an
// unenforceable in-prompt promise: while off, this resolver returns null and
// the block never reaches the model. Mirrors the bot's two byte-stable
// prompt variants.
//
// Resolved on every turn; the toggle flips rarely, so a short cache keeps
// this from costing a Supabase read per message.
const CACHE_TTL_MS = 60_000
let cached: { value: boolean; at: number } | undefined

async function loreEnabled(): Promise<boolean> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value
  const value = await getLoreEnabled()
  cached = { value, at: Date.now() }
  return value
}

export default defineDynamic({
  events: {
    'turn.started': async () =>
      (await loreEnabled()) ? defineInstructions({ content: LORE_BLOCK }) : null,
  },
})
