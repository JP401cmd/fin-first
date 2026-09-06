import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import {
  getCanonicalDailyIncomeRate,
  EMPTY_DAILY_INCOME_RATE,
  type DailyIncomeRate,
} from '@/lib/income-rate'
import { loadCashflowKpis } from '@/lib/cashflow-kpis'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { buildVasteLastenInsights } from '@/lib/vaste-lasten-insights'
import { VasteLastenClient } from '@/components/overview/vaste-lasten-client'
import { CashflowKalender } from '@/components/overview/cashflow-kalender'
import { HideInSimple } from '@/components/app/hide-in-simple'
import type { Perspective } from '@/lib/household-data'

/**
 * VasteLastenLoader — async server-child achter de `<Suspense>` op
 * /overzicht/budget/vaste-lasten (perf Task 2.4). Spiegelt
 * `CashflowCardsLoader` op de hub: de pagina zelf rendert alleen wat direct kan
 * (kicker, titel, header-controls) en dít blok stroomt er achteraan.
 *
 * DRIE LOADERS, GEEN DASHBOARD-BUNDEL. `buildVasteLastenInsights` heeft uit die
 * bundel precies twee scalars nodig — `monthlyIncome` en `monthlyExpenses` — en
 * die komen uit `loadCashflowKpis` (lib/cashflow-kpis.ts, ADR 0083) in plaats van
 * uit de volle `loadDashboardData` (~40 queries in 5-6 seriële golven plus een
 * koude horizon-tak met bisectie-solve).
 *
 * `loadVasteLastenSummary` blijft staan: dat IS de inhoud van deze pagina, niet
 * een bijvangst. Zijn kosten (12 maanden ruwe rijen + recurring-detectie) zijn
 * een aparte, latere stap — hier verhuist hij alleen achter de Suspense-grens,
 * zodat hij de titel niet meer ophoudt.
 *
 * De kalender ligt in DEZELFDE grens: hij hangt aan `cashflow.recurrings` uit
 * diezelfde `loadCashflowData`. Een eigen `<Suspense>` zou een tweede wachtpunt
 * op één load zijn; `cache()` deelt de load toch al, dus meeliften kost niets.
 */
export async function VasteLastenLoader({ perspective }: { perspective: Perspective }) {
  // `createClient()` is React-`cache()`-gewrapt → dezelfde instantie als elders in
  // deze render. Bewust hier en niet als prop: zo houdt page.tsx nul zware awaits
  // boven zijn return (zie de kop van page.tsx).
  const supabase = await createClient()

  // De WERKTIJD-noemer hangt aan de ingelogde gebruiker (handmatige Box 1-
  // override staat op zijn profielrij). `getCachedUser` is `cache()`-gewrapt en
  // deelt de auth-roundtrip die de loaders hieronder toch al doen.
  const user = await getCachedUser(supabase)

  const [kpis, cashflow, summary, incomeRate] = await Promise.all([
    loadCashflowKpis(supabase),
    loadCashflowData(supabase, perspective),
    loadVasteLastenSummary(supabase),
    // WERKTIJD-basis (ADR 0105) — bruto dagtarief uit de CANONIEKE bruto Box 1-
    // grondslag (`resolveBox1GrossIncome`, ADR 0086/0103), dezelfde bron als de
    // belasting-hub. Bewust géén tweede afleiding uit `kpis.monthlyIncome`: dat
    // is netto én een andere grondslag, en zou dit scherm een ander werkjaar
    // geven dan /overzicht/belasting — precies de fout die C5 blootlegde.
    // KOSTEN: deze bron trekt de `loadCoreData`-bundel binnen (aandachtspunt
    // `bruto-box1-grondslag-meervoudig`); hij draait daarom PARALLEL met de drie
    // loaders hierboven, en faalt zacht → geen werktijd-regel i.p.v. geen pagina.
    user
      ? getCanonicalDailyIncomeRate(supabase, user.id).catch((err): DailyIncomeRate => {
          console.error('vaste-lasten:income-rate', err)
          return EMPTY_DAILY_INCOME_RATE
        })
      : Promise.resolve(EMPTY_DAILY_INCOME_RATE),
  ])

  // TWEE VERSCHILLENDE GRONDSLAGEN, allebei bewust:
  //  · `monthlyIncome` — EFFECTIVE (ADR 0073, `income_source='manual'` wint). Een
  //    structureel aandeel ("hoeveel van mijn inkomen ligt vast?") meet je tegen
  //    een stabiel maandinkomen, niet tegen een half-afgelopen maand;
  //    `currentMonth*` hoort hier dus NIET.
  //  · `dailyExpenseRate` — CANONIEK 12-mnd ROLLING (lib/expense-rate.ts). Hier
  //    stond `monthlyExpenses: kpis.monthlyExpenses`, waarna de motor er zélf
  //    `dailyExpenseRate(...)` op deed: de effective/single-month-conversie die
  //    KRUIS-17/20 heeft afgeschaft. Dezelfde vaste last kostte daardoor op dit
  //    scherm een ander aantal vrijheidsdagen dan in de vaste-lasten-widget.
  const insights = buildVasteLastenInsights({
    summary,
    monthlyIncome: kpis.monthlyIncome,
    // `?? 0` = "geen eerlijke dagbasis" (het veld is additief/optioneel op het
    // gedeelde scalars-type); de motor laat de tijdregels dan weg.
    dailyExpenseRate: kpis.dailyExpenseRate ?? 0,
    //  · `dailyIncomeRate` — CANONIEK bruto dagtarief (ADR 0105). Een DERDE
    //    grondslag naast de twee hierboven, en bewust: werktijd ("hoeveel van je
    //    werkjaar gaat hiernaartoe") deelt op het inkomen, vrijheidstijd op de
    //    uitgaven. 0 = geen werkjaar-basis → het scherm laat de werktijd-zin weg.
    dailyIncomeRate: incomeRate.dailyRate,
  })

  return (
    <div className="space-y-6">
      <VasteLastenClient
        insights={insights}
        subscriptions={summary.subscriptions}
        vasteKosten={summary.vasteKosten}
        terugkerendVariabel={summary.terugkerendVariabel}
        fullName={cashflow.fullName}
      />
      {/* Kalender = secundaire diepte ("wanneer komt het"): in Eenvoudig
          verborgen, in Volledig zichtbaar. De primaire analyse + het
          hoofdcijfer (VasteLastenClient) blijven altijd staan.

          TWEE POPULATIES, ÉÉN KALENDER (M21). `cashflow.recurrings` is de
          bevestigde tabel; `detections` zijn de posten die de analyse hierboven
          wél meetelt maar die nog niet bevestigd zijn. Zonder die tweede stroom
          stond er "geen vaste afschrijvingen" onder een kaart die er 21 telde.
          `terugkerendVariabel` (boodschappen/tanken) blijft er bewust BUITEN:
          die staat ook buiten `totalMonthly` en heeft geen vaste afschrijfdag. */}
      <HideInSimple>
        <CashflowKalender
          recurrings={cashflow.recurrings}
          detections={[...summary.subscriptions, ...summary.vasteKosten]
            .filter((item) => !item.alreadyConfirmed && item.schedule)
            .map((item) => ({
              id: item.id,
              name: item.name,
              amount: item.averageAmount,
              schedule: item.schedule ?? null,
            }))}
        />
      </HideInSimple>
    </div>
  )
}

/**
 * Suspense-fallback voor het gestreamde blok. Reserveert de hoogte van het
 * cijferblok + de aandeel-meter (allebei boven de vouw, direct onder de titel)
 * en de shell van de Vaste-Kosten-Analyse-kaart, zodat de instroom daar geen
 * layout-shift geeft.
 *
 * De hoogtes zijn NAGETELD uit de echte markup, niet geschat. Bron:
 * components/overview/vaste-lasten-client.tsx (cijferblok + `CompactMeter`),
 * components/editorial/page-opening.tsx (`PageOpeningFigure`) en
 * components/fin/vaste-kosten-analyse.tsx (kaart-shell). Regelhoogtes volgen
 * Tailwinds preflight-`line-height: 1.5` waar geen `leading-*` staat:
 *
 *   kicker      text-[10px]                    → 15px   → h-[15px]
 *   hoofdcijfer text-[32px] leading-none       → 32px   → h-8
 *               sm:text-[40px]                 → 40px   → sm:h-10
 *   sub-meta    text-[12px] / sm:text-[13px]   → 18/20px → h-[18px] sm:h-5
 *   Fin-knop    py-1 + 11px-regel (16.5px) + 1px randen → ~26px → h-[26px]
 *   meter-label text-xs (16px)                 → h-4
 *   meter-balk  h-2                            → h-2
 *
 * plus dezelfde marges (`mt-1.5`, `mt-2`, `mb-1`), dezelfde `border-t … pt-4`
 * hairline onder de titel en dezelfde `space-y-3`/`space-y-6`-ritmiek.
 *
 * WAT BEWUST NIET GERESERVEERD WORDT:
 *  · De AANTALLEN in de analyse-kaart. Hoeveel abonnementen/vaste kosten iemand
 *    heeft is precies wat de load nog moet uitzoeken; drie rijen per kolom is de
 *    veelvoorkomende orde van grootte, geen belofte. De rij-HOOGTE (62px:
 *    py-3 + `text-sm`-regel + `text-xs`-regel + 1px randen) is wél nageteld, dus
 *    een afwijking kost een veelvoud van één rij en geen willekeurig verschil.
 *  · De KALENDER (`HideInSimple` — in Eenvoudig rendert hij helemaal niet) en de
 *    inzicht-blokken. Allebei ver onder de vouw; een vaste reservering zou voor
 *    de Eenvoudig-modus een permanent gat zijn (dezelfde afweging als de
 *    inflatiekaart op de hub).
 *
 * WAT WÉL GERESERVEERD WORDT HOEWEL HET KAN ONTBREKEN — de strook direct onder
 * het cijferblok. `CompactMeter` rendert alleen bij `insights.hasData`
 * (vaste-lasten-client.tsx), dus voor een account zonder gedetecteerde vaste
 * lasten klapt hier ~40px dicht, bóven de vouw. Toch gereserveerd, om dezelfde
 * reden als de KPI-regel in `CashflowCardsFallback` op de hub: reserveren kiest
 * de veelvoorkomende kant.
 *
 * S2 — DE OUDE AANNAME "in Eenvoudig rendert daar niets" IS VERVALLEN. Sinds S2
 * staat in Eenvoudig op precies deze plek de OORDEELREGEL (`OordeelDeck`, ±2
 * regels ≈ 46px) in plaats van de compacte meter (±28px), en dáár weer onder de
 * quote-meter, het sluipverbruik en de top-5. Deze fallback is bewust
 * modus-AGNOSTISCH gebleven: hij is een server-component en kan
 * `useDisplayMode()` niet lezen, en een tweede, modus-afhankelijke skeleton zou
 * de modus alsnog naar de serverrender moeten prop-drillen (drift-risico dat
 * ADR 0026 juist wegneemt). Boven de vouw kost dat ~18px verschil (deck i.p.v.
 * meter) — kleiner dan de bestaande onzekerheid over het aantal lijstrijen.
 * Onder de vouw schuift de analyse-kaart in Eenvoudig verder omlaag (de drie
 * duidingsblokken komen ertussen) en klapt hij bovendien in tot de
 * DepthSection-kop; die twee heffen elkaar deels op en spelen zich af buiten
 * het eerste scherm, waar een skeleton geen shift meer voorkomt die iemand ziet.
 */
export function VasteLastenFallback() {
  return (
    <div aria-hidden="true" className="animate-pulse space-y-6">
      {/* ── Cijferblok + meter — spiegelt het `space-y-3`-groepje bovenin
             VasteLastenClient (hairline onder de H1, dan het hoofdcijfer). ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4 border-t border-[var(--border-ed)] pt-4">
          <div>
            <div className="h-[15px] w-32 bg-[var(--subtle)]" />
            <div className="mt-1.5 h-8 w-44 bg-[var(--subtle)] sm:h-10" />
            <div className="mt-2 h-[18px] w-56 bg-[var(--subtle)] sm:h-5" />
          </div>
          <div className="h-[26px] w-[130px] bg-[var(--subtle)]" />
        </div>

        {/* CompactMeter — label-rij (text-xs) + `mb-1` + de 8px-balk. */}
        <div className="w-full max-w-xs">
          <div className="mb-1 flex items-center justify-between">
            <div className="h-4 w-32 bg-[var(--subtle)]" />
            <div className="h-4 w-8 bg-[var(--subtle)]" />
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--subtle)]" />
        </div>
      </div>

      {/* ── Vaste-Kosten-Analyse — zelfde shell-classes als het echte blok. ── */}
      <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)]">
        <div className="h-[3px] w-full bg-[var(--subtle)]" />

        {/* Kop-rij: px-4 py-4 sm:px-5, hoogste regel is de `text-sm`-KPI (20px). */}
        <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-4 py-4 sm:px-5">
          <div className="h-5 w-44 bg-[var(--subtle)]" />
          <div className="h-5 w-20 bg-[var(--subtle)]" />
        </div>

        {/* Tabbalk — alleen onder md, net als in het origineel. Knop = py-2 +
            een 11px-regel (16,5px) → 33px. */}
        <div className="border-b border-[var(--border-ed)] px-5 pb-3 pt-3 md:hidden">
          <div className="flex gap-1 rounded-[var(--r)] bg-[var(--subtle)] p-1">
            <div className="h-[33px] flex-1 rounded-[var(--r-sm)] bg-[var(--paper)]" />
            <div className="h-[33px] flex-1 rounded-[var(--r-sm)] bg-[var(--paper)]" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2">
          {[0, 1].map((col) => (
            <div
              key={col}
              className={`p-5 ${col === 0 ? 'md:border-r md:border-[var(--border-ed)]' : 'hidden md:block'}`}
            >
              <div className="mb-3 h-[18px] w-40 bg-[var(--subtle)]" />
              <div className="space-y-2">
                {[0, 1, 2].map((row) => (
                  <div
                    key={row}
                    className="flex items-center justify-between rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-3"
                  >
                    {/* Twee regels van 20px + 16px = 36px; de balken zijn iets
                        korter zodat de 4px `space-y-1` binnen die 36px valt. */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="h-[18px] w-2/3 bg-[var(--subtle)]" />
                      <div className="h-[14px] w-1/3 bg-[var(--subtle)]" />
                    </div>
                    <div className="ml-3 h-5 w-16 shrink-0 bg-[var(--subtle)]" />
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-[var(--border-ed)] pt-3">
                  <div className="h-4 w-16 bg-[var(--subtle)]" />
                  <div className="h-5 w-20 bg-[var(--subtle)]" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Totaalregel + actie-rij (min-h-[44px] knoppen). */}
        <div className="border-t border-[var(--border-ed)] px-5 py-4">
          {/* Rechts: `text-base`-regel (24px) + `text-xs`-regel (16px) = 40px. */}
          <div className="flex items-start justify-between">
            <div className="h-5 w-36 bg-[var(--subtle)]" />
            <div className="text-right">
              <div className="ml-auto h-[22px] w-24 bg-[var(--subtle)]" />
              <div className="ml-auto mt-1 h-[14px] w-20 bg-[var(--subtle)]" />
            </div>
          </div>
          <div className="mt-3 flex min-h-[44px] items-center justify-center gap-3">
            <div className="h-5 w-28 bg-[var(--subtle)]" />
            <div className="h-5 w-36 bg-[var(--subtle)]" />
          </div>
        </div>
      </div>
    </div>
  )
}
