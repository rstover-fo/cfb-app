import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getMatchupEdgesTool, getMatchupEdgesInputShape, getMatchupEdgesDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getMatchupEdgesDescription,
  inputSchema: z.object(getMatchupEdgesInputShape),
  async execute(input) {
    return getMatchupEdgesTool(input)
  },
})
