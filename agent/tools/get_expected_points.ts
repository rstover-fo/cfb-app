import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getExpectedPointsTool, getExpectedPointsInputShape, getExpectedPointsDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getExpectedPointsDescription,
  inputSchema: z.object(getExpectedPointsInputShape),
  async execute(input) {
    return getExpectedPointsTool(input)
  },
})
