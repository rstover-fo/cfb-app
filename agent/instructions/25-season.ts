import { defineDynamic, defineInstructions } from 'eve/instructions'
import { getCurrentSeasonForRoute } from '@/lib/queries/season'
import { seasonRulesBlock } from '@/lib/agent/prompts'

// R10: the season-dependent slice of RULES_CONTENT (src/lib/agent/prompts.ts),
// resolved per turn instead of baked in as the CURRENT_SEASON compiled
// constant -- see seasonRulesBlock's own doc comment for what it renders.
//
// getCurrentSeasonForRoute is the non-RSC resolver (a manual 600s TTL cache):
// eve's runtime is a route handler, not a React render pass, so
// getCurrentSeasonCached (React cache(), scoped to one render) is the wrong
// tool here -- see src/lib/queries/season.ts's module header for why the two
// wrappers exist. Filename ordering (20-rules.ts, 25-season.ts, 30-lore.ts)
// keeps this landing right after the rest of the rules, same as before this
// content was split out.
export default defineDynamic({
  events: {
    'turn.started': async () => {
      const state = await getCurrentSeasonForRoute()
      return defineInstructions({ content: seasonRulesBlock(state) })
    },
  },
})
