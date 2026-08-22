import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getTeamEloTool, getTeamEloInputShape, getTeamEloDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getTeamEloDescription,
  inputSchema: z.object(getTeamEloInputShape),
  async execute(input) {
    return getTeamEloTool(input)
  },
})
