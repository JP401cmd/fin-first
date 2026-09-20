import { createClient } from '@/lib/supabase/server'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { buildForecast } from '@/lib/cashflow-forecast-math'
import { forecastVerdict } from '@/lib/cashflow-cards'
import { PageVerdictSuffix } from '@/components/editorial'
import type { Perspective } from '@/lib/household-data'

/**
 * Het oordeel in de paginatitel van /overzicht/budget/forecast, als eigen async
 * server-child achter een `<Suspense>` ín de kop.
 *
 * WAAROM APART EN NIET IN page.tsx — zelfde reden als bij vaste-lasten: de titel
 * is de LCP-kandidaat en moet in de eerste byte staan, en
 * `page.streaming.test.ts` faalt zodra een loader in de paginabron voorkomt.
 * De kop groeit dus van "Vooruitblik" naar "Vooruitblik | Saldo groeit".
 *
 * `loadCashflowData` draait op deze route toch al in `ForecastLoader` en is
 * React-`cache()`-gewrapt → geen extra queries, alleen een tweede consument.
 *
 * DEZELFDE PROGNOSE ALS DE PAGINA. `buildForecast` met exact de argumenten die
 * `buildCashflowCards` gebruikt, en `netPerMonth` is rij 1 — precies zoals de
 * Vooruitblik-kaart op /overzicht/budget hem leest. Geen tweede prognose met
 * eigen aannames ernaast.
 */
export async function ForecastVerdict({ perspective }: { perspective: Perspective }) {
  const supabase = await createClient()
  const cashflow = await loadCashflowData(supabase, perspective)

  const rows = buildForecast(
    cashflow.recurrings,
    cashflow.baselineIncome,
    cashflow.baselineExpenses,
    cashflow.startingBalance,
    new Date(),
  )
  const hasForecast =
    cashflow.baselineIncome > 0 || cashflow.baselineExpenses > 0 || cashflow.recurrings.length > 0

  const { status, label } = forecastVerdict({
    netPerMonth: rows[0]?.net ?? 0,
    hasForecast,
  })

  return <PageVerdictSuffix verdict={label} tone={status} />
}
