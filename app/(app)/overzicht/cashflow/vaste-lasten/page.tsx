import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { loadCashflowKpis } from '@/lib/cashflow-kpis'
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
 *
 * GEEN DASHBOARD-BUNDEL (perf Task 2.4, stap 1). Deze pagina las uit
 * `loadDashboardData` precies TWEE scalars — `monthlyIncome` en
 * `monthlyExpenses` — en betaalde daarvoor ~40 queries in 5-6 seriële golven
 * plus een koude horizon-tak met bisectie-solve. Beide velden zitten op
 * `CashflowCardScalars` uit de slanke KPI-laag (lib/cashflow-kpis.ts, ADR 0077):
 * vier `cache()`-gedeelde fetches, dezelfde verplaatste afleidingen, geen tweede
 * rekenweg.
 *
 * De EFFECTIVE grondslag blijft de grondslag (ADR 0073): `monthlyIncome`/
 * `monthlyExpenses` laten `income_source = 'manual'` de profielinschatting
 * winnen. Dat is bewust — een structureel aandeel ("hoeveel van mijn inkomen
 * ligt vast?") meet je tegen een stabiel maandinkomen, niet tegen een
 * half-afgelopen maand. Vervangen door `currentMonth*` zou precies de bug van
 * ADR 0073 terugzetten.
 */
export default async function OverzichtCashflowVasteLastenPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()
  const [kpis, cashflow, summary] = await Promise.all([
    loadCashflowKpis(supabase),
    loadCashflowData(supabase, perspective),
    loadVasteLastenSummary(supabase),
  ])
  const insights = buildVasteLastenInsights({
    summary,
    monthlyIncome: kpis.monthlyIncome,
    monthlyExpenses: kpis.monthlyExpenses,
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
