import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { renderChartTool, renderChartInputShape, renderChartDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: renderChartDescription,
  inputSchema: z.object(renderChartInputShape),
  async execute(input) {
    return renderChartTool(input)
  },
})
