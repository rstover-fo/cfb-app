import { defineAgent } from 'eve'
import { anthropic } from '@ai-sdk/anthropic'

// Direct AI SDK provider (not AI Gateway): keeps the existing ANTHROPIC_API_KEY
// billing relationship the Discord bot already uses. The provider reads the key
// at call time, so importing this file costs nothing at build.
export default defineAgent({
  model: anthropic('claude-sonnet-5'),
})
