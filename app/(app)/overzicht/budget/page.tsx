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
import { BudgetHeaderSlot, BudgetHeaderSlotProvider } from '@/components/app/budgets-client'
import { BudgetVerdict } from './budget-verdict'
import { Kicker } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Budget — TriFinity',
  description: 'Plan en volg je maandbudgetten — transacties, vaste lasten en vooruitblik.',
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
/*
 * VOLGORDE: AANHEF → KICKER → KAARTEN → BUDGETTEN.
 *
 * De aanhef stond ónder de kaarten. ADR 0135 haalde terecht één van de twee
 * pagina-aanhefs weg — er stonden er twee, met de kaarten ertussen geklemd —
 * maar de aanhef die won (`BudgetEditorialHeader`, "Hoeveel ruimte heb je
 * nog?") woont in `BudgetsClient`, en die stroomt als laatste binnen. Gevolg:
 * een pagina die met drie kaartjes opende en zijn titel halverwege droeg.
 *
 * De aanhef is niet naar deze server-page te tillen: zijn cijfers hangen aan
 * de maand-selectie en het perspectief in `BudgetsClient`, en hier opnieuw
 * uitrekenen zou een tweede grondslag maken. In plaats daarvan staat hier de
 * aanhef-PLEK (`<BudgetHeaderSlot>`) en publiceert `BudgetsClient` zijn
 * cijfers ernaartoe (`BudgetHeaderSlotProvider` omspant beide). Tot de
 * budgetten binnen zijn draagt het slot de wachtvorm: kicker + kop staan zo
 * nog steeds in de eerste byte, precies waar de LCP-redenering hierboven ze
 * wil hebben, en het cijferblok schuift de kaarten niet omlaag als het invult.
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

      <BudgetHeaderSlotProvider>
        {/* De pagina-aanhef — één opening, bovenaan. De header-controls zweven
            er absoluut overheen (conventie CLAUDE.md: statuspunt links van de
            'i', zelfde h-7 w-7-familie); `BudgetHeaderSlot` geeft de kicker-rij
            en de kop daarvoor een rechter-gutter, zodat alleen die twee regels
            inspringen en het cijferblok de volle breedte houdt. */}
        <section className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
          <PageInfoButton
            content={getPageInfo('/overzicht/budget')}
            className="absolute right-4 top-4 sm:right-6"
          />
          {/* Het oordeel stroomt de titel in (zie `budget-verdict.tsx`); de
              kop zelf blijft dataloos, zodat er geen await boven de return
              komt. */}
          <BudgetHeaderSlot
            verdictSlot={
              <Suspense fallback={null}>
                <BudgetVerdict perspective={perspective} />
              </Suspense>
            }
          />
        </section>

        {/* De drie onderdelen als kaarten met hun kerngetal en status —
            overgenomen van de opgeheven cashflow-hub, waar er vier stonden.
            Budget zelf valt weg: dit ÍS die pagina.

            De kicker hoort bij de KAARTEN, niet bij de aanhef: hij benoemt waar
            deze drie over gaan en staat er al vóór ze binnen zijn. Daarom
            blijft hij hier staan, tussen de aanhef en de kaarten, en niet
            bovenaan — de aanhef draagt zijn eigen kicker ("Budgetteren · <maand>"). */}
        <section className="mx-auto max-w-6xl px-4 pt-2 sm:px-6 sm:pt-3">
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
      </BudgetHeaderSlotProvider>
    </>
  )
}
