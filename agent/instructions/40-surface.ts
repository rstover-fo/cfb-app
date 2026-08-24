import { defineDynamic, defineInstructions } from 'eve/instructions'
import { DISCORD_SURFACE_BLOCK, WEB_SURFACE_BLOCK } from '@/lib/agent/prompts'

// One brain, two rendering targets. The channel auth stamps
// attributes.surface on every caller: 'discord' from the bot's JWT, 'web'
// from the Supabase-cookie auth. Unknown surfaces get the web contract --
// plain markdown is the safe default.
export default defineDynamic({
  events: {
    'turn.started': (_event, ctx) => {
      const surface = ctx.session.auth.current?.attributes.surface
      return defineInstructions({
        content: surface === 'discord' ? DISCORD_SURFACE_BLOCK : WEB_SURFACE_BLOCK,
      })
    },
  },
})
