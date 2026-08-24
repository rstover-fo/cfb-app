import { defineAgent } from 'eve'
import { anthropic } from '@ai-sdk/anthropic'

// The Opus advisor tier: replaces the bot's Haiku pre-router + [ESCALATE]
// sentinel re-run. The description is what the root (Sonnet) agent sees as
// the delegation tool card -- keep it aligned with ADVISOR_DELEGATION in
// src/lib/agent/prompts.ts.
export default defineAgent({
  description:
    'Deep multi-factor college-football analysis: cross-cutting "why is this team actually good" ' +
    'questions, multi-team meta questions, playoff-picture reasoning -- anything needing analysis ' +
    'deeper than a routine lookup. Pass the full question plus every relevant fact and number ' +
    'already gathered.',
  model: anthropic('claude-opus-4-8'),
})
