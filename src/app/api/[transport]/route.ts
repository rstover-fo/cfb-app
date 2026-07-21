import { createMcpHandler } from 'mcp-handler'
import { checkAuth, unauthorizedResponse } from '@/lib/mcp/auth'
import { registerMcpTools } from '@/lib/mcp/tools'

// Streamable-HTTP MCP server hosted inside this Next.js app (mcp-handler's
// documented App Router pattern: app/api/[transport]/route.ts + basePath
// "/api" resolves the streamable-HTTP transport to /api/mcp). See docs/MCP.md.
//
// Needs the Node.js runtime (not edge): mcp-handler and
// @modelcontextprotocol/sdk use Node APIs, and src/lib/mcp/auth.ts uses
// node:crypto's timingSafeEqual for constant-time token comparison.
export const runtime = 'nodejs'
export const maxDuration = 60

const mcpHandler = createMcpHandler(
  server => {
    registerMcpTools(server)
  },
  {
    serverInfo: { name: 'cfb-mcp', version: '1.0.0' },
  },
  {
    basePath: '/api',
    maxDuration: 60,
    verboseLogs: false,
  }
)

// Bearer-token auth gate in front of the MCP transport handler. Enforced
// manually (rather than via mcp-handler's experimental withMcpAuth) because
// this endpoint uses a single static shared-secret token, not OAuth --
// withMcpAuth's resource-metadata/scopes machinery doesn't apply here, and a
// direct check keeps the fail-closed behavior (see src/lib/mcp/auth.ts)
// simple to read and unit-test.
async function handleRequest(request: Request): Promise<Response> {
  const auth = checkAuth(request)
  if (!auth.ok) return unauthorizedResponse(auth)
  return mcpHandler(request)
}

export { handleRequest as GET, handleRequest as POST }
