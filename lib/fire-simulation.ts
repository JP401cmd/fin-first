/**
 * FIRE Simulatie Engine — gedeelde logica voor fire-sim tool en De Horizon module.
 *
 * Bevat: typen, runSimulation(), lifeEventsToCashflows()
 * Pure functions, geen Supabase dependency.
 */

import {
  BOX3_DRAG,
  type LifeEvent,
  type ChildrenMetadata,
  type AOWMetadata,
  type InheritanceMetadata,
  NIBUD_CHILDREN_MONTHLY_COST,
  NL_AOW_MONTHLY,
  NL_AOW_MONTHLY_SAMENWONEND,
  berekenErfbelasting,
  berekenKinderopvangNetto,
  kinderbijslagPerMaand,
} from '@/lib/horizon-data'
import { type FireEndStrategy, type FireStrategyConfig, DEFAULT_FIRE_STRATEGY } from '@/lib/fire-strategy'

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
  phase: 'accumulation' | 'retirement'
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
  /** Which strategy was used */
  strategy: FireEndStrategy
  /** Target end portfolio (0 for deplete, indexed legacy amount, 0 for perpetual) */
  targetEndPortfolio: number
  /** Effective end age used for display (chart x-axis) */
  displayEndAge: number
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
  strategyConfig?: FireStrategyConfig,
): SimResult {
  // Resolve strategy (default = deplete@endAge for backward compat)
  const cfg = strategyConfig ?? DEFAULT_FIRE_STRATEGY
  const strategy = cfg.strategy
  const effectiveEndAge = strategy === 'perpetual' ? Math.max(endAge, 100) : cfg.endAge
  const legacyAmount = cfg.legacyAmount
  // Display horizon: for perpetual use config.endAge (or 100); for others use effectiveEndAge
  const displayEndAge = strategy === 'perpetual' ? cfg.endAge : effectiveEndAge

  // Nominaal netto rendement — consistent voor zowel opbouw als afbouw
  const portReturn = returnModel === 'nl_box3'
    ? grossReturn - BOX3_DRAG
    : grossReturn

  // Perpetual met negatief reëel rendement is onmogelijk
  if (strategy === 'perpetual' && portReturn <= inflation) {
    return {
      rows: [],
      fireAge: null,
      fireAgeFractional: null,
      firePortfolioAtFire: Math.round(currentPortfolio),
      requiredFirePortfolio: 0,
      fireReachable: false,
      implicitWithdrawalRate: 0,
      classic25xTarget: Math.round(yearlyExpenses * 25),
      strategy,
      targetEndPortfolio: 0,
      displayEndAge,
    }
  }

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
    simEndAge: number = effectiveEndAge,
  ): { rows: SimRow[]; endPortfolio: number } {
    const rows: SimRow[] = []
    let portfolio = startPortfolio

    for (let age = startAge; age < simEndAge; age++) {
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
          phase: 'retirement',
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
   * Binary search: minimum portfolio at candidateFireAge such that the
   * decumulation meets the strategy target at the verification horizon.
   */
  function requiredAt(candidateFireAge: number): number {
    // Verification horizon: perpetual simulates 100 years post-FIRE
    const verifyEndAge = strategy === 'perpetual'
      ? candidateFireAge + 100
      : effectiveEndAge

    let lo = 0
    let hi = Math.max(
      yearlyExpenses * (strategy === 'perpetual' ? 500 : 200),
      currentPortfolio * 10,
      10_000_000,
    )

    // Indexed legacy target on endAge
    const indexedLegacy = strategy === 'legacy'
      ? legacyAmount * Math.pow(1 + inflation, effectiveEndAge - currentAge)
      : 0

    for (let iter = 0; iter < 60; iter++) {
      const mid = (lo + hi) / 2
      const { endPortfolio: ep } = simulateDecumulation(mid, candidateFireAge, false, verifyEndAge)

      if (strategy === 'legacy') {
        if (ep >= indexedLegacy) hi = mid; else lo = mid
      } else {
        // deplete: endPortfolio >= 0 at endAge
        // perpetual: endPortfolio >= 0 at fireAge+100 (effectively perpetual)
        if (ep >= 0) hi = mid; else lo = mid
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

  for (let age = currentAge; age < effectiveEndAge; age++) {
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
      phase: 'accumulation',
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
      requiredFirePortfolio: Math.round(requiredAt(effectiveEndAge - 1)),
      fireReachable: false,
      implicitWithdrawalRate: 0,
      classic25xTarget,
      strategy,
      targetEndPortfolio: strategy === 'legacy' ? legacyAmount : 0,
      displayEndAge,
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

  const { rows: decRows } = simulateDecumulation(requiredFirePortfolioExact, computedFireAge, true, displayEndAge)

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
    strategy,
    targetEndPortfolio: strategy === 'legacy'
      ? Math.round(legacyAmount * Math.pow(1 + inflation, effectiveEndAge - currentAge))
      : 0,
    displayEndAge,
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
    const meta = ev.metadata ?? {}

    // ── Metadata-enhanced processing per event type ──
    // When metadata is present, generate more accurate phased cashflows
    // and skip the generic fallback for the same cost categories.

    let skipGenericCost = false
    let skipGenericMonthlyCost = false
    let skipGenericMonthlyIncome = false

    // Children: phased costs by age period (NIBUD-based) + kinderopvang + kinderbijslag
    if (ev.event_type === 'children' && meta.aantalKinderen) {
      const m = meta as ChildrenMetadata
      const count = Math.min(4, Math.max(1, Number(m.aantalKinderen) || 1))
      // NIBUD phases: 0-3 baby (120%), 4-11 basisschool (100%), 12-17 tiener (130%)
      const baseCost = NIBUD_CHILDREN_MONTHLY_COST[count] ?? NIBUD_CHILDREN_MONTHLY_COST[4]!
      const phases = [
        { label: 'baby/peuter', factor: 1.2, fromAge: age, toAge: age + 4 },
        { label: 'basisschool', factor: 1.0, fromAge: age + 4, toAge: age + 12 },
        { label: 'tiener', factor: 1.3, fromAge: age + 12, toAge: age + 18 },
      ]
      for (const phase of phases) {
        const amount = Math.round(baseCost * phase.factor)
        flows.push({
          id: `le-children-${phase.label}-${ev.id}`,
          name: `${ev.name} (${phase.label})`,
          type: 'recurring',
          direction: 'expense',
          amount,
          fromAge: phase.fromAge,
          toAge: phase.toAge,
          indexed: true,
        })
      }

      // Kinderopvang: netto kosten na toeslag, typisch 0-4 jaar
      const opvangDagen = Number(m.kinderopvangDagen ?? 0)
      if (opvangDagen > 0) {
        const nettoOpvang = berekenKinderopvangNetto(opvangDagen, count)
        flows.push({
          id: `le-children-opvang-${ev.id}`,
          name: `${ev.name} (kinderopvang)`,
          type: 'recurring',
          direction: 'expense',
          amount: nettoOpvang,
          fromAge: age,
          toAge: age + 4, // Kinderopvang typically 0-4 years
          indexed: true,
        })
      }

      // Kinderbijslag: income over full 0-18 period
      const useKinderbijslag = m.kinderbijslag !== false
      if (useKinderbijslag) {
        const kbPerMaand = kinderbijslagPerMaand(count)
        flows.push({
          id: `le-children-kb-${ev.id}`,
          name: `${ev.name} (kinderbijslag)`,
          type: 'recurring',
          direction: 'income',
          amount: kbPerMaand,
          fromAge: age,
          toAge: age + 18,
          indexed: true,
        })
      }

      skipGenericMonthlyCost = true
      skipGenericMonthlyIncome = true
    }

    // AOW: adjust amount based on leefsituatie and opbouwpercentage
    if (ev.event_type === 'aow' && (meta.leefsituatie || meta.jarenBuitenNL)) {
      const m = meta as AOWMetadata
      const leefsituatie = m.leefsituatie ?? 'alleenstaand'
      const jarenBuiten = Math.min(50, Math.max(0, Number(m.jarenBuitenNL ?? m.jarenInNL ?? 0)))
      const opbouwFactor = (50 - jarenBuiten) / 50
      const baseAmount = leefsituatie === 'samenwonend' ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
      const adjustedAmount = Math.round(baseAmount * opbouwFactor)
      if (adjustedAmount > 0) {
        flows.push({
          id: `le-aow-adjusted-${ev.id}`,
          name: ev.name,
          type: 'recurring',
          direction: 'income',
          amount: adjustedAmount,
          fromAge: age,
          toAge: null, // AOW is levenslang
          indexed: true,
        })
      }
      skipGenericMonthlyIncome = true
    }

    // Inheritance: calculate netto after erfbelasting
    if (ev.event_type === 'inheritance' && meta.brutoBedrag) {
      const m = meta as InheritanceMetadata
      const bruto = Number(m.brutoBedrag) || 0
      const relatie = m.erfbelastingSchijf ?? 'overig'
      const result = berekenErfbelasting(bruto, relatie)
      const netto = result.netto
      if (netto > 0) {
        flows.push({
          id: `le-inheritance-netto-${ev.id}`,
          name: ev.name,
          type: 'one_time',
          direction: 'income',
          amount: netto,
          fromAge: age,
          toAge: age,
          indexed: false,
        })
      }
      skipGenericCost = true
    }

    // ── Generic fallback: use stored amounts (backward compatible) ──

    // 1. Eenmalige kosten (one_time_cost) — eenmalige bedragen zijn nooit geïndexeerd
    if (!skipGenericCost) {
      const cost = Number(ev.one_time_cost ?? 0)
      if (cost !== 0) {
        flows.push({
          id: `le-cost-${ev.id}`,
          name: ev.name,
          type: 'one_time',
          direction: cost > 0 ? 'expense' : 'income',
          amount: Math.abs(cost),
          fromAge: age,
          toAge: age,
          indexed: false,
        })
      }
    }

    // 2. Maandelijkse kostenwijziging (monthly_cost_change)
    if (!skipGenericMonthlyCost) {
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
    }

    // 3. Maandelijkse inkomenswijziging (monthly_income_change)
    if (!skipGenericMonthlyIncome) {
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
  }

  return flows
}
