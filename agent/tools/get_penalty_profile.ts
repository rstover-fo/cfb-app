import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getPenaltyProfileTool, getPenaltyProfileInputShape, getPenaltyProfileDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getPenaltyProfileDescription,
  inputSchema: z.object(getPenaltyProfileInputShape),
  async execute(input) {
    return getPenaltyProfileTool(input)
  },
})
