import { CheckCircle, Circle } from '@phosphor-icons/react/dist/ssr'
import { requireUser } from '@/lib/auth/session'
import { getActiveEntitlements, type Entitlement } from '@/lib/queries/entitlements'
import { SEASON_PASS_PRODUCT, MCP_ADDON_PRODUCT } from '@/lib/queries/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SignOutButton } from '@/components/auth/SignOutButton'

export const metadata = {
  title: 'Account | CFB Team 360',
  description: 'Manage your CFB Team 360 account and plan.',
}

const PLAN_ROWS: { product: string; label: string; description: string }[] = [
  { product: SEASON_PASS_PRODUCT, label: 'Season Pass', description: 'Full-season predictions and edges.' },
  { product: MCP_ADDON_PRODUCT, label: 'MCP Add-on', description: 'Agent/API access via the MCP server.' },
]

function PlanRow({ label, description, active }: { label: string; description: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-[var(--border)] last:border-b-0">
      <div className="flex items-start gap-3">
        {active ? (
          <CheckCircle size={20} weight="fill" className="text-[var(--color-positive)] mt-0.5" aria-hidden="true" />
        ) : (
          <Circle size={20} weight="thin" className="text-[var(--text-muted)] mt-0.5" aria-hidden="true" />
        )}
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
          <p className="text-xs text-[var(--text-muted)]">{description}</p>
        </div>
      </div>
      <Badge variant={active ? 'default' : 'outline'}>{active ? 'Active' : 'Not active'}</Badge>
    </div>
  )
}

export default async function AccountPage() {
  const user = await requireUser('/account')
  const entitlements = await getActiveEntitlements(user.id)
  const owned = new Set<string>(entitlements.map((e: Entitlement) => e.product))
  const hasAnyPlan = PLAN_ROWS.some((row) => owned.has(row.product))

  return (
    <div className="p-8">
      <div className="max-w-lg mx-auto">
        <h1 className="font-headline text-3xl text-[var(--text-primary)] underline-sketch inline-block">
          Account
        </h1>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="font-headline text-lg">{user.email ?? 'Signed in'}</CardTitle>
          </CardHeader>
          <CardContent>
            {hasAnyPlan ? (
              <div>
                {PLAN_ROWS.map((row) => (
                  <PlanRow
                    key={row.product}
                    label={row.label}
                    description={row.description}
                    active={owned.has(row.product)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Free plan</p>
                  <p className="text-xs text-[var(--text-muted)]">No active season pass or add-on.</p>
                </div>
                <Badge variant="outline">Free</Badge>
              </div>
            )}

            {/*
              Phase 2 seam: the Stripe Customer Portal link (manage
              payment method, cancel, view invoices) renders here once the
              webhook + `stripe_customer_id` plumbing lands. Nothing to wire
              up yet -- Phase 1 ships no Stripe integration.
            */}
          </CardContent>
        </Card>

        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
