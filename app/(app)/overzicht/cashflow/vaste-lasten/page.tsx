import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { buildVasteLastenInsights } from '@/lib/vaste-lasten-insights'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { VasteLastenClient } from '@/components/overview/vaste-lasten-client'
import { CashflowKalender } from '@/components/overview/cashflow-kalender'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Vaste lasten — TriFinity',
  description: 'Abonnementen en terugkerende kosten — onderdeel van cashflow.',
}

/**
 * /overzicht/cashflow/vaste-lasten — losse Vaste-lasten-pagina (was de
 * "Vaste lasten"-tab). Abonnementen-/vaste-kosten-analyse + kalender van
 * terugkerende transacties.
 */
export default async function OverzichtCashflowVasteLastenPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()
  const [dashboardResult, cashflow, summary] = await Promise.all([
    loadDashboardData(supabase),
    loadCashflowData(supabase, perspective),
    loadVasteLastenSummary(supabase),
  ])
  const { dashboardData } = dashboardResult
  const insights = buildVasteLastenInsights({
    summary,
    monthlyIncome: dashboardData.monthlyIncome,
    monthlyExpenses: dashboardData.monthlyExpenses,
  })

  return (
    <>
      <NavStackMeta title="Vaste lasten" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          description={PAGE_INFO['/overzicht/cashflow/vaste-lasten'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-4 sm:px-6">
        <VasteLastenClient
          insights={insights}
          subscriptions={summary.subscriptions}
          vasteKosten={summary.vasteKosten}
          fullName={cashflow.fullName}
        />
        {/* Kalender = secundaire diepte ("wanneer komt het"): in Eenvoudig
            verborgen, in Volledig zichtbaar. De primaire analyse + het
            hoofdcijfer (VasteLastenClient) blijven altijd staan. */}
        <HideInSimple>
          <CashflowKalender recurrings={cashflow.recurrings} />
        </HideInSimple>
      </div>
    </>
  )
}
