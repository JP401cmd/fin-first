/**
 * Withdrawal Strategy types, resolver, and engine — single source of truth.
 *
 * Vier strategieën:
 * 1. static  — Vaste onttrekking (klassieke SWR, bijv. 4% regel)
 * 2. guardrails — Guyton-Klinger guardrails: verlaag/verhoog onttrekking
 *    op basis van portfolioprestatie, begrensd door floor en ceiling
 * 3. vpw  — Variable Percentage Withdrawal: jaarlijks herberekend %
 *    op basis van resterende levensverwachting en portfoliowaarde
 * 4. bucket — Bucket-strategie: 3 emmers (cash/bonds/equity) met
 *    hervulling vanuit groei-emmer
 *
 * applyWithdrawalStrategy() is een PURE functie — geen side effects,
 * geen database calls, geen UI.
 */

// ── Types ────────────────────────────────────────────────────────────

export type WithdrawalStrategyType = 'static' | 'guardrails' | 'vpw' | 'bucket'

export interface WithdrawalStrategyConfig {
  strategy: WithdrawalStrategyType
  /** Minimale onttrekking als fractie van basis (alleen guardrails) */
  guardrailFloor: number
  /** Maximale onttrekking als fractie van basis (alleen guardrails) */
  guardrailCeiling: number
  /** Verlagingsstap bij slechte returns (alleen guardrails) */
  guardrailCutStep: number
  /** Verhogingsstap bij goede returns (alleen guardrails) */
  guardrailRaiseStep: number
}

/** Context for applyWithdrawalStrategy — all values for ONE simulation year */
export interface WithdrawalContext {
  /** Jaarlijkse basisuitgaven (geïndexeerd voor inflatie) */
  baseExpenses: number
  /** Jaarlijks terugkerend inkomen (AOW, pensioen, etc.) */
  recurringIncome: number
  /** Huidig portfoliobedrag (begin van dit jaar, na cashflows) */
  currentPortfolio: number
  /** Portfolio bij start van pensioen (voor guardrails ratio-berekening) */
  startPortfolio: number
  /** Onttrekking vorig jaar (voor guardrails aanpassing) */
  previousWithdrawal: number
  /** Rendement afgelopen jaar als fractie (bijv. 0.07 voor 7%) */
  yearReturn: number
  /** Jaren sinds start pensioen (0 = eerste jaar) */
  yearsIntoRetirement: number
  /** Huidige leeftijd */
  currentAge: number
  /** Eindleeftijd (voor VPW resterende-jaren berekening) */
  endAge: number
}

/** State for bucket strategy — tracks allocation across 3 buckets */
export interface BucketState {
  /** Cash bucket (1-2 jaar uitgaven) */
  cash: number
  /** Obligaties bucket (3-5 jaar uitgaven) */
  bonds: number
  /** Aandelen bucket (rest) */
  stocks: number
}

// ── Defaults ─────────────────────────────────────────────────────────

export const WITHDRAWAL_DEFAULTS: WithdrawalStrategyConfig = {
  strategy: 'static',
  guardrailFloor: 0.80,
  guardrailCeiling: 1.20,
  guardrailCutStep: 0.10,
  guardrailRaiseStep: 0.10,
} as const

// ── Resolver ─────────────────────────────────────────────────────────

/**
 * Resolve withdrawal strategy config from user profile.
 * Falls back to WITHDRAWAL_DEFAULTS for any missing/null field.
 */
export function resolveWithdrawalStrategy(profile: {
  withdrawal_strategy?: string | null
  guardrail_floor?: number | null
  guardrail_ceiling?: number | null
  guardrail_cut_step?: number | null
  guardrail_raise_step?: number | null
}): WithdrawalStrategyConfig {
  const validStrategies: WithdrawalStrategyType[] = ['static', 'guardrails', 'vpw', 'bucket']

  const strategy: WithdrawalStrategyType =
    validStrategies.includes(profile.withdrawal_strategy as WithdrawalStrategyType)
      ? (profile.withdrawal_strategy as WithdrawalStrategyType)
      : WITHDRAWAL_DEFAULTS.strategy

  return {
    strategy,
    guardrailFloor: profile.guardrail_floor ?? WITHDRAWAL_DEFAULTS.guardrailFloor,
    guardrailCeiling: profile.guardrail_ceiling ?? WITHDRAWAL_DEFAULTS.guardrailCeiling,
    guardrailCutStep: profile.guardrail_cut_step ?? WITHDRAWAL_DEFAULTS.guardrailCutStep,
    guardrailRaiseStep: profile.guardrail_raise_step ?? WITHDRAWAL_DEFAULTS.guardrailRaiseStep,
  }
}

// ── Engine ───────────────────────────────────────────────────────────

/**
 * Pure function: compute the withdrawal amount for one simulation year.
 *
 * CRITICAL: the 'static' strategy MUST produce byte-for-byte identical
 * results to the current hardcoded logic in simulateDecumulation:
 *   withdrawal = Math.max(0, baseExpenses - recurringIncome)
 *
 * Returns the withdrawal amount (≥ 0).
 */
export function applyWithdrawalStrategy(
  config: WithdrawalStrategyConfig,
  ctx: WithdrawalContext,
  bucketState?: BucketState,
): number {
  switch (config.strategy) {
    case 'static':
      return applyStatic(ctx)
    case 'guardrails':
      return applyGuardrails(config, ctx)
    case 'vpw':
      return applyVpw(config, ctx)
    case 'bucket':
      return applyBucket(config, ctx, bucketState)
    default:
      return applyStatic(ctx)
  }
}

// ── Static ───────────────────────────────────────────────────────────

/**
 * Static withdrawal: exact replication of current simulateDecumulation logic.
 * withdrawal = max(0, baseExpenses - recurringIncome)
 */
function applyStatic(ctx: WithdrawalContext): number {
  return Math.max(0, ctx.baseExpenses - ctx.recurringIncome)
}

// ── Guardrails (Guyton-Klinger) ──────────────────────────────────────

/**
 * Guyton-Klinger guardrails strategy:
 *
 * 1. Start with base withdrawal (same as static for first year)
 * 2. Prosperity rule: if portfolio > ceiling * startPortfolio → raise withdrawal
 * 3. Capital preservation rule: if portfolio < floor * startPortfolio → cut withdrawal
 * 4. Inflation skip: no inflation adjustment in years with negative returns
 * 5. Clamp final withdrawal between floor*base and ceiling*base
 */
function applyGuardrails(
  config: WithdrawalStrategyConfig,
  ctx: WithdrawalContext,
): number {
  const netBaseExpenses = Math.max(0, ctx.baseExpenses - ctx.recurringIncome)

  // First year of retirement: use static withdrawal
  if (ctx.yearsIntoRetirement === 0 || ctx.previousWithdrawal <= 0) {
    return netBaseExpenses
  }

  // Start from previous year's withdrawal
  let withdrawal = ctx.previousWithdrawal

  // Inflation skip rule: skip inflation adjustment in negative-return years
  // (In positive years, inflation is already baked into baseExpenses via caller)
  if (ctx.yearReturn < 0) {
    // Don't adjust for inflation — keep nominal amount from last year
    // (withdrawal already equals previousWithdrawal which is nominal)
  }

  // Prosperity rule: portfolio doing well → raise withdrawal
  const ceilingThreshold = config.guardrailCeiling * ctx.startPortfolio
  if (ctx.currentPortfolio > ceilingThreshold) {
    withdrawal *= (1 + config.guardrailRaiseStep)
  }

  // Capital preservation rule: portfolio struggling → cut withdrawal
  const floorThreshold = config.guardrailFloor * ctx.startPortfolio
  if (ctx.currentPortfolio < floorThreshold) {
    withdrawal *= (1 - config.guardrailCutStep)
  }

  // Clamp withdrawal between floor and ceiling of base expenses
  const minWithdrawal = config.guardrailFloor * netBaseExpenses
  const maxWithdrawal = config.guardrailCeiling * netBaseExpenses
  withdrawal = Math.max(minWithdrawal, Math.min(maxWithdrawal, withdrawal))

  return Math.max(0, withdrawal)
}

// ── VPW (Variable Percentage Withdrawal) ─────────────────────────────

/**
 * Variable Percentage Withdrawal:
 *
 * Each year, withdraw a percentage of portfolio based on remaining years.
 * Formula: withdrawal% = 1 / (1 + [(1 - (1+r)^(-(n-1))) / r])
 * where r = effective real return and n = years remaining to endAge.
 *
 * Minimum withdrawal = floor * baseExpenses (bestaansminimum).
 */
function applyVpw(
  config: WithdrawalStrategyConfig,
  ctx: WithdrawalContext,
): number {
  const yearsRemaining = Math.max(1, ctx.endAge - ctx.currentAge)

  // Effective real return (already net of inflation in simulation context)
  // Use yearReturn as proxy; minimum 0.001 to avoid division by zero
  const r = Math.max(0.001, ctx.yearReturn)

  let vpwRate: number
  if (yearsRemaining <= 1) {
    // Last year: withdraw everything remaining
    vpwRate = 1.0
  } else {
    // VPW formula: 1 / (1 + annuity factor)
    // annuity factor = (1 - (1+r)^(-(n-1))) / r
    const n = yearsRemaining
    const annuityFactor = (1 - Math.pow(1 + r, -(n - 1))) / r
    vpwRate = 1 / (1 + annuityFactor)
  }

  // Apply VPW rate to current portfolio
  let withdrawal = vpwRate * ctx.currentPortfolio

  // Subtract recurring income (same as static — don't double-count pensions)
  withdrawal = Math.max(0, withdrawal - ctx.recurringIncome)

  // Minimum floor: never go below floor * net base expenses
  const netBaseExpenses = Math.max(0, ctx.baseExpenses - ctx.recurringIncome)
  const minWithdrawal = config.guardrailFloor * netBaseExpenses
  withdrawal = Math.max(minWithdrawal, withdrawal)

  return withdrawal
}

// ── Bucket ───────────────────────────────────────────────────────────

/** Default bucket allocation ratios */
const BUCKET_CASH_YEARS = 2
const BUCKET_BONDS_YEARS = 5

/**
 * Initialize bucket state from a portfolio value and annual expenses.
 */
export function initBucketState(
  portfolio: number,
  annualExpenses: number,
): BucketState {
  const cashTarget = annualExpenses * BUCKET_CASH_YEARS
  const bondsTarget = annualExpenses * BUCKET_BONDS_YEARS
  const cash = Math.min(cashTarget, portfolio)
  const bonds = Math.min(bondsTarget, Math.max(0, portfolio - cash))
  const stocks = Math.max(0, portfolio - cash - bonds)
  return { cash, bonds, stocks }
}

/**
 * Bucket strategy (simplified 3-bucket model):
 *
 * 1. Withdraw from cash bucket first
 * 2. Annual rebalancing: replenish cash from bonds, bonds from stocks
 * 3. Cash = 2 years expenses, Bonds = 5 years expenses, Stocks = remainder
 *
 * If no bucketState provided, initializes from currentPortfolio.
 * NOTE: this function mutates nothing — caller must track BucketState externally.
 */
function applyBucket(
  config: WithdrawalStrategyConfig,
  ctx: WithdrawalContext,
  bucketState?: BucketState,
): number {
  const netBaseExpenses = Math.max(0, ctx.baseExpenses - ctx.recurringIncome)

  // Initialize buckets if not provided
  const state = bucketState ?? initBucketState(ctx.currentPortfolio, ctx.baseExpenses)

  // Withdraw from cash bucket
  const withdrawal = Math.min(netBaseExpenses, state.cash)

  // If cash is insufficient, the withdrawal is capped at what's available
  // (simulation caller can handle the deficit by adjusting portfolio)
  return Math.max(0, withdrawal)
}

/**
 * Rebalance bucket state after a year of growth/withdrawal.
 * Pure function — returns new BucketState.
 *
 * @param state - Current bucket allocations
 * @param stocksReturn - Return on stocks bucket this year (e.g. 0.07)
 * @param bondsReturn - Return on bonds bucket this year (e.g. 0.02)
 * @param withdrawal - Amount withdrawn from cash this year
 * @param annualExpenses - Target annual expenses for cash/bonds sizing
 */
export function rebalanceBuckets(
  state: BucketState,
  stocksReturn: number,
  bondsReturn: number,
  withdrawal: number,
  annualExpenses: number,
): BucketState {
  // Apply growth
  let stocks = state.stocks * (1 + stocksReturn)
  let bonds = state.bonds * (1 + bondsReturn)
  let cash = state.cash - withdrawal

  // Target allocations
  const cashTarget = annualExpenses * BUCKET_CASH_YEARS
  const bondsTarget = annualExpenses * BUCKET_BONDS_YEARS

  // Replenish cash from bonds
  const cashDeficit = Math.max(0, cashTarget - cash)
  const cashFromBonds = Math.min(cashDeficit, bonds)
  cash += cashFromBonds
  bonds -= cashFromBonds

  // Replenish bonds from stocks
  const bondsDeficit = Math.max(0, bondsTarget - bonds)
  const bondsFromStocks = Math.min(bondsDeficit, stocks)
  bonds += bondsFromStocks
  stocks -= bondsFromStocks

  return {
    cash: Math.max(0, cash),
    bonds: Math.max(0, bonds),
    stocks: Math.max(0, stocks),
  }
}
