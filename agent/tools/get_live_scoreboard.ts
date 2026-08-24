import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getLiveScoreboardTool, getLiveScoreboardInputShape, getLiveScoreboardDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getLiveScoreboardDescription,
  inputSchema: z.object(getLiveScoreboardInputShape),
  async execute() {
    return getLiveScoreboardTool()
  },
})
