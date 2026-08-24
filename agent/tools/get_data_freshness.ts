import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getDataFreshnessTool, getDataFreshnessInputShape, getDataFreshnessDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getDataFreshnessDescription,
  inputSchema: z.object(getDataFreshnessInputShape),
  async execute() {
    return getDataFreshnessTool()
  },
})
