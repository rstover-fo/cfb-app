import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getLeaderboardTool, getLeaderboardInputShape, getLeaderboardDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getLeaderboardDescription,
  inputSchema: z.object(getLeaderboardInputShape),
  async execute(input) {
    return getLeaderboardTool(input)
  },
})
