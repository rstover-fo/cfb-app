import { timingSafeEqual, createHash } from 'crypto'

// ---------------------------------------------------------------------------
// Bearer-token auth for the MCP endpoint (src/app/api/[transport]/route.ts).
//
// Fails closed: if MCP_AUTH_TOKEN is not set in the environment, EVERY
// request is refused, regardless of what Authorization header (if any) it
// carries. There is no "no auth configured -> allow" fallback.
// ---------------------------------------------------------------------------

const BEARER_PREFIX = 'Bearer '

// SHA-256 both sides before comparing so timingSafeEqual always receives
// equal-length (32-byte) buffers -- avoids both a length-mismatch throw and
// timing leakage of the expected token's length.
function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

export function tokensMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(hashToken(provided), hashToken(expected))
}

export interface AuthResult {
  ok: boolean
  status: number
  message?: string
}

/**
 * Checks the request's credential against process.env.MCP_AUTH_TOKEN.
 *
 * Two equivalent ways to present the token:
 * - `Authorization: Bearer <token>` header (Claude Code / Desktop / curl).
 * - `?token=<token>` query parameter (claude.ai's custom-connector UI has no
 *   custom-header field -- only OAuth -- so the URL carries the token there).
 *
 * - MCP_AUTH_TOKEN unset -> fail closed (401, all requests refused).
 * - No credential either way -> 401.
 * - Wrong token -> 401 (constant-time comparison).
 * - Correct token (either mechanism) -> { ok: true }.
 */
export function checkAuth(request: Request): AuthResult {
  const expected = process.env.MCP_AUTH_TOKEN

  if (!expected) {
    return {
      ok: false,
      status: 401,
      message:
        'Server misconfiguration: MCP_AUTH_TOKEN is not set in this deployment. ' +
        'This endpoint refuses all requests (fails closed) until an operator sets ' +
        'MCP_AUTH_TOKEN in the environment.',
    }
  }

  const provided = extractToken(request)
  if (!provided) {
    return {
      ok: false,
      status: 401,
      message:
        'Missing credential. Send "Authorization: Bearer <token>" or append ?token=<token> to the URL.',
    }
  }

  if (!tokensMatch(provided, expected)) {
    return { ok: false, status: 401, message: 'Invalid bearer token.' }
  }

  return { ok: true, status: 200 }
}

// Pull the token from the Authorization header (preferred) or the ?token=
// query parameter (claude.ai custom-connector compatibility). Returns null
// when neither carries a non-empty value.
function extractToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  // RFC 6750: the auth scheme token is case-insensitive ("Bearer"/"bearer").
  if (header && header.slice(0, BEARER_PREFIX.length).toLowerCase() === BEARER_PREFIX.toLowerCase()) {
    const value = header.slice(BEARER_PREFIX.length).trim()
    if (value) return value
  }

  try {
    const url = new URL(request.url)
    const param = url.searchParams.get('token')?.trim()
    if (param) return param
  } catch {
    // Unparseable URL -> no query credential.
  }

  return null
}

/** Build the 401 (or other failure-status) Response for a failed AuthResult. */
export function unauthorizedResponse(result: AuthResult): Response {
  return new Response(JSON.stringify({ error: result.message ?? 'Unauthorized' }), {
    status: result.status,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': 'Bearer',
    },
  })
}
