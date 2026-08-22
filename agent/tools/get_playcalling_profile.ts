import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getPlaycallingProfileTool, getPlaycallingProfileInputShape, getPlaycallingProfileDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getPlaycallingProfileDescription,
  inputSchema: z.object(getPlaycallingProfileInputShape),
  async execute(input) {
    return getPlaycallingProfileTool(input)
  },
})
