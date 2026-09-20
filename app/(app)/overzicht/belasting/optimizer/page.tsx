import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageVerdictOpening } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'
import { resolveRouteTitle } from '@/lib/nav-config'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { loadFiscaleKansen } from '@/lib/tax-opportunities-loader'
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'
import { Box3OptimizerClient } from '@/components/overview/belasting/optimizer-client'

export const metadata: Metadata = {
  title: 'Fiscale kansen — TriFinity',
  description:
    'Al je fiscale doelen doorgerekend — Box 3-scenario’s én je Box 1-jaarruimte — in euro’s en vrijheidsdagen.',
}

/**
 * /overzicht/belasting/optimizer — de fiscale-strategie-optimizer (roadmap J).
 *
 * MVP-as = Box 3 (samenstelling-shift + fiscale partnerverdeling). De pagina is
 * bewust DUN: de volledige samenstelling (grondslagkeuze, scenario-generatie,
 * ranking per doel, jaarruimte-kans) woont in `lib/tax-opportunities-loader.ts`
 * — dezelfde loader die de belasting-hub en de aandachtspunten voedt, zodat één
 * kans nooit op twee manieren wordt afgeleid (ADR 0086). We geven ALLEEN
 * geaggregeerde uitkomsten door — nooit de per-partner-splitsing (ADR 0036).
 *
 * De pagina VERGELIJKT eerst en zoomt daarna pas in: de client zet alle kansen
 * (Box 3-scenario's + de Box 1-jaarruimte) op één netto-effect-as en biedt de
 * uitwerking per kans op aanvraag.
 *
 * Katern IV (de levenslange variantensweep) haalt zijn invoer NIET hier op maar
 * via `GET /api/belasting/varianten-sweep`, achter een expliciete klik. Dat
 * scheelt élke bezoeker een extra kernel-solve in de TTFB én houdt de rauwe
 * kernel-context uit de RSC-payload van iedere paginaweergave; zie de route zelf
 * voor de volledige motivering.
 */
export default async function BelastingOptimizerPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()

  const kansen = await loadFiscaleKansen(supabase, perspective, CURRENT_TAX_YEAR)

  // KERNCIJFER IN DE PAGINATITEL (kop-herziening sep 2026). Deze pagina heeft
  // GEEN paginastoplicht — een fiscale kans is geen "op koers / aandacht /
  // actie" — dus de titel draagt een KPI met tone `neutral`: het netto effect
  // per jaar van de leidende kans.
  //
  // CONSUME, DON'T RECOMPUTE: `kansen.topChoice` is de door `pickTopChoice`
  // gekozen winnaar uit dezelfde loader die de vergelijking hieronder vult; we
  // ranken hier niets zelf. `netEffect` (besparing − verwacht rendementsverlies)
  // is het cijfer dat de client als leidend toont — niet de bruto `savings`.
  // Niets of niet-positief → geen oordeel, dan is de titel de kale paginanaam.
  const topNetEffect = kansen.topChoice?.netEffect ?? 0
  const kpi = topNetEffect > 0 ? `${formatCurrency(Math.round(topNetEffect))} per jaar` : null
  // Geen kaal groot bedrag: de vrijheidstijd-vertaling staat in de deck,
  // gerekend met het canonieke dagtarief uit dezelfde loader-bundel.
  const kpiFreedom =
    kpi && kansen.dailyExpenses > 0
      ? formatFreedomTimeString(calculateFreedomTime(topNetEffect, kansen.dailyExpenses))
      : null

  return (
    <>
      <NavStackMeta title="Fiscale kansen" bottomBar={{ kind: 'tabs' }} />

      <div className="relative mx-auto max-w-6xl px-4 pt-6 pb-3 sm:px-6 sm:pt-8">
        <PageInfoButton
          content={getPageInfo('/overzicht/belasting/optimizer')}
          className="absolute right-4 top-6 sm:right-6 sm:top-8"
        />
        <PageVerdictOpening
          gutterClassName="pr-20 sm:pr-24"
          pageName={resolveRouteTitle('/overzicht/belasting/optimizer') ?? 'Fiscale kansen'}
          verdict={kpi}
          tone="neutral"
          deck={
            kpiFreedom
              ? `Elke fiscale keuze doorgerekend. De grootste kans levert je zo’n ${kpiFreedom} vrijheidstijd per jaar op.`
              : 'Elke fiscale keuze doorgerekend, in euro’s en vrijheidsdagen. Daarna zoom je per keuze in op de uitwerking.'
          }
        />
      </div>

      <Box3OptimizerClient
        sections={kansen.sections}
        topChoice={kansen.topChoice}
        standing={kansen.standing}
        hasPartner={kansen.hasPartner}
        perspectiveAware={kansen.perspectiveAware}
        year={kansen.year}
        expectedReturn={kansen.expectedReturn}
        expectedReturnIsPersonal={kansen.expectedReturnIsPersonal}
        dailyExpenses={kansen.dailyExpenses}
      />
    </>
  )
}
