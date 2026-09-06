import { createClient } from '@/lib/supabase/server'
import { loadForecastSectionData } from '@/lib/cashflow-kpis'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { CashflowSection } from '@/components/fin/cashflow-section'
import { CashflowForecast } from '@/components/overview/cashflow-forecast'
import type { Perspective } from '@/lib/household-data'

/**
 * ForecastLoader — async server-child achter de `<Suspense>` op
 * /overzicht/budget/forecast (perf Task 2.5). Spiegelt `CashflowCardsLoader`
 * op de hub en `VasteLastenLoader` op de vaste-lasten-pagina: de pagina rendert
 * alleen wat direct kan (kicker, titel, deck, header-controls) en dít blok
 * stroomt er achteraan.
 *
 * De bijbehorende Suspense-fallback woont sinds FC-1 in `forecast-fallback.tsx`:
 * die moet de weergavemodus lezen (Eenvoudig reserveert een eindregel i.p.v. de
 * zes-rijen-tabel) en is daarmee een client-component, wat in deze server-module
 * niet kan.
 *
 * TWEE LOADERS, GEEN DASHBOARD-BUNDEL. `CashflowSection` leest uit die bundel
 * precies vijf velden — `monthlyIncome`, `monthlyExpenses`, `savingsRate6m`,
 * `savingsHistory` en `expenseHistory` — en die komen uit
 * `loadForecastSectionData` (lib/cashflow-kpis.ts, ADR 0083) in plaats van uit de
 * volle `loadDashboardData` (~40 queries in 5-6 seriële golven plus een koude
 * horizon-tak met bisectie-solve).
 *
 * `savingsRate6m` is daarbij het kerngetal dat óók op /overzicht en in het
 * instellingenblok staat. De slanke laag berekent 'm niet opnieuw: ze consumeert
 * dezelfde `resolveSavingsRate6m`-keten (incl. de profiel-fallback én de
 * net-vermogen-delta-tak) die `loadDashboardData` consumeert.
 * `lib/cashflow-kpis.forecast-parity.test.ts` draait beide paden end-to-end tegen
 * dezelfde fixtures — inclusief een fixture waarin die delta-tak echt aanslaat.
 *
 * `loadCashflowData` blijft staan: dat IS de inhoud van de forecast-tabel
 * (recurrings + baseline + startsaldo), geen bijvangst. Hier verhuist hij alleen
 * achter de Suspense-grens, zodat hij de titel niet meer ophoudt.
 */
export async function ForecastLoader({ perspective }: { perspective: Perspective }) {
  // `createClient()` is React-`cache()`-gewrapt → dezelfde instantie als elders in
  // deze render. Bewust hier en niet als prop: zo houdt page.tsx nul zware awaits
  // boven zijn return (zie de kop van page.tsx).
  const supabase = await createClient()

  const [forecastData, cashflow] = await Promise.all([
    loadForecastSectionData(supabase),
    loadCashflowData(supabase, perspective),
  ])

  return (
    <div className="space-y-6">
      <CashflowSection data={forecastData} />
      <CashflowForecast
        recurrings={cashflow.recurrings}
        baselineIncome={cashflow.baselineIncome}
        baselineExpenses={cashflow.baselineExpenses}
        startingBalance={cashflow.startingBalance}
      />
    </div>
  )
}
