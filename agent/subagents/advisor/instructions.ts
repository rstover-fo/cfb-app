import { defineDynamic, defineInstructions } from 'eve/instructions'
import { getCurrentSeasonForRoute } from '@/lib/queries/season'
import { RULES_CONTENT, seasonRulesBlock } from '@/lib/agent/prompts'

// The advisor shares the root agent's integrity rules but NOT the
// delegation rule (an advisor must never "escalate" again) and NOT the
// persona -- the root relays advisor analysis in its own voice.
//
// R10: the season slice is resolved here the same way the root agent's
// agent/instructions/25-season.ts resolves it (same resolver, same render
// function), so root and advisor never disagree on what "this season" means.
export default defineDynamic({
  events: {
    'turn.started': async () => {
      const state = await getCurrentSeasonForRoute()
      return defineInstructions({
        content: [
          'You are the deep-analysis advisor for a college-football analytics agent. You receive hard',
          'multi-factor questions together with facts already gathered. Analyze rigorously, use your',
          'tools to fill data gaps, and return a dense, well-structured analysis: verdict first, then',
          'the supporting numbers with their sources. No personality -- the caller adds the voice.',
          '',
          RULES_CONTENT,
          '',
          seasonRulesBlock(state),
        ].join('\n'),
      })
    },
  },
})
