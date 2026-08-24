import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { situationalSplitsTool, situationalSplitsInputShape, situationalSplitsDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: situationalSplitsDescription,
  inputSchema: z.object(situationalSplitsInputShape),
  async execute(input) {
    return situationalSplitsTool(input)
  },
})
