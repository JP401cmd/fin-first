/**
 * FIRE Simulatie Engine — gedeelde logica voor fire-sim tool en De Horizon module.
 *
 * Bevat: typen, runSimulation(), lifeEventsToCashflows()
 * Pure functions, geen Supabase dependency.
 */

import { BOX3_DRAG, type LifeEvent } from '@/lib/horizon-data'

// ── Types ───────────────────────────────────────────────────────────────────

export type ReturnModel = 'classic' | 'nl_box3'

export interface SimCashflow {
  id: string
  name: string
  type: 'recurring' | 'one_time'
  direction: 'income' | 'expense'
  amount: number       // always positive; direction determines sign
  fromAge: number      // age at which cashflow starts / one-time occurs
  toAge: number | null // recurring: stops at this age (null = until endAge); one_time: ignored
  indexed: boolean     // true: amount grows with inflation
}

export interface SimRow {
  age: number
  phase: 'opbouw' | 'pensioen'
  startPortfolio: number
  growth: number
  savings: number
  withdrawal: number
  cashflowNet: number
  endPortfolio: number
}

export interface SimResult {
  /** One combined path: accumulation rows + decumulation rows */
  rows: SimRow[]
  /** Computed FIRE age as integer (null if not reachable within endAge) */
  fireAge: number | null
  /** Fractional FIRE age with sub-year precision (e.g. 52.3) */
  fireAgeFractional: number | null
  /** Portfolio value at the computed FIRE age */
  firePortfolioAtFire: number
  /** Minimum portfolio at fireAge so portfolio = 0 at endAge */
  requiredFirePortfolio: number
  /** Whether FIRE is reachable before endAge */
  fireReachable: boolean
  /** yearlyExpenses / requiredFirePortfolio */
  implicitWithdrawalRate: number
  /** Classic 25× comparison target */
  classic25xTarget: number
}

// ── Simulation Engine ───────────────────────────────────────────────────────

export function runSimulation(
  currentAge: number,
  endAge: number,
  currentPortfolio: number,
  yearlyExpenses: number,
  annualSavings: number,
  grossReturn: number,      // decimal, e.g. 0.07
  returnModel: ReturnModel,
  inflation: number,        // decimal, e.g. 0.02
  cashflows: SimCashflow[],
): SimResult {
  // Nominaal netto rendement — consistent voor zowel opbouw als afbouw
  const portReturn = returnModel === 'nl_box3'
    ? grossReturn - BOX3_DRAG
    : grossReturn

  const classic25xTarget = Math.round(yearlyExpenses * 25)

  /** Compute signed monthly cashflow amount for a recurring cashflow at a given age */
  function recurringMonthly(cf: SimCashflow, age: number): number {
    if (cf.type !== 'recurring') return 0
    if (age < cf.fromAge) return 0
    if (cf.toAge !== null && age >= cf.toAge) return 0
    const yrsActive = age - cf.fromAge
    const monthly = cf.indexed ? cf.amount * Math.pow(1 + inflation, yrsActive) : cf.amount
    return cf.direction === 'income' ? monthly : -monthly
  }

  /** Compute signed one-time amount for a one-time cashflow at a given age */
  function oneTimeAmount(cf: SimCashflow, age: number): number {
    if (cf.type !== 'one_time') return 0
    if (cf.fromAge !== age) return 0
    const yrsFromNow = age - currentAge
    const nominal = cf.indexed ? cf.amount * Math.pow(1 + inflation, yrsFromNow) : cf.amount
    return cf.direction === 'income' ? nominal : -nominal
  }

  /**
   * Simulate decumulation from startPortfolio at startAge to endAge.
   * portfolio is NOT clamped to 0 (for binary search convergence).
   * generateRows=true produces SimRows with endPortfolio clamped >= 0 for display.
   */
  function simulateDecumulation(
    startPortfolio: number,
    startAge: number,
    generateRows: boolean,
  ): { rows: SimRow[]; endPortfolio: number } {
    const rows: SimRow[] = []
    let portfolio = startPortfolio

    for (let age = startAge; age < endAge; age++) {
      const startPf = portfolio

      // Apply one-time cashflows to portfolio BEFORE growth
      let oneTimeNet = 0
      for (const cf of cashflows) {
        const amt = oneTimeAmount(cf, age)
        portfolio += amt
        oneTimeNet += amt
      }

      const yearsIntoPension = age - startAge
      const expensesThisYear = yearlyExpenses * Math.pow(1 + inflation, yearsIntoPension)

      // Recurring cashflows net this year
      let recurringNet = 0
      for (const cf of cashflows) {
        recurringNet += recurringMonthly(cf, age) * 12
      }

      const withdrawal = Math.max(0, expensesThisYear - recurringNet)
      const growth = portfolio * portReturn
      const rawEnd = portfolio + growth - withdrawal

      if (generateRows) {
        rows.push({
          age,
          phase: 'pensioen',
          startPortfolio: Math.round(startPf),
          growth: Math.round(growth),
          savings: 0,
          withdrawal: Math.round(withdrawal),
          cashflowNet: Math.round(oneTimeNet + recurringNet),
          endPortfolio: Math.round(Math.max(rawEnd, 0)),
        })
      }

      portfolio = rawEnd // unclamped for binary search convergence
    }

    return { rows, endPortfolio: portfolio }
  }

  /**
   * Binary search: minimum portfolio at candidateFireAge such that
   * decumulation results in endPortfolio ≈ 0 at endAge.
   */
  function requiredAt(candidateFireAge: number): number {
    let lo = 0
    let hi = Math.max(yearlyExpenses * 200, currentPortfolio * 10, 10_000_000)

    for (let iter = 0; iter < 60; iter++) {
      const mid = (lo + hi) / 2
      const { endPortfolio } = simulateDecumulation(mid, candidateFireAge, false)
      if (endPortfolio >= 0) {
        hi = mid
      } else {
        lo = mid
      }
      if (hi - lo < 10) break
    }

    return (lo + hi) / 2
  }

  // ── Phase 1: Accumulation + FIRE-age detection ─────────────────────────
  let portfolio = currentPortfolio
  let portfolioPreFire = currentPortfolio
  let computedFireAge: number | null = null
  const accRows: SimRow[] = []

  for (let age = currentAge; age < endAge; age++) {
    const req = requiredAt(age)
    if (portfolio >= req) {
      computedFireAge = age
      break
    }

    portfolioPreFire = portfolio

    let oneTimeNet = 0
    for (const cf of cashflows) {
      const amt = oneTimeAmount(cf, age)
      portfolio += amt
      oneTimeNet += amt
    }

    let cashflowNet = 0
    for (const cf of cashflows) {
      cashflowNet += recurringMonthly(cf, age) * 12
    }

    const effectiveSavings = annualSavings + cashflowNet
    const growth = portfolio * portReturn
    const endPortfolio = portfolio + growth + effectiveSavings

    accRows.push({
      age,
      phase: 'opbouw',
      startPortfolio: Math.round(portfolio),
      growth: Math.round(growth),
      savings: Math.round(annualSavings),
      withdrawal: 0,
      cashflowNet: Math.round(cashflowNet + oneTimeNet),
      endPortfolio: Math.round(Math.max(endPortfolio, 0)),
    })

    portfolio = endPortfolio
  }

  if (computedFireAge === null) {
    return {
      rows: accRows,
      fireAge: null,
      fireAgeFractional: null,
      firePortfolioAtFire: Math.round(portfolio),
      requiredFirePortfolio: Math.round(requiredAt(endAge - 1)),
      fireReachable: false,
      implicitWithdrawalRate: 0,
      classic25xTarget,
    }
  }

  // ── Phase 2: Decumulation from fireAge ─────────────────────────────────
  const firePortfolioAtFire = Math.round(portfolio)
  const requiredFirePortfolioExact = requiredAt(computedFireAge)
  const requiredFirePortfolio = Math.round(requiredFirePortfolioExact)

  // Fractional FIRE age via linear interpolation within the FIRE year
  let fractionalFireAge: number
  if (computedFireAge === currentAge) {
    fractionalFireAge = currentAge
  } else {
    const reqStart = requiredAt(computedFireAge - 1)
    const reqEnd = requiredFirePortfolioExact
    const portDiff = portfolio - portfolioPreFire
    const reqDiff = reqEnd - reqStart
    const denom = portDiff - reqDiff
    const t = denom !== 0 ? (reqStart - portfolioPreFire) / denom : 0.5
    fractionalFireAge = (computedFireAge - 1) + Math.max(0, Math.min(1, t))
  }

  const { rows: decRows } = simulateDecumulation(requiredFirePortfolioExact, computedFireAge, true)

  const implicitWithdrawalRate = requiredFirePortfolio > 0
    ? yearlyExpenses / requiredFirePortfolio
    : 0

  return {
    rows: [...accRows, ...decRows],
    fireAge: computedFireAge,
    fireAgeFractional: fractionalFireAge,
    firePortfolioAtFire,
    requiredFirePortfolio,
    fireReachable: true,
    implicitWithdrawalRate,
    classic25xTarget,
  }
}

// ── LifeEvent → SimCashflow conversie ──────────────────────────────────────

/**
 * Converteert app-data LifeEvents naar SimCashflows voor de simulatie-engine.
 * AOW wordt niet hardcoded toegevoegd — het staat als levensgebeurtenis in de DB.
 */
export function lifeEventsToCashflows(events: LifeEvent[]): SimCashflow[] {
  const flows: SimCashflow[] = []

  for (const ev of events) {
    if (!ev.is_active) continue
    const age = ev.target_age ?? null
    if (age === null) continue

    const isIndexed = ev.is_indexed ?? true

    // 1. Eenmalige kosten (one_time_cost) — eenmalige bedragen zijn nooit geïndexeerd
    const cost = Number(ev.one_time_cost ?? 0)
    if (cost !== 0) {
      flows.push({
        id: `le-cost-${ev.id}`,
        name: ev.name,
        type: 'one_time',
        direction: cost > 0 ? 'expense' : 'income',
        // Engine verwacht maandbedrag voor one_time dat intern × 12 gebruikt wordt.
        // Maar één-malig bedrag is een totaalbedrag — we geven het direct als jaarsbedrag
        // door amount/12 te doen zodat engine × 12 = het originele bedrag oplevert.
        amount: Math.abs(cost) / 12,
        fromAge: age,
        toAge: age,
        indexed: false,
      })
    }

    // 2. Maandelijkse kostenwijziging (monthly_cost_change)
    const monthlyCost = Number(ev.monthly_cost_change ?? 0)
    if (monthlyCost !== 0) {
      const toAge = ev.duration_months && ev.duration_months > 0
        ? age + Math.ceil(ev.duration_months / 12)
        : null
      flows.push({
        id: `le-costchange-${ev.id}`,
        name: ev.name,
        type: 'recurring',
        direction: monthlyCost > 0 ? 'expense' : 'income',
        amount: Math.abs(monthlyCost),
        fromAge: age,
        toAge,
        indexed: isIndexed,
      })
    }

    // 3. Maandelijkse inkomenswijziging (monthly_income_change)
    const monthlyIncome = Number(ev.monthly_income_change ?? 0)
    if (monthlyIncome !== 0) {
      const toAge = ev.duration_months && ev.duration_months > 0
        ? age + Math.ceil(ev.duration_months / 12)
        : null
      flows.push({
        id: `le-incomechange-${ev.id}`,
        name: ev.name,
        type: 'recurring',
        direction: monthlyIncome > 0 ? 'income' : 'expense',
        amount: Math.abs(monthlyIncome),
        fromAge: age,
        toAge,
        indexed: isIndexed,
      })
    }
  }

  return flows
}
