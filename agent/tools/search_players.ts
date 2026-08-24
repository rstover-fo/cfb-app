import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { searchPlayersTool, searchPlayersInputShape, searchPlayersDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: searchPlayersDescription,
  inputSchema: z.object(searchPlayersInputShape),
  async execute(input) {
    return searchPlayersTool(input)
  },
})
