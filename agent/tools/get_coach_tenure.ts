import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getCoachTenureTool, getCoachTenureInputShape, getCoachTenureDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getCoachTenureDescription,
  inputSchema: z.object(getCoachTenureInputShape),
  async execute(input) {
    return getCoachTenureTool(input)
  },
})
