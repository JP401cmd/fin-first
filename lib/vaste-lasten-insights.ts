// lib/vaste-lasten-insights.ts
//
// Pure, serialiseerbare inzichten-motor voor het Vaste-lasten-scherm
// (/overzicht/budget/vaste-lasten). Zet de gedeelde vaste-lasten-samenvatting
// (`VasteLastenSummary`) + inkomen/uitgaven uit `DashboardData` om naar één
// model dat de client-componenten renderen.
//
// CONSUME, DON'T RECOMPUTE (harde huisregel):
//   - aandeel% + status  → `vasteLastenRatio` + `vasteLastenCardStatus` (lib/cashflow-cards.ts)
//   - meter-zones        → `VASTE_LASTEN_GOOD_MAX` / `VASTE_LASTEN_WARN_MAX`
//   - vrijheidstijd      → `dailyExpenseRate` → `calculateFreedomTime` (lib/format)
//   - werktijd           → `dailyIncomeRate` → `calculateWorkTime` (lib/work-time, ADR 0105)
//   - benchmark-getal    → `SUBSCRIPTION_BENCHMARK` (redactioneel, lib/vaste-lasten-benchmarks)
//
// TWEE TIJD-GROOTHEDEN, NOOIT DOOR ELKAAR (ADR 0105):
//   · VRIJHEIDSTIJD  — bedrag / uitgaven-dagtarief = "hoeveel dagen leven koopt dit".
//   · WERKTIJD       — jaarbedrag / bruto inkomen-dagtarief = "welk deel van mijn
//     werkjaar gaat hier naartoe". Alleen dít getal mag "die je werkt om te
//     betalen"-taal dragen, en alleen dít getal is optelbaar tot twaalf maanden.
// Er wordt hier geen eigen som van een kerngetal gemaakt; alleen samenstellen,
// groeperen en delta's t.o.v. de geciteerde benchmark.

import type { VasteLastenSummary, VasteLastenItem } from '@/lib/vaste-lasten-summary'
import {
  vasteLastenCardStatus,
  vasteLastenRatio,
  VASTE_LASTEN_GOOD_MAX,
  VASTE_LASTEN_WARN_MAX,
} from '@/lib/cashflow-cards'
import type { LeverageStatus } from '@/lib/leverage-status'
import {
  calculateFreedomTime,
  roundCents,
  type FreedomTimeBreakdown,
} from '@/lib/format'
import { calculateWorkTime, EMPTY_WORK_TIME, type WorkTimeBreakdown } from '@/lib/work-time'
import {
  CATEGORY_LABELS,
  type RecurringCategory,
} from '@/lib/recurring-detection'
import { SUBSCRIPTION_BENCHMARK } from '@/lib/vaste-lasten-benchmarks'

export interface CategoryComposition {
  category: RecurringCategory
  label: string
  monthlyAmount: number
  /** Aandeel van het totaal vaste lasten (0-1). */
  share: number
}

export interface VasteLastenInsights {
  hasData: boolean
  count: number
  subscriptionCount: number
  vasteKostenCount: number

  totalMonthly: number
  totalYearly: number
  subscriptionsMonthly: number
  subscriptionsYearly: number
  vasteKostenMonthly: number
  vasteKostenYearly: number

  monthlyIncome: number
  /**
   * CANONIEK dagtarief (€/dag, 12-mnd rolling) — doorgegeven aan `cancelEffect`
   * voor de "wat als ik opzeg"-interactie, zodat die exact dezelfde noemer
   * gebruikt als de vrijheidstijd-regels op deze pagina. Verving het vroegere
   * `monthlyExpenses`-veld (effective grondslag), dat de client dwong zelf een
   * dagtarief te maken.
   */
  dailyExpenseRate: number
  /** Aandeel van vaste lasten in het maandinkomen (0-1), of null zonder inkomen. */
  ratioOfIncome: number | null
  /** Afgerond aandeel-percentage (0-100), of null zonder inkomen. */
  ratioPct: number | null
  status: LeverageStatus

  /** Meter-zones — gelijk aan de statusdrempels. */
  meterGoodMax: number
  meterWarnMax: number
  /** Voor de meter-vulling geclampte fractie (0-1, gecapt op 1 = "over de rand"). */
  meterValue: number | null

  /** Vrijheidstijd die je vaste lasten je per maand/jaar kosten. */
  freedomPerMonth: FreedomTimeBreakdown
  freedomPerYear: FreedomTimeBreakdown
  /** Afgeronde vrijheidsdagen per maand (voor het onderschrift). */
  freedomDaysPerMonth: number

  /**
   * WERKTIJD (ADR 0105): welk deel van het WERKJAAR de vaste lasten opeisen —
   * jaarbedrag gedeeld door het bruto dagelijks inkomen. Een ANDERE grootheid dan
   * `freedomPerYear` hierboven (dat deelt op de uitgaven) en de enige die de
   * "die je werkt om te betalen"-formulering mag dragen. `hasBasis: false` →
   * bruto jaarinkomen onbekend, het scherm laat de werktijd-zin dan weg.
   */
  workTimePerYear: WorkTimeBreakdown
  /** Het bruto dagtarief waarop `workTimePerYear` staat (€/dag, 0 = geen basis). */
  dailyIncomeRate: number

  /** Benchmark-duiding voor abonnementen (redactioneel geciteerd getal). */
  subscriptionBenchmarkMonthly: number
  /** jouw abonnementen − benchmark (€/mnd). Positief = boven gemiddeld. */
  subscriptionDeltaMonthly: number
  aboveSubscriptionBenchmark: boolean

  /**
   * TERUGKEREND, MAAR VARIABEL (H14 fase 1) — posten die terugkomen maar waarvan
   * het bedrag een keuze is (boodschappen, tanken, horeca, winkelen). Staan
   * BUITEN `totalMonthly`, de quote, de status en de samenstelling: ze zijn geen
   * vaste last. Wél doorgegeven zodat het scherm ze kan tónen — zie
   * `isTerugkerendVariabel` in lib/vaste-lasten-summary.ts: onzichtbaar weglaten
   * maakt een verkeerde indeling oncorrigeerbaar.
   */
  variabelMonthly: number
  variabelCount: number
  /** De variabele posten, aflopend op maandbedrag (gecapt op 6 voor de lijst). */
  variabelItems: { id: string; name: string; monthlyAmount: number }[]

  /**
   * TOP-5 GROOTSTE POSTEN (S2) — abonnementen én overige vaste kosten door
   * elkaar, aflopend op maandbedrag, gecapt op 5. Dit is een SORT + SLICE over
   * de al afgeleide items: exact dezelfde klasse als `largestOf()` en
   * `buildComposition()` hierboven, géén nieuw rekenpad en geen tweede
   * grondslag. `terugkerendVariabel` blijft er bewust BUITEN — die posten staan
   * ook buiten `totalMonthly`, de quote en de status (H14), dus ze horen niet in
   * een lijst die "je grootste vaste lasten" heet.
   */
  topItems: {
    id: string
    name: string
    monthlyAmount: number
    category: RecurringCategory
    categoryLabel: string
  }[]

  /** Samenstelling per categorie, aflopend op maandbedrag. */
  composition: CategoryComposition[]
  /** Grootste losse post (naam + bedrag) — bruikbaar als opzeg-suggestie. */
  largestItem: { id: string; name: string; monthlyAmount: number; category: RecurringCategory } | null
  /** Grootste abonnement specifiek (voor het sluipverbruik-blok). */
  largestSubscription: { id: string; name: string; monthlyAmount: number } | null
}

const EMPTY_FREEDOM: FreedomTimeBreakdown = {
  years: 0,
  months: 0,
  days: 0,
  totalDays: 0,
  isDeficit: false,
  isInfinite: false,
}

function buildComposition(items: VasteLastenItem[], total: number): CategoryComposition[] {
  const byCategory = new Map<RecurringCategory, number>()
  for (const item of items) {
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.monthlyAmount)
  }
  const rows: CategoryComposition[] = []
  for (const [category, monthlyAmount] of byCategory) {
    rows.push({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      monthlyAmount: roundCents(monthlyAmount),
      share: total > 0 ? monthlyAmount / total : 0,
    })
  }
  return rows.sort((a, b) => b.monthlyAmount - a.monthlyAmount)
}

function largestOf(
  items: VasteLastenItem[],
): { id: string; name: string; monthlyAmount: number; category: RecurringCategory } | null {
  let best: VasteLastenItem | null = null
  for (const item of items) {
    if (!best || item.monthlyAmount > best.monthlyAmount) best = item
  }
  return best
    ? { id: best.id, name: best.name, monthlyAmount: roundCents(best.monthlyAmount), category: best.category }
    : null
}

/**
 * Effect van het opzeggen van een maandelijkse post: jaarbedrag +
 * vrijheidstijd. Pure helper zodat de "wat als ik opzeg"-interactie in de UI
 * exact dezelfde grondslag deelt als de rest van het scherm.
 *
 * `dailyRate` is het AL-BEREKENDE canonieke dagtarief (€/dag), niet een
 * maandbedrag: deze functie mag de grondslag niet meer kiezen. Was
 * `cancelEffect(monthlyAmount, monthlyExpenses)` met een interne
 * `dailyExpenseRate(monthlyExpenses)` — waardoor de aanroeper er ongemerkt de
 * EFFECTIVE maanduitgaven in kon schuiven (vervolg KRUIS-20). Geef
 * `insights.dailyExpenseRate` door.
 */
export function cancelEffect(
  monthlyAmount: number,
  dailyRate: number,
): { yearlyEuro: number; freedom: FreedomTimeBreakdown } {
  const yearlyEuro = roundCents(Math.max(0, monthlyAmount) * 12)
  const freedom = calculateFreedomTime(yearlyEuro, dailyRate)
  return { yearlyEuro, freedom }
}

/**
 * @param monthlyIncome - EFFECTIVE maandinkomen: de noemer van het structurele
 *   aandeel ("hoeveel van mijn inkomen ligt vast?"). Bewust effective (ADR 0073).
 * @param dailyExpenseRate - CANONIEK dagtarief (€/dag) uit de 12-mnd rolling
 *   bron (`CashflowCardScalars.dailyExpenseRate` / `DashboardData.dailyExpenseRate`).
 *   Bewust een KANT-EN-KLAAR tarief i.p.v. `monthlyExpenses`: deze motor koos
 *   voorheen zelf `dailyExpenseRate(monthlyExpenses)` op de effective grondslag,
 *   waardoor dezelfde vaste last hier een ander aantal vrijheidsdagen kostte dan
 *   in de widgets (vervolg KRUIS-20). 0 → geen vrijheidstijd, geen benadering.
 * @param dailyIncomeRate - CANONIEK bruto dagtarief (€/dag) uit `lib/income-rate.ts`
 *   (`getCanonicalDailyIncomeRate` → `resolveBox1GrossIncome`, ADR 0086/0105) —
 *   de noemer van de WERKTIJD-claim. Bewust een KANT-EN-KLAAR tarief én bewust
 *   een ANDER tarief dan `dailyExpenseRate`: werktijd deelt op het inkomen, niet
 *   op de uitgaven. Optioneel/additief: 0 (of weggelaten) → geen werkjaar-basis,
 *   de motor laat de werktijd-regel leeg i.p.v. hem te benaderen.
 */
export function buildVasteLastenInsights(params: {
  summary: VasteLastenSummary
  monthlyIncome: number
  dailyExpenseRate: number
  dailyIncomeRate?: number
}): VasteLastenInsights {
  const {
    summary,
    monthlyIncome,
    dailyExpenseRate: dailyRate,
    dailyIncomeRate: dailyIncome = 0,
  } = params

  const subscriptionsMonthly = roundCents(summary.totalMonthlySubscriptions)
  const vasteKostenMonthly = roundCents(summary.totalMonthlyVasteKosten)
  const totalMonthly = roundCents(summary.totalMonthly)
  const count = summary.count
  const hasData = count > 0

  // Aandeel + status — CONSUME (geen eigen drempels). Zonder vaste lasten of
  // zonder inkomen is er geen betekenisvol aandeel → null (spiegelt de neutrale
  // status en houdt de meter leeg).
  const ratioOfIncome = hasData ? vasteLastenRatio({ totalMonthly, monthlyIncome }) : null
  const status = vasteLastenCardStatus({ totalMonthly, count, monthlyIncome })

  // Vrijheidstijd via het canonieke dagtarief — aangeleverd, niet zelf gerekend.
  const freedomPerMonth =
    hasData && dailyRate > 0 ? calculateFreedomTime(totalMonthly, dailyRate) : EMPTY_FREEDOM
  const freedomPerYear =
    hasData && dailyRate > 0 ? calculateFreedomTime(totalMonthly * 12, dailyRate) : EMPTY_FREEDOM

  // Werktijd via het canonieke bruto dagtarief — aangeleverd, niet zelf gerekend.
  // SCHAAL: `calculateWorkTime` wil een JAARbedrag, vandaar ×12 (spiegelt
  // `freedomPerYear` hierboven).
  const workTimePerYear =
    hasData && dailyIncome > 0 ? calculateWorkTime(totalMonthly * 12, dailyIncome) : EMPTY_WORK_TIME

  // Benchmark-delta (geciteerd getal, redactioneel).
  const subscriptionBenchmarkMonthly = SUBSCRIPTION_BENCHMARK.avgMonthlyPerPerson
  const subscriptionDeltaMonthly = roundCents(subscriptionsMonthly - subscriptionBenchmarkMonthly)

  const composition = buildComposition(
    [...summary.subscriptions, ...summary.vasteKosten],
    totalMonthly,
  )

  const largestSub = largestOf(summary.subscriptions)

  // Top-5 — sort + slice over de al afgeleide posten (zie `topItems` hierboven).
  const topItems = [...summary.subscriptions, ...summary.vasteKosten]
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
    .slice(0, 5)
    .map((i) => ({
      id: i.id,
      name: i.name,
      monthlyAmount: roundCents(i.monthlyAmount),
      category: i.category,
      categoryLabel: i.categoryLabel,
    }))

  // Variabele groep — puur doorgeven/sorteren, geen eigen som van een kerngetal.
  const variabelItems = [...summary.terugkerendVariabel]
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
    .slice(0, 6)
    .map((i) => ({ id: i.id, name: i.name, monthlyAmount: roundCents(i.monthlyAmount) }))

  return {
    hasData,
    count,
    subscriptionCount: summary.subscriptions.length,
    vasteKostenCount: summary.vasteKosten.length,

    totalMonthly,
    totalYearly: roundCents(totalMonthly * 12),
    subscriptionsMonthly,
    subscriptionsYearly: roundCents(subscriptionsMonthly * 12),
    vasteKostenMonthly,
    vasteKostenYearly: roundCents(vasteKostenMonthly * 12),

    monthlyIncome,
    dailyExpenseRate: dailyRate,
    ratioOfIncome,
    ratioPct: ratioOfIncome != null ? Math.round(ratioOfIncome * 100) : null,
    status,

    meterGoodMax: VASTE_LASTEN_GOOD_MAX,
    meterWarnMax: VASTE_LASTEN_WARN_MAX,
    meterValue: ratioOfIncome != null ? Math.min(1, Math.max(0, ratioOfIncome)) : null,

    freedomPerMonth,
    freedomPerYear,
    freedomDaysPerMonth: Math.round(freedomPerMonth.totalDays),

    workTimePerYear,
    dailyIncomeRate: dailyIncome,

    subscriptionBenchmarkMonthly,
    subscriptionDeltaMonthly,
    aboveSubscriptionBenchmark: subscriptionsMonthly > subscriptionBenchmarkMonthly,

    variabelMonthly: roundCents(summary.totalMonthlyVariabel),
    variabelCount: summary.terugkerendVariabel.length,
    variabelItems,

    topItems,
    composition,
    largestItem: largestOf([...summary.subscriptions, ...summary.vasteKosten]),
    largestSubscription: largestSub
      ? { id: largestSub.id, name: largestSub.name, monthlyAmount: largestSub.monthlyAmount }
      : null,
  }
}
