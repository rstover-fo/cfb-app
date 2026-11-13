import { defineAgent } from 'eve'
import { anthropic } from '@ai-sdk/anthropic'

// Direct AI SDK provider (not AI Gateway): keeps the existing ANTHROPIC_API_KEY
// billing relationship the Discord bot already uses. The provider reads the key
// at call time, so importing this file costs nothing at build.
export default defineAgent({
  model: anthropic('claude-sonnet-5-5'),
  // Chat plus tool use. Sonnet 5.5 thinks adaptively by default and rejects
  // thinking disabled; its API default effort is high. Medium is the
  // recommended start. Set effort directly so the SDK does not also force
  // thinking.display = summarized.
  modelOptions: {
    providerOptions: {
      anthropic: { effort: 'medium' },
    },
  },
})
