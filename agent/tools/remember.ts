import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { rememberMemory } from '@/lib/memory/client'
import { getUserProfile } from '@/lib/agent/bot-data'
import { withToolTelemetry } from '@/lib/mcp/telemetry'

// The explicit "remember this about me" path -- automatic extraction covers
// most turns, but a direct ask deserves a direct, honest save. Honors the
// user's memory toggle; identity comes only from session auth.
const run = withToolTelemetry(
  'remember',
  async (userId: string, kind: 'preference' | 'fact' | 'take', content: string): Promise<string> => {
    const profile = await getUserProfile(userId)
    if (!profile.memoryEnabled) {
      return 'This user turned long-term memory OFF -- nothing was saved. Acknowledge for this conversation only and point at /memory on in Discord.'
    }
    const stored = await rememberMemory({ userId, kind, content })
    if (!stored) return 'Memory storage is unavailable right now -- nothing was saved. Say so honestly.'
    return `Saved: [${stored.kind}] ${stored.content}`
  },
  { redactArgs: true }
)

export default defineTool({
  description:
    'Save one durable memory about the person you are talking to, when they explicitly ask you to ' +
    'remember something about THEMSELVES or clearly state a lasting preference/fact/take. Keep it ' +
    'under 120 characters, third person, present tense ("Hates Texas", "Went to Oklahoma State"). ' +
    'Never store CFB trivia or stats, and never store claims about OTHER users.',
  inputSchema: z.object({
    kind: z.enum(['preference', 'fact', 'take']).describe('What sort of memory this is.'),
    content: z.string().min(3).max(120).describe('The memory, third person, present tense.'),
  }),
  async execute(input, ctx) {
    const caller = ctx.session.auth.current
    if (!caller || caller.principalType !== 'user') return 'No user identity on this session.'
    return run(caller.principalId, input.kind, input.content)
  },
})
