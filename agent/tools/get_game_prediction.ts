import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { getGamePredictionTool, getGamePredictionInputShape, getGamePredictionDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: getGamePredictionDescription,
  inputSchema: z.object(getGamePredictionInputShape),
  async execute(input) {
    return getGamePredictionTool(input)
  },
})
