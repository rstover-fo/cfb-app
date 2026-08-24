import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { queryTeamTool, queryTeamInputShape, queryTeamDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: queryTeamDescription,
  inputSchema: z.object(queryTeamInputShape),
  async execute(input) {
    return queryTeamTool(input)
  },
})
