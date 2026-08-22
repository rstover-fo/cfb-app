import { defineDynamic, defineInstructions } from 'eve/instructions'
import { buildUserContext } from '@/lib/agent/user-context'

/**
 * Per-turn user context (favorite team, picks receipts, and -- from Phase 2
 * -- memory), injected as a user-role message so it rides the conversation
 * like the bot's `(Context: ...)` suffix did, never the cached system
 * prompt. Keyed strictly off auth.current: in a multi-user Discord channel
 * session, the context always belongs to whoever sent THIS message.
 */
export default defineDynamic({
  events: {
    'turn.started': async (_event, ctx) => {
      const caller = ctx.session.auth.current
      if (!caller) return null
      const guildIdAttr = caller.attributes.guildId
      const guildId = typeof guildIdAttr === 'string' ? guildIdAttr : undefined
      const context = await buildUserContext(caller.principalId, guildId)
      if (!context) return null
      return defineInstructions({
        role: 'user',
        content: `(Context about the person asking, from their profile -- not part of their question: ${context})`,
      })
    },
  },
})
