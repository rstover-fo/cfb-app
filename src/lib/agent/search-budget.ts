/**
 * Per-turn web-access budget shared by the web_search and read_page tools.
 * WEB_SEARCH_MAX_USES caps how many Firecrawl calls ONE turn may spend
 * across both tools -- the port of the bot's per-logical-ask search budget
 * (bot/src/claude.ts WebSearchBudget), enforced tool-side because eve has
 * no built-in budget option.
 *
 * In-process state keyed by turn id: correct within one eve runtime
 * instance, which is where a turn's tool calls all execute. Entries expire
 * so a long-lived process doesn't accumulate finished turns.
 */
const TURN_TTL_MS = 15 * 60 * 1000
const spentByTurn = new Map<string, { spent: number; at: number }>()

export function webSearchMaxUses(): number {
  const raw = process.env.WEB_SEARCH_MAX_USES
  if (raw === undefined || raw.trim() === '') return 3
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 3
}

function sweep(now: number): void {
  for (const [turnId, entry] of spentByTurn) {
    if (now - entry.at > TURN_TTL_MS) spentByTurn.delete(turnId)
  }
}

/**
 * Tries to spend one unit of the turn's budget. Returns the remaining
 * allowance after spending, or null when the budget is already exhausted
 * (or the feature is disabled with a 0 cap).
 */
export function trySpend(turnId: string): number | null {
  const max = webSearchMaxUses()
  const now = Date.now()
  sweep(now)
  const entry = spentByTurn.get(turnId) ?? { spent: 0, at: now }
  if (entry.spent >= max) return null
  entry.spent += 1
  entry.at = now
  spentByTurn.set(turnId, entry)
  return max - entry.spent
}

/** Test-only: clears all turn budgets. */
export function resetSearchBudgetForTests(): void {
  spentByTurn.clear()
}
