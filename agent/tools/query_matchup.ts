import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { queryMatchupTool, queryMatchupInputShape, queryMatchupDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: queryMatchupDescription,
  inputSchema: z.object(queryMatchupInputShape),
  async execute(input) {
    return queryMatchupTool(input)
  },
})
