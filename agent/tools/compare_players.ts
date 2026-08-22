import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { comparePlayersTool, comparePlayersInputShape, comparePlayersDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: comparePlayersDescription,
  inputSchema: z.object(comparePlayersInputShape),
  async execute(input) {
    return comparePlayersTool(input)
  },
})
