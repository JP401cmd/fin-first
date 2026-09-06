'use client'

import { useDisplayMode } from '@/lib/hooks/use-display-mode'

/**
 * Suspense-fallback voor het gestreamde forecast-blok. Reserveert de drie
 * samenvattingskaarten (boven de vouw, direct onder het deck) en wat daaronder
 * komt, zodat de instroom geen layout-shift geeft.
 *
 * WAAROM EEN CLIENT-COMPONENT IN EEN EIGEN BESTAND — sinds FC-1
 * (docs/eenvoudige-weergave-audit.md §7) heeft het blok twee verschijningen: in
 * "Volledig" de zes-rijen-tabel, in "Eenvoudig" één eindregel met sparkline. Een
 * skeleton die altijd de tabel reserveert zou in Eenvoudig ~350px te veel
 * vasthouden en daarna inklappen — precies de layout-shift die dit bestand hoort
 * te voorkomen. De modus lezen vereist `useDisplayMode()`, en dus een client-
 * component; `forecast-loader.tsx` is een server-module (async `ForecastLoader`)
 * en kan die hook niet dragen. Vandaar de splitsing.
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
 * WAT WÉL GERESERVEERD WORDT HOEWEL HET KAN ONTBREKEN — in VOLLEDIG de derde
 * kaart en de sparkline. De uitgaventrend-kaart rendert alleen bij ≥2 maanden
 * historie en de spaarquote-sparkline alleen bij ≥2 snapshots. Toch gereserveerd, om dezelfde
 * reden als de KPI-regel in `CashflowCardsFallback` op de hub: reserveren kiest
 * de veelvoorkomende kant, en op lg zit de derde kaart naast de andere twee (dus
 * kost het daar geen hoogte). Ook de gevulde forecast-tabel is gereserveerd; het
 * lege alternatief (een gestippelde uitleg-kaart) is de uitzondering.
 */
export function ForecastFallback() {
  const { mode } = useDisplayMode()

  return (
    <div aria-hidden="true" className="animate-pulse space-y-6">
      {/* ── Samenvatting — zelfde vorm als CashflowSection, per modus.
             S5: die sectie is sinds 28 aug 2026 óók modus-bewust. In Eenvoudig
             is het één kaart met een bedrag en twee zinnen; drie kaarten
             reserveren zou daar ~150px vasthouden die daarna inklapt.

             Eenvoudig-kaart nageteld: 17 (label) + 4 (mt-1) + 32 (font-mono
             text-2xl, 24/32px) + 8 (mt-2) + 2×20 (text-sm, twee regels) = 101px
             inhoud, plus 2×16px padding (p-4). ── */}
      {mode === 'simple' ? (
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <div className="h-[17px] w-40 bg-[var(--subtle)]" />
          <div className="mt-1 h-8 w-44 bg-[var(--subtle)]" />
          <div className="mt-2 h-5 w-full max-w-md bg-[var(--subtle)]" />
          <div className="mt-1 h-5 w-2/3 max-w-sm bg-[var(--subtle)]" />
        </div>
      ) : (
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
              {/* Kaart 1 sluit af met een 3px-voortgangsbalk, kaart 2 en 3 met
                  een regel meta-tekst van 17px — beide ná `mt-2`. */}
              {card === 0 ? (
                <div className="mt-2 h-[3px] w-full rounded-full bg-[var(--subtle)]" />
              ) : (
                <div className="mt-2 h-[17px] w-40 bg-[var(--subtle)]" />
              )}
            </div>
          ))}
        </div>
      )}

      {mode === 'simple' ? (
        /* ── Eenvoudig — kop + één eindregel-kaart + voetnoot. ──
           Kaart-inhoud: 17 (label) + 4 (mt-1) + 32 (font-serif text-2xl, 24/32px)
           + 4 (mt-1) + 17 (sub) = 74px, plus 2×16px padding (p-4) = 106px. */
        <div className="space-y-4">
          <div>
            <div className="h-[15px] w-40 bg-[var(--subtle)]" />
            <div className="mt-1 h-7 w-48 bg-[var(--subtle)]" />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <div>
              <div className="h-[17px] w-28 bg-[var(--subtle)]" />
              <div className="mt-1 h-8 w-32 bg-[var(--subtle)]" />
              <div className="mt-1 h-[17px] w-44 bg-[var(--subtle)]" />
            </div>
            {/* <svg width=96 height=28> */}
            <div className="h-7 w-24 shrink-0 bg-[var(--subtle)]" />
          </div>
          <div className="h-[17px] w-full max-w-lg bg-[var(--subtle)]" />
        </div>
      ) : (
        /* ── Volledig — forecast-tabel, zelfde shell-classes als het echte blok. ── */
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
      )}
    </div>
  )
}
