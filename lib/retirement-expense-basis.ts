// lib/retirement-expense-basis.ts
//
// GEDEELDE HELPER — pensioenuitgave-basis (inkomens-extrapolatie + methode-afleiding)
// ───────────────────────────────────────────────────────────────────────────
// ÉNE bron voor "jaarinkomen op de transactiegrondslag → jaarlijkse
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
// SINDS ADR 0138 (historiebasis, 11 sep 2026) komt het transactie-jaarinkomen
// op de SERVER uit `transactionAnnualIncome(realized)` (lib/budget-realized.ts):
// de positieve som over twaalf AFGESLOTEN maanden, geschaald met dezelfde
// `historyMonths` als de budgetposten. De caller levert dat jaarinkomen hier
// kant-en-klaar aan (`transactionAnnualIncome`); deze module doet alleen nog de
// methode-afleiding. `extrapolateAnnualIncome` blijft bestaan als de
// CLIENT-TERUGVAL (horizon-client zonder bundel): dezelfde schaalformule
// (`annualizeHistorySum`), met de all-time vroegste inkomstendatum als
// deler-anker omdat de client het realisatievenster niet heeft.
//
// Grondslag van de horizon-som: transfer-INCLUSIEF (`includeTransfers: true`) —
// bewust NIET gelijkgetrokken met de transfer-exclusieve spaarquote/gezondheids-
// grondslag. Zie lib/horizon/raw-data-loader.ts voor de volledige motivatie.

import { computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { annualizeHistorySum, clampHistoryMonths, closedMonthsSince } from '@/lib/history-basis'

/**
 * Annualiseer een positieve inkomenssom over AFGESLOTEN maanden met de
 * ALL-TIME vroegste inkomstendatum als deler-anker — de CLIENT-TERUGVAL
 * (ADR 0138). De server gebruikt `transactionAnnualIncome` op het
 * realisatievenster; die kent de gebruiker-brede deler. Dit pad deelt de
 * schaalformule (`annualizeHistorySum`) en telt zijn maanden met dezelfde
 * `closedMonthsSince`, zodat het hoogstens in het deler-anker kan afwijken
 * (vroegste INKOMSTEN-datum, all-time) en nooit in de formule.
 *
 * De all-time datum (i.p.v. een 12-maands-slice) voorkomt over-extrapolatie bij
 * >1000 positieve rijen die stil afkapten (ADR-0050).
 *
 * Retourneert `closedIncome` ongewijzigd wanneer er geen datum-anker is (dan
 * is er niets te schalen); 0 wanneer er geen inkomen is.
 */
export function extrapolateAnnualIncome(
  closedIncome: number,
  earliestIncomeDate: string | Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!(closedIncome > 0) || !earliestIncomeDate) return closedIncome
  const months = clampHistoryMonths(closedMonthsSince(now, earliestIncomeDate))
  return annualizeHistorySum(closedIncome, months)
}

export interface RetirementExpenseBasisParams {
  /** Gekozen methode (essential_budgets / current_income / custom_amount). */
  method: RetirementExpenseMethod | null | undefined
  /** Jaarlijkse essentiële uitgaven (computeYearlyMustExpenses). */
  yearlyMustExpenses: number
  /**
   * Het jaarinkomen op de TRANSACTIEgrondslag, al geschaald naar een jaar:
   * server → `transactionAnnualIncome(realized, …)` (lib/budget-realized.ts);
   * client-terugval → `extrapolateAnnualIncome(...)`. Deze module rekent er
   * niet zelf aan — één schaalformule, één home (ADR 0138).
   */
  transactionAnnualIncome: number
  /** Handmatig bedrag (methode custom_amount). */
  customAmount?: number | null
  /** Fallback-jaaruitgaven (profiel-schatting × 12) wanneer de methode geen geldige waarde geeft. */
  estimatedYearlyExpenses?: number
  /**
   * Het EFFECTIEVE jaarinkomen op de gekozen grondslag (ADR 0103), uit
   * `resolveAmountWithBasis`. Is dit meegegeven én > 0, dan is DÍT de
   * inkomensgrondslag voor methode `current_income` — bij die methode ís het
   * jaarinkomen de pensioenuitgave en dus het FIRE-doel, dus een budget- of
   * handmatige grondslag hoort hier door te werken.
   *
   * WEGLATEN (of ≤ 0) → het transactie-jaarinkomen blijft de grondslag,
   * byte-identiek aan het gedrag van vóór dat besluit. Bewust optioneel: één van
   * de drie call-sites (components/app/horizon/horizon-client.tsx) kent de
   * grondslag in zijn terugvalpad niet en mag daar niet stil van verschuiven.
   */
  effectiveAnnualIncome?: number | null
}

export interface RetirementExpenseBasis {
  /**
   * Het inkomen dat methode `current_income` voedt: het effectieve jaarinkomen op
   * de gekozen grondslag wanneer de caller die meegeeft, anders het
   * transactie-jaarinkomen.
   */
  extrapolatedIncome: number
  /** Het RÚWE transactie-jaarinkomen, altijd — los van de gekozen grondslag. */
  transactionAnnualIncome: number
  /** Jaarlijkse pensioenuitgave volgens de gekozen methode. */
  yearlyRetirementExpenses: number
}

/**
 * Leidt in één stap zowel het jaarinkomen dat `current_income` voedt als de
 * jaarlijkse pensioenuitgave (via de gekozen methode) af. Dé single source voor
 * de drie call-sites die deze FIRE-kerninput consumeren.
 */
export function deriveRetirementExpenseBasis(
  params: RetirementExpenseBasisParams,
): RetirementExpenseBasis {
  const transactionAnnualIncome = Number.isFinite(params.transactionAnnualIncome)
    ? Math.max(0, params.transactionAnnualIncome)
    : 0
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
