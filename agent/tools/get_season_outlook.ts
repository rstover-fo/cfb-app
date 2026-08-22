import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getSeasonOutlookTool, getSeasonOutlookInputShape, getSeasonOutlookDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getSeasonOutlookDescription,
  inputSchema: z.object(getSeasonOutlookInputShape),
  async execute(input) {
    return getSeasonOutlookTool(input)
  },
})
