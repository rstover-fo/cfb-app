import { eveChannel } from 'eve/channels/eve'
import { localDev } from 'eve/channels/auth'

// Phase 0: local development only. localDev() authenticates nothing outside
// `eve dev`/local, so this channel fails closed if it ever reaches production
// before Phase 1 lands the real auth stack:
//   - a Supabase-cookie AuthFn for the in-app /chat surface (principalId =
//     the user's Discord snowflake from their Discord OAuth identity)
//   - jwtHmac({ secret: EVE_JWT_SECRET }) for the Railway Discord bot
export default eveChannel({
  auth: [localDev()],
})
