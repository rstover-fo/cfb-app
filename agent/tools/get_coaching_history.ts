import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getCoachingHistoryTool, getCoachingHistoryInputShape, getCoachingHistoryDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getCoachingHistoryDescription,
  inputSchema: z.object(getCoachingHistoryInputShape),
  async execute(input) {
    return getCoachingHistoryTool(input)
  },
})
