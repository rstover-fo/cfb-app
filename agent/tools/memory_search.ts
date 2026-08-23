import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { searchMemories } from '@/lib/memory/client'
import { getUserProfile } from '@/lib/agent/bot-data'
import { withToolTelemetry } from '@/lib/mcp/telemetry'

// Identity comes ONLY from session auth -- the model never chooses whose
// memory to read. Telemetry redacts args: queries derive from user talk.
// The /memory off toggle gates reads too, not just writes: a user who
// turned memory off must not have retained memories resurfaced to the
// model (same guard as the remember tool and the capture hook).
const run = withToolTelemetry(
  'memory_search',
  async (userId: string, query: string): Promise<string> => {
    const profile = await getUserProfile(userId)
    if (!profile.memoryEnabled) {
      return 'This user turned long-term memory OFF -- stored memories must not be recalled. Treat this conversation as fresh; /memory on in Discord re-enables memory.'
    }
    const memories = await searchMemories(userId, query)
    if (memories.length === 0) return 'No stored memories match that.'
    return memories.map(memory => `[${memory.kind}] ${memory.content}`).join('\n')
  },
  { redactArgs: true }
)

export default defineTool({
  description:
    'Search your long-term memory about the person you are talking to (their preferences, facts ' +
    'they shared, takes they hold) for things not already shown in your context -- e.g. "what did ' +
    'they tell me about their fantasy league". Only covers THIS user; you cannot look up other ' +
    'people.',
  inputSchema: z.object({
    query: z.string().min(2).max(300).describe('What to recall, in natural language.'),
  }),
  async execute(input, ctx) {
    const caller = ctx.session.auth.current
    if (!caller || caller.principalType !== 'user') return 'No user identity on this session.'
    return run(caller.principalId, input.query)
  },
})
