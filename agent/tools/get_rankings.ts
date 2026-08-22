import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getRankingsTool } from '@/lib/mcp/tools'

// Phase 0 spike tool: proves (a) an eve tool can import the exported MCP tool
// functions directly (no HTTP hop through /api/mcp), and (b) the app's zod v3
// schemas pass into defineTool via Standard Schema. Phase 1 replaces the
// inline schema with per-tool shapes exported from src/lib/mcp/tools.ts so the
// MCP registration and this wrapper can never drift.
export default defineTool({
  description:
    'Get weekly or final poll rankings (AP Top 25, Coaches Poll, CFP committee, etc). ' +
    "Tied teams share a rank value and the next rank is skipped. For the end-of-season final poll set season_type='postseason'. " +
    'Prefer narrowing with poll and/or week; results are capped at 100 rows.',
  inputSchema: z.object({
    season: z.number().int().describe('Season year, e.g. 2024.'),
    week: z.number().int().optional().describe('Week number. Omit for every week of the season.'),
    poll: z
      .string()
      .optional()
      .describe("Exact poll name, e.g. 'AP Top 25', 'Coaches Poll', 'Playoff Committee Rankings'."),
    season_type: z
      .enum(['regular', 'postseason'])
      .optional()
      .describe("'regular' (default) for weekly in-season polls, 'postseason' for the final poll."),
    limit: z.number().int().optional().describe('Max rows to return (default 100).'),
  }),
  async execute(input) {
    return getRankingsTool(input)
  },
})
