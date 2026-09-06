/**
 * Canonieke dagtarief-bron (€/dag) voor de "geld = opgeslagen tijd"-conversie.
 *
 * ── Waarom deze module bestaat ──────────────────────────────────────────────
 * Vóór KRUIS-20 herimplementeerde élk oppervlak (balans/budget/vermogen-rapport,
 * de client-side DailyExpenseProvider, de bezittingen-pagina, de netto-vermogen-
 * widget) dezelfde "jaaruitgaven → dagtarief"-som — mét net andere venstergrenzen
 * (12-mnd rolling vs. losse kalendermaand vs. rapportperiode). Daardoor gaf
 * hetzelfde bedrag verschillende "jaren vrijheid" per scherm. Dit is de ENE
 * gedeelde bron: elk oppervlak middelt de werkelijke uitgaven over exact hetzelfde
 * rolling-venster (`EXPENSE_RATE_ROLLING_MONTHS`) en converteert via de canonieke
 * `dailyExpenseRate()` (×12/365) uit `lib/format.ts`.
 *
 * ── Grondslag = GEZUIVERDE CONSUMPTIE (ADR 0126, besluit D2) ─────────────────
 * Een aggregaatrij (maand × budget × type) telt als consumptie wanneer
 *   1. `sum_negatief < 0`,
 *   2. het geen (joint_)transfer is (`isRealAggRow`), én
 *   3. het GEËRFDE budgettype niet in `EXCLUDED_BUDGET_TYPES` zit
 *      ('archive' · 'income' · 'savings'; lib/budget-utils.ts).
 * Expliciete randen: ongecategoriseerd (`budget_id` null) telt MEE (blocklist-
 * semantiek), 'debt' telt mee (een aflossing is een uitgave), en een child erft
 * het type van zijn parent (`buildBudgetTypeMap`).
 *
 * BEKENDE BEPERKING — een niet-null `budget_id` die NIET in de type-map staat.
 * Een verwijderd budget kan dat niet zijn (`transactions.budget_id` is
 * `ON DELETE SET NULL`). De enige bron is een RLS-onzichtbaar PARTNER-budget:
 * `transactions` is zichtbaar bij `ownership='shared'` binnen het huishouden,
 * maar `budgets` alleen bij eigen rijen óf `ownership='shared'`, en in het
 * default budgetmodel 'separate' zijn partnerbudgetten `personal`. Een
 * partner-hypotheek op diens archiefbudget valt dan door de blocklist en telt
 * als jouw consumptie. Vandaag onbereikbaar (nul huishoudens in productie),
 * dus bewust niet in PR A opgelost.
 * TODO(ADR 0126-vervolg): partnerbudgettypes ontsluiten (bv. via de
 * perspective-loader) of shared-transacties zonder bekend type uitsluiten.
 *
 * Tot ADR 0126 was de grondslag "ALLE negatieve transacties". Op een echt account
 * bestond ~60% van dat 12-maandstotaal uit één hypotheekaflossing (type NULL,
 * archief-budget "Eigen rekening") en één terugbetaald voorschot (type transfer):
 * het dagtarief stond ~2,6× te hoog en élke €→vrijheidstijd dus ~2,6× te kort.
 * De budgetgebaseerde sommen (`computeYearlyMustExpenses`, budget-spending) sloten
 * archief al uit; de transactiegebaseerde niet — dat verschil is hier gedicht.
 * Eén functie draagt die definitie: `consumptionExpenseRows`. Bouw nergens een
 * eigen `aggToExpenseRows(…, opts)` voor het dagtarief.
 *
 * De aparte onttrekkingsfase-grondslag (`uitgaveNaPensioenPerJaar` → horizon-kernel)
 * is een ánder concept en hoort hier NIET thuis.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { credibleMonthlyBasis, dailyExpenseRate, type FreedomRateSource } from '@/lib/format'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'
import { EXPENSE_RATE_ROLLING_MONTHS } from '@/lib/constants'
import { buildBudgetTypeMap, EXCLUDED_BUDGET_TYPES, type BudgetTypeRow } from '@/lib/budget-utils'
import { getBudgets } from '@/lib/server-data/base'
import {
  aggToExpenseRows,
  fetchTxMonthAggregate,
  getTxAgg12m,
  type TxMonthAggregateRow,
} from '@/lib/server-data/tx-aggregates'

export interface RecentDailyExpenseRate {
  /** Dagtarief in €/dag (canonieke jaar/365-basis via `dailyExpenseRate`). */
  dailyRate: number
  /**
   * Gemiddelde maanduitgaven over het rolling-venster (of de schatting-fallback).
   * Altijd 0 óf ≥ `CREDIBLE_MONTHLY_BASIS_MIN` (lib/format.ts): een grondslag
   * onder die geloofwaardigheidsvloer wordt hier al als "geen data" behandeld.
   */
  monthlyExpenses: number
  /** Aantal maanden met data (1..EXPENSE_RATE_ROLLING_MONTHS); 0 bij schatting/geen data. */
  dataMonths: number
  /**
   * Herkomst van het tarief: echte transacties, profiel-schatting, de gok van
   * de app zelf, of geen.
   * 'transactions' impliceert een GELOOFWAARDIGE transactiebasis (≥ vloer);
   * consumenten die hierop toetsen hoeven de vloer dus niet zelf te kennen.
   * 'cohort' is de terugval-tak mét `fallbackSource: 'cohort'` — het
   * profielbedrag is dan door "Schat het voor me" ingevuld (ADR 0131); zie
   * `FreedomRateSource` in lib/format.ts voor waarom dat een eigen woord krijgt.
   */
  source: FreedomRateSource
}

type ExpenseRow = { amount: number | string; date: string }

/**
 * Pure variant: bereken het canonieke dagtarief uit reeds-opgehaalde
 * uitgaven-rijen (amount < 0) over het rolling-venster dat op `referenceDate`
 * eindigt. Gebruik deze wanneer een oppervlak de rijen tóch al fetcht
 * (rapport-routes, dashboard-loader) — zo delen we de formule zonder extra query.
 *
 * ── Geloofwaardigheidsvloer BIJ DE PRODUCENT (UR2-03, ADR 0126) ─────────────
 * Een maandgrondslag onder `CREDIBLE_MONTHLY_BASIS_MIN` (€100/mnd, lib/format.ts)
 * telt hier als "geen rijen": de uitkomst valt door naar de schatting-tak
 * (`source: 'estimate'`) en zonder schatting naar `source: 'none'`. Dat is exact
 * de al gedocumenteerde intentie van `credibleMonthlyBasis` ("0 is bewust
 * dezelfde uitkomst als geen data"), alleen op ÉÉN plek in plaats van bij elke
 * consument. De consumptie-grondslag maakt dit noodzakelijk: een account met
 * vooral overboekingen en één ongecategoriseerde bankkostenpost van €2/mnd
 * kreeg vroeger een opgeblazen maar plausibel tarief, en zou ná de zuivering
 * een piepklein-maar-niet-nul tarief houden — waarmee €10.000 spaargeld als
 * "414 jaar vrijheid" leest op elk oppervlak dat alleen op `source ===
 * 'transactions'` of `dailyRate > 0` toetst. Dezelfde vloer geldt voor de
 * schatting zelf: een profielinschatting van €50/mnd is even ongeloofwaardig.
 *
 * @param rows - Transactie-rijen met negatieve `amount` over het venster.
 * @param referenceDate - Einddatum van het venster (bepaalt dataMonths).
 * @param fallbackMonthlyExpenses - Optionele maand-schatting; alléén gebruikt
 *   wanneer er GEEN geloofwaardige transactiebasis is (geen rijen, of een
 *   grondslag onder de vloer — bv. onboarding zonder transacties), zodat een
 *   schatting-only gebruiker niet plots "0 vrijheid" ziet.
 */
export function recentDailyExpenseRateFromRows(
  rows: ExpenseRow[],
  referenceDate: Date,
  fallbackMonthlyExpenses = 0,
  /**
   * WIENS bedrag de terugval is. `'profile'` (default) = de gebruiker gaf het
   * op; `'cohort'` = de app raadde het ("Schat het voor me",
   * `profiles.expenses_source === 'estimate'`, ADR 0131). Alleen de
   * terugval-tak leest dit — met een geloofwaardige transactiebasis is de
   * herkomst van het profielbedrag betekenisloos.
   */
  fallbackSource: 'profile' | 'cohort' = 'profile',
): RecentDailyExpenseRate {
  if (rows.length > 0) {
    const totalExpenses = rows.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0)
    const times = rows
      .map((tx) => new Date(tx.date).getTime())
      .filter((t) => Number.isFinite(t))
    const earliest = times.length > 0 ? new Date(Math.min(...times)) : referenceDate
    let dataMonths = Math.max(
      1,
      (referenceDate.getFullYear() - earliest.getFullYear()) * 12 +
        (referenceDate.getMonth() - earliest.getMonth()) +
        1,
    )
    dataMonths = Math.min(dataMonths, EXPENSE_RATE_ROLLING_MONTHS)
    // Vloer: onder CREDIBLE_MONTHLY_BASIS_MIN geeft `credibleMonthlyBasis` 0 en
    // valt de transactiebasis weg — door naar schatting of 'none' (zie kop).
    const monthlyExpenses = credibleMonthlyBasis(totalExpenses / dataMonths)
    if (monthlyExpenses > 0) {
      return {
        dailyRate: dailyExpenseRate(monthlyExpenses),
        monthlyExpenses,
        dataMonths,
        source: 'transactions',
      }
    }
  }
  const estimate = credibleMonthlyBasis(fallbackMonthlyExpenses)
  if (estimate > 0) {
    return {
      dailyRate: dailyExpenseRate(estimate),
      monthlyExpenses: estimate,
      dataMonths: 0,
      source: fallbackSource === 'cohort' ? 'cohort' : 'estimate',
    }
  }
  return { dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none' }
}

/**
 * De budget-ids die NIET als consumptie tellen: elk budget waarvan het (geërfde)
 * type in `EXCLUDED_BUDGET_TYPES` zit. `budgetTypes` is de canonieke type-map uit
 * `buildBudgetTypeMap` (lib/budget-utils.ts) — child erft parent — zodat een
 * "Hypotheek"-kind onder "Eigen rekening" (archive) óók buiten de consumptie valt.
 */
function nonConsumptionBudgetIds(budgetTypes: Map<string, string>): Set<string> {
  const out = new Set<string>()
  for (const [id, type] of budgetTypes) {
    if (EXCLUDED_BUDGET_TYPES.includes(type)) out.add(id)
  }
  return out
}

/**
 * DE canonieke dagtarief-grondslag: de synthetische uitgaven-rijen (één per
 * maand × budget × type, `amount < 0`) die als CONSUMPTIE tellen — zie de
 * kop van dit bestand voor de definitie (ADR 0126 D2).
 *
 * Elk oppervlak dat `recentDailyExpenseRateFromRows` voedt vanuit het 12-maands
 * maandaggregaat (dashboard-, core-, cashflow-, horizon- en grenzenpot-loader,
 * plus `fetchExpenseRowsForRate` hieronder) roept DEZE functie aan. Nooit een
 * eigen `aggToExpenseRows(txAgg, { … })` met losse opties: dat is een tweede
 * grondslag, en twee grondslagen geven hetzelfde bedrag twee vrijheidstijden.
 *
 * @param txAgg - Aggregaatrijen over het rolling-venster (`getTxAgg12m` of
 *   `fetchTxMonthAggregate` met het canonieke venster).
 * @param budgetTypes - `buildBudgetTypeMap(budgets)` over de VOLLEDIGE
 *   budgetlijst (ongefilterd, ook gearchiveerde/gemergde rijen): een transactie
 *   op een archiefbudget moet zijn type behouden om buiten de consumptie te vallen.
 */
export function consumptionExpenseRows(
  txAgg: TxMonthAggregateRow[],
  budgetTypes: Map<string, string>,
): { amount: number; date: string }[] {
  return aggToExpenseRows(txAgg, {
    realOnly: true,
    excludeBudgetIds: nonConsumptionBudgetIds(budgetTypes),
  })
}

/**
 * Haal de uitgaven-rijen voor het rolling-venster op — VIA HET MAANDAGGREGAAT,
 * gezuiverd tot consumptie via `consumptionExpenseRows`.
 *
 * ── Waarom niet meer rauw (L10) ─────────────────────────────────────────────
 * De vorige implementatie deed `.from('transactions').select('amount, date')`
 * zonder `.order()` en zonder paginering. PostgREST kapt zo'n antwoord STIL af op
 * `max_rows` (supabase/config.toml = 1000) — óók zonder expliciete `.limit()`.
 * Boven de 1000 negatieve transacties in het venster kreeg deze functie dus een
 * willekeurige deelverzameling: zowel `totalExpenses` als de vroegste maand
 * (`dataMonths`) schoven mee, en het dagtarief LOOG omhoog. Dat is exact het
 * bugpatroon dat `lib/server-data/tx-aggregates.parity.test.ts` al bewijst voor
 * de spaarquote — en de reden dat /rapportages/balans €165/dag toonde naast
 * €106/dag op /overzicht/budget (bevinding L10): cashflow liep al wél via het
 * aggregaat, de rapport-routes nog niet.
 *
 * Het aggregaat (`public.tx_month_aggregate`) levert per definitie enkele rijen
 * (één per maand × budget × type) en kan dus niet afkappen. `consumptionExpenseRows`
 * bouwt daar synthetische maand-rijen van; `recentDailyExpenseRateFromRows`
 * gebruikt alleen het totaal én de vroegste maand, dus de uitkomst is voor een
 * niet-afgekapte verzameling byte-identiek aan een rij-voor-rij reductie op
 * dezelfde consumptie-definitie (bewezen in de parity-test hierboven).
 *
 * De budgettypes komen via de gedeelde, `cache()`-gewrapte `getBudgets`
 * (lib/server-data/base.ts): binnen een request waar een loader die rijen al
 * heeft kost dat nul extra queries, en het is een tabel van enkele tientallen
 * rijen — geen rij-fetch die op `max_rows` kan afkappen.
 *
 * ── Venster: maandkorrel, en waarom dat de canonieke keuze is ───────────────
 * Het aggregaat kent alleen hele kalendermaanden. Het venster is daarom
 * `[maandstart 11 mnd terug, maandeinde van referenceDate)` — waar de rauwe query
 * exact op `referenceDate` afkapte. Voor de lopende maand is dat precies wat
 * `lib/dashboard-data-loader.ts`, `lib/cashflow-kpis.ts`, `lib/core-data-loader.ts`
 * en de horizon-loader al hanteren; die grondslag is dus de norm, niet de
 * afwijking. Voor een HISTORISCHE peildatum (rapport-routes met `?date=`) telt de
 * rest van die kalendermaand mee — bewust geaccepteerd: één grondslag app-breed
 * weegt zwaarder dan een dag-precieze afkap op één rapport, en de afwijking is
 * begrensd tot hooguit één deelmaand van de twaalf.
 *
 * Valt de peildatum in de HUIDIGE kalendermaand, dan is het venster identiek aan
 * dat van `getTxAgg12m` en delen we diens `cache()`-entry — dan draait er binnen
 * één request één RPC voor dashboard-, core-, horizon- én deze consumers samen.
 */
export async function fetchExpenseRowsForRate(
  supabase: SupabaseClient,
  referenceDate: Date = new Date(),
): Promise<{ amount: number; date: string }[]> {
  const now = new Date()
  const sameMonthAsNow =
    referenceDate.getFullYear() === now.getFullYear() &&
    referenceDate.getMonth() === now.getMonth()

  const [aggResult, budgetsResult] = await Promise.all([
    sameMonthAsNow
      ? getTxAgg12m(supabase)
      : fetchTxMonthAggregate(supabase, {
          from: localMonthStartMonthsAgo(referenceDate, EXPENSE_RATE_ROLLING_MONTHS - 1),
          // `to` is EXCLUSIEF in de RPC → de 1e van de volgende maand.
          to: localMonthBounds(referenceDate).end,
        }),
    getBudgets(supabase),
  ])

  // FOUTEN NIET SLIKKEN. Zonder budgettypes zou `data ?? []` een LEGE type-map
  // geven en telt alles behalve transfers weer mee — precies de oude, ~2,6× te
  // hoge grondslag, stil en zonder log. Een mislukte budgets-fetch is daarom
  // "geen data" (lege rijen → schatting of 'none' via de vloer in
  // `recentDailyExpenseRateFromRows`), nooit "alles is consumptie". Het
  // aggregaat-pad viel al op "geen data" terug; alleen de log ontbrak. Spiegelt
  // lib/spend-limits/loader.ts, dat zijn aggregaat-fout wél logt.
  if (aggResult.error) {
    console.error('[expense-rate] 12-maands aggregaat mislukt — dagtarief valt terug op de schatting', aggResult.error)
  }
  if (budgetsResult.error) {
    console.error('[expense-rate] budgets-fetch mislukt — geen budgettypes, dagtarief valt terug op de schatting', budgetsResult.error)
    return []
  }

  // Dezelfde consumptie-grondslag als `DashboardData.dailyExpenseRate` en de
  // loaders (dashboard/core/cashflow/horizon/grenzenpot): één functie, één
  // definitie. `budget_type` heeft in de DB default 'expense'; de `?? 'expense'`
  // hieronder spiegelt de type-map-bron van lib/core-data-loader.ts.
  const budgetTypes = buildBudgetTypeMap(
    ((budgetsResult.data ?? []) as { id: string; parent_id: string | null; budget_type: string | null }[]).map(
      (b): BudgetTypeRow => ({
        id: b.id,
        parent_id: b.parent_id ?? null,
        budget_type: b.budget_type ?? 'expense',
      }),
    ),
  )
  return consumptionExpenseRows(aggResult.data ?? [], budgetTypes)
}

/**
 * Server-variant: haal het canonieke rolling-venster op (via het maandaggregaat,
 * zie `fetchExpenseRowsForRate`) en bereken het dagtarief. Gebruik deze wanneer
 * een oppervlak nog geen uitgaven-rijen heeft opgehaald (client via
 * `/api/daily-expense-rate`, bezittingen-loader, cashflow-rapport).
 */
export async function getRecentDailyExpenseRate(
  supabase: SupabaseClient,
  referenceDate: Date = new Date(),
  fallbackMonthlyExpenses = 0,
  /** Zie `recentDailyExpenseRateFromRows`: herkomst van het terugval-bedrag. */
  fallbackSource: 'profile' | 'cohort' = 'profile',
): Promise<RecentDailyExpenseRate> {
  const rows = await fetchExpenseRowsForRate(supabase, referenceDate)
  return recentDailyExpenseRateFromRows(rows, referenceDate, fallbackMonthlyExpenses, fallbackSource)
}
