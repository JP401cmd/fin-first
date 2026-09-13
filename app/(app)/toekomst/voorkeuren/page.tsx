import type { Metadata } from 'next'
import Link from 'next/link'
import { ListChecks } from 'lucide-react'
import { PLAN_REVIEW_HREF, PLAN_REVIEW_NAAM } from '@/lib/plan-review/types'
import { readPlanReviewState } from '@/lib/plan-review/read-state'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonRaw } from '@/lib/horizon-data-loader'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { ToekomstSubpageShell } from '@/components/future/toekomst-subpage-shell'
import { VoorkeurenView } from '@/components/future/voorkeuren-view'
import { resolveWithdrawalProfiel } from '@/lib/withdrawal-strategy'
import { WEALTH_GROUPS, type WealthGroup } from '@/lib/wealth-composition'

export const metadata: Metadata = {
  title: 'Voorkeuren — TriFinity',
  description:
    'Toekomst-voorkeuren: eindstrategie, onttrekking, pot-regels en markt-aannames die over de hele tijdas gelden.',
}

/**
 * /toekomst/voorkeuren — eigen subroute voor de Voorkeuren-view.
 *
 * Repliceert de prop-opbouw die voorheen in app/(app)/toekomst/page.tsx
 * (de ToekomstTabs-variant) gebeurde, nu als zelfstandige server-page met een
 * "Terug naar tijdas"-header.
 */
export default async function ToekomstVoorkeurenPage() {
  const supabase = await createClient()
  const user = await getCachedUser(supabase)
  const [horizonData, dashboardResult, planReviewState] = await Promise.all([
    loadHorizonRaw(supabase),
    loadDashboardData(supabase),
    // TPR-01 — alleen om te weten of de review iets kan bewaren (kolom uitgerold).
    user ? readPlanReviewState(supabase, user.id) : Promise.resolve(null),
  ])

  // simRows + fireAge voor AfbouwOverzichtCard in VoorkeurenView (plan F-2).
  const simRows = dashboardResult.dashboardData.simRows ?? null
  const fireAge =
    dashboardResult.dashboardData.fireAgeFractional != null
      ? Math.round(dashboardResult.dashboardData.fireAgeFractional)
      : null

  // Huidig saldo per WealthGroup voor de illustratieve pot-flow-weergave (regel 3/4/5).
  const potBalances: Record<WealthGroup, number> = {
    spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0,
  }
  for (const a of horizonData.assets ?? []) {
    if (a.is_active === false) continue
    const g = WEALTH_GROUPS[a.asset_type]
    if (g) potBalances[g] += Number(a.current_value) || 0
  }
  potBalances.spaargeld += Math.max(0, horizonData.unlinkedCash ?? 0)

  // TPR-12 — heffingvrij inkomen (Box 3, werkelijk-tak) uit de rauwe profielrij; de
  // select('*') van de loader laat de nieuwe kolom vanzelf door. NULL = kernel-default.
  const rawHeffingvrij = horizonData.rawProfile?.box3_heffingvrij_inkomen
  const box3HeffingvrijInkomen =
    rawHeffingvrij == null || !Number.isFinite(Number(rawHeffingvrij)) ? null : Number(rawHeffingvrij)

  return (
    <>
      <ToekomstSubpageShell
        kicker="Toekomst · Voorkeuren"
        titleBefore="Onder welke "
        emphasis="aannames"
        titleAfter=" reken je?"
        deck="Eindstrategie, onttrekking, pot-regels en markt-aannames die over je hele tijdas gelden."
        infoKey="/toekomst/voorkeuren"
      >
        {/* TPR-01 — de plan-review heropenen (A6): start bij stap 1 zodat ook een
            voltooide review opnieuw te doorlopen is. De pane leeft op /toekomst,
            naast de tijdas. */}
        {planReviewState && (
          <Link
            href={`${PLAN_REVIEW_HREF}&stap=plan`}
            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-4 text-xs font-semibold text-[var(--ink-2)] hover:text-[var(--ink)]"
          >
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            {PLAN_REVIEW_NAAM}
          </Link>
        )}
      </ToekomstSubpageShell>
      <VoorkeurenView
        fireParams={horizonData.fireParams}
        fireStrategy={horizonData.fireStrategy}
        firePlan={horizonData.firePlan}
        withdrawalStrategy={horizonData.withdrawalStrategy}
        // Zelfde rauwe rij + zelfde voorrangsregel als de kernel-adapter (B-042).
        withdrawalProfiel={resolveWithdrawalProfiel({
          withdrawal_strategy: horizonData.withdrawalStrategy.strategy,
          withdrawal_profile_config: horizonData.rawProfile?.withdrawal_profile_config,
        })}
        fireAge={fireAge}
        simRows={simRows}
        simSnapshot={dashboardResult.regelSimSnapshot}
        regelVoorkeuren={dashboardResult.regelVoorkeuren}
        potBalances={potBalances}
        box3HeffingvrijInkomen={box3HeffingvrijInkomen}
      />
    </>
  )
}
