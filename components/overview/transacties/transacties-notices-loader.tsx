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
 * TransactiesNoticesLoader — async server-child achter een eigen `<Suspense>` op
 * /overzicht/…/transacties. Draagt de twee duidingen die vóór de analyse horen:
 * de versheidsmelding en de inflatie-impact.
 *
 * WAAROM HIER. Beide stonden op de cashflow-hub, boven de vier hefboom-kaarten.
 * Die hub is opgeheven; de kaarten verhuizen naar de budgetpagina, deze twee
 * naar de transactiepagina. Dat is voor beide de juiste kant van de splitsing:
 *
 *  - De versheidsmelding gaat letterlijk over transacties die stilstaan. Op de
 *    hub stond hij vóór de cijfers omdat die cijfers erop rusten; hier staat hij
 *    vóór de analyse, om precies dezelfde reden.
 *  - De inflatiekaart hangt aan `cashflow.baselineExpenses` — de gemeten
 *    uitgaven, en dus aan deze pagina.
 *
 * DE VOORKEUR REIST MEE. Het is dezelfde melding als op /overzicht, onder
 * dezelfde pref-sleutel: wie haar daar inklapte, hoort haar hier niet opnieuw op
 * volle grootte te zien. De knoppen zitten er bewust niet bij — terughalen doe
 * je op /overzicht, en van daaruit werkt het weer op beide pagina's.
 *
 * De drempel (>= €500), de `HideInSimple` en de Koopkracht-kicker zijn
 * byte-identiek meeverhuisd; aan het gedrag van beide blokken verandert niets.
 */
export async function TransactiesNoticesLoader({ perspective }: { perspective: Perspective }) {
  // `createClient()` is React-`cache()`-gewrapt → dezelfde instantie als elders
  // in deze render, en `loadCashflowKpis`/`loadCashflowData` delen hun fetches
  // via `cache()`. Bewust hier en niet als prop, zodat page.tsx geen zwaar await
  // boven zijn return krijgt.
  const supabase = await createClient()
  const user = await getCachedUser(supabase)

  const [kpis, cashflow, minimizedMap] = await Promise.all([
    loadCashflowKpis(supabase),
    loadCashflowData(supabase, perspective),
    user
      ? readMinimizedMap(supabase, user.id)
      : Promise.resolve({} as Record<string, unknown>),
  ])

  const txFreshness = transactionFreshness(kpis.latestTransactionMonth)
  const staleDisplay = resolveStaleNoticeDisplay(
    txFreshness.state === 'stale' ? txFreshness.monthsBehind : null,
    asStaleMinimizedMonths(minimizedMap[STALE_TX_NOTICE_MINIMIZE_KEY]),
  )

  return (
    <>
      {staleDisplay === 'expanded' && (
        <StaleTransactionsBanner latestTransactionMonth={kpis.latestTransactionMonth} />
      )}

      {cashflow.baselineExpenses >= 500 && (
        <HideInSimple>
          <section>
            <Kicker size="small" className="mb-2">
              Koopkracht
            </Kicker>
            <InflationImpactCard monthlyExpenses={cashflow.baselineExpenses} />
          </section>
        </HideInSimple>
      )}
    </>
  )
}
