import { eveChannel } from 'eve/channels/eve'
import { localDev, verifyJwtHmac, extractBearerToken, type AuthFn } from 'eve/channels/auth'
import { createServerClient } from '@supabase/ssr'

/**
 * Route auth for the agent's HTTP channel, walked in order; fails closed.
 *
 *  1. botJwt        -- the Railway Discord bot (server-to-server HMAC JWT)
 *  2. supabaseCookie -- the in-app /chat surface (same-origin, cookie auth)
 *  3. localDev      -- `eve dev` only; authenticates nothing in production
 *
 * Both real authenticators resolve principalId to the person's DISCORD
 * SNOWFLAKE -- the one identity key shared across surfaces, and the key the
 * memory graph and bot-schema profile reads are scoped by.
 */

const BOT_JWT_ISSUER = 'cfb-bot'
const BOT_JWT_AUDIENCE = 'cfb-agent'

/**
 * Verifies the bot's HMAC JWT (secret EVE_JWT_SECRET), then projects the
 * VERIFIED token's own claims into session auth: `sub` is the Discord user
 * snowflake, plus surface/guildId/channelId context claims. Claims ride
 * inside the signature -- nothing here trusts an unauthenticated header.
 * The payload decode below happens only after verifyJwtHmac accepted the
 * signature, issuer, audience, and expiry.
 */
const botJwt: AuthFn<Request> = async request => {
  const secret = process.env.EVE_JWT_SECRET
  if (!secret || secret.trim() === '') return null
  const token = extractBearerToken(request.headers.get('authorization'))
  if (!token) return null

  const result = await verifyJwtHmac(token, {
    algorithm: 'HS256',
    audiences: [BOT_JWT_AUDIENCE],
    issuer: BOT_JWT_ISSUER,
    secret,
  })
  if (!result.ok) return null

  let claims: Record<string, unknown>
  try {
    const payload = token.split('.')[1]!
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
  const sub = typeof claims.sub === 'string' ? claims.sub : undefined
  if (!sub) return null

  const attributes: Record<string, string> = { surface: 'discord' }
  for (const key of ['guildId', 'channelId'] as const) {
    const value = claims[key]
    if (typeof value === 'string' && value !== '') attributes[key] = value
  }
  return {
    authenticator: 'cfb-bot',
    issuer: BOT_JWT_ISSUER,
    principalId: sub,
    principalType: 'user',
    subject: sub,
    attributes,
  }
}

function parseCookieHeader(header: string | null): { name: string; value: string }[] {
  if (!header) return []
  return header
    .split('; ')
    .map(part => {
      const eq = part.indexOf('=')
      if (eq <= 0) return undefined
      return { name: part.slice(0, eq), value: decodeURIComponent(part.slice(eq + 1)) }
    })
    .filter((c): c is { name: string; value: string } => c !== undefined)
}

/**
 * Authenticates a same-origin browser request by validating the Supabase
 * auth cookies. setAll is a no-op: token REFRESH happens in the Next
 * middleware on /chat page loads, not here -- this only validates. A user
 * without a Discord identity is rejected (sign-in is Discord OAuth only,
 * and the snowflake is the cross-surface identity key).
 */
const supabaseCookie: AuthFn<Request> = async request => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  const cookies = parseCookieHeader(request.headers.get('cookie'))
  if (cookies.length === 0) return null

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: { getAll: () => cookies, setAll: () => {} },
    })
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const identity = user.identities?.find(entry => entry.provider === 'discord')
    const snowflake =
      identity?.id ??
      (typeof identity?.identity_data?.provider_id === 'string' ? identity.identity_data.provider_id : undefined)
    if (!snowflake) return null

    return {
      authenticator: 'supabase',
      principalId: snowflake,
      principalType: 'user',
      subject: user.id,
      attributes: { surface: 'web', supabaseUserId: user.id },
    }
  } catch (err) {
    console.error('[channel/eve] supabase cookie auth failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export default eveChannel({
  auth: [botJwt, supabaseCookie, localDev()],
})
