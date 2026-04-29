/**
 * Per-strategie forward decumulatie-schema's (Addendum II).
 *
 * Bestaande code: `perpetual-tables.tsx`, `legacy-tables.tsx`,
 * `pension-tables.tsx`, `deplete-tables.tsx` hebben elk vier inline
 * schedule-berekeningen (SWR/Guardrails/VPW/Bucket). Die logica wordt hier
 * geëxtraheerd als pure helpers zodat zowel de tabel-componenten (future
 * refactor) als de required-curve (`computeAfbouwRequiredSchedule`) één
 * bron delen.
 *
 * Kernprincipe: gegeven een `startPortfolio` op `retirementAge`, simuleren
 * deze helpers de forward-evolutie jaar-voor-jaar tot `endAge` met de
 * strategie-specifieke withdrawal-logica. De `computeAfbouwRequiredSchedule`
 * doet een binary-search op `startPortfolio` zodat `rows.at(-1).endBalance`
 * het strategy-target raakt (0 voor deplete, legacy-indexed voor legacy,
 * koopkracht-behoud voor perpetual).
 *
 * Nominaal vs. reëel: alle helpers werken in **nominale** EUR. Uitgaven
 * worden per jaar geïnflateerd met `(1 + inflation)^y`. Rendement is bruto
 * (`grossReturn`). Dat matcht de conventies in `simulateBase` en de
 * hybride-projectie.
 */

import { NL_AOW_AGE, NL_SWR } from '@/lib/constants'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import type { SimCashflow } from '@/lib/fire-simulation'

// ── Types ───────────────────────────────────────────────────────

export type WithdrawalStrategy = 'swr' | 'guardrails' | 'vpw' | 'bucket'

export interface StrategyScheduleInputs {
  startPortfolio: number
  retirementAge: number
  endAge: number
  endStrategy: FireEndStrategy
  yearlyExpenses: number        // nominaal op retirementAge
  grossReturn: number
  inflationRate: number
  hasPartner: boolean
  legacyAmount: number
  cashflows: SimCashflow[]      // alle events incl. AOW
  /** Anker voor cashflow-inflatie. Default = retirementAge. */
  currentAgeAnchor?: number
  /** AOW-event-ids voor detectie (niet strict nodig voor schedule). */
  aowEventIds?: string[]
  /**
   * Override de auto-berekende `baseWithdrawal`. Gebruikt door de solver:
   * die simuleert met `yearlyExpenses` als basis i.p.v. een annuïteit die
   * van `startPortfolio` afhangt (self-referentieel voor binary search).
   */
  baseWithdrawalOverride?: number
}

export interface StrategyScheduleRow {
  age: number
  year: number
  startBalance: number
  withdrawal: number
  cashflowNetThisYear: number
  growth: number
  endBalance: number
}

// ── Shared helpers ──────────────────────────────────────────────

/**
 * Som alle cashflow-bedragen voor het jaar `[age, age+1)`, met dezelfde
 * inflatie-indexering als `sumCashflowsForYear` in `afbouw-projection.ts`.
 * Gedupliceerd om circular-import te voorkomen — matcht exact.
 */
function sumCashflowsForYearLocal(
  cashflows: SimCashflow[],
  yearStartAge: number,
  currentAgeAnchor: number,
  inflationRate: number,
): number {
  let total = 0
  const yearEndAge = yearStartAge + 1
  const yearsFromAnchor = yearStartAge - currentAgeAnchor
  const inflationFactor = Math.pow(1 + inflationRate, Math.max(0, yearsFromAnchor))

  for (const cf of cashflows) {
    const direction = cf.direction === 'income' ? 1 : -1
    if (cf.type === 'one_time') {
      if (cf.fromAge >= yearStartAge && cf.fromAge < yearEndAge) {
        total += cf.amount * direction * (cf.indexed !== false ? inflationFactor : 1)
      }
    } else {
      // recurring — maandelijks bedrag × 12 pro-rata voor het jaar
      const overlapStart = Math.max(cf.fromAge, yearStartAge)
      const overlapEnd = Math.min(cf.toAge ?? 100, yearEndAge)
      if (overlapEnd > overlapStart) {
        const months = (overlapEnd - overlapStart) * 12
        const monthlyIndexed = cf.amount * (cf.indexed !== false ? inflationFactor : 1)
        total += monthlyIndexed * months * direction
      }
    }
  }
  return Math.round(total)
}

/**
 * Annuïtaire betaling: `P × r / (1 − (1+r)^−n)` met degenerate fallback
 * `P / n` als r ≈ 0.
 */
function annuityPayment(startPortfolio: number, rate: number, nYears: number): number {
  if (nYears <= 0) return 0
  if (Math.abs(rate) < 1e-9) return startPortfolio / nYears
  return (startPortfolio * rate) / (1 - Math.pow(1 + rate, -nYears))
}

/**
 * VPW-rate voor gegeven resterende jaren + rendement. Zelfde formule als
 * `pension-tables.tsx:41`.
 */
function vpwRate(remainingYears: number, realReturn: number): number {
  if (remainingYears <= 0) return 1
  if (Math.abs(realReturn) < 1e-9) return 1 / remainingYears
  return realReturn / (1 - Math.pow(1 + realReturn, -remainingYears))
}

function remainingLifeYears(age: number, endAge: number): number {
  return Math.max(1, endAge - age)
}

/**
 * Bepaal `baseWithdrawal` voor strategieën die een vast jaarbedrag hanteren
 * (SWR/Guardrails/Bucket). Voor deplete/legacy is dat de annuïteit-PV;
 * voor perpetual/pensioen gebruiken we NL_SWR × startPortfolio (static).
 */
function baseWithdrawalFor(inputs: StrategyScheduleInputs): number {
  const { startPortfolio, retirementAge, endAge, endStrategy, grossReturn, inflationRate, legacyAmount } = inputs
  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const totalYears = Math.max(1, endAge - retirementAge)

  if (endStrategy === 'perpetual' || endStrategy === 'pensioen') {
    return startPortfolio * NL_SWR
  }
  if (endStrategy === 'deplete') {
    return annuityPayment(startPortfolio, realReturn, totalYears)
  }
  // legacy — houd `legacyAmount` (nominaal op endAge) over
  const legacyNominalOnEnd = legacyAmount * Math.pow(1 + inflationRate, totalYears)
  const pvLegacy = legacyNominalOnEnd / Math.pow(1 + realReturn, totalYears)
  const netStart = Math.max(0, startPortfolio - pvLegacy)
  return annuityPayment(netStart, realReturn, totalYears)
}

// ── Helpers per strategie ───────────────────────────────────────

/**
 * SWR — vaste jaarbetaling (annuïteit voor deplete/legacy, NL_SWR voor
 * perpetual/pensioen). Uitgaven worden NIET extra geïnflateerd omdat de
 * baseWithdrawal in `realReturn`-termen is (wat neerkomt op nominaal groei
 * van de withdrawal per jaar).
 */
export function simulateScheduleSwr(inputs: StrategyScheduleInputs): StrategyScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, endStrategy, grossReturn, inflationRate, cashflows, currentAgeAnchor } = inputs
  const totalYears = Math.max(0, endAge - retirementAge)
  if (totalYears === 0 || startPortfolio <= 0) return []

  const baseWithdrawal = inputs.baseWithdrawalOverride ?? baseWithdrawalFor(inputs)
  const anchor = currentAgeAnchor ?? retirementAge
  const rows: StrategyScheduleRow[] = []
  let balance = startPortfolio

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const cashflowNet = sumCashflowsForYearLocal(cashflows, age, anchor, inflationRate)

    let needed: number
    if (endStrategy === 'perpetual') {
      const inflatedExpenses = inputs.yearlyExpenses * Math.pow(1 + inflationRate, y)
      needed = Math.max(0, Math.min(balance * NL_SWR, inflatedExpenses - cashflowNet))
    } else {
      // Indexeer baseWithdrawal met inflatie: `baseWithdrawalFor` gebruikt
      // realReturn (= reëel, constant in huidige-EUR). Simulatie loopt in
      // nominale EUR met grossReturn; dus withdrawal moet per jaar groeien
      // met inflatie om de annuïteit nominaal kloppend te maken.
      const indexedBase = baseWithdrawal * Math.pow(1 + inflationRate, y)
      needed = Math.max(0, indexedBase - cashflowNet)
    }

    const withdrawal = Math.min(needed, Math.max(0, balance))
    const afterWithdraw = balance - withdrawal
    const growth = afterWithdraw * grossReturn
    balance = afterWithdraw + growth

    rows.push({
      age, year: y + 1,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      cashflowNetThisYear: Math.round(cashflowNet),
      growth: Math.round(growth),
      endBalance: Math.round(balance),
    })
  }
  return rows
}

/**
 * Guardrails — start met SWR-base, pas ±10% aan wanneer balance buiten
 * ±20% van startPortfolio valt. Zelfde ritme als `perpetual-tables.tsx`.
 */
export function simulateScheduleGuardrails(inputs: StrategyScheduleInputs): StrategyScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, grossReturn, inflationRate, cashflows, currentAgeAnchor } = inputs
  const totalYears = Math.max(0, endAge - retirementAge)
  if (totalYears === 0 || startPortfolio <= 0) return []

  const swrBase = inputs.baseWithdrawalOverride ?? baseWithdrawalFor(inputs)
  const anchor = currentAgeAnchor ?? retirementAge
  const upperThreshold = startPortfolio * 1.2
  const lowerThreshold = startPortfolio * 0.8
  let currentWithdrawal = swrBase

  const rows: StrategyScheduleRow[] = []
  let balance = startPortfolio

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const cashflowNet = sumCashflowsForYearLocal(cashflows, age, anchor, inflationRate)

    // Inflatie-indexering + guardrails-aanpassing (cumulatief).
    currentWithdrawal *= (1 + inflationRate)
    if (balance > upperThreshold) currentWithdrawal *= 1.1
    else if (balance < lowerThreshold) currentWithdrawal *= 0.9

    const needed = Math.max(0, currentWithdrawal - cashflowNet)
    const withdrawal = Math.min(needed, Math.max(0, balance))
    const afterWithdraw = balance - withdrawal
    const growth = afterWithdraw * grossReturn
    balance = afterWithdraw + growth

    rows.push({
      age, year: y + 1,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      cashflowNetThisYear: Math.round(cashflowNet),
      growth: Math.round(growth),
      endBalance: Math.round(balance),
    })
  }
  return rows
}

/**
 * VPW (Variable Percentage Withdrawal) — withdrawal = balance × rate waar
 * rate afhangt van resterende jaren + rendement. Balance raakt dichter bij
 * eindAge; rate groeit; withdrawal groeit naar eindjaar.
 */
export function simulateScheduleVpw(inputs: StrategyScheduleInputs): StrategyScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, grossReturn, inflationRate, cashflows, currentAgeAnchor } = inputs
  const totalYears = Math.max(0, endAge - retirementAge)
  if (totalYears === 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const anchor = currentAgeAnchor ?? retirementAge
  const rows: StrategyScheduleRow[] = []
  let balance = startPortfolio

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const cashflowNet = sumCashflowsForYearLocal(cashflows, age, anchor, inflationRate)

    const remYears = remainingLifeYears(age, endAge)
    const rate = vpwRate(remYears, realReturn)
    const vpwWithdrawal = balance * rate
    const needed = Math.max(0, vpwWithdrawal - cashflowNet)
    const withdrawal = Math.min(needed, Math.max(0, balance))
    const afterWithdraw = balance - withdrawal
    const growth = afterWithdraw * grossReturn
    balance = afterWithdraw + growth

    rows.push({
      age, year: y + 1,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      cashflowNetThisYear: Math.round(cashflowNet),
      growth: Math.round(growth),
      endBalance: Math.round(balance),
    })
  }
  return rows
}

/**
 * Bucket — vereenvoudigde aggregate variant. Houdt 2 jaar expenses als cash
 * (0% return) + 5 jaar als bonds (~2% return) + rest als stocks (gross).
 * Jaarlijkse withdrawal komt uit cash; cash wordt aan einde jaar aangevuld
 * vanuit bonds/stocks (rebalancing-drag ≈ 0.5% lagere effective return).
 */
export function simulateScheduleBucket(inputs: StrategyScheduleInputs): StrategyScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, cashflows, currentAgeAnchor } = inputs
  const totalYears = Math.max(0, endAge - retirementAge)
  if (totalYears === 0 || startPortfolio <= 0) return []

  const BOND_RETURN = 0.02
  const baseSwr = inputs.baseWithdrawalOverride ?? baseWithdrawalFor(inputs)
  const anchor = currentAgeAnchor ?? retirementAge

  let cashBal = Math.min(yearlyExpenses * 2, startPortfolio)
  let bondBal = Math.min(yearlyExpenses * 5, Math.max(0, startPortfolio - cashBal))
  let stockBal = Math.max(0, startPortfolio - cashBal - bondBal)

  const rows: StrategyScheduleRow[] = []

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = cashBal + bondBal + stockBal
    const cashflowNet = sumCashflowsForYearLocal(cashflows, age, anchor, inflationRate)
    const indexedBase = baseSwr * Math.pow(1 + inflationRate, y)
    const needed = Math.max(0, indexedBase - cashflowNet)
    const totalAvail = cashBal + bondBal + stockBal
    const withdrawal = Math.min(needed, totalAvail)

    // Trek uit cash → bonds → stocks (cascade)
    let remain = withdrawal
    const fromCash = Math.min(remain, cashBal); cashBal -= fromCash; remain -= fromCash
    const fromBonds = Math.min(remain, bondBal); bondBal -= fromBonds; remain -= fromBonds
    const fromStocks = Math.min(remain, stockBal); stockBal -= fromStocks; remain -= fromStocks

    // Growth (cash 0%, bonds 2%, stocks gross)
    bondBal *= (1 + BOND_RETURN)
    stockBal *= (1 + grossReturn)

    // Refill cash → 2×expenses, bonds → 5×expenses
    const cashTarget = yearlyExpenses * 2
    if (cashBal < cashTarget) {
      const need = cashTarget - cashBal
      const fromBondsRefill = Math.min(need, bondBal); bondBal -= fromBondsRefill; cashBal += fromBondsRefill
      const stillNeed = Math.max(0, need - fromBondsRefill)
      const fromStocksRefill = Math.min(stillNeed, stockBal); stockBal -= fromStocksRefill; cashBal += fromStocksRefill
    }
    const bondTarget = yearlyExpenses * 5
    if (bondBal < bondTarget && stockBal > 0) {
      const need = bondTarget - bondBal
      const fromStocks = Math.min(need, stockBal); stockBal -= fromStocks; bondBal += fromStocks
    }

    const endBalance = cashBal + bondBal + stockBal
    const growth = endBalance - (startBalance - withdrawal)

    rows.push({
      age, year: y + 1,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      cashflowNetThisYear: Math.round(cashflowNet),
      growth: Math.round(growth),
      endBalance: Math.round(endBalance),
    })
  }
  return rows
}

/**
 * Dispatcher — roept de juiste strategie-helper aan.
 */
export function simulateScheduleByStrategy(
  strategy: WithdrawalStrategy,
  inputs: StrategyScheduleInputs,
): StrategyScheduleRow[] {
  switch (strategy) {
    case 'swr': return simulateScheduleSwr(inputs)
    case 'guardrails': return simulateScheduleGuardrails(inputs)
    case 'vpw': return simulateScheduleVpw(inputs)
    case 'bucket': return simulateScheduleBucket(inputs)
  }
}

// ── Required-portfolio per strategie (binary search) ───────────

/**
 * Vind het `startPortfolio` waarvoor `simulateScheduleByStrategy(...)` op
 * `endAge` eindigt met het strategy-target:
 *  - `deplete`: target = 0
 *  - `legacy`: target = legacyAmount × (1+inflation)^years
 *  - `perpetual`: target = startPortfolio zelf (koopkracht-behoud) — hier
 *    gebruiken we een iteratieve solver met as target `> 0` maar
 *    koopkracht-consistent; default: target = `indexedExpenses / NL_SWR`.
 *  - `pensioen`: als age < aowAge → return 0 (geen kapitaal nodig vóór AOW).
 */
export function solveRequiredStartPortfolio(
  strategy: WithdrawalStrategy,
  inputs: Omit<StrategyScheduleInputs, 'startPortfolio'>,
): number {
  const totalYears = Math.max(0, inputs.endAge - inputs.retirementAge)
  if (totalYears === 0) return 0

  // Target bepalen
  let target: number
  if (inputs.endStrategy === 'deplete') {
    target = 0
  } else if (inputs.endStrategy === 'legacy') {
    target = inputs.legacyAmount * Math.pow(1 + inputs.inflationRate, totalYears)
  } else if (inputs.endStrategy === 'pensioen') {
    // Pensioen: vóór AOW geen kapitaal nodig (SWR vanaf AOW).
    if (inputs.retirementAge < NL_AOW_AGE) return 0
    target = 0
  } else {
    // perpetual: koopkracht-behoud. Target = startPortfolio-indexed. Gebruik
    // als heuristiek: indexed expenses / NL_SWR (wat de minimale SWR-anchor is).
    const indexedExpenses = inputs.yearlyExpenses * Math.pow(1 + inputs.inflationRate, totalYears)
    target = indexedExpenses / NL_SWR
  }

  // Binary search op startPortfolio. Gebruik `yearlyExpenses` (nominaal NU
  // × inflation-per-jaar) als withdrawal-override zodat de solver niet
  // self-referentieel is.
  //
  // Critical: endBalance alleen is niet genoeg — als het portfolio tussentijds
  // uitgeput raakt kapt de simulatie withdrawals af, met endBalance=0 als
  // gevolg. Dat ziet er voor de binary search uit als "target bereikt" terwijl
  // er feitelijk een tekort was. Daarom rekenen we ook de gecumuleerde
  // `shortfall` (needed − actual withdrawal) mee en trekken die van
  // endBalance af om een effectief netto-tekort te krijgen.
  const override = inputs.yearlyExpenses
  let lo = 0
  let hi = Math.max(inputs.yearlyExpenses * 100, 10_000_000)

  const simulateAndEvaluate = (startPortfolio: number): number => {
    const rows = simulateScheduleByStrategy(strategy, {
      ...inputs,
      startPortfolio,
      baseWithdrawalOverride: override,
    })
    if (rows.length === 0) return -Infinity
    const endBalance = rows.at(-1)!.endBalance
    // Shortfall = gecumuleerde (needed − withdrawal), waar `needed` de
    // gewenste withdrawal is voor dat jaar. We reconstructeren needed via
    // override × (1+inflation)^y − cashflowNetThisYear.
    let shortfall = 0
    for (let y = 0; y < rows.length; y++) {
      const indexed = override * Math.pow(1 + inputs.inflationRate, y)
      const needed = Math.max(0, indexed - rows[y].cashflowNetThisYear)
      const deficit = needed - rows[y].withdrawal
      if (deficit > 0) shortfall += deficit * Math.pow(1 + inputs.grossReturn, rows.length - 1 - y)
    }
    return endBalance - shortfall
  }

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const effective = simulateAndEvaluate(mid)
    if (effective < target) {
      // Te weinig — startPortfolio moet hoger
      lo = mid
    } else {
      hi = mid
    }
  }
  return (lo + hi) / 2
}
