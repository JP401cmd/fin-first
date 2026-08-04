import { createClient } from '@/lib/supabase/server'
import { loadCashflowKpis } from '@/lib/cashflow-kpis'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { buildCashflowCards, cashflowCardStatuses } from '@/lib/cashflow-cards'
import { CashflowStatusSeed } from '@/components/app/cashflow-status-provider'
import { CashflowLandingCards } from '@/components/overview/cashflow-landing-cards'
import { InflationImpactCard } from '@/components/overview/inflation-impact-card'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { Kicker } from '@/components/editorial'
import type { Perspective } from '@/lib/household-data'

/**
 * CashflowCardsLoader — async server-child achter de `<Suspense>` op
 * /overzicht/cashflow (perf Task 2.2). Spiegelt `OverzichtSecondaryLoader` op
 * /overzicht: de pagina zelf rendert alleen wat direct kan (titel, opening,
 * header-controls) en dít blok stroomt er achteraan.
 *
 * DRIE LOADERS, GEEN DASHBOARD-BUNDEL. `buildCashflowCards` leest precies zeven
 * scalars; die komen uit `loadCashflowKpis` (lib/cashflow-kpis.ts, ADR 0083) —
 * vier `cache()`-gedeelde fetches — in plaats van uit de volle
 * `loadDashboardData` (~40 queries plus een koude horizon-tak met bisectie-solve).
 * De cashflow-hub gebruikte de bundel nergens anders voor; dit is de enige
 * callsite die 'm hier had.
 *
 * DE SIDEBAR-DOTS LIFTEN MEE (T2.3): dezelfde kaarten voeden via
 * `<CashflowStatusSeed>` de vier status-dots onder Cashflow in de sidebar. Op de
 * hub vervalt daarmee de tweede request naar /api/overzicht/cashflow-status —
 * die route bestaat nog uitsluitend voor de sub-pagina's, die de kaarten niet
 * server-side hebben. De projectie kaart→status loopt via `cashflowCardStatuses`,
 * gedeeld met die route, zodat dot en kaart per constructie gelijk blijven.
 *
 * DE INFLATIEKAART HOORT HIER (stap 3): hij hangt aan `cashflow.baselineExpenses`
 * uit diezelfde `loadCashflowData`. Hem in een eigen `<Suspense>` zetten zou een
 * tweede wachtpunt op dezelfde load introduceren; `cache()` deelt de load toch al,
 * dus meeliften kost niets. De toon-drempel (>= €500) blijft byte-identiek aan de
 * vroegere in-page-conditie, inclusief `HideInSimple` en de Koopkracht-kicker.
 */
export async function CashflowCardsLoader({ perspective }: { perspective: Perspective }) {
  // `createClient()` is React-`cache()`-gewrapt → dezelfde instantie als elders in
  // deze render. Bewust hier en niet als prop: zo houdt page.tsx nul zware awaits
  // boven zijn return (zie de kop van page.tsx).
  const supabase = await createClient()

  const [kpis, cashflow, vasteLasten] = await Promise.all([
    loadCashflowKpis(supabase),
    loadCashflowData(supabase, perspective),
    loadVasteLastenSummary(supabase),
  ])
  const cards = buildCashflowCards(kpis, cashflow, vasteLasten)

  return (
    <>
      {/* Seedt de sidebar-status-dots met de statussen van DEZE kaarten (zelfde
          array, zelfde projectie) — daardoor fetcht de hub `/api/overzicht/
          cashflow-status` niet. Rendert niets. */}
      <CashflowStatusSeed statuses={cashflowCardStatuses(cards)} />

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <CashflowLandingCards cards={cards} />
      </section>

      {cashflow.baselineExpenses >= 500 && (
        <HideInSimple>
          <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
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

/**
 * Suspense-fallback voor het kaartenblok. Reserveert de hoogte van de vier
 * `LeverageCard`s zodat de instroom geen layout-shift geeft (CLS ~0).
 *
 * De hoogtes zijn NAGETELD uit `components/overview/leverage-card.tsx`, niet
 * geschat — elk blok komt overeen met de line-height van de regel die het
 * vervangt (Tailwind-defaults):
 *
 *   icon-chip   w-8 h-8 / sm:w-9 sm:h-9      → h-8 w-8 / sm:h-9 sm:w-9
 *   label       text-sm (20px) / sm:text-base (24px)  → h-5 / sm:h-6
 *   kpi         text-base (24px) / sm:text-lg (28px)  → h-6 / sm:h-7
 *   substext-rij min-h-[16px]                → h-4
 *
 * plus de kaart-padding `p-3 sm:p-4` en dezelfde `rounded-2xl border`-shell.
 *
 * De KPI-regel wordt bewust WÉL gereserveerd, terwijl `LeverageCard` 'm bij
 * `kpi === null` weglaat: dat is de lege-account-staat (nog geen budget, geen
 * transacties). Reserveren kiest de veelvoorkomende kant; de lege staat krijgt
 * één keer een krimp van ~24px i.p.v. iedereen-met-data een groei.
 *
 * De INFLATIEKAART krijgt géén gereserveerde hoogte: hij verschijnt alleen boven
 * €500 baseline-uitgaven én kan client-side verborgen zijn
 * (`useInsightVisibility`), dus een vaste reservering zou voor een deel van de
 * gebruikers een permanent gat zijn. Hij staat bovendien onder het kaartenraster,
 * dus buiten het eerste scherm.
 */
export function CashflowCardsFallback() {
  return (
    <section aria-hidden="true" className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="grid animate-pulse grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4"
          >
            <div className="h-8 w-8 rounded-lg bg-[var(--subtle)] sm:h-9 sm:w-9" />
            <div className="mt-2 h-5 w-20 bg-[var(--subtle)] sm:h-6" />
            <div className="mt-0.5 h-6 w-24 bg-[var(--subtle)] sm:h-7" />
            <div className="mt-1 h-4 w-16 bg-[var(--subtle)]" />
          </div>
        ))}
      </div>
    </section>
  )
}
