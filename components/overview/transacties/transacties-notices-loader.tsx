import { createClient } from '@/lib/supabase/server'
import { loadCashflowKpis } from '@/lib/cashflow-kpis'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { StaleTransactionsBanner } from '@/components/app/stale-transactions-banner'
import { transactionFreshness } from '@/lib/transaction-staleness'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { readMinimizedMap } from '@/lib/page-status/minimized-prefs'
import {
  STALE_TX_NOTICE_MINIMIZE_KEY,
  asStaleMinimizedMonths,
  resolveStaleNoticeDisplay,
} from '@/lib/transaction-staleness-minimize'
import { InflationImpactCard } from '@/components/overview/inflation-impact-card'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { Kicker } from '@/components/editorial'
import type { Perspective } from '@/lib/household-data'

/**
 * De twee duidingen die van de opgeheven cashflow-hub (ADR 0135) naar de
 * transactiepagina verhuisden. Bewust TWEE server-children en niet één blok:
 * ze horen op verschillende plekken in de leesvolgorde.
 *
 *  - De versheidsmelding staat BOVEN de analyse. Hij gaat over transacties die
 *    stilstaan, en alles eronder rust daarop — precies de reden dat hij op de
 *    hub vóór de cijfers stond.
 *  - De inflatiekaart staat ERONDER. De pagina vraagt "waar gaat je tijd
 *    naartoe?"; dan hoort het antwoord te volgen, niet eerst een zijstap over
 *    koopkracht over dertig jaar. Op de hub stond hij ook onder de cijfers.
 *
 * Twee children kost geen tweede leesronde: `loadCashflowKpis` en
 * `loadCashflowData` zijn React-`cache()`-gewrapt, en na de splitsing heeft elk
 * blok alleen nog de bron nodig die het zelf gebruikt.
 */

/**
 * Versheidsmelding — "gegevens verouderd", boven de analyse.
 *
 * DE VOORKEUR REIST MEE. Het is dezelfde melding als op /overzicht, onder
 * dezelfde pref-sleutel: wie haar daar inklapte, hoort haar hier niet opnieuw op
 * volle grootte te zien. De knoppen zitten er bewust niet bij — terughalen doe
 * je op /overzicht, en van daaruit werkt het weer op beide pagina's.
 */
export async function TransactiesVersheidBanner() {
  const supabase = await createClient()
  const user = await getCachedUser(supabase)

  const [kpis, minimizedMap] = await Promise.all([
    loadCashflowKpis(supabase),
    user
      ? readMinimizedMap(supabase, user.id)
      : Promise.resolve({} as Record<string, unknown>),
  ])

  const txFreshness = transactionFreshness(kpis.latestTransactionMonth)
  const staleDisplay = resolveStaleNoticeDisplay(
    txFreshness.state === 'stale' ? txFreshness.monthsBehind : null,
    asStaleMinimizedMonths(minimizedMap[STALE_TX_NOTICE_MINIMIZE_KEY]),
  )

  if (staleDisplay !== 'expanded') return null
  return <StaleTransactionsBanner latestTransactionMonth={kpis.latestTransactionMonth} />
}

/**
 * Inflatie-impact ("Koopkracht") — onder de analyse.
 *
 * Hangt aan `cashflow.baselineExpenses`, de gemeten uitgaven. De drempel
 * (>= €500), de `HideInSimple` en de kicker zijn byte-identiek meeverhuisd; aan
 * het gedrag verandert niets.
 *
 * Dit blok is de enige reden dat deze route `loadCashflowData` nog aanraakt —
 * voor één scalar. Bewuste keuze van de eigenaar: het staat achter een eigen
 * `<Suspense>` onderaan de pagina, dus het houdt de analyse niet op.
 */
export async function TransactiesKoopkrachtKaart({ perspective }: { perspective: Perspective }) {
  const supabase = await createClient()
  const cashflow = await loadCashflowData(supabase, perspective)

  if (cashflow.baselineExpenses < 500) return null

  return (
    <HideInSimple>
      <section>
        <Kicker size="small" className="mb-2">
          Koopkracht
        </Kicker>
        <InflationImpactCard monthlyExpenses={cashflow.baselineExpenses} />
      </section>
    </HideInSimple>
  )
}
