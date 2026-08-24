import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { searchWeb, firecrawlConfigured } from '@/lib/agent/firecrawl'
import { trySpend } from '@/lib/agent/search-budget'

// Authoring a tool named web_search shadows eve's built-in: this one is
// Firecrawl-backed and budget-capped per turn (shared with read_page),
// porting the bot's per-logical-ask search allowance. Budget refusals are
// tool RESULTS, not errors -- the model should answer from the warehouse
// with what it has, per the rules prompt.
export default defineTool({
  description:
    'Search the web for NEWS and CONTEXT the cfb data warehouse cannot know: injuries, transfers, ' +
    'coaching moves, suspensions, kickoff/broadcast info, breaking stories. Returns page content ' +
    'with SOURCE urls -- cite the source domain when you use one. Never use this for stats, ' +
    'rankings, scores, or projections the cfb data tools cover: the warehouse is the only ' +
    'authority for those. Budgeted per answer; search sparingly.',
  inputSchema: z.object({
    query: z.string().min(2).max(300).describe('The search query. Be specific: team, name, topic.'),
  }),
  async execute(input, ctx) {
    if (!firecrawlConfigured()) {
      return 'Web search is not configured on this deployment. Answer from the cfb data tools and say current-news context is unavailable.'
    }
    const remaining = trySpend(ctx.session.turn.id)
    if (remaining === null) {
      return 'Web access budget for this answer is spent. Answer with what you already have; do not fabricate news.'
    }
    try {
      const digest = await searchWeb(input.query)
      return `${digest}\n\n[web access remaining this answer: ${remaining}]`
    } catch (err) {
      console.error('[web_search] failed:', err instanceof Error ? err.message : err)
      return 'Web search failed. Answer from the cfb data tools and say the news check did not go through.'
    }
  },
})
