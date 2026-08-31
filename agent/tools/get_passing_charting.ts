import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getPassingChartingTool, getPassingChartingInputShape, getPassingChartingDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getPassingChartingDescription,
  inputSchema: z.object(getPassingChartingInputShape),
  async execute(input) {
    return getPassingChartingTool(input)
  },
})
