/**
 * Pure projection helpers voor de afbouw-fase (decumulatie).
 *
 * Deze module bundelt de forward withdrawal-schedules en de backward
 * required-portfolio-berekening die door `afbouw-client.tsx` en
 * (later) `overzicht-client.tsx` gebruikt worden.
 *
 * Belangrijk: de **required-curve** (`computeAfbouwRequiredSchedule`)
 * gebruikt INTERN altijd de `static` withdrawal-strategy. Dynamische
 * strategies (guardrails / VPW) veroorzaken circulaire afhankelijkheden
 * omdat ze `startPortfolio` als anker nemen — net zoals productie
 * (`lib/fire-simulation.ts`) doet, wordt de required-berekening hier
 * losgekoppeld van de gekozen withdrawal-strategy voor de visualisatie.
 */

import {
  NL_AOW_AGE,
  NL_AOW_MONTHLY,
  NL_AOW_MONTHLY_SAMENWONEND,
  NL_SWR,
} from '@/lib/constants'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import { projectDebtYearly, computeBox3Tax } from './opbouw-projection'
import { solveRequiredStartPortfolio } from './afbouw-strategies'
import {
  computeTableSchedule,
  type TableEndStrategy,
  type TableWithdrawalStrategy,
} from './afbouw-table-schedules'

// ── Withdrawal-strategy typering (shared met afbouw-client) ─────

export type WithdrawalStrategy = 'swr' | 'guardrails' | 'vpw' | 'bucket'

/**
 * Huishouden-key voor AOW-bepaling. Mapt 1:1 op `hasPartner`:
 *  - `alleenstaand` → NL_AOW_MONTHLY
 *  - `samenwonend`  → NL_AOW_MONTHLY_SAMENWONEND
 */
export type AowHouseholdKey = 'alleenstaand' | 'samenwonend'

function aowYearlyFor(household: AowHouseholdKey): number {
  return (household === 'samenwonend' ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12
}

// ── computeRequiredPortfolio ────────────────────────────────────

/**
 * Compute the minimum portfolio needed to sustain a given withdrawal strategy
 * from startAge to endAge, covering yearlyExpenses (with inflation), minus AOW from 67.
 *
 * Verplaatst uit `afbouw-client.tsx`. Signature onveranderd.
 */
export function computeRequiredPortfolio(
  yearlyExpenses: number,
  startAge: number,
  endAge: number,
  grossReturn: number,
  inflationRate: number,
  strategy: FireEndStrategy,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  withdrawalStrategy: WithdrawalStrategy,
  hasPartner: boolean,
  legacyAmount: number,
): number {
  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12
  const totalYears = Math.max(1, endAge - startAge)

  // For each strategy, compute what initial portfolio is required
  if (strategy === 'perpetual') {
    // SWR: portfolio × SWR ≥ expenses − AOW => portfolio ≥ (expenses − AOW) / SWR
    // For perpetual, required portfolio is expenses / SWR (pre-AOW), reduced after AOW kicks in
    // Simplified: max withdrawal needed / SWR
    const maxNeeded = startAge >= NL_AOW_AGE
      ? Math.max(0, yearlyExpenses - aowYearly)
      : yearlyExpenses
    return maxNeeded / NL_SWR
  }

  if (strategy === 'deplete') {
    // Annuity formula: PV of expenses stream from startAge to endAge
    // accounting for AOW offset from age 67
    if (realReturn === 0) {
      let total = 0
      for (let y = 0; y < totalYears; y++) {
        const age = startAge + y
        const aow = age >= NL_AOW_AGE ? aowYearly : 0
        total += Math.max(0, yearlyExpenses - aow)
      }
      return total
    }
    let pv = 0
    for (let y = 0; y < totalYears; y++) {
      const age = startAge + y
      const aow = age >= NL_AOW_AGE ? aowYearly : 0
      const needed = Math.max(0, yearlyExpenses - aow)
      pv += needed / Math.pow(1 + realReturn, y)
    }
    return pv
  }

  if (strategy === 'legacy') {
    // Like deplete but preserve legacyAmount at endAge
    const pvLegacy = legacyAmount / Math.pow(1 + realReturn, totalYears)
    let pv = pvLegacy
    for (let y = 0; y < totalYears; y++) {
      const age = startAge + y
      const aow = age >= NL_AOW_AGE ? aowYearly : 0
      const needed = Math.max(0, yearlyExpenses - aow)
      pv += needed / Math.pow(1 + realReturn, y === 0 ? 1 : y)
    }
    return pv
  }

  // pensioen: same as perpetual from AOW age
  const maxNeeded = Math.max(0, yearlyExpenses - aowYearly)
  return maxNeeded / NL_SWR
}

// ── computeMonthlyCrossover ─────────────────────────────────────

/** Monthly crossover result */
export interface MonthlyCrossover {
  ageYears: number
  ageMonths: number
  portfolioAtCrossover: number
  requiredPortfolio: number
}

/**
 * Compute crossover on a monthly basis.
 * For each month, compare accumulation portfolio vs required portfolio for chosen strategy.
 *
 * Verplaatst uit `afbouw-client.tsx`. Signature onveranderd.
 */
export function computeMonthlyCrossover(
  currentAge: number,
  currentNetWorth: number,
  annualSavings: number,
  grossReturn: number,
  inflationRate: number,
  yearlyExpenses: number,
  endAge: number,
  strategy: FireEndStrategy,
  withdrawalStrategy: WithdrawalStrategy,
  hasPartner: boolean,
  legacyAmount: number,
  maxAge: number = 100,
): MonthlyCrossover | null {
  const monthlyReturn = Math.pow(1 + grossReturn, 1 / 12) - 1
  const monthlyInflation = Math.pow(1 + inflationRate, 1 / 12) - 1
  const monthlyRealReturn = (1 + monthlyReturn) / (1 + monthlyInflation) - 1
  const monthlySavings = annualSavings / 12
  const totalMonths = (maxAge - currentAge) * 12

  let portfolio = currentNetWorth

  for (let m = 0; m <= totalMonths; m++) {
    const ageYears = currentAge + Math.floor(m / 12)
    const ageMonths = m % 12

    // Compute required portfolio at this age for the chosen end strategy
    const displayEnd = strategy === 'perpetual' || strategy === 'pensioen' ? 100 : endAge
    const requiredPortfolio = computeRequiredPortfolio(
      yearlyExpenses,
      ageYears,
      displayEnd,
      grossReturn,
      inflationRate,
      strategy,
      withdrawalStrategy,
      hasPartner,
      legacyAmount,
    )

    if (portfolio >= requiredPortfolio) {
      return {
        ageYears,
        ageMonths,
        portfolioAtCrossover: Math.round(portfolio),
        requiredPortfolio: Math.round(requiredPortfolio),
      }
    }

    portfolio = portfolio * (1 + monthlyRealReturn) + monthlySavings
  }
  return null
}

// ── computeWithdrawalSchedule ───────────────────────────────────

/** Generate withdrawal schedule (decumulation table). */
export interface WithdrawalRow {
  age: number
  year: number
  startBalance: number
  withdrawal: number
  aowIncome: number
  growth: number
  endBalance: number
}

/** Verplaatst uit `afbouw-client.tsx`. Signature onveranderd. */
export function computeWithdrawalSchedule(
  startPortfolio: number,
  retirementAge: number,
  endAge: number,
  yearlyExpenses: number,
  grossReturn: number,
  inflationRate: number,
  hasPartner: boolean,
  strategy: FireEndStrategy,
  legacyAmount: number,
): WithdrawalRow[] {
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12

  // Determine annual withdrawal amount based on strategy
  let baseWithdrawal: number
  if (strategy === 'perpetual') {
    // SWR-based: withdraw NL_SWR (2.883%) × portfolio (recalculated yearly with inflation correction)
    baseWithdrawal = startPortfolio * NL_SWR
  } else if (strategy === 'deplete') {
    // Annuity formula: withdraw evenly so portfolio hits 0 at endAge
    if (realReturn === 0) {
      baseWithdrawal = startPortfolio / totalYears
    } else {
      baseWithdrawal = startPortfolio * realReturn / (1 - Math.pow(1 + realReturn, -totalYears))
    }
  } else if (strategy === 'legacy') {
    // Annuity that preserves legacyAmount at endAge
    const netPortfolio = startPortfolio - legacyAmount * Math.pow(1 + realReturn, -totalYears)
    if (realReturn === 0) {
      baseWithdrawal = Math.max(0, netPortfolio / totalYears)
    } else {
      baseWithdrawal = Math.max(0, netPortfolio * realReturn / (1 - Math.pow(1 + realReturn, -totalYears)))
    }
  } else {
    // pensioen / default: SWR-based
    baseWithdrawal = startPortfolio * NL_SWR
  }

  const schedule: WithdrawalRow[] = []
  let balance = startPortfolio

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const aow = age >= NL_AOW_AGE ? aowYearly : 0

    // Inflate yearly expenses for this year
    const inflatedExpenses = yearlyExpenses * Math.pow(1 + inflationRate, y)

    // How much do we need from portfolio?
    let neededFromPortfolio: number
    if (strategy === 'perpetual') {
      // Variable: NL_SWR (2.883%) of current balance, capped at inflation-adjusted expenses minus AOW
      neededFromPortfolio = Math.max(0, Math.min(balance * NL_SWR, inflatedExpenses - aow))
    } else {
      neededFromPortfolio = Math.max(0, baseWithdrawal - aow)
    }

    const withdrawal = Math.min(neededFromPortfolio, balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    schedule.push({
      age,
      year: y + 1,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.max(0, Math.round(endBalance)),
    })

    balance = Math.max(0, endBalance)
    if (balance <= 0) break
  }

  return schedule
}

// ── computeInflationExpenseSchedule ─────────────────────────────

/** Generate month-by-month expense schedule with inflation correction. */
export interface InflationExpenseRow {
  month: number
  age: number
  ageMonth: number // month within the year (0-11)
  baseExpense: number
  inflationCorrection: number
  adjustedExpense: number
}

/** Verplaatst uit `afbouw-client.tsx`. Signature onveranderd. */
export function computeInflationExpenseSchedule(
  monthlyExpense: number,
  startAge: number,
  endAge: number,
  yearlyInflation: number,
): InflationExpenseRow[] {
  if (monthlyExpense <= 0 || endAge <= startAge) return []
  const totalMonths = (endAge - startAge) * 12
  const monthlyInflation = Math.pow(1 + yearlyInflation, 1 / 12) - 1
  const rows: InflationExpenseRow[] = []
  let adjusted = monthlyExpense

  for (let m = 0; m < totalMonths; m++) {
    const yearOffset = Math.floor(m / 12)
    const monthInYear = m % 12
    const correction = adjusted - monthlyExpense
    rows.push({
      month: m + 1,
      age: startAge + yearOffset,
      ageMonth: monthInYear,
      baseExpense: Math.round(monthlyExpense * 100) / 100,
      inflationCorrection: Math.round(correction * 100) / 100,
      adjustedExpense: Math.round(adjusted * 100) / 100,
    })
    adjusted = adjusted * (1 + monthlyInflation)
  }
  return rows
}

// ── computeAfbouwRequiredSchedule (NIEUW) ───────────────────────

export interface AfbouwRequiredSchedulePoint {
  age: number
  /** Vereist portfolio op deze leeftijd om de eind-strategie te halen.
   *  `null` betekent "niet gedefinieerd op deze leeftijd" (bv. pensioen
   *  vóór AOW-leeftijd). */
  requiredPortfolio: number | null
}

/**
 * Backward required-curve: vereist portfolio per leeftijd van `currentAge`
 * tot `endAge` (inclusief).
 *
 * Regels (zie plan sectie "Stap 2"):
 *  - **Intern altijd `static` withdrawal** — zie module-header.
 *  - **Perpetual**: `required(age) = max(0, expensesReal − aowReal(age))
 *    × (1 + inflation)^(age − currentAge) / realReturn`. Levert een (bijna
 *    horizontale) koopkracht-behoud-target. `realReturn == 0` geeft
 *    `Infinity` vermijden we — daar valt de formule terug op `NL_SWR`.
 *  - **Pensioen**: `required(age) = null` voor `age < aowAge`; vanaf
 *    `aowAge` normale annuïteit-PV over `(endAge − age)` jaren op basis
 *    van de netto-behoefte na AOW.
 *  - **Legacy**: annuïteit-PV over `(endAge − age)` jaren + geïndexeerd
 *    legacy-bedrag aan het eind (via `computeRequiredPortfolio`).
 *  - **Deplete**: annuïteit-PV over `(endAge − age)` jaren tot nul.
 */
export function computeAfbouwRequiredSchedule(inputs: {
  currentAge: number
  endAge: number
  strategy: FireEndStrategy
  yearlyExpenses: number
  aowHousehold: AowHouseholdKey
  inflation: number
  grossReturn: number
  legacyAmount: number
  aowAge: number
  /**
   * Onttrekkingsstrategie. Default `'swr'` voor backward-compat. Bij
   * guardrails/VPW/bucket wordt per leeftijd binary-search gedaan tegen
   * `simulateScheduleByStrategy` zodat de required-curve daadwerkelijk
   * de gekozen strategie volgt.
   */
  withdrawalStrategy?: WithdrawalStrategy
  /** Cashflows (inclusief AOW) voor niet-SWR strategieën. */
  cashflows?: SimCashflow[]
  /**
   * Per-asset context. Wanneer meegegeven wordt de required-curve per leeftijd
   * berekend met de werkelijke asset-mix uit de opbouw-projectie (i.p.v. een
   * aggregate solver). Zo heeft `withdrawalOrder` wél effect op de kruising.
   *
   * `getAssetWeightsAtAge(age)` moet fractionele weights teruggeven (sum ≈ 1)
   * die de mix op die leeftijd representeren. Retourneert `null` als het
   * startpunt onbekend is → valt terug op aggregate-solver voor die rij.
   */
  perAssetContext?: {
    assets: Asset[]
    debts: Debt[]
    getStartAssetWeights: (age: number) => number[] | null
    getStartDebtValues: (age: number) => number[]
    withdrawalOrder: AfbouwDistributionStrategy
    currentAgeAnchor: number
    cumBox3StartAtAge: (age: number) => number
  }
}): Array<{ age: number; requiredPortfolio: number | null }> {
  const {
    currentAge,
    endAge,
    strategy,
    yearlyExpenses,
    aowHousehold,
    inflation,
    grossReturn,
    legacyAmount,
    aowAge,
    withdrawalStrategy = 'swr',
    cashflows = [],
    perAssetContext,
  } = inputs

  const hasPartner = aowHousehold === 'samenwonend'
  const aowYearly = aowYearlyFor(aowHousehold)
  const realReturn = (1 + grossReturn) / (1 + inflation) - 1

  const out: AfbouwRequiredSchedulePoint[] = []

  // Table-schedule-based solver: gebruik dezelfde `computeTableSchedule`
  // helper als de /afbouw-tabel-componenten. Zo zijn de required-curve
  // getallen consistent met wat de user in de tabellen ziet.
  //
  // Triggering: wanneer `perAssetContext` is meegegeven OR wanneer
  // `withdrawalStrategy !== 'swr'`, want dan wil de caller per-strategie-
  // aware required hebben.
  //
  // Algoritme: per leeftijd binary-search op `startPortfolio` (real-dollar)
  // zodat `computeTableSchedule` een compleet schedule oplevert waarin de
  // eerste-jaar withdrawal+AOW de yearlyExpenses dekt. Converteer naar
  // nominaal-bij-die-leeftijd voor de chart.
  if (perAssetContext || withdrawalStrategy !== 'swr') {
    for (let age = currentAge; age <= endAge; age++) {
      if (strategy === 'pensioen' && age < aowAge) {
        out.push({ age, requiredPortfolio: null })
        continue
      }
      if (age >= endAge) {
        out.push({ age, requiredPortfolio: null })
        continue
      }
      const realRequired = solveRequiredViaTableSchedule({
        retirementAge: age,
        endAge,
        endStrategy: strategy,
        withdrawalStrategy,
        yearlyExpenses,
        grossReturn,
        inflationRate: inflation,
        hasPartner,
        aowAge,
        legacyAmount,
      })
      // Real → nominaal bij `age` (chart toont nominaal).
      const nominal = realRequired * Math.pow(1 + inflation, age - currentAge)
      out.push({ age, requiredPortfolio: Math.round(nominal) })
    }
    return out
  }

  // Analytisch SWR-pad (default voor callers zonder withdrawalStrategy).
  // Deplete/legacy/perpetual/pensioen met SWR-formule — closed-form.
  for (let age = currentAge; age <= endAge; age++) {
    let required: number | null

    if (strategy === 'perpetual') {
      // Koopkracht-behoud: indexeer de netto-behoefte met inflatie vanaf
      // currentAge. AOW komt pas in zodra age >= aowAge.
      const netNeedNow = age >= aowAge
        ? Math.max(0, yearlyExpenses - aowYearly)
        : yearlyExpenses
      const indexed = netNeedNow * Math.pow(1 + inflation, age - currentAge)
      if (realReturn <= 0) {
        // Degenerate geval: val terug op SWR om divisie-door-nul /
        // negatieve-waarden te vermijden.
        required = indexed / NL_SWR
      } else {
        required = indexed / realReturn
      }
    } else if (strategy === 'pensioen') {
      if (age < aowAge) {
        required = null
      } else {
        // Annuïteit-PV over (endAge − age) jaren — static withdrawal.
        // `computeRequiredPortfolio` werkt intern met realReturn en
        // yearlyExpenses-in-huidige-EUR → output is REËEL. We inflateren
        // naar NOMINALE EUR van de betreffende leeftijd zodat
        // `findIntersection` op dezelfde eenheid als de nominale opbouw-
        // curve werkt.
        const realRequired = computeRequiredPortfolio(
          yearlyExpenses,
          age,
          endAge,
          grossReturn,
          inflation,
          'deplete',
          'swr',
          hasPartner,
          0,
        )
        required = realRequired * Math.pow(1 + inflation, age - currentAge)
      }
    } else if (strategy === 'legacy') {
      // Hergebruik: annuïteit-PV + geïndexeerd legacy aan eind.
      // Zie pensioen-branch: output van computeRequiredPortfolio is reëel;
      // we inflateren naar nominaal van `age`.
      const realRequired = computeRequiredPortfolio(
        yearlyExpenses,
        age,
        endAge,
        grossReturn,
        inflation,
        'legacy',
        'swr',
        hasPartner,
        legacyAmount,
      )
      required = realRequired * Math.pow(1 + inflation, age - currentAge)
    } else {
      // deplete — zelfde reëel→nominaal transformatie.
      const realRequired = computeRequiredPortfolio(
        yearlyExpenses,
        age,
        endAge,
        grossReturn,
        inflation,
        'deplete',
        'swr',
        hasPartner,
        0,
      )
      required = realRequired * Math.pow(1 + inflation, age - currentAge)
    }

    out.push({ age, requiredPortfolio: required })
  }

  return out
}

// ── Table-schedule-based required solver ────────────────────────

/**
 * Bepaal required portfolio in **real-dollar** terms door `computeTableSchedule`
 * als bron te gebruiken. Zo is de required-curve consistent met de getallen
 * die op `/horizon/doorrekening-test/afbouw`-tabellen getoond worden.
 *
 * Algoritme: binary-search op `startPortfolio` zodat de resulterende
 * tabel-schedule:
 *   1. Compleet is (rows.length === endAge − retirementAge), portfolio niet
 *      vroegtijdig leeg, EN
 *   2. Eerste-jaar `withdrawal + aowIncome ≥ yearlyExpenses`.
 *
 * Adaptive hi-bound: verdubbel tot een voldoend-groot portfolio het schedule
 * compleet maakt, cap op 1e12 (defensief). Binary search 40 iteraties voor
 * ≤ 1e-12 relatieve precisie.
 *
 * Returns **real-dollar** (koopkracht-equivalent) required portfolio. Caller
 * converteert naar nominaal met `× (1+inflation)^(retirementAge − currentAge)`.
 */
function solveRequiredViaTableSchedule(inputs: {
  retirementAge: number
  endAge: number
  endStrategy: FireEndStrategy
  withdrawalStrategy: WithdrawalStrategy
  yearlyExpenses: number
  grossReturn: number
  inflationRate: number
  hasPartner: boolean
  aowAge: number
  legacyAmount: number
}): number {
  const {
    retirementAge, endAge, endStrategy, withdrawalStrategy,
    yearlyExpenses, grossReturn, inflationRate, hasPartner, aowAge, legacyAmount,
  } = inputs

  const totalYears = endAge - retirementAge
  if (totalYears <= 0) return 0

  // Map FireEndStrategy → TableEndStrategy (ze matchen 1:1 semantisch).
  const tableEndStrat: TableEndStrategy =
    endStrategy === 'deplete' ? 'deplete'
    : endStrategy === 'legacy' ? 'legacy'
    : endStrategy === 'pensioen' ? 'pensioen'
    : 'perpetual'

  const tableWdStrat: TableWithdrawalStrategy = withdrawalStrategy

  const evaluateAt = (startPortfolio: number): boolean => {
    if (startPortfolio <= 0) return false
    const rows = computeTableSchedule(tableEndStrat, tableWdStrat, {
      startPortfolio,
      retirementAge,
      endAge,
      yearlyExpenses,
      grossReturn,
      inflationRate,
      hasPartner,
      aowAge,
      legacyAmount,
    })
    if (rows.length < totalYears) return false
    // Eerste-jaar onttrekking + AOW moet yearlyExpenses dekken (tolerantie €1).
    const firstCoverage = rows[0].withdrawal + rows[0].aowIncome
    return firstCoverage >= yearlyExpenses - 1
  }

  // Adaptive hi-bound. Startpunt: ~yearlyExpenses × totalYears (worst case
  // zonder groei). Verdubbel tot het schedule voldoende is.
  let hi = Math.max(yearlyExpenses * Math.max(totalYears, 30), 1_000_000)
  let attempts = 0
  while (attempts < 30 && !evaluateAt(hi)) {
    hi *= 2
    attempts++
    if (hi > 1e12) return hi  // unreachable
  }
  if (!evaluateAt(hi)) return hi

  // Binary-search minimum startPortfolio waar evaluateAt true is.
  let lo = 0
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (evaluateAt(mid)) {
      hi = mid
    } else {
      lo = mid
    }
  }
  return (lo + hi) / 2
}

// ── Per-asset afbouw-schedule (Fase G2 — hybride doorrekening) ─

/**
 * Distributiestrategie voor het verdelen van een withdrawal over de assets
 * in de decumulatie-fase. Alle varianten honoreren het principe dat een
 * asset niet onder 0 kan zakken — een overflow cascadeert naar het volgende
 * asset in de sortering.
 *
 *  - `proportional`     — elke asset levert in naar value-share
 *  - `cash_first`       — laagste `expected_return` eerst (opgebruikt cash
 *    voor het aan belegde assets toekomt); identiek aan `lowest_return_first`
 *  - `lowest_return_first` — alias van `cash_first`
 */
export type AfbouwDistributionStrategy =
  | 'proportional'
  | 'cash_first'
  | 'lowest_return_first'
  | 'highest_return_first'
  | 'own_home_last'
  | 'highest_value_first'

/**
 * Eén rij van de per-asset decumulatie-tabel. Bevat zowel totalen (assets,
 * debts, netWorth, Box 3) als per-asset/per-debt detail zodat de UI-laag
 * "niet rekent, alleen tekent". Keys zijn waar mogelijk identiek aan
 * `OpbouwProjectionRow` zodat tabellen hetzelfde stramien kunnen volgen.
 */
export interface AfbouwPerAssetRow {
  age: number
  year: number
  phase: 'afbouw'
  /** Totaal assets (gewogen voor `net_worth_inclusion_pct`). */
  assets: number
  /** Totaal schulden (ongewogen). */
  debts: number
  /** `assets − debts − cumulativeBox3Tax`. */
  netWorth: number
  cumulativeBox3Tax: number
  box3TaxThisYear: number
  // Afbouw-specifiek
  startBalance: number
  withdrawal: number
  growth: number
  endBalance: number
  /** Sommatie van alle cashflows (inclusief AOW) dit jaar. */
  cashflowNetThisYear: number
  /** AOW-bijdrage dit jaar, apart voor modal-weergave. */
  aowIncomeThisYear: number
  /** `cashflowNetThisYear − aowIncomeThisYear`. */
  eventCashflowNetThisYear: number
  // Per-asset / per-debt detail
  perAssetValues: number[]
  perAssetWithdrawal: number[]
  perAssetGrowth: number[]
  perDebtValues: number[]
  perDebtInterest: number[]
  perDebtRepayment: number[]
}

/**
 * Inputs voor `computeAfbouwSchedulePerAsset`. Zie moduledoc voor contract.
 */
export interface AfbouwPerAssetInputs {
  /** Beginbalans per asset (aligned met `assets`). Lengte moet gelijk zijn. */
  startAssetValues: number[]
  /** Asset-metadata; verdeel- en groeistrategie gebruiken `expected_return`
   *  en `net_worth_inclusion_pct`. Mag een virtueel `__savings`-asset bevatten. */
  assets: Asset[]
  /** Beginbalans per debt (aligned met `debts`). */
  startDebtValues: number[]
  /** Debt-metadata voor `projectDebtYearly`. */
  debts: Debt[]
  /** Leeftijd waarop afbouw start. */
  retirementAge: number
  /** Laatste leeftijd in het schedule (exclusief — rijen lopen tot `endAge − 1`). */
  endAge: number
  /** Nominale jaarlijkse uitgaven op retirementAge (jaar 0). */
  yearlyExpenses: number
  /** Gewogen portfolio-return (bijv. 0.07). Return wordt **gross** toegepast
   *  op de per-asset balances — inflatie speelt alleen via `yearlyExpenses`. */
  grossReturn: number
  /** Jaarlijkse inflatie (bijv. 0.02) voor indexatie van de uitgaven. */
  inflationRate: number
  /** Eind-strategie die bepaalt hoe `baseWithdrawal` berekend wordt. */
  strategy: FireEndStrategy
  /** Nominaal legacy-bedrag op `endAge` (alleen gebruikt bij `strategy==='legacy'`). */
  legacyAmount: number
  /** Withdrawal-strategy (SWR/guardrails/VPW/bucket) — momenteel alleen
   *  doorgegeven voor toekomstige uitbreiding; implementatie gebruikt een
   *  static-equivalent per strategie-tak. */
  withdrawalStrategy: WithdrawalStrategy
  /** Verdeelmethode voor de withdrawal over de assets. */
  distributionStrategy: AfbouwDistributionStrategy
  /** Cashflow-stream (incl. AOW). Wordt per jaar gesommeerd en verlaagt
   *  `neededFromPortfolio`. */
  cashflows: SimCashflow[]
  /** Partner-vlag voor Box 3 heffingsvrij. */
  hasPartner: boolean
  /** Optioneel: extra AOW-metadata om het cashflow-id-prefix voor AOW te
   *  kunnen herkennen. Wanneer niet gezet wordt de conventie `le-aow-*`
   *  en `le-costchange-<aowEventId>*` uit `lifeEventsToCashflows` gevolgd. */
  aowEventIds?: string[]
  /** Cumulatieve Box 3 op start (uit opbouw-fase). Gebruikt de deplete-
   *  solver om netto-vermogen correct te richten inclusief pre-fire tax. */
  cumBox3Start?: number
  /** currentAge-anker voor cashflow-inflatie. Default = retirementAge. */
  currentAgeAnchor?: number
}

/**
 * Herken of een SimCashflow-id een AOW-bijdrage is. `lifeEventsToCashflows`
 * genereert AOW-flows met id `le-aow-adjusted-<eventId>` of, voor generieke
 * fallback, `le-incomechange-<eventId>`. We matchen op `aowEventIds` (exact
 * voor het event-id) óf op de stabiele prefix `le-aow-`.
 */
function isAowCashflow(cf: SimCashflow, aowEventIds?: string[]): boolean {
  if (cf.id.startsWith('le-aow-')) return true
  if (cf.id === '__aow') return true
  if (aowEventIds && aowEventIds.length > 0) {
    for (const aowId of aowEventIds) {
      if (cf.id.includes(aowId)) return true
    }
  }
  return false
}

/**
 * Sommeer alle SimCashflows voor één jaar `[yearStartAge, yearEndAge)`.
 * Volgt exact dezelfde prorata-logica als `overzicht-client.tsx`: recurring
 * cashflows tellen per overlap-maand, one-time op de `fromAge`-trigger.
 *
 * Returns totaalbedrag (positief = netto inflow) plus AOW-deel apart.
 */
function sumCashflowsForYear(
  cashflows: SimCashflow[],
  yearStartAge: number,
  currentAge: number,
  inflationRate: number,
  aowEventIds?: string[],
): { total: number; aowPart: number } {
  let total = 0
  let aowPart = 0
  const yearEndAge = yearStartAge + 1
  const yearsFromNow = yearStartAge - currentAge

  for (const cf of cashflows) {
    let contribution = 0
    if (cf.type === 'one_time') {
      if (cf.fromAge >= yearStartAge && cf.fromAge < yearEndAge) {
        const yearsFromNowOne = cf.fromAge - currentAge
        const inflationFactor = cf.indexed ? Math.pow(1 + inflationRate, yearsFromNowOne) : 1
        const amount = cf.amount * inflationFactor
        contribution = cf.direction === 'income' ? amount : -amount
      }
    } else {
      const cfEnd = cf.toAge ?? 999
      const overlapStart = Math.max(cf.fromAge, yearStartAge)
      const overlapEnd = Math.min(cfEnd, yearEndAge)
      if (overlapStart < overlapEnd) {
        const months = Math.round((overlapEnd - overlapStart) * 12)
        const inflationFactor = cf.indexed ? Math.pow(1 + inflationRate, yearsFromNow) : 1
        const monthlyAmount = cf.amount * inflationFactor
        const periodAmount = monthlyAmount * months
        contribution = cf.direction === 'income' ? periodAmount : -periodAmount
      }
    }

    total += contribution
    if (isAowCashflow(cf, aowEventIds)) {
      aowPart += contribution
    }
  }

  return { total, aowPart }
}

/**
 * Verdeel een onttrekking (`amount`) over de assets volgens `strategy`.
 * Muteert `values` in-place. Een asset kan nooit negatief worden: de rest
 * cascadeert door naar het volgende asset in de sortering.
 *
 * Retourneert per-asset deltas zodat de caller `perAssetWithdrawal` kan
 * rapporteren. Deltas zijn altijd `>= 0` (withdraw-amount per asset).
 */
function applyAfbouwWithdrawal(
  values: number[],
  assets: Asset[],
  amount: number,
  strategy: AfbouwDistributionStrategy,
): number[] {
  const deltas = new Array<number>(values.length).fill(0)
  if (amount <= 0) return deltas
  let remaining = amount

  if (strategy === 'proportional') {
    // Share naar value-weight; rekening houdend met zero-total edge.
    const total = values.reduce((s, v) => s + v, 0)
    if (total <= 0) return deltas
    for (let i = 0; i < values.length; i++) {
      const share = values[i] / total
      const withdraw = Math.min(values[i], remaining * share)
      values[i] -= withdraw
      deltas[i] += withdraw
      remaining -= withdraw
    }
    // Cascade rounding remainder — voorkom "vastlopen" bij FP-ruis.
    if (remaining > 0.01) {
      for (let i = 0; i < values.length; i++) {
        const withdraw = Math.min(values[i], remaining)
        values[i] -= withdraw
        deltas[i] += withdraw
        remaining -= withdraw
        if (remaining <= 0.01) break
      }
    }
    return deltas
  }

  // `cash_first` en `lowest_return_first` zijn semantisch identiek: laagste
  // `expected_return` eerst aangesproken. Cash heeft in de praktijk return=0,
  // dus die raakt automatisch als eerste op.
  // `highest_return_first` is het omgekeerde — agressief: groeiende assets
  // eerst opmaken, lage-return-assets bewaren als buffer.
  // `highest_value_first` — grootste positie eerst aangesproken; natuurlijk
  // herbalanceren richting kleinere spreiding.
  // `own_home_last` — woonzekerheid: vastgoed (`eigen_huis`, `real_estate`)
  // als absoluut laatst aangesproken; alle andere assets eerst op laagste-
  // rendement-volgorde.
  const isRealEstate = (i: number): boolean => {
    const t = String(assets[i].asset_type ?? '')
    return t === 'eigen_huis' || t === 'real_estate'
  }

  const indices = assets.map((_, i) => i)
  if (strategy === 'highest_return_first') {
    indices.sort(
      (a, b) => Number(assets[b].expected_return) - Number(assets[a].expected_return),
    )
  } else if (strategy === 'highest_value_first') {
    indices.sort(
      (a, b) => Number(values[b]) - Number(values[a]),
    )
  } else if (strategy === 'own_home_last') {
    // Twee buckets: niet-vastgoed eerst (op lage return), vastgoed laatst.
    indices.sort((a, b) => {
      const ra = isRealEstate(a) ? 1 : 0
      const rb = isRealEstate(b) ? 1 : 0
      if (ra !== rb) return ra - rb
      return Number(assets[a].expected_return) - Number(assets[b].expected_return)
    })
  } else {
    indices.sort(
      (a, b) => Number(assets[a].expected_return) - Number(assets[b].expected_return),
    )
  }
  for (const idx of indices) {
    if (remaining <= 0.01) break
    const withdraw = Math.min(values[idx], remaining)
    values[idx] -= withdraw
    deltas[idx] += withdraw
    remaining -= withdraw
  }
  return deltas
}

/**
 * Pure single-bucket decumulatie-simulatie die één `baseWithdrawal` toepast
 * tot `totalYears` verstreken zijn. Gebruikt door de binary search in
 * `solveDepleteBaseWithdrawal`.
 *
 * Wanneer `debts` meegegeven zijn wordt de schulden-aflossing + cumulatieve
 * Box 3 belasting meegerekend, en retourneert de functie de **eind-netto-
 * vermogen** (assets − debts − cumBox3). Zonder `debts` retourneert hij het
 * pure portfolio-saldo (backward-compat).
 *
 * Return-model: `grossReturn` nominaal (conform `runSimulation` met
 * returnModel ≠ 'nl_box3').
 */
function simulateBase(
  startBalance: number,
  retirementAge: number,
  totalYears: number,
  baseWithdrawal: number,
  yearlyExpenses: number,
  grossReturn: number,
  inflationRate: number,
  cashflows: SimCashflow[],
  aowEventIds?: string[],
  /** Pre-berekende debt-schedules per debt, elk `totalYears` lang. */
  debtSchedules?: Array<Array<{ value: number }>>,
  /** Huishoudtype voor Box 3 heffingsvrij (alleen gebruikt bij debts). */
  hasPartner?: boolean,
  /** Cumulatieve Box 3 op startpunt (uit opbouw-fase). Default 0. */
  cumBox3Start: number = 0,
  /** currentAge-anker voor cashflow-inflatie. Default = retirementAge. */
  currentAgeAnchor: number = retirementAge,
  /**
   * Addendum IV: als per-asset context beschikbaar is, gebruik een
   * weighted effective return i.p.v. de aggregate `grossReturn`. Zo komt de
   * baseWithdrawal overeen met de daadwerkelijke per-asset simulatie in
   * `computeAfbouwSchedulePerAsset` — voorkomt de 30-jaar fireAge-sprong
   * bij niet-pro-rata onttrekkingsvolgorde (savings-bucket met 0% groeit
   * niet zoals de aggregate 7% zou suggereren).
   */
  assetWeights?: number[],
  assetReturns?: number[],
): number {
  let balance = startBalance
  let cumBox3 = cumBox3Start
  const includeBox3 = !!debtSchedules

  // Weighted effective return (normalized) — alleen van toepassing als
  // beide arrays meegegeven zijn en niet-leeg.
  let effectiveReturn = grossReturn
  if (assetWeights && assetReturns && assetWeights.length === assetReturns.length && assetWeights.length > 0) {
    const sum = assetWeights.reduce((s, v) => s + v, 0)
    if (sum > 0) {
      effectiveReturn = assetWeights.reduce(
        (s, w, i) => s + (w / sum) * assetReturns[i],
        0,
      )
    }
  }

  for (let y = 0; y < totalYears; y++) {
    const { total: cfTotal } = sumCashflowsForYear(
      cashflows,
      retirementAge + y,
      currentAgeAnchor,
      inflationRate,
      aowEventIds,
    )
    // `baseWithdrawal` is de koopkracht-constante (huidige EUR); inflateer
    // per jaar zodat nominale onttrekking consistent is met de inflatie-
    // geïndexeerde cashflow-stream. Solver vindt baseWithdrawal zodat
    // endBalance de target haalt.
    const indexedBase = baseWithdrawal * Math.pow(1 + inflationRate, y)
    const needed = Math.max(0, indexedBase - cfTotal)
    const withdrawal = Math.min(needed, Math.max(0, balance))
    balance = (balance - withdrawal) * (1 + effectiveReturn)

    if (includeBox3) {
      // Schulden-totaal dat jaar (debt-schedule row y = eind-jaar y).
      let debtTotal = 0
      for (const sched of debtSchedules!) {
        debtTotal += sched[y]?.value ?? 0
      }
      const netWorthBeforeTax = balance - debtTotal - cumBox3
      const taxThisYear = computeBox3Tax(Math.max(0, netWorthBeforeTax), !!hasPartner)
      cumBox3 += taxThisYear
    }
  }

  if (includeBox3) {
    let debtTotalEnd = 0
    for (const sched of debtSchedules!) {
      debtTotalEnd += sched[totalYears - 1]?.value ?? 0
    }
    return balance - debtTotalEnd - cumBox3
  }
  return balance
  void yearlyExpenses
}

/**
 * Binary-search solver: zoek het `baseWithdrawal` zó dat een enkel-bucket
 * decumulatie-simulatie van `retirementAge` tot `endAge` eindigt op
 * `targetEnd` (0 voor deplete, `legacyAmount × (1+inflation)^years` voor
 * legacy).
 *
 * Implementatie-detail: 60 iteraties geeft ~1e-18 × startBalance precisie,
 * ruim binnen de €1-tolerantie van de invarianten. Range is
 * `[0, 2 × startBalance]`, wat in de praktijk altijd het feasible interval
 * bevat (SWR ligt typisch rond 3% van startBalance).
 */
export function solveDepleteBaseWithdrawal(inputs: {
  startBalance: number
  retirementAge: number
  endAge: number
  yearlyExpenses: number
  grossReturn: number
  inflationRate: number
  cashflows: SimCashflow[]
  /** Target-eindsaldo (nominal). Default 0 (deplete). */
  targetEnd?: number
  aowEventIds?: string[]
  /**
   * Wanneer meegegeven wordt de solver's eindcriterium NETTO VERMOGEN i.p.v.
   * puur portfolio-saldo. Dan komt het eind-vermogen op endAge uit op
   * `targetEnd` inclusief schulden-rest + cumulatieve Box 3 belasting — wat
   * de gebruiker verwacht bij "vermogen volledig opmaken op endAge".
   */
  debtSchedules?: Array<Array<{ value: number }>>
  hasPartner?: boolean
  /** Cumulatieve Box 3 op startpunt (uit opbouw). Default 0. */
  cumBox3Start?: number
  /** currentAge-anker voor cashflow-inflatie. Default = retirementAge. */
  currentAgeAnchor?: number
  /**
   * Per-asset context voor weighted effective return (Addendum IV fix).
   * Wanneer meegegeven matcht de solver met de per-asset simulate; cruciaal
   * voor niet-pro-rata onttrekkingsvolgordes met gemengde asset-returns.
   */
  assetWeights?: number[]
  assetReturns?: number[]
}): number {
  const {
    startBalance,
    retirementAge,
    endAge,
    yearlyExpenses,
    grossReturn,
    inflationRate,
    cashflows,
    targetEnd = 0,
    aowEventIds,
    debtSchedules,
    hasPartner,
    cumBox3Start = 0,
    currentAgeAnchor,
    assetWeights,
    assetReturns,
  } = inputs

  const totalYears = Math.max(0, endAge - retirementAge)
  if (totalYears === 0 || startBalance <= 0) return 0

  let lo = 0
  let hi = Math.max(startBalance * 2, yearlyExpenses * 2)

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const endValue = simulateBase(
      startBalance,
      retirementAge,
      totalYears,
      mid,
      yearlyExpenses,
      grossReturn,
      inflationRate,
      cashflows,
      aowEventIds,
      debtSchedules,
      hasPartner,
      cumBox3Start,
      currentAgeAnchor,
      assetWeights,
      assetReturns,
    )
    if (endValue > targetEnd) {
      // Nog te veel over → trek meer
      lo = mid
    } else {
      // Te weinig over → trek minder
      hi = mid
    }
  }

  return (lo + hi) / 2
}

/**
 * Per-asset decumulatie-schema voor de "tabel rekent, grafiek tekent"-
 * architectuur. Levert per jaar een complete snapshot van assets, debts,
 * netto vermogen, Box 3 én het aandeel van elke asset in de withdrawal.
 *
 * Algoritme:
 *  1. Bereken een `baseWithdrawal` op basis van `strategy`:
 *     - `perpetual` / `pensioen` → NL_SWR × huidige balance per jaar
 *     - `deplete` → `solveDepleteBaseWithdrawal` met `targetEnd=0`
 *     - `legacy`  → `solveDepleteBaseWithdrawal` met inflatie-geïndexeerde
 *       legacy-target
 *  2. Per jaar:
 *     a. Sommeer cashflows voor het jaar (incl. AOW apart).
 *     b. Bepaal `neededFromPortfolio = max(0, baseWithdrawal − cashflowNet)`
 *        (voor perpetual: `min(balance×SWR, inflatedExpenses − cfNet)`).
 *     c. Verdeel `withdrawal` over assets via `applyAfbouwWithdrawal`.
 *     d. Groei elk asset met `expected_return × (net_worth_inclusion_pct/100)`.
 *     e. Draai debt-schema door (`projectDebtYearly` vooraf berekend).
 *     f. Bereken Box 3 belasting op netto vermogen (inclusief peildatum-
 *        logica met cumulatief belasting-anker, identiek aan opbouw).
 */
export function computeAfbouwSchedulePerAsset(inputs: AfbouwPerAssetInputs): AfbouwPerAssetRow[] {
  const {
    startAssetValues,
    assets,
    startDebtValues,
    debts,
    retirementAge,
    endAge,
    yearlyExpenses,
    grossReturn,
    inflationRate,
    strategy,
    legacyAmount,
    cumBox3Start = 0,
    currentAgeAnchor,
    // withdrawalStrategy blijft gereserveerd — zie AfbouwPerAssetInputs-doc.
    distributionStrategy,
    cashflows,
    hasPartner,
    aowEventIds,
  } = inputs

  const totalYears = Math.max(0, endAge - retirementAge)
  if (totalYears === 0) return []
  if (startAssetValues.length !== assets.length) {
    throw new Error('startAssetValues.length must equal assets.length')
  }
  if (startDebtValues.length !== debts.length) {
    throw new Error('startDebtValues.length must equal debts.length')
  }

  // Per-debt yearly schedule wordt vooraf berekend. `projectDebtYearly`
  // consumeert `current_balance`; dus we clonen de Debt-objecten met het
  // `startDebtValues[i]` als startbalans zodat het schema aansluit op de
  // afbouw-fase (niet de originele opbouw-startbalans).
  const perDebtSchedule = debts.map((d, i) =>
    projectDebtYearly({ ...d, current_balance: startDebtValues[i] } as Debt, totalYears),
  )

  const inclusionWeights = assets.map(a => (a.net_worth_inclusion_pct ?? 100) / 100)
  const startPortfolio = startAssetValues.reduce((s, v) => s + v, 0)

  // Bepaal `baseWithdrawal` per strategie. Voor perpetual/pensioen blijft
  // het een year-by-year NL_SWR × currentBalance — we zetten baseWithdrawal
  // op een sentinel en rekenen per jaar opnieuw.
  const PERPETUAL_SENTINEL = Number.NaN
  let baseWithdrawal: number

  // `baseWithdrawal` (nominaal-bij-retirementAge) — formules matchen de
  // /afbouw-tabellen 1:1. Geen solver meer: voorheen gebruikte deplete/legacy
  // `solveDepleteBaseWithdrawal` dat met nested solvers divergeerde en voor
  // required-curve kapot was. De directe formules uit `afbouw-table-schedules`
  // zijn deterministisch én match met de tabel-weergave.
  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1

  if (strategy === 'perpetual' || strategy === 'pensioen') {
    baseWithdrawal = PERPETUAL_SENTINEL
  } else if (strategy === 'deplete') {
    // Deplete-SWR annuity formule (zie `afbouw-table-schedules.ts` →
    // `scheduleDepleteSwr`). Fixed nominale-bij-retirementAge withdrawal die
    // portfolio over `totalYears` naar 0 brengt bij constante real-return.
    if (totalYears <= 0 || startPortfolio <= 0) {
      baseWithdrawal = 0
    } else if (realReturn === 0) {
      baseWithdrawal = startPortfolio / totalYears
    } else {
      baseWithdrawal = (startPortfolio * realReturn) / (1 - Math.pow(1 + realReturn, -totalYears))
    }
  } else {
    // Legacy-SWR: `(surplus) × NL_SWR` (conservatief, zie `scheduleLegacySwr`).
    // `pvLegacy` = legacyAmount (nominaal-eindleeftijd) → real-at-retirementAge
    // via grossReturn-discount. Houdt `legacyAmount` als nominal-at-endAge
    // interpretatie (consistent met pre-V3-gedrag voor overzicht).
    const pvLegacy = legacyAmount / Math.pow(1 + grossReturn, totalYears)
    baseWithdrawal = Math.max(0, (startPortfolio - pvLegacy) * NL_SWR)
  }

  // Per-asset mutable balances gedurende de loop
  const values = [...startAssetValues]

  const rows: AfbouwPerAssetRow[] = []
  let cumulativeBox3Tax = 0

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = values.reduce((s, v) => s + v, 0)

    // 1. Cashflow-sommatie (AOW apart). Gebruik `currentAgeAnchor` (werkelijke
    //    currentAge uit hybrid) i.p.v. retirementAge zodat AOW en andere
    //    geïndexeerde events de juiste nominale waarde krijgen.
    const anchor = currentAgeAnchor ?? retirementAge
    const { total: cashflowNetThisYear, aowPart: aowIncomeThisYear } =
      sumCashflowsForYear(cashflows, age, anchor, inflationRate, aowEventIds)

    // 2. Inflatie-gecorrigeerde uitgaven (alleen relevant voor perpetual-cap)
    const inflatedExpenses = yearlyExpenses * Math.pow(1 + inflationRate, y)

    // 3. Bepaal `neededFromPortfolio` per strategie
    let neededFromPortfolio: number
    if (strategy === 'perpetual') {
      // Variabel: NL_SWR × currentBalance, gecapt op
      // `inflatedExpenses − cashflowNet` (min 0).
      neededFromPortfolio = Math.max(
        0,
        Math.min(startBalance * NL_SWR, inflatedExpenses - cashflowNetThisYear),
      )
    } else if (strategy === 'pensioen') {
      // Pensioen: zodra AOW binnenkomt, SWR-vast op currentBalance —
      // identiek gedrag aan bestaande `computeWithdrawalSchedule`.
      neededFromPortfolio = Math.max(
        0,
        Math.min(startBalance * NL_SWR, inflatedExpenses - cashflowNetThisYear),
      )
    } else {
      // deplete / legacy → onttrekking = geïnflateerde `baseWithdrawal`
      // minus cashflow. `baseWithdrawal` is de solver-gekozen koopkracht-
      // constante die portfolio naar target stuurt. Door hem per jaar te
      // inflateren blijft de nominale onttrekking consistent met de
      // geïnflateerde cashflows (AOW) → AOW vult aan, vervangt niet, en
      // portfolio bereikt op endAge de gewenste eindwaarde (0 voor deplete,
      // legacyAmount × (1+inflation)^years voor legacy).
      const indexedBase = baseWithdrawal * Math.pow(1 + inflationRate, y)
      neededFromPortfolio = Math.max(0, indexedBase - cashflowNetThisYear)
    }

    const withdrawal = Math.min(neededFromPortfolio, Math.max(0, startBalance))

    // 4. Verdeel withdrawal over assets (muteert `values`)
    const perAssetWithdrawal = applyAfbouwWithdrawal(
      values,
      assets,
      withdrawal,
      distributionStrategy,
    )

    // 5. Groei per asset (net_worth_inclusion_pct toegepast op rendement
    // zodat een 50%-asset ook maar de helft van de groei bijdraagt — zie
    // plan-notitie over net_worth_inclusion_pct). Elke asset groeit met
    // zijn **eigen** `expected_return` — niet de aggregate `grossReturn`.
    // Zonder die per-asset rate zou de onttrekkingsvolgorde geen invloed
    // hebben op het aggregate totaal: cash_first vs highest_return_first
    // zouden dezelfde eindwaarde opleveren, wat niet klopt.
    const perAssetGrowth: number[] = []
    for (let i = 0; i < values.length; i++) {
      const weight = inclusionWeights[i]
      const assetReturn = Number(assets[i].expected_return) / 100
      const growth = values[i] * assetReturn * weight
      values[i] = Math.max(0, values[i] + growth)
      perAssetGrowth.push(growth)
    }

    const endBalance = values.reduce((s, v) => s + v, 0)
    const growthTotal = perAssetGrowth.reduce((s, v) => s + v, 0)

    // 6. Debts dit jaar — lees uit vooraf berekend schema
    const perDebtValues: number[] = []
    const perDebtInterest: number[] = []
    const perDebtRepayment: number[] = []
    for (let i = 0; i < debts.length; i++) {
      const row = perDebtSchedule[i][y]
      perDebtValues.push(row?.value ?? 0)
      perDebtInterest.push(row?.growth ?? 0)
      perDebtRepayment.push(Math.abs(row?.contribution ?? 0))
    }
    const debtSum = perDebtValues.reduce((s, v) => s + v, 0)

    // 7. Box 3 op netto vermogen — peildatum-logica met cumulatief anker,
    // identiek aan `computeOpbouwProjection`.
    let assetSum = 0
    for (let i = 0; i < values.length; i++) {
      assetSum += values[i] * inclusionWeights[i]
    }
    const rawNet = assetSum - debtSum
    const preTaxNet = rawNet - cumulativeBox3Tax
    const box3TaxThisYear = computeBox3Tax(preTaxNet, hasPartner)
    cumulativeBox3Tax += box3TaxThisYear
    const netWorth = rawNet - cumulativeBox3Tax

    rows.push({
      age,
      year: y + 1,
      phase: 'afbouw',
      assets: assetSum,
      debts: debtSum,
      netWorth,
      cumulativeBox3Tax,
      box3TaxThisYear,
      startBalance,
      withdrawal,
      growth: growthTotal,
      endBalance,
      cashflowNetThisYear,
      aowIncomeThisYear,
      eventCashflowNetThisYear: cashflowNetThisYear - aowIncomeThisYear,
      perAssetValues: [...values],
      perAssetWithdrawal,
      perAssetGrowth,
      perDebtValues,
      perDebtInterest,
      perDebtRepayment,
    })
  }

  return rows
}

// ── AOW cashflow injection (Fase G2) ──────────────────────────

/**
 * Zorg dat er een AOW-cashflow-stream in het gegeven `cashflows`-array zit.
 * Als er al een life-event met `event_type === 'aow'` bestaat in
 * `existingEvents`, retourneren we `cashflows` ongewijzigd (de
 * `lifeEventsToCashflows`-pipeline heeft die dan al geïnjecteerd).
 *
 * Als er geen AOW-event bestaat wordt er één recurring cashflow toegevoegd
 * die loopt van `aowAge` tot `endAge`, met een maandbedrag volgens
 * leefsituatie (`hasPartner` → `NL_AOW_MONTHLY_SAMENWONEND`). De flow krijgt
 * id `__aow` en wordt als `indexed: true` gemarkeerd zodat de inflatie-
 * pipeline in `sumCashflowsForYear` / `runSimulation` hem consistent
 * behandelt met de reguliere AOW-injectie uit life-events.
 *
 * NB: we volgen de SimCashflow-conventie — amount is **maandbedrag** voor
 * recurring flows, niet jaarbedrag (zie `lib/fire-simulation.ts:35-44`).
 */
export function ensureAowCashflow(
  cashflows: SimCashflow[],
  aowAge: number,
  endAge: number,
  hasPartner: boolean,
  existingEvents: LifeEvent[],
): SimCashflow[] {
  // Skip wanneer er al een AOW life-event bestaat: `lifeEventsToCashflows`
  // heeft die al in `cashflows` gezet.
  const hasAowEvent = existingEvents.some(
    ev => ev.event_type === 'aow' && ev.is_active !== false,
  )
  if (hasAowEvent) return cashflows

  // Skip wanneer er al een AOW-cashflow aanwezig is (defensief — bijv. een
  // vooraf geïnjecteerde __aow). Voorkomt dubbel-tellen.
  const hasAowCashflow = cashflows.some(cf => isAowCashflow(cf, undefined))
  if (hasAowCashflow) return cashflows

  if (endAge <= aowAge) return cashflows

  const monthlyAmount = hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
  if (monthlyAmount <= 0) return cashflows

  const aowFlow: SimCashflow = {
    id: '__aow',
    name: 'AOW (fallback)',
    type: 'recurring',
    direction: 'income',
    amount: monthlyAmount,
    fromAge: aowAge,
    toAge: endAge,
    indexed: true,
  }

  return [...cashflows, aowFlow]
}

// ── Per-asset required-solver (withdrawalOrder beïnvloedt kruising) ─

/**
 * Binary-search op totaal startPortfolio voor `retirementAge` zodat de
 * volledige per-asset afbouw-simulatie eindigt op het strategy-target.
 *
 * Het totale startPortfolio wordt bij elke trial proportioneel over de
 * assets verdeeld volgens `assetWeights` (de actuele mix op `retirementAge`
 * uit de opbouw-projectie). `withdrawalOrder` bepaalt vervolgens hoe de
 * jaarlijkse onttrekking over assets wordt verdeeld.
 *
 * Zo hebben Onttrekkingsvolgorde + per-asset rendementen daadwerkelijk
 * invloed op de required-curve — en dus op de FIRE-leeftijd.
 *
 * Target per strategie:
 *  - `deplete` → netto-vermogen 0 op endAge
 *  - `legacy` → legacyAmount × (1+inflatie)^years
 *  - `perpetual` → 0 (benadering; de perpetual-lijn blijft best met de
 *    analytische formule, maar per-asset geeft nog steeds een zinvolle
 *    bovengrens)
 *  - `pensioen` (vóór AOW) → caller geeft null; anders 0
 */
export function solveRequiredPerAssetPortfolio(inputs: {
  retirementAge: number
  endAge: number
  endStrategy: FireEndStrategy
  yearlyExpenses: number
  grossReturn: number
  inflationRate: number
  hasPartner: boolean
  legacyAmount: number
  withdrawalStrategy: WithdrawalStrategy
  withdrawalOrder: AfbouwDistributionStrategy
  cashflows: SimCashflow[]
  currentAgeAnchor: number
  cumBox3Start: number
  assetWeights: number[]
  assets: Asset[]
  debts: Debt[]
  startDebtValues: number[]
}): number {
  const {
    retirementAge, endAge, endStrategy, yearlyExpenses, grossReturn, inflationRate,
    hasPartner, legacyAmount, withdrawalStrategy, withdrawalOrder, cashflows,
    currentAgeAnchor, cumBox3Start, assetWeights, assets, debts, startDebtValues,
  } = inputs

  const totalYears = Math.max(0, endAge - retirementAge)
  if (totalYears === 0) return 0

  let target: number
  if (endStrategy === 'deplete') target = 0
  else if (endStrategy === 'legacy') target = legacyAmount * Math.pow(1 + inflationRate, totalYears)
  else target = 0 // perpetual / pensioen fallback

  // Normalize weights (defensief — sum moet ~1 zijn).
  const weightSum = assetWeights.reduce((s, w) => s + w, 0)
  const normWeights = weightSum > 0
    ? assetWeights.map(w => w / weightSum)
    : assetWeights.map(() => 1 / Math.max(1, assetWeights.length))

  const evaluateAt = (startPortfolio: number): number => {
    const startAssetValues = normWeights.map(w => w * startPortfolio)
    const rows = computeAfbouwSchedulePerAsset({
      startAssetValues,
      assets,
      startDebtValues,
      debts,
      retirementAge,
      endAge,
      yearlyExpenses,
      grossReturn,
      inflationRate,
      strategy: endStrategy,
      legacyAmount,
      withdrawalStrategy,
      distributionStrategy: withdrawalOrder,
      cashflows,
      hasPartner,
      cumBox3Start,
      currentAgeAnchor,
    })
    return rows.at(-1)?.netWorth ?? -Infinity
  }

  let lo = 0
  let hi = Math.max(yearlyExpenses * 100, 1_000_000)
  // Addendum IV: adaptieve hi-bound. Verdubbel `hi` tot target haalbaar is
  // (of cap-limiet bereikt). Voorkomt vastlopen op 10M wanneer de required
  // hoger ligt (grote portfolios, Box 3, savings-bucket met 0% groei).
  let expandAttempts = 0
  while (expandAttempts < 20 && evaluateAt(hi) < target) {
    hi *= 2
    expandAttempts++
    if (hi > 1e12) break
  }

  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    const endNetWorth = evaluateAt(mid)
    if (endNetWorth < target) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return (lo + hi) / 2
}
