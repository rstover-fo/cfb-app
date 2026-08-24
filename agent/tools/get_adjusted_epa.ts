import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getAdjustedEpaTool, getAdjustedEpaInputShape, getAdjustedEpaDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getAdjustedEpaDescription,
  inputSchema: z.object(getAdjustedEpaInputShape),
  async execute(input) {
    return getAdjustedEpaTool(input)
  },
})
