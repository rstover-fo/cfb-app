import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, type SessionUser } from '@/lib/auth/session'
import { SEASON_PASS_PRODUCT, MCP_ADDON_PRODUCT } from './constants'

// ---------------------------------------------------------------------------
// app.entitlements -- who has paid for what. cfb-app-owned (see
// supabase/README.md); this is the one module that reads the `app` schema.
//
// Every function here FAILS CLOSED: a query error reads as "no entitlement",
// never as access. That is the opposite of the rest of the query layer's
// degradation story, where an error means an empty widget -- here it means a
// locked page, and that asymmetry is deliberate.
// ---------------------------------------------------------------------------

export type EntitlementProduct = `season_pass_${number}` | `mcp_addon_${number}`
export type EntitlementSource = 'manual' | 'stripe' | 'comp'

export interface Entitlement {
  product: EntitlementProduct
  source: EntitlementSource
  granted_at: string
  /** ISO 8601. null = perpetual. */
  expires_at: string | null
  stripe_customer_id: string | null
}

const ENTITLEMENT_COLUMNS = 'product, source, granted_at, expires_at, stripe_customer_id'

/** `expires_at is null OR expires_at > now()`, expressed for PostgREST. The
 *  filter runs in SQL so an expired row never crosses the wire. */
function activeFilter(): string {
  return `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`
}

/**
 * The active entitlement row for (user, product), or null when absent/expired.
 */
export const getEntitlement = cache(async (
  userId: string,
  product: EntitlementProduct
): Promise<Entitlement | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('app')
    .from('entitlements')
    .select(ENTITLEMENT_COLUMNS)
    .eq('user_id', userId)
    .eq('product', product)
    .or(activeFilter())
    // maybeSingle, not single: "no entitlement" is the normal case, and
    // single() reports zero rows as a PostgREST error.
    .maybeSingle()

  if (error) {
    console.error('[entitlements] getEntitlement error:', error)
    return null
  }

  return (data as Entitlement | null) ?? null
})

/**
 * Every currently-active entitlement for a user -- one query instead of N when
 * a page needs to know about several products at once.
 */
export const getActiveEntitlements = cache(async (userId: string): Promise<Entitlement[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('app')
    .from('entitlements')
    .select(ENTITLEMENT_COLUMNS)
    .eq('user_id', userId)
    .or(activeFilter())

  if (error) {
    console.error('[entitlements] getActiveEntitlements error:', error)
    return []
  }

  return (data as Entitlement[] | null) ?? []
})

/**
 * Null-tolerant convenience: takes the nullable id straight from
 * getCurrentUser() so callers don't branch twice.
 */
export async function hasEntitlement(
  userId: string | null | undefined,
  product: EntitlementProduct
): Promise<boolean> {
  if (!userId) return false
  return (await getEntitlement(userId, product)) !== null
}

export interface ViewerAccess {
  user: SessionUser | null
  seasonPass: boolean
  mcpAddon: boolean
}

/**
 * Identity + product flags in one cache()d call. This -- not getEntitlement --
 * is what gated surfaces should call: /predictions, the chat route, and the
 * account page all want the same composed shape, and because both this and
 * getCurrentUser() are memoized, the layout and the page share one round trip.
 */
export const getViewerAccess = cache(async (): Promise<ViewerAccess> => {
  const user = await getCurrentUser()

  if (!user) {
    return { user: null, seasonPass: false, mcpAddon: false }
  }

  const entitlements = await getActiveEntitlements(user.id)
  const owned = new Set(entitlements.map(e => e.product))

  return {
    user,
    seasonPass: owned.has(SEASON_PASS_PRODUCT),
    mcpAddon: owned.has(MCP_ADDON_PRODUCT),
  }
})
