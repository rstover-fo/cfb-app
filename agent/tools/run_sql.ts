import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { runSqlTool, runSqlInputShape, runSqlDescription } from '@/lib/mcp/tools'

export default defineTool({
  description: runSqlDescription,
  inputSchema: z.object(runSqlInputShape),
  async execute(input) {
    return runSqlTool(input)
  },
})
