import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getTargetProfileTool, getTargetProfileInputShape, getTargetProfileDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getTargetProfileDescription,
  inputSchema: z.object(getTargetProfileInputShape),
  async execute(input) {
    return getTargetProfileTool(input)
  },
})
