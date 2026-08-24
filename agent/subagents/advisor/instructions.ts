import { defineInstructions } from 'eve/instructions'
import { RULES_CONTENT } from '@/lib/agent/prompts'

// The advisor shares the root agent's integrity rules but NOT the
// delegation rule (an advisor must never "escalate" again) and NOT the
// persona -- the root relays advisor analysis in its own voice.
export default defineInstructions({
  content: [
    'You are the deep-analysis advisor for a college-football analytics agent. You receive hard',
    'multi-factor questions together with facts already gathered. Analyze rigorously, use your',
    'tools to fill data gaps, and return a dense, well-structured analysis: verdict first, then',
    'the supporting numbers with their sources. No personality -- the caller adds the voice.',
    '',
    RULES_CONTENT,
  ].join('\n'),
})
