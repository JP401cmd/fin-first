// lib/retirement-expense-basis.ts
//
// GEDEELDE HELPER — pensioenuitgave-basis (inkomens-extrapolatie + methode-afleiding)
// ───────────────────────────────────────────────────────────────────────────
// ÉNE bron voor "extrapoleer het rollende 12-maands-inkomen → jaarlijkse
// pensioenuitgave (methode current_income)". Voorheen leefde deze afleiding in
// DRIE onafhankelijke kopieën die stilletjes uiteenliepen (WF-TOEK-02-bug2):
//
//   1. lib/horizon-data-loader.ts        (SSR, canoniek — all-time earliest-datum)
//   2. components/app/horizon/horizon-client.tsx::loadData()  (client-refresh)
//   3. app/api/uitgaven-na-pensioen/context/route.ts          (sheet-context)
//
// #2 en #3 ankerden de extrapolatie-deler op de VROEGSTE inkomstendatum BINNEN
// een 12-maands-venster i.p.v. de all-time vroegste datum (zoals #1). Bij <12
// maanden historie leverde dat een afwijkend `incomeMonths` → een ander
// jaarbedrag (waargenomen: €86.950 vs €94.855 vs €38.640 voor dezelfde methode).
// Dit is een directe 'Consume, don't recompute'-schending: drie plekken die
// dezelfde FIRE-kerninput zelf herberekenen.
//
// Deze module bundelt de PURE rekenstap (extrapolatie + computeRetirementExpenses).
// De all-time vroegste inkomstendatum wordt door de caller aangeleverd:
//   • server (SSR-loader, API-route) via de gedeelde, cache()-gewrapte
//     getEarliestIncomeDate() (lib/server-data/base.ts, order(date asc).limit(1));
//   • client (horizon-client) via zijn eigen batched all-time-query.
// Zo blijft de I/O-laag (React cache vs. browser-client) per omgeving passend,
// maar is de rekenkundige afleiding gegarandeerd byte-identiek.
//
// Grondslag: `last12Income` is de som van de POSITIEVE transacties over het
// rollende 12-maands-venster, TRANSFER-INCLUSIEF (realOnly:false) — bewust NIET
// gelijkgetrokken met de transfer-exclusieve spaarquote/gezondheids-grondslag.
// Zie lib/horizon-data-loader.ts (regels rond 572) voor de volledige motivatie.

import { computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'

/**
 * Annualiseer het positieve 12-maands-inkomen met de ALL-TIME vroegste
 * inkomstendatum als deler-anker.
 *
 * Bij minder dan 12 maanden inkomenshistorie wordt de som over het aantal
 * werkelijk gedekte maanden gemiddeld en naar een vol jaar geschaald. De
 * all-time datum (i.p.v. een 12-maands-slice) voorkomt over-extrapolatie bij
 * >1000 positieve rijen die stil afkapten (ADR-0050).
 *
 * Retourneert `last12Income` ongewijzigd wanneer er geen inkomen of geen
 * datum-anker is (dan is er niets te schalen).
 */
export function extrapolateAnnualIncome(
  last12Income: number,
  earliestIncomeDate: string | Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!(last12Income > 0) || !earliestIncomeDate) return last12Income
  const earliest = new Date(earliestIncomeDate)
  const incomeMonths = Math.max(
    1,
    Math.min(
      12,
      (now.getFullYear() - earliest.getFullYear()) * 12 + (now.getMonth() - earliest.getMonth()),
    ),
  )
  return incomeMonths < 12 ? (last12Income / incomeMonths) * 12 : last12Income
}

export interface RetirementExpenseBasisParams {
  /** Gekozen methode (essential_budgets / current_income / custom_amount). */
  method: RetirementExpenseMethod | null | undefined
  /** Jaarlijkse essentiële uitgaven (computeYearlyMustExpenses). */
  yearlyMustExpenses: number
  /** Som van positieve transacties over het rollende 12-maands-venster (transfer-inclusief). */
  last12Income: number
  /** All-time vroegste inkomstendatum (deler-anker voor de extrapolatie). */
  earliestIncomeDate: string | Date | null | undefined
  /** Handmatig bedrag (methode custom_amount). */
  customAmount?: number | null
  /** Fallback-jaaruitgaven (profiel-schatting × 12) wanneer de methode geen geldige waarde geeft. */
  estimatedYearlyExpenses?: number
  /** Referentiemoment voor de maand-diff (default: nu). */
  now?: Date
  /**
   * Het EFFECTIEVE jaarinkomen op de gekozen grondslag (ADR 0103), uit
   * `resolveAmountWithBasis`. Is dit meegegeven én > 0, dan is DÍT de
   * inkomensgrondslag voor methode `current_income` — bij die methode ís het
   * jaarinkomen de pensioenuitgave en dus het FIRE-doel, dus een budget- of
   * handmatige grondslag hoort hier door te werken.
   *
   * WEGLATEN (of ≤ 0) → de transactie-extrapolatie blijft de grondslag,
   * byte-identiek aan het gedrag van vóór dat besluit. Bewust optioneel: één van
   * de drie call-sites (components/app/horizon/horizon-client.tsx) kent de
   * grondslag nog niet en mag daar niet stil van verschuiven.
   */
  effectiveAnnualIncome?: number | null
}

export interface RetirementExpenseBasis {
  /**
   * Het inkomen dat methode `current_income` voedt: het effectieve jaarinkomen op
   * de gekozen grondslag wanneer de caller die meegeeft, anders de
   * transactie-extrapolatie.
   */
  extrapolatedIncome: number
  /** De RÚWE transactie-extrapolatie, altijd — los van de gekozen grondslag. */
  transactionAnnualIncome: number
  /** Jaarlijkse pensioenuitgave volgens de gekozen methode. */
  yearlyRetirementExpenses: number
}

/**
 * Leidt in één stap zowel het geëxtrapoleerde jaarinkomen als de jaarlijkse
 * pensioenuitgave (via de gekozen methode) af. Dé single source voor de drie
 * call-sites die deze FIRE-kerninput consumeren.
 */
export function deriveRetirementExpenseBasis(
  params: RetirementExpenseBasisParams,
): RetirementExpenseBasis {
  const transactionAnnualIncome = extrapolateAnnualIncome(
    params.last12Income,
    params.earliestIncomeDate,
    params.now ?? new Date(),
  )
  // ADR 0103: de gekozen inkomensgrondslag wint wanneer de caller 'm aanlevert.
  // De `> 0`-guard voorkomt dat een leeggemaakt handmatig bedrag de FIRE-keten op
  // een jaarinkomen van €0 zet.
  const resolved = params.effectiveAnnualIncome
  const extrapolatedIncome =
    resolved != null && Number.isFinite(resolved) && resolved > 0 ? resolved : transactionAnnualIncome
  const yearlyRetirementExpenses = computeRetirementExpenses(
    params.method,
    params.yearlyMustExpenses,
    extrapolatedIncome,
    params.customAmount,
    params.estimatedYearlyExpenses,
  )
  return { extrapolatedIncome, transactionAnnualIncome, yearlyRetirementExpenses }
}
