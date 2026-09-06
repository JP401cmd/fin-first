import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import {
  CashflowCardsLoader,
  CashflowCardsFallback,
} from '@/components/overview/cashflow-cards-loader'
import { CashOverviewLoader } from './cash-overview-loader'
import { CashOverviewSkeleton } from './cashflow-below-fold'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { PageOpening } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Cashflow — TriFinity',
  description: 'Budget, transacties, vaste lasten en forecast — de hefboom cashflow.',
}

/**
 * /overzicht/cashflow — cashflow-landingspagina, gestreamd in blokken
 * (perf Task 2.2, zelfde vorm als /overzicht).
 *
 * Vier hefboom-stijl kaarten (Budget, Transacties, Vaste lasten, Forecast), elk
 * met een status-dot, een KPI en een uitklapbare chevron — identiek aan de
 * vier-hefbomen-rij op /overzicht. Elke kaart deeplinkt naar zijn eigen
 * sub-pagina onder /overzicht/cashflow/*, waar de volledige inhoud leeft.
 *
 * DEZE HUB WORDT OPGEHEVEN (UR3-28, de scheve diepte). De versheidsmelding, de
 * inflatiekaart en het instellingenblok staan inmiddels op de transactiepagina;
 * de rekeningen bij de bezittingen. Wat hier nog staat — de kaarten en het
 * geldstroomblok — verhuist in de volgende stappen naar respectievelijk de
 * budget- en de transactiepagina, waarna deze route een redirect wordt.
 *
 * ── BLOK 1 (direct, in de eerste byte) ──────────────────────────────────────
 * `NavStackMeta`, de drie header-controls, de `PageOpening` (kicker + titel +
 * deck) en het frame van het kaartenraster. De LCP-kandidaat is de TITEL, en die
 * hangt van niets af — hij staat dus in het eerste antwoord i.p.v. achter de
 * traagste loader.
 *
 * **`getServerPerspective()` — een cookie-read — is het ENIGE await boven de
 * return, en dat moet zo blijven.** Streaming werkt alleen als er geen zware
 * await boven staat: één `await createClient()`/`loadX()` erbij en de hele
 * pagina wacht weer, terwijl de `<Suspense>`-grenzen er nog "correct" uitzien.
 * De loaders hieronder halen hun supabase-client daarom zélf op (`createClient()`
 * is React-`cache()`-gewrapt → dezelfde instantie, geen dubbele cookie-read).
 *
 * ── GESTREAMDE BLOKKEN ──────────────────────────────────────────────────────
 *  · `CashflowCardsLoader` — `loadCashflowKpis` + `loadCashflowData` +
 *    `loadVasteLastenSummary` → de vier kaarten. De volle `loadDashboardData` is
 *    hier VERDWENEN: `buildCashflowCards` leest zeven scalars en die levert de
 *    slanke KPI-laag (ADR 0083).
 *  · `CashOverviewLoader` — `loadCashBankLinks` → het geldstroomblok. Voedt een
 *    `ssr:false`-eiland onder de vouw; mag dus laat.
 *
 * Dynamiek blijft: geen `revalidate`, geen ISR, geen cache-headers. De winst is
 * minder werk per request, niet stale HTML.
 */
export default async function OverzichtCashflowPage() {
  const perspective = await getServerPerspective()

  return (
    <>
      <NavStackMeta title="Cashflow" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          content={getPageInfo('/overzicht/cashflow')}
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

      <Suspense fallback={<CashflowCardsFallback />}>
        <CashflowCardsLoader perspective={perspective} />
      </Suspense>

      <Suspense fallback={<CashOverviewSkeleton />}>
        <CashOverviewLoader />
      </Suspense>

    </>
  )
}
