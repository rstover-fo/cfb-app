import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getPlayerLeadersTool, getPlayerLeadersInputShape, getPlayerLeadersDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getPlayerLeadersDescription,
  inputSchema: z.object(getPlayerLeadersInputShape),
  async execute(input) {
    return getPlayerLeadersTool(input)
  },
})
