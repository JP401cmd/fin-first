import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { loadBudgetsData } from '@/lib/budgets-data-loader'
import { getServerPerspective } from '@/lib/household/server-perspective'
import BudgetsClient from '@/components/app/budgets-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import {
  CashflowCardsLoader,
  CashflowCardsFallback,
} from '@/components/overview/cashflow-cards-loader'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { PageOpening } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Budget — TriFinity',
  description: 'Plan en volg je maandbudgetten — transacties, vaste lasten en forecast.',
}

/**
 * /overzicht/budget — de derde hefboom.
 *
 * WAS /overzicht/budget, één laag dieper, achter de cashflow-hub.
 * Budgetteren is voor het grip-segment de dagelijkse handeling en zat daarmee
 * even diep als de fiscale optimizer, die bijna niemand opent (UR3-28, "de
 * scheve diepte"). De hub is opgeheven; deze pagina neemt zijn plek in de
 * hefbomenrij over, met zijn drie onderdelen als kaarten bovenaan.
 *
 * GEEN SETUP-GATE MEER. Hier stond een `AppSetupGate` op appKey `budgetteren`
 * die de hele pagina verving tot de inrichting voltooid was — een poort zonder
 * overslaan-knop. Een hefboom die soms een formulier is in plaats van een
 * hefboom, is geen hefboom: budgetteren is basisfunctionaliteit, net als
 * bezittingen en schulden. Wie nog niets heeft ingericht krijgt de lege staat
 * van `BudgetsClient` ("voeg je eerste budget toe"); de inrichtflow zelf blijft
 * bestaan en bereikbaar, hij is alleen geen voorwaarde meer.
 */
export default async function OverzichtBudgetPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()

  const data = await loadBudgetsData(supabase)

  // showKoppelNudge: toon ná het doorlopen van de setup éénmalig de koppel-nudge
  // (BudgetKoppelNudge). Zelf-beperkend: alleen als de eenmalige marker ontbreekt
  // ÉN de gebruiker nog géén bank_accounts en géén transacties heeft. De 0-data-
  // guard voorkomt dat bestaande (backfill-)gebruikers de nudge zien. User-scoped
  // tellen (.eq('user_id', …)), niet via gedeelde huishoud-RLS, zodat partner-data
  // niet meetelt. Slug-string spiegelt BUDGET_KOPPEL_NUDGE_SHOWN_SLUG uit
  // components/app/budget-koppel-nudge.tsx.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let showKoppelNudge = false
  if (user) {
    const [markerRes, accountsRes, txRes] = await Promise.all([
      supabase
        .from('user_feature_visits')
        .select('feature_slug')
        .eq('user_id', user.id)
        .eq('feature_slug', 'budget_koppel_nudge_shown')
        .maybeSingle(),
      supabase
        .from('bank_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
    ])
    const markerAbsent = !markerRes.data
    const noAccounts = (accountsRes.count ?? 0) === 0
    const noTransactions = (txRes.count ?? 0) === 0
    showKoppelNudge = markerAbsent && noAccounts && noTransactions
  }

  return (
    <>
      <NavStackMeta title="Budget" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          content={getPageInfo('/overzicht/budget')}
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
      </section>

      {/* De drie onderdelen als kaarten met hun kerngetal en status —
          overgenomen van de opgeheven cashflow-hub, waar er vier stonden.
          Budget zelf valt weg: dit ÍS die pagina. */}
      <Suspense fallback={<CashflowCardsFallback />}>
        <CashflowCardsLoader perspective={perspective} />
      </Suspense>

      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <BudgetsClient initialData={data} showKoppelNudge={showKoppelNudge} />
      </div>
    </>
  )
}
