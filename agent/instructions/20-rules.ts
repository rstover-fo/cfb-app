import { defineInstructions } from 'eve/instructions'
import { RULES_CONTENT, ADVISOR_DELEGATION } from '@/lib/agent/prompts'

// Static module-backed instructions: resolved once at build time. The rules
// text lives in src/lib/agent/prompts.ts so the advisor subagent can share
// it (minus the delegation rule, which must be root-only).
export default defineInstructions({
  content: [RULES_CONTENT, ADVISOR_DELEGATION].join('\n'),
})
