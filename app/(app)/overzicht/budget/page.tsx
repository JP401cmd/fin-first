import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { BudgetsLoader, BudgetsFallback } from './budgets-loader'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import {
  CashflowCardsLoader,
  CashflowCardsFallback,
} from '@/components/overview/cashflow-cards-loader'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { Kicker } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Budget — TriFinity',
  description: 'Plan en volg je maandbudgetten — transacties, vaste lasten en forecast.',
}

/**
 * /overzicht/budget — de derde hefboom.
 *
 * WAS /overzicht/cashflow/budget, één laag dieper, achter de cashflow-hub.
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
 *
 * GESTREAMD IN BLOKKEN, net als /overzicht en de oude hub. Blok 1 (titel,
 * opening, header-controls) staat in de eerste byte; de drie kaarten en de
 * budgetten stromen er elk achteraan in hun eigen `<Suspense>`. De LCP-kandidaat
 * is de TITEL, en die hangt van niets af.
 */
export default async function OverzichtBudgetPage() {
  // HET ENIGE AWAIT BOVEN DE RETURN, en dat moet zo blijven. Streaming werkt
  // alleen als er geen zware await boven staat: één `createClient()`/`loadX()`
  // erbij en de hele pagina wacht weer, terwijl de `<Suspense>`-grenzen er nog
  // "correct" uitzien. De loaders hieronder halen hun supabase-client daarom
  // zélf op (`createClient()` is React-`cache()`-gewrapt → dezelfde instantie,
  // geen dubbele cookie-read). Vergrendeld in page.streaming.test.ts.
  const perspective = await getServerPerspective()

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

      {/* De drie onderdelen als kaarten met hun kerngetal en status —
          overgenomen van de opgeheven cashflow-hub, waar er vier stonden.
          Budget zelf valt weg: dit ÍS die pagina.

          GEEN EIGEN PAGINA-AANHEF hier. De hub-hero ("Hoeveel vrijheid zet je
          elke maand opzij?") is bij de verhuizing meegekomen en stond toen
          bóven de aanhef die `BudgetsClient` zelf al draagt ("Hoeveel ruimte
          heb je nog?") — twee volwaardige `PageOpening`s, dus twee h2's met
          een grote vraag op één scherm, met deze kaarten ertussen geklemd.
          ADR 0135 schreef die afweging al voor ("één wint, de andere vervalt");
          de budget-aanhef wint, want die draagt cijfers en een maandaanduiding.
          Alleen zichtbaar bij live doorklikken: los gelezen klopt elk bestand.

          De kicker blijft wél, buiten het gestreamde blok: hij benoemt waar
          deze drie kaarten over gaan en staat er al vóór ze binnen zijn. */}
      <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <Kicker size="small" className="mb-2">
          Je geldstroom
          <PerspectiveContextLabel className="normal-case tracking-normal" />
        </Kicker>
      </section>
      <Suspense fallback={<CashflowCardsFallback />}>
        <CashflowCardsLoader perspective={perspective} />
      </Suspense>

      <Suspense fallback={<BudgetsFallback />}>
        <BudgetsLoader />
      </Suspense>
    </>
  )
}
