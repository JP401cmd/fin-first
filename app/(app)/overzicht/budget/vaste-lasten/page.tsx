import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { VasteLastenLoader, VasteLastenFallback } from './vaste-lasten-loader'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { PageOpening } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Vaste lasten — TriFinity',
  description: 'Abonnementen en terugkerende kosten — onderdeel van cashflow.',
}

/**
 * /overzicht/budget/vaste-lasten — losse Vaste-lasten-pagina (was de
 * "Vaste lasten"-tab). Abonnementen-/vaste-kosten-analyse + kalender van
 * terugkerende transacties. Gestreamd in blokken (perf Task 2.4, zelfde vorm als
 * de hub).
 *
 * ── BLOK 1 (direct, in de eerste byte) ──────────────────────────────────────
 * `NavStackMeta`, de twee header-controls en de `PageOpening` (kicker + titel).
 * De LCP-kandidaat is de TITEL, en die hangt van niets af — hij staat dus in het
 * eerste antwoord i.p.v. achter de traagste loader. De kicker/titel woonden
 * eerder ín `VasteLastenClient`; ze zijn hierheen gehaald omdat ze geen data
 * nodig hebben. Het cijferblok eronder (dat wél data nodig heeft) blijft in de
 * client-component staan, mét zijn `border-t`-hairline en dezelfde
 * `space-y-3`-afstand tot de kop.
 *
 * **`getServerPerspective()` — een cookie-read — is het ENIGE await boven de
 * return, en dat moet zo blijven.** Streaming werkt alleen als er geen zware
 * await boven staat: één `await createClient()`/`loadX()` erbij en de hele
 * pagina wacht weer, terwijl de `<Suspense>`-grens er nog "correct" uitziet.
 * De loader haalt zijn supabase-client daarom zélf op (`createClient()` is
 * React-`cache()`-gewrapt → dezelfde instantie, geen dubbele cookie-read).
 *
 * ── GESTREAMD BLOK ──────────────────────────────────────────────────────────
 *  · `VasteLastenLoader` — `loadCashflowKpis` + `loadCashflowData` +
 *    `loadVasteLastenSummary` → het cijferblok, de analyse en de kalender. De
 *    volle `loadDashboardData` is hier VERDWENEN: `buildVasteLastenInsights`
 *    leest twee scalars en die levert de slanke KPI-laag (ADR 0083).
 *
 * Dynamiek blijft: geen `revalidate`, geen ISR, geen cache-headers. De winst is
 * minder werk vóór de eerste byte, niet stale HTML.
 */
export default async function OverzichtCashflowVasteLastenPage() {
  const perspective = await getServerPerspective()

  return (
    <>
      <NavStackMeta title="Vaste lasten" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          content={getPageInfo('/overzicht/budget/vaste-lasten')}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      {/* `space-y-3` = de afstand die de kop en het cijferblok binnen de oude
          `<PageOpening>`-header al hadden; het gestreamde blok draagt zijn eigen
          `space-y-6` voor de rest van de pagina. */}
      <div className="mx-auto max-w-6xl space-y-3 px-4 pt-4 sm:px-6">
        <PageOpening
          kicker="Vaste lasten"
          titleBefore="Hoeveel "
          emphasis="vrijheid"
          titleAfter=" ligt er maandelijks vast?"
        />

        <Suspense fallback={<VasteLastenFallback />}>
          <VasteLastenLoader perspective={perspective} />
        </Suspense>
      </div>
    </>
  )
}
