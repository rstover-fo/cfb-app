import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getModelAccuracyTool, getModelAccuracyInputShape, getModelAccuracyDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getModelAccuracyDescription,
  inputSchema: z.object(getModelAccuracyInputShape),
  async execute() {
    return getModelAccuracyTool()
  },
})
