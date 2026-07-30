import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { buildCashflowCards } from '@/lib/cashflow-cards'
import { CashflowLandingCards } from '@/components/overview/cashflow-landing-cards'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { InflationImpactCard, INFLATION_IMPACT_ID } from '@/components/overview/inflation-impact-card'
import { loadCashflowSettingsData } from '@/lib/cashflow-settings-data'
import { loadCashBankLinks } from '@/lib/bank-link-loader'
import { CashOverviewLazy, CashflowInstellingenBlokLazy } from './cashflow-below-fold'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { InsightToggleButton } from '@/components/editorial/insight-toggle-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { Kicker, PageOpening } from '@/components/editorial'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Cashflow — TriFinity',
  description: 'Budget, transacties, vaste lasten en forecast — de hefboom cashflow.',
}

/**
 * /overzicht/cashflow — cashflow-landingspagina.
 *
 * Vier hefboom-stijl kaarten (Budget, Transacties, Vaste lasten, Forecast),
 * elk met een status-dot, een KPI en een uitklapbare chevron — identiek aan de
 * vier-hefbomen-rij op /overzicht. Elke kaart deeplinkt naar zijn eigen
 * sub-pagina onder /overzicht/cashflow/*, waar de volledige inhoud leeft.
 * Daaronder het inspiratieblok (Inflatie & koopkracht).
 *
 * De spaarquote / maandelijks netto / uitgaventrend-samenvatting is verhuisd
 * naar de Forecast-sub-pagina (CashflowSection).
 */
export default async function OverzichtCashflowPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()
  const [dashboardResult, cashflow, vasteLasten, settings, bankLinks] = await Promise.all([
    loadDashboardData(supabase),
    loadCashflowData(supabase, perspective),
    loadVasteLastenSummary(supabase),
    loadCashflowSettingsData(supabase),
    // Koppelstatus per rekening (fase 7): weergavedata hoort via de loader, niet
    // via een client-directe read ná hydratatie (ADR 0058). Voedt zowel het
    // herkomst-symbool op de rekeningkaarten als de rekeningdetail.
    loadCashBankLinks(supabase),
  ])
  const { dashboardData } = dashboardResult
  const cards = buildCashflowCards(dashboardData, cashflow, vasteLasten)

  return (
    <>
      <NavStackMeta title="Cashflow" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <InsightToggleButton
          ids={[INFLATION_IMPACT_ID]}
          className="absolute right-[84px] top-4 sm:right-[92px]"
        />
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          description={PAGE_INFO['/overzicht/cashflow'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>

      <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageOpening
          className="mb-4"
          kicker={
            <>
              Je geldstroom
              <PerspectiveContextLabel />
            </>
          }
          titleBefore="Hoeveel "
          emphasis="vrijheid"
          titleAfter=" zet je elke maand opzij?"
          deck="Het deel van je inkomen dat je opzij zet bepaalt hoe snel je vrijheid bereikt. Kies een onderdeel om dieper te kijken."
        />
        <CashflowLandingCards cards={cards} />
      </section>

      {cashflow.baselineExpenses >= 500 && (
        <HideInSimple>
          <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
            <Kicker size="small" className="mb-2">
              Koopkracht
            </Kicker>
            <InflationImpactCard monthlyExpenses={cashflow.baselineExpenses} />
          </section>
        </HideInSimple>
      )}

      <CashOverviewLazy embedded showAllCashAccounts showMonthLinks bankLinks={bankLinks} />

      {settings && (
        // Instellingen (inkomen, spaarquote, uitgaven) zijn óók in Eenvoudig
        // zichtbaar — bewust géén HideInSimple. Het blok bevat alleen die drie
        // kern-instellingen, die de gebruiker in beide modi wil kunnen zien.
        <section className="mx-auto max-w-6xl px-4 pb-8 pt-2 sm:px-6">
          <CashflowInstellingenBlokLazy data={settings} />
        </section>
      )}
    </>
  )
}
