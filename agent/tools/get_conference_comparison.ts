import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getConferenceComparisonTool, getConferenceComparisonInputShape, getConferenceComparisonDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getConferenceComparisonDescription,
  inputSchema: z.object(getConferenceComparisonInputShape),
  async execute(input) {
    return getConferenceComparisonTool(input)
  },
})
