import { getCurrentSeasonForRoute } from '@/lib/queries/season'

/**
 * Season-state lookup for out-of-process callers that can't share this app's
 * React render tree (and so can't use getCurrentSeasonCached's cache()) --
 * today, the Discord bot: it has no MCP client of its own (it only reaches
 * the MCP server through Anthropic's server-side mcp_servers connector), so
 * it cannot call the get_data_freshness MCP tool at prompt-build time. This
 * route is its substitute, fetched on the bot's own boot/refresh schedule
 * (see bot/src/config.ts's refreshSeasonState). See
 * docs/implementation-notes.md for the fuller design deviation writeup.
 *
 * Needs the Node.js runtime (not edge): getCurrentSeasonForRoute goes through
 * the Supabase server client, same reasoning as the MCP transport route.
 *
 * No auth: the payload is a season number and a week -- the same information
 * every page on this site already renders unauthenticated.
 */
export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const state = await getCurrentSeasonForRoute()
  return Response.json(state, {
    headers: {
      // Matches SEASON_CACHE_TTL_MS's own 600s TTL for stale-while-revalidate;
      // max-age=60 keeps a burst of callers within a minute of each other from
      // each paying their own resolveCurrentSeason() round trip.
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
    },
  })
}
