import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { ForecastLoader } from './forecast-loader'
import { ForecastFallback } from './forecast-fallback'
import { PageVerdictOpening } from '@/components/editorial'
import { resolveRouteTitle } from '@/lib/nav-config'
import { ForecastVerdict } from './forecast-verdict'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { getPageInfo } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Vooruitblik — TriFinity',
  description: 'Spaarquote, maandelijks netto, uitgaventrend en 6-maands-vooruitblik.',
}

/**
 * /overzicht/budget/forecast — losse Forecast-pagina (was de "Forecast"-tab).
 * Toont eerst de cashflow-samenvatting (spaarquote 6m, maandelijks netto,
 * uitgaventrend) en daaronder de 6-maands-projectietabel. Gestreamd in blokken
 * (perf Task 2.5, zelfde vorm als de hub en de vaste-lasten-pagina).
 *
 * ── BLOK 1 (direct, in de eerste byte) ──────────────────────────────────────
 * `NavStackMeta`, de twee header-controls en de `PageOpening` (kicker + titel +
 * deck). De LCP-kandidaat is de TITEL, en die hangt van niets af — hij staat dus
 * in het eerste antwoord i.p.v. achter de traagste loader.
 *
 * **`getServerPerspective()` — een cookie-read — is het ENIGE await boven de
 * return, en dat moet zo blijven.** Streaming werkt alleen als er geen zware
 * await boven staat: één `await createClient()`/`loadX()` erbij en de hele
 * pagina wacht weer, terwijl de `<Suspense>`-grens er nog "correct" uitziet.
 * De loader haalt zijn supabase-client daarom zélf op (`createClient()` is
 * React-`cache()`-gewrapt → dezelfde instantie, geen dubbele cookie-read).
 *
 * ── GESTREAMD BLOK ──────────────────────────────────────────────────────────
 *  · `ForecastLoader` — `loadForecastSectionData` + `loadCashflowData` → de
 *    samenvattingskaarten en de projectietabel. De volle `loadDashboardData` is
 *    hier VERDWENEN: `CashflowSection` leest vijf velden en die levert de slanke
 *    laag (ADR 0083), inclusief het kerngetal `savingsRate6m` uit dezelfde
 *    canonieke keten die /overzicht en het instellingenblok voedt.
 *
 * Dynamiek blijft: geen `revalidate`, geen ISR, geen cache-headers. De winst is
 * minder werk vóór de eerste byte, niet stale HTML.
 */
export default async function OverzichtCashflowForecastPage() {
  const perspective = await getServerPerspective()

  return (
    <>
      {/* Titel = "Vooruitblik" (UR3-13 F2, optie C). De map — en dus de URL —
          blijft /overzicht/budget/forecast; alleen het woord op het scherm is
          Nederlands. */}
      <NavStackMeta title="Vooruitblik" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          content={getPageInfo('/overzicht/budget/forecast')}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-4 sm:px-6">
        {/* Dataloze kop (LCP); het oordeel stroomt erachteraan via zijn eigen
            Suspense — zie `forecast-verdict.tsx`. */}
        <PageVerdictOpening
          pageName={resolveRouteTitle('/overzicht/budget/forecast') ?? 'Vooruitblik'}
          verdict={null}
          verdictSlot={
            <Suspense fallback={null}>
              <ForecastVerdict perspective={perspective} />
            </Suspense>
          }
          deck="De komende zes maanden op je huidige tempo. Blijft er netto geld over, dan ben je op koers."
        />

        {/* Het gestreamde blok draagt zijn eigen `space-y-6`, zodat de afstand
            tussen samenvatting en projectietabel gelijk blijft aan de afstand
            tussen aanhef en samenvatting. */}
        <Suspense fallback={<ForecastFallback />}>
          <ForecastLoader perspective={perspective} />
        </Suspense>
      </div>
    </>
  )
}
