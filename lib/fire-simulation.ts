/**
 * FIRE Simulatie Engine — gedeelde logica voor fire-sim tool en De Horizon module.
 *
 * Bevat: typen, runSimulation(), lifeEventsToCashflows()
 * Pure functions, geen Supabase dependency.
 */

import {
  BOX3_DRAG,
  type LifeEvent,
  type UserDefinedCashflow,
  type ChildrenMetadata,
  type AOWMetadata,
  type InheritanceMetadata,
  type BegrafenisMetadata,
  NIBUD_CHILDREN_MONTHLY_COST,
  NL_AOW_MONTHLY,
  NL_AOW_MONTHLY_SAMENWONEND,
  berekenErfbelasting,
  berekenKinderopvangNetto,
  kinderbijslagPerMaand,
} from '@/lib/horizon-data'
import { type FireEndStrategy, type FireStrategyConfig, DEFAULT_FIRE_STRATEGY } from '@/lib/fire-strategy'
import {
  applyWithdrawalStrategy,
  WITHDRAWAL_DEFAULTS,
  type WithdrawalStrategyConfig,
  type WithdrawalContext,
} from '@/lib/withdrawal-strategy'

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

export interface IncomeExpenseItem {
  id: string        // 'savings' | 'growth' | 'withdrawal' | 'box3' | cf.id
  label: string     // 'Besparingen' | 'Rendement' | cf.name
  amount: number    // altijd positief
}

export interface SimRow {
  age: number
  phase: 'accumulation' | 'retirement'
  startPortfolio: number
  growth: number
  savings: number
  withdrawal: number
  cashflowNet: number
  oneTimeNet: number
  endPortfolio: number
  grossIncome: number
  grossExpenses: number
  /** Vermogensstromen: totaal aanvulling op netto vermogen */
  flowIn: number
  /** Vermogensstromen: totaal onttrekking van netto vermogen */
  flowOut: number
  incomeBreakdown?: IncomeExpenseItem[]
  expenseBreakdown?: IncomeExpenseItem[]
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
  withdrawalStrategy?: WithdrawalStrategyConfig,
  /** Force FIRE transition at this age (used by pensioen strategy). Skips binary-search detection. */
  forcedFireAge?: number,
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

  /** Compute signed yearly amount for a recurring cashflow, prorated for partial years */
  function recurringYearly(cf: SimCashflow, age: number): number {
    const monthly = recurringMonthly(cf, age)
    if (monthly === 0) return 0
    const cfEnd = cf.toAge ?? (age + 1)
    const months = Math.round(Math.min(12, Math.max(0, (Math.min(age + 1, cfEnd) - Math.max(age, cf.fromAge)) * 12)))
    return monthly * months
  }

  /** Compute signed one-time amount for a one-time cashflow at a given age */
  function oneTimeAmount(cf: SimCashflow, age: number): number {
    if (cf.type !== 'one_time') return 0
    if (cf.fromAge !== age) return 0
    const yrsFromNow = age - currentAge
    const nominal = cf.indexed ? cf.amount * Math.pow(1 + inflation, yrsFromNow) : cf.amount
    return cf.direction === 'income' ? nominal : -nominal
  }

  // Resolve withdrawal strategy — default to static (identical to old hardcoded logic)
  const wsConfig = withdrawalStrategy ?? WITHDRAWAL_DEFAULTS

  // VPW + perpetual/legacy is onverenigbaar: VPW onttrekt per definitie volledig
  // binnen de resterende horizon (vpwRate=1.0 in laatste jaar), wat conflicteert met
  // eeuwigdurend vermogensbehoud (perpetual) en nalatenschap (legacy).
  // VPW is alleen compatibel met 'deplete' (portfolio → €0 op einddatum).
  if ((strategy === 'perpetual' || strategy === 'legacy') && wsConfig.strategy === 'vpw') {
    return {
      rows: [],
      fireAge: null,
      fireAgeFractional: null,
      firePortfolioAtFire: Math.round(currentPortfolio),
      requiredFirePortfolio: 0,
      fireReachable: false,
      implicitWithdrawalRate: 0,
      classic25xTarget,
      strategy,
      targetEndPortfolio: 0,
      displayEndAge,
    }
  }

  /**
   * Simulate decumulation from startPortfolio at startAge to endAge.
   * portfolio is NOT clamped to 0 (for binary search convergence).
   * generateRows=true produces SimRows with endPortfolio clamped >= 0 for display.
   *
   * useWithdrawalStrategy: when true, applies the configured withdrawal strategy
   * (static/guardrails/vpw/bucket). Both binary search and visualisation now use
   * the chosen strategy, so each strategy yields its own FIRE-leeftijd.
   * When false, uses WITHDRAWAL_DEFAULTS (static) as conservative fallback.
   */
  function simulateDecumulation(
    startPortfolio: number,
    startAge: number,
    generateRows: boolean,
    simEndAge: number = effectiveEndAge,
    useWithdrawalStrategy: boolean = false,
  ): { rows: SimRow[]; endPortfolio: number } {
    const rows: SimRow[] = []
    let portfolio = startPortfolio
    let previousWithdrawal = 0
    // Portfolio at FIRE/AOW age, used as guardrails anchor.
    // In pensioen mode (forcedFireAge), this is the ACTUAL portfolio at AOW age,
    // which can be €1M+ after decades of saving. Guardrails floor/ceiling are
    // computed relative to this value. See withdrawal-strategy.ts applyGuardrails
    // and feature #475 for documented behavior with high portfolios.
    const decumStartPortfolio = startPortfolio

    // Determine which config to use: dynamic for visualisation, static for binary search
    const activeConfig = useWithdrawalStrategy ? wsConfig : WITHDRAWAL_DEFAULTS

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

      // Recurring cashflows net this year — split into positive (income) and negative (expense)
      let recurringNet = 0
      let recurringIncome = 0
      let recurringExpense = 0
      const retIncomeItems: IncomeExpenseItem[] = []
      const retExpenseItems: IncomeExpenseItem[] = []
      for (const cf of cashflows) {
        const val = recurringYearly(cf, age)
        recurringNet += val
        if (val > 0) {
          recurringIncome += val
          retIncomeItems.push({ id: cf.id, label: cf.name, amount: val })
        } else if (val < 0) {
          recurringExpense += Math.abs(val)
          retExpenseItems.push({ id: cf.id, label: cf.name, amount: Math.abs(val) })
        }
      }

      // Split one-time cashflows into income/expense
      let oneTimeIncome = 0
      let oneTimeExpense = 0
      for (const cf of cashflows) {
        const amt = oneTimeAmount(cf, age)
        // Note: oneTimeNet already accumulated above; here we just classify
        if (amt > 0) {
          oneTimeIncome += amt
          retIncomeItems.push({ id: cf.id, label: cf.name, amount: amt })
        } else if (amt < 0) {
          oneTimeExpense += Math.abs(amt)
          retExpenseItems.push({ id: cf.id, label: cf.name, amount: Math.abs(amt) })
        }
      }

      // Build withdrawal context and apply strategy
      // Only pass endStrategy for visualization rows (useWithdrawalStrategy=true).
      // Binary search (useWithdrawalStrategy=false) uses pure static withdrawal
      // to reliably converge — the simulation horizon handles deplete vs perpetual.
      const wCtx: WithdrawalContext = {
        baseExpenses: expensesThisYear,
        recurringIncome: recurringNet,
        currentPortfolio: portfolio,
        startPortfolio: decumStartPortfolio,
        previousWithdrawal,
        yearReturn: portReturn,
        yearsIntoRetirement: yearsIntoPension,
        currentAge: age,
        endAge: simEndAge,
        endStrategy: useWithdrawalStrategy ? strategy : undefined,
        inflation,
      }
      const withdrawal = applyWithdrawalStrategy(activeConfig, wCtx)

      const growth = portfolio * portReturn
      const rawEnd = portfolio + growth - withdrawal

      if (generateRows) {
        // grossIncome: portfolio growth + positive cashflows
        const rowGrossIncome = Math.max(0, growth) + recurringIncome + oneTimeIncome
        // grossExpenses: withdrawal (onttrekking) + negative cashflows
        const rowGrossExpenses = withdrawal + recurringExpense + oneTimeExpense

        // Build breakdown: vermogensstromen (flows to/from net worth)
        const grossGrowthRet = portfolio * grossReturn
        const box3TaxRet = returnModel === 'nl_box3' ? portfolio * BOX3_DRAG : 0

        const incomeBreakdown: IncomeExpenseItem[] = [
          ...(grossGrowthRet > 0 ? [{ id: 'growth', label: 'Rendement', amount: Math.round(grossGrowthRet) }] : []),
          ...retIncomeItems.map(it => ({ ...it, amount: Math.round(it.amount) })),
        ]
        const expenseBreakdown: IncomeExpenseItem[] = [
          ...(withdrawal > 0 ? [{ id: 'withdrawal', label: 'Levensonderhoud', amount: Math.round(withdrawal) }] : []),
          ...(box3TaxRet > 0 ? [{ id: 'box3', label: 'Box 3 belasting', amount: Math.round(box3TaxRet) }] : []),
          ...retExpenseItems.map(it => ({ ...it, amount: Math.round(it.amount) })),
        ]

        // flowIn/flowOut: vermogensstromen (flows to/from net worth)
        const retFlowIn = Math.max(0, grossGrowthRet) + recurringIncome + oneTimeIncome
        const retFlowOut = withdrawal + box3TaxRet + recurringExpense + oneTimeExpense

        rows.push({
          age,
          phase: 'retirement',
          startPortfolio: Math.round(startPf),
          growth: Math.round(growth),
          savings: 0,
          withdrawal: Math.round(withdrawal),
          cashflowNet: Math.round(recurringNet),
          oneTimeNet: Math.round(oneTimeNet),
          endPortfolio: Math.round(Math.max(rawEnd, 0)),
          grossIncome: Math.round(rowGrossIncome),
          grossExpenses: Math.round(rowGrossExpenses),
          flowIn: Math.round(retFlowIn),
          flowOut: Math.round(retFlowOut),
          incomeBreakdown,
          expenseBreakdown,
        })
      }

      previousWithdrawal = withdrawal
      portfolio = rawEnd // unclamped for binary search convergence
    }

    return { rows, endPortfolio: portfolio }
  }

  /**
   * Binary search: minimum portfolio at candidateFireAge such that the
   * decumulation meets the strategy target at the verification horizon.
   *
   * Gebruikt de gekozen onttrekkingsstrategie (static/guardrails/vpw/bucket)
   * zodat elke strategie een eigen FIRE-leeftijd oplevert.
   *
   * Convergentie-notities:
   * Binary search uses static withdrawal strategy for all strategies to ensure
   * reliable convergence. Dynamic strategies (guardrails/VPW) have circular
   * dependencies with the trial value that cause unrealistic convergence.
   * The chosen strategy is used for final visualization rows only.
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

    // Binary search always uses static withdrawal strategy for reliable convergence.
    // Guardrails/VPW use startPortfolio as anchor for thresholds — when startPortfolio
    // equals the trial value `mid`, lower trials shift thresholds down, creating a
    // self-reinforcing spiral that converges to unrealistically low required portfolios.
    // The chosen strategy is still used for the final visualization rows (line 443+).
    for (let iter = 0; iter < 80; iter++) {
      const mid = (lo + hi) / 2
      const { endPortfolio: ep } = simulateDecumulation(mid, candidateFireAge, false, verifyEndAge, false)

      if (strategy === 'legacy') {
        if (ep >= indexedLegacy) hi = mid; else lo = mid
      } else if (strategy === 'perpetual') {
        // perpetual: koopkracht behouden — endPortfolio moet geïndexeerd startportfolio dekken
        const indexedTarget = mid * Math.pow(1 + inflation, verifyEndAge - candidateFireAge)
        if (ep >= indexedTarget) hi = mid; else lo = mid
      } else {
        // deplete: endPortfolio >= 0 at endAge
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

  // Determine the accumulation end: either forcedFireAge or effectiveEndAge (whichever is smaller)
  const accEndAge = forcedFireAge != null
    ? Math.min(forcedFireAge, effectiveEndAge)
    : effectiveEndAge

  for (let age = currentAge; age < accEndAge; age++) {
    // When forcedFireAge is set, skip binary-search FIRE detection (we force at specific age)
    if (forcedFireAge == null) {
      const req = requiredAt(age)
      if (portfolio >= req) {
        computedFireAge = age
        break
      }
    }

    portfolioPreFire = portfolio

    // Save portfolio before one-time cashflows for accurate startPortfolio
    const portfolioPreOneTime = portfolio

    let oneTimeNet = 0
    for (const cf of cashflows) {
      const amt = oneTimeAmount(cf, age)
      portfolio += amt
      oneTimeNet += amt
    }

    let cashflowNet = 0
    let cfIncome = 0
    let cfExpense = 0
    const accIncomeItems: IncomeExpenseItem[] = []
    const accExpenseItems: IncomeExpenseItem[] = []
    for (const cf of cashflows) {
      const val = recurringYearly(cf, age)
      cashflowNet += val
      if (val > 0) {
        cfIncome += val
        accIncomeItems.push({ id: cf.id, label: cf.name, amount: val })
      } else if (val < 0) {
        cfExpense += Math.abs(val)
        accExpenseItems.push({ id: cf.id, label: cf.name, amount: Math.abs(val) })
      }
    }

    // Split one-time cashflows into income/expense for gross calculations
    let otIncome = 0
    let otExpense = 0
    for (const cf of cashflows) {
      const amt = oneTimeAmount(cf, age)
      if (amt > 0) {
        otIncome += amt
        accIncomeItems.push({ id: cf.id, label: cf.name, amount: amt })
      } else if (amt < 0) {
        otExpense += Math.abs(amt)
        accExpenseItems.push({ id: cf.id, label: cf.name, amount: Math.abs(amt) })
      }
    }

    const effectiveSavings = annualSavings + cashflowNet
    const growth = portfolio * portReturn
    const endPortfolio = portfolio + growth + effectiveSavings

    // grossIncome: netto maandinkomen×12 (= annualSavings + yearlyExpenses) + positive cashflows (no growth)
    const accGrossIncome = annualSavings + yearlyExpenses + cfIncome + otIncome
    // grossExpenses: jaarlijkse uitgaven + negative cashflows
    const accGrossExpenses = yearlyExpenses + cfExpense + otExpense

    // Build breakdown: vermogensstromen (flows to/from net worth)
    const grossGrowthAcc = portfolio * grossReturn
    const box3TaxAcc = returnModel === 'nl_box3' ? portfolio * BOX3_DRAG : 0

    const incomeBreakdown: IncomeExpenseItem[] = [
      ...(annualSavings > 0 ? [{ id: 'savings', label: 'Besparingen', amount: Math.round(annualSavings) }] : []),
      ...(grossGrowthAcc > 0 ? [{ id: 'growth', label: 'Rendement', amount: Math.round(grossGrowthAcc) }] : []),
      ...accIncomeItems.map(it => ({ ...it, amount: Math.round(it.amount) })),
    ]
    const expenseBreakdown: IncomeExpenseItem[] = [
      ...(box3TaxAcc > 0 ? [{ id: 'box3', label: 'Box 3 belasting', amount: Math.round(box3TaxAcc) }] : []),
      ...accExpenseItems.map(it => ({ ...it, amount: Math.round(it.amount) })),
    ]

    // flowIn/flowOut: vermogensstromen (flows to/from net worth)
    const accFlowIn = Math.max(0, annualSavings) + Math.max(0, grossGrowthAcc) + cfIncome + otIncome
    const accFlowOut = box3TaxAcc + cfExpense + otExpense

    accRows.push({
      age,
      phase: 'accumulation',
      startPortfolio: Math.round(portfolioPreOneTime),
      growth: Math.round(growth),
      savings: Math.round(annualSavings),
      withdrawal: 0,
      cashflowNet: Math.round(cashflowNet),
      oneTimeNet: Math.round(oneTimeNet),
      endPortfolio: Math.round(Math.max(endPortfolio, 0)),
      grossIncome: Math.round(accGrossIncome),
      grossExpenses: Math.round(accGrossExpenses),
      flowIn: Math.round(accFlowIn),
      flowOut: Math.round(accFlowOut),
      incomeBreakdown,
      expenseBreakdown,
    })

    portfolio = endPortfolio
  }

  // If forcedFireAge is set, always transition at that age (regardless of portfolio level)
  if (forcedFireAge != null && computedFireAge == null && forcedFireAge <= effectiveEndAge) {
    computedFireAge = forcedFireAge
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
      targetEndPortfolio: strategy === 'legacy'
        ? legacyAmount
        : strategy === 'perpetual'
          ? Math.round(requiredAt(effectiveEndAge - 1) * Math.pow(1 + inflation, effectiveEndAge - currentAge))
          : 0,
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

  // Use withdrawal strategy for visualisation rows — consistent with binary search
  // which now also uses the chosen strategy (since FIRE-leeftijd is strategie-afhankelijk)
  // Always start decumulation from actual portfolio (firePortfolioAtFire) to avoid
  // visual discontinuity at FIRE age. The graph should show a continuous line —
  // the last accumulation row's endPortfolio must match the first decumulation row's startPortfolio.
  // Previously only pensioen-modus (forcedFireAge) used actual portfolio; now all modes do (#511).
  //
  // NOTE (#475): This value becomes the guardrails anchoring point (decumStartPortfolio
  // inside simulateDecumulation). For high portfolios (€1M+), guardrails
  // will keep withdrawals stable around base expenses — this is correct behavior.
  // See withdrawal-strategy.ts applyGuardrails docs for full analysis.
  const decStartPortfolio = portfolio
  const { rows: decRows } = simulateDecumulation(decStartPortfolio, computedFireAge, true, displayEndAge, true)

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
      : strategy === 'perpetual'
        ? Math.round(requiredFirePortfolioExact * Math.pow(1 + inflation, displayEndAge - computedFireAge))
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

    // Begrafenis: eenmalige kost = uitvaartkosten + extraWensen - verzekeringDekking + grafrechten
    if (ev.event_type === 'begrafenis') {
      const m = meta as BegrafenisMetadata
      const uitvaartkosten = Number(m.uitvaartkosten ?? 9000)
      const extraWensen = Number(m.extraWensen ?? 0)
      const heeftVerzekering = m.heeftVerzekering ?? false
      const verzekeringDekking = heeftVerzekering ? Number(m.verzekeringDekking ?? 0) : 0
      const uitvaartType = m.uitvaartType ?? 'begraven'
      const grafrechtenJaar = Number(m.grafrechtenJaar ?? 20)

      // Grafrechten: alleen bij begraven of natuurbegraven (niet bij crematie)
      // Geschatte kosten: ~€150/jaar voor grafrechten
      const grafrechtenKosten = (uitvaartType === 'begraven' || uitvaartType === 'natuurbegraven') && grafrechtenJaar > 0
        ? Math.round(grafrechtenJaar * 150)
        : 0

      const nettoKosten = Math.max(0, uitvaartkosten + extraWensen + grafrechtenKosten - verzekeringDekking)

      if (nettoKosten > 0) {
        flows.push({
          id: `le-begrafenis-${ev.id}`,
          name: ev.name,
          type: 'one_time',
          direction: 'expense',
          amount: nettoKosten,
          fromAge: age,
          toAge: age,
          indexed: false,
        })
      }
      skipGenericCost = true
    }

    // ── User-defined custom cashflows from metadata ──
    const customFlows = (meta.cashflows as UserDefinedCashflow[] | undefined) ?? []
    if (customFlows.length > 0) {
      for (const cf of customFlows) {
        const dur = cf.durationMonths > 0 ? Math.ceil(cf.durationMonths / 12) : null
        flows.push({
          id: `le-custom-${ev.id}-${cf.id}`,
          name: cf.name || ev.name,
          type: cf.type,
          direction: cf.direction,
          amount: cf.amount,
          fromAge: age,
          toAge: dur != null ? age + dur : null,
          indexed: cf.indexed,
        })
      }
      // Custom cashflows replace the generic fallback
      skipGenericCost = true
      skipGenericMonthlyCost = true
      skipGenericMonthlyIncome = true
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
          ? age + ev.duration_months / 12
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
          ? age + ev.duration_months / 12
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

/**
 * Preview cashflows for a single life event, regardless of is_active or target_age.
 * Useful for displaying calculated flows in modal previews before saving.
 */
export function previewEventCashflows(event: LifeEvent): SimCashflow[] {
  const previewEvent: LifeEvent = {
    ...event,
    is_active: true,
    target_age: event.target_age ?? 40, // fallback for preview
  }
  return lifeEventsToCashflows([previewEvent])
}
