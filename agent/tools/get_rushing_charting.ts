import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getRushingChartingTool, getRushingChartingInputShape, getRushingChartingDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getRushingChartingDescription,
  inputSchema: z.object(getRushingChartingInputShape),
  async execute(input) {
    return getRushingChartingTool(input)
  },
})
