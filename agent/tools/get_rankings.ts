import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getRankingsTool, getRankingsInputShape, getRankingsDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getRankingsDescription,
  inputSchema: z.object(getRankingsInputShape),
  async execute(input) {
    return getRankingsTool(input)
  },
})
