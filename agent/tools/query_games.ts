import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { queryGamesTool, queryGamesInputShape, queryGamesDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: queryGamesDescription,
  inputSchema: z.object(queryGamesInputShape),
  async execute(input) {
    return queryGamesTool(input)
  },
})
