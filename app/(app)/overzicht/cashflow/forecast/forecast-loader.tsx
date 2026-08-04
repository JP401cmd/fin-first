import { createClient } from '@/lib/supabase/server'
import { loadForecastSectionData } from '@/lib/cashflow-kpis'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { CashflowSection } from '@/components/fin/cashflow-section'
import { CashflowForecast } from '@/components/overview/cashflow-forecast'
import type { Perspective } from '@/lib/household-data'

/**
 * ForecastLoader — async server-child achter de `<Suspense>` op
 * /overzicht/cashflow/forecast (perf Task 2.5). Spiegelt `CashflowCardsLoader`
 * op de hub en `VasteLastenLoader` op de vaste-lasten-pagina: de pagina rendert
 * alleen wat direct kan (kicker, titel, deck, header-controls) en dít blok
 * stroomt er achteraan.
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

/**
 * Suspense-fallback voor het gestreamde blok. Reserveert de drie
 * samenvattingskaarten (boven de vouw, direct onder het deck) en de
 * forecast-tabel eronder, zodat de instroom geen layout-shift geeft.
 *
 * De hoogtes zijn NAGETELD uit de echte markup, niet geschat. Bron:
 * components/fin/cashflow-section.tsx en components/overview/cashflow-forecast.tsx.
 * Regelhoogtes volgen Tailwinds preflight-`line-height: 1.5` waar geen
 * `leading-*`/`text-*`-token een eigen hoogte meebrengt:
 *
 *   kaartlabel   text-[11px]                     → 16,5px → h-[17px]
 *   kaartcijfer  text-lg (18/28px)               → 28px   → h-7
 *   sparkline    <svg width=80 height=24>        → 24px   → h-6 w-20
 *   voortgang    h-[3px]                         → 3px
 *   forecast-kop text-[10px]                     → 15px   → h-[15px]
 *   forecast-h2  font-serif text-xl (20/28px)    → 28px   → h-7
 *   tabelkop     text-[10px] + py-2              → 31px   → h-[31px]
 *   tabelrij     text-sm (14/20px) + py-2        → 36px   → h-9
 *   voetnoot     text-[11px]                     → 16,5px → h-[17px]
 *
 * plus dezelfde marges (`mt-1`, `mt-2`), dezelfde `gap-3`/`space-y-4`/`space-y-6`-
 * ritmiek en dezelfde randen. De kaart-hoogte volgt de HOOGSTE van de drie
 * (Maandelijks netto / Uitgaventrend: 17 + 4 + 28 + 8 + 17 = 74px inhoud), want de
 * grid strekt ze toch al gelijk.
 *
 * WAT BEWUST NIET LETTERLIJK GEREPRODUCEERD WORDT:
 *  · De WRAP van de forecast-kopregel. De vier samenvattingscijfers rechts staan
 *    in een `flex-wrap`-rij; waar die breekt hangt af van de tekstbreedte van
 *    bedragen die de load nog moet ophalen. De skeleton gebruikt dáárom exact
 *    dezelfde flex-container met dezelfde `gap-4`, zodat de browser op dezelfde
 *    plek breekt in plaats van dat wij een breekpunt raden.
 *  · Het AANTAL tabelrijen is wél vast: `FORECAST_MONTHS` = 6, altijd.
 *
 * WAT WÉL GERESERVEERD WORDT HOEWEL HET KAN ONTBREKEN — de derde kaart en de
 * sparkline. De uitgaventrend-kaart rendert alleen bij ≥2 maanden historie en de
 * spaarquote-sparkline alleen bij ≥2 snapshots. Toch gereserveerd, om dezelfde
 * reden als de KPI-regel in `CashflowCardsFallback` op de hub: reserveren kiest
 * de veelvoorkomende kant, en op lg zit de derde kaart naast de andere twee (dus
 * kost het daar geen hoogte). Ook de gevulde forecast-tabel is gereserveerd; het
 * lege alternatief (een gestippelde uitleg-kaart) is de uitzondering.
 */
export function ForecastFallback() {
  return (
    <div aria-hidden="true" className="animate-pulse space-y-6">
      {/* ── Drie samenvattingskaarten — zelfde grid als CashflowSection. ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((card) => (
          <div
            key={card}
            className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="h-[17px] w-28 bg-[var(--subtle)]" />
                <div className="mt-1 h-7 w-24 bg-[var(--subtle)]" />
              </div>
              <div className="h-6 w-20 shrink-0 bg-[var(--subtle)]" />
            </div>
            {/* Kaart 1 sluit af met een 3px-voortgangsbalk, kaart 2 en 3 met een
                regel meta-tekst van 17px — beide ná `mt-2`. */}
            {card === 0 ? (
              <div className="mt-2 h-[3px] w-full rounded-full bg-[var(--subtle)]" />
            ) : (
              <div className="mt-2 h-[17px] w-40 bg-[var(--subtle)]" />
            )}
          </div>
        ))}
      </div>

      {/* ── Forecast-tabel — zelfde shell-classes als het echte blok. ── */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div className="h-[15px] w-40 bg-[var(--subtle)]" />
            <div className="mt-1 h-7 w-48 bg-[var(--subtle)]" />
          </div>
          <div className="flex items-center gap-4">
            {[0, 1, 2, 3].map((stat) => (
              <div key={stat} className="text-right">
                <div className="ml-auto h-[15px] w-16 bg-[var(--subtle)]" />
                <div className="ml-auto h-4 w-14 bg-[var(--subtle)]" />
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)]">
          <div className="flex h-[31px] items-center gap-3 border-b border-[var(--border-ed)] px-3 sm:px-4">
            <div className="h-[15px] w-16 bg-[var(--subtle)]" />
            <div className="ml-auto h-[15px] w-20 bg-[var(--subtle)]" />
            <div className="h-[15px] w-20 bg-[var(--subtle)]" />
            <div className="h-[15px] w-14 bg-[var(--subtle)]" />
            <div className="h-[15px] w-14 bg-[var(--subtle)]" />
          </div>
          {/* FORECAST_MONTHS = 6 rijen, de laatste zonder onderrand. */}
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div
              key={row}
              className="flex h-9 items-center gap-3 border-b border-[var(--border-ed)] px-3 last:border-b-0 sm:px-4"
            >
              <div className="h-5 w-20 bg-[var(--subtle)]" />
              <div className="ml-auto h-5 w-16 bg-[var(--subtle)]" />
              <div className="h-5 w-16 bg-[var(--subtle)]" />
              <div className="h-5 w-16 bg-[var(--subtle)]" />
              <div className="h-5 w-16 bg-[var(--subtle)]" />
            </div>
          ))}
        </div>

        <div className="h-[17px] w-full max-w-lg bg-[var(--subtle)]" />
      </div>
    </div>
  )
}
