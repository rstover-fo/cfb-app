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
 * Checks the request's Authorization header against process.env.MCP_AUTH_TOKEN.
 *
 * - MCP_AUTH_TOKEN unset -> fail closed (401, all requests refused).
 * - Missing/malformed header -> 401.
 * - Wrong token -> 401 (constant-time comparison).
 * - Correct token -> { ok: true }.
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

  const header = request.headers.get('authorization')
  // RFC 6750: the auth scheme token is case-insensitive ("Bearer"/"bearer").
  if (!header || !header.slice(0, BEARER_PREFIX.length).toLowerCase().startsWith(BEARER_PREFIX.toLowerCase())) {
    return {
      ok: false,
      status: 401,
      message: 'Missing or malformed Authorization header. Expected "Authorization: Bearer <token>".',
    }
  }

  const provided = header.slice(BEARER_PREFIX.length).trim()
  if (!provided || !tokensMatch(provided, expected)) {
    return { ok: false, status: 401, message: 'Invalid bearer token.' }
  }

  return { ok: true, status: 200 }
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
