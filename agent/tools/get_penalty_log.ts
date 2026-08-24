import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getPenaltyLogTool, getPenaltyLogInputShape, getPenaltyLogDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getPenaltyLogDescription,
  inputSchema: z.object(getPenaltyLogInputShape),
  async execute(input) {
    return getPenaltyLogTool(input)
  },
})
