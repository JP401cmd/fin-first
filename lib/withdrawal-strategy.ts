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
  /** FIRE eindstrategie — bij 'deplete' gebruikt applyStatic annuïteitsonttrekking */
  endStrategy?: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'
  /** Geïndexeerd nalatenschapsbedrag (alleen voor legacy strategie) */
  legacyAmount?: number
  /** Inflatiepercentage als decimaal (bijv. 0.02 voor 2%) — nodig voor reëel rendement in annuïteit */
  inflation?: number
  /**
   * Grootboek-modus (horizon-engine v2): gebruik de FLOORLESS schuivende annuïteit
   * naar het doelsaldo voor zowel deplete (doelsaldo €0) ALS legacy (doelsaldo L).
   * De annuïteit wordt elk jaar herberekend op de resterende liquide pot richting
   * doelsaldo op endAge en CONSUMEERT zo de FIRE-overshoot → de afbouw landt per
   * constructie EXACT op het doelsaldo op endAge. Géén `Math.max(annuïteit,
   * netBaseExpenses)`-bodem (die bindt de uitgaven-vloer op een lage-rendement-pot
   * en leegt 'm vroegtijdig) en géén need-only-residu (dat laat de overshoot
   * compounden ver bóven het doel). Eén reële voet (ctx.yearReturn) voor doel én
   * afbouw — geen 0,6×.
   *
   * SUPERSEDES het oude need-only legacy-model (ADR 0014): de architect heeft Fase 1
   * gestandaardiseerd op het verenigde annuity-to-doelsaldo-model (opeten ≡
   * nalatenschap met doelsaldo €0; €1 ≈ €0 per constructie). Default false/undefined
   * = klassieke GEFLOORDE annuïteit (scalar-/unit-test-contract; de engine zet de
   * vlag altijd). Zie withdrawal-strategy.ts applyStatic + engine.ts decumulation-ctx.
   *
   * NB: voor legacy met een POSITIEF nalatenschapsbedrag zet de engine deze vlag
   * NIET maar `legacyPreserveOnly` (need-only) — zie hieronder.
   */
  floorlessAnnuityToTarget?: boolean
  /**
   * Legacy met een POSITIEF doel (need-only, ADR 0014/0017): onttrek alléén de netto
   * leefbehoefte en laat het residu naar de nalatenschap groeien — NIET de annuïteit,
   * die het surplus uit de assets zou trekken zonder het te consumeren (in een
   * grootboek-model verdampt dat → nalatenschap onhaalbaar; de afbouw landt ónder L).
   *
   * Het verenigde annuity-to-doelsaldo-model (floorlessAnnuityToTarget) geldt voor
   * deplete ÉN legacy(€0) (opeten ≡ nalatenschap met doelsaldo €0). Voor legacy(€>0)
   * is need-only de juiste decumulatie: het door de gebruiker ingevoerde bedrag IS de
   * bewust nagelaten buffer, dus wat je niet nodig hebt groeit ernaartoe — een
   * annuïteit-naar-L undershoot het doel door de jaar-op-jaar return-mismatch. Eén
   * van beide vlaggen is gezet, nooit allebei. Zie engine.ts decumulation-ctx +
   * meetsStrategyTarget (legacy(€0) routeert door de deplete-gate; legacy(€>0) door
   * de eigen tak).
   */
  legacyPreserveOnly?: boolean
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
 * Static withdrawal: base logic = max(0, baseExpenses - recurringIncome).
 *
 * deplete & legacy — VERENIGD annuity-to-doelsaldo (Fase 1, architect-beslissing):
 * gebruik de schuivende groeiende annuïteit `computeAnnuityBase` met doelsaldo =
 * legacyAmount (0 voor deplete, L voor legacy). In de grootboek-modus
 * (`floorlessAnnuityToTarget`, door de engine gezet) is dit FLOORLESS — de
 * onttrekking = de annuïteit (geclampt ≥0), ZONDER `Math.max(annuïteit,
 * netBaseExpenses)`-bodem. De annuïteit herberekent elk jaar op de resterende
 * liquide pot richting doelsaldo op endAge en consumeert zo de FIRE-overshoot →
 * de afbouw landt per constructie EXACT op het doelsaldo op endAge. (De oude
 * uitgaven-bodem bond op een lage-rendement-pot en leegde 'm vroegtijdig; het
 * oude need-only-residu liet de overshoot juist compounden ver bóven het doel —
 * beide weg.) Eén reële voet (ctx.yearReturn) voor doel én afbouw, geen 0,6×.
 * SUPERSEDES het need-only legacy-model (ADR 0014).
 *
 * Zonder `floorlessAnnuityToTarget` (scalar-/unit-test-contract): de klassieke
 * GEFLOORDE annuïteit `Math.max(computeAnnuityBase, netBaseExpenses)` — onveranderd
 * gedrag voor callers buiten het grootboek. De engine zet de vlag altijd.
 *
 * Voor perpetual, pensioen, of een niet-gezette endStrategy: klassieke static
 * (need-only, backwards compatible).
 */
function applyStatic(ctx: WithdrawalContext): number {
  const netBaseExpenses = Math.max(0, ctx.baseExpenses - ctx.recurringIncome)

  // Legacy(€>0) need-only (ADR 0014/0017): onttrek alléén de behoefte; het residu
  // groeit naar de nalatenschap. De annuïteit zou het surplus opspenden → afbouw
  // ónder L. (Komt vóór de annuïteit-tak omdat het strategy === 'legacy' is.)
  if (ctx.legacyPreserveOnly) return netBaseExpenses

  if (ctx.endStrategy === 'deplete' || ctx.endStrategy === 'legacy') {
    // computeAnnuityBase trekt voor legacy de PV van het doelsaldo af (op dezelfde
    // ctx.yearReturn-voet) → de afbouw landt op L; voor deplete is doelsaldo 0 → ~€0.
    const annuity = computeAnnuityBase(ctx)
    // Grootboek-modus: FLOORLESS (consumeert de overshoot, landt exact op doelsaldo).
    if (ctx.floorlessAnnuityToTarget) return Math.max(0, annuity)
    // Scalar-/unit-test-contract: geflooorde annuïteit (nooit minder dan leefkosten).
    return Math.max(annuity, netBaseExpenses)
  }

  return netBaseExpenses
}

// ── Guardrails (Guyton-Klinger) ──────────────────────────────────────

/**
 * Compute the annuity base for deplete/legacy strategies using the growing
 * annuity formula: P × (r−g) / (1 − ((1+g)/(1+r))^n)
 *
 * This is self-consistent with the simulation model where portfolio compounds
 * at nominal rate r and expenses grow at inflation rate g.
 *
 * For legacy: the available portfolio is reduced by the indexed legacy target.
 *
 * The annuity recalculates each year on remaining portfolio and remaining years
 * (schuivende basis / sliding basis).
 */
function computeAnnuityBase(ctx: WithdrawalContext): number {
  const n = Math.max(1, ctx.endAge - ctx.currentAge)
  const r = ctx.yearReturn
  const g = ctx.inflation ?? 0
  const rg = r - g

  // For legacy: only the surplus above the indexed legacy target is available.
  // ctx.legacyAmount is the NOMINAL target at endAge (already indexed by the
  // caller in fire-simulation). Discount to current PV so the growing annuity
  // depletes only the surplus, while the legacy portion compounds at r naar L
  // op endAge. Math: P_T = P_0 × (1+r)^n − Σ W_i × (1+g)^i × (1+r)^{n-1-i};
  // bij P_T = L volgt W_0 = (P_0 − L/(1+r)^n) × (r−g)/(1−((1+g)/(1+r))^n).
  let availablePortfolio = ctx.currentPortfolio
  if (ctx.endStrategy === 'legacy' && ctx.legacyAmount != null && ctx.legacyAmount > 0) {
    const pvLegacy = ctx.legacyAmount / Math.pow(1 + r, n)
    availablePortfolio = Math.max(0, ctx.currentPortfolio - pvLegacy)
  }

  if (n <= 1) {
    // Last year: withdraw everything. Include growth only for grow-then-withdraw
    // order (when inflation is set). See applyStatic n<=1 for full explanation.
    return g > 0
      ? availablePortfolio * (1 + ctx.yearReturn)
      : availablePortfolio
  }
  if (Math.abs(rg) < 1e-10) {
    return availablePortfolio / n
  }
  // Growing annuity (exact): P × (r−g) / (1 − ((1+g)/(1+r))^n)
  return availablePortfolio * rg / (1 - Math.pow((1 + g) / (1 + r), n))
}

/**
 * Guyton-Klinger guardrails strategy:
 *
 * 1. Start with base withdrawal (same as static for first year)
 * 2. Prosperity rule: if portfolio > ceiling * startPortfolio → raise withdrawal
 * 3. Capital preservation rule: if portfolio < floor * startPortfolio → cut withdrawal
 * 4. Inflation skip: no inflation adjustment in years with negative returns
 * 5. Clamp final withdrawal between floor*base and ceiling*base
 *
 * Strategy-aware base:
 * - deplete/legacy: annuity calculation as base (recalculated each year)
 * - perpetual/pensioen/undefined: netBaseExpenses as base (classic behavior)
 *
 * The annuity base ensures that with guardrails, the portfolio actually depletes
 * to ≈€0 (deplete) or ≈legacyAmount (legacy) at the target end age, while still
 * providing ±20% flexibility for market conditions.
 *
 * Anchoring to startPortfolio (= decumStartPortfolio from simulateDecumulation):
 *
 * In pensioen mode, startPortfolio = the ACTUAL portfolio at AOW age (not the
 * binary-search minimum). After 30+ years of saving, this can be €1M+.
 * With €33k/year net expenses and ~5% return, net growth ≈ +€17k/year,
 * so the portfolio GROWS in retirement. Consequences:
 *   - Floor (0.80 × €1M = €800k): never hit under normal returns → no cuts
 *   - Ceiling (1.20 × €1M = €1.2M): hit after ~12 years → withdrawal raised
 *   - Withdrawal stays effectively static until ceiling triggers
 *
 * This IS correct Guyton-Klinger behavior: anchoring to start-of-retirement
 * portfolio provides downside crash protection and upside prosperity sharing,
 * while keeping withdrawals stable at base expenses for well-funded pensions.
 * No dynamic re-anchoring is needed — the clamp (floor/ceiling of base
 * expenses) ensures withdrawals never deviate more than ±20% from needs.
 */
function applyGuardrails(
  config: WithdrawalStrategyConfig,
  ctx: WithdrawalContext,
): number {
  const netBaseExpenses = Math.max(0, ctx.baseExpenses - ctx.recurringIncome)

  // Determine the base withdrawal:
  // For deplete/legacy: the schuivende annuity-to-doelsaldo (computeAnnuityBase),
  // recalculated each year. In de grootboek-modus (floorlessAnnuityToTarget) is de
  // effectieve basis FLOORLESS (= de annuïteit zelf, geclampt ≥0) zodat de afbouw de
  // FIRE-overshoot consumeert en exact op het doelsaldo landt; daarbuiten (scalar/
  // unit-test) blijft de geflooorde basis (≥ netBaseExpenses). SUPERSEDES need-only
  // legacy (ADR 0014); zie applyStatic.
  // For perpetual/pensioen/undefined: classic netBaseExpenses.
  // Legacy(€>0) need-only (legacyPreserveOnly): geen annuïteit-basis — onttrek de
  // behoefte, het residu groeit naar de nalatenschap (ADR 0014/0017).
  const useAnnuityBase = !ctx.legacyPreserveOnly && (ctx.endStrategy === 'deplete' || ctx.endStrategy === 'legacy')
  const annuityBase = useAnnuityBase ? computeAnnuityBase(ctx) : netBaseExpenses
  // Floorless in grootboek-modus; anders nooit minder dan de leefkosten.
  const effectiveBase = useAnnuityBase
    ? ctx.floorlessAnnuityToTarget
      ? Math.max(0, annuityBase)
      : Math.max(annuityBase, netBaseExpenses)
    : netBaseExpenses

  // First year of retirement: use the effective base directly
  if (ctx.yearsIntoRetirement === 0 || ctx.previousWithdrawal <= 0) {
    return effectiveBase
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

  // Clamp withdrawal between floor and ceiling of the effective base
  const minWithdrawal = config.guardrailFloor * effectiveBase
  const maxWithdrawal = config.guardrailCeiling * effectiveBase
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
 *
 * End-strategy aware (verenigd annuity-to-doelsaldo, gespiegeld aan applyStatic):
 * - deplete/legacy in grootboek-modus (floorlessAnnuityToTarget): FLOORLESS annuïteit
 *   richting doelsaldo (consumeert de overshoot, landt exact op het doelsaldo op
 *   endAge). SUPERSEDES need-only legacy (ADR 0014).
 * - deplete/legacy daarbuiten (scalar-callers): geflooorde annuïteit.
 * - perpetual/pensioen/undefined: withdraws only net living expenses (classic)
 */
function applyBucket(
  config: WithdrawalStrategyConfig,
  ctx: WithdrawalContext,
  bucketState?: BucketState,
): number {
  const netBaseExpenses = Math.max(0, ctx.baseExpenses - ctx.recurringIncome)
  void bucketState // bucket allocation tracked externally via waterfallWithdraw

  // Legacy(€>0) need-only: onttrek de behoefte; residu groeit naar de nalatenschap.
  if (ctx.legacyPreserveOnly) return netBaseExpenses

  // deplete/legacy: schuivende annuïteit richting doelsaldo op dezelfde basis als
  // applyStatic/applyGuardrails. Grootboek-modus = floorless (consumeert de
  // overshoot); daarbuiten geflooorde annuïteit (≥ leefkosten).
  if (ctx.endStrategy === 'deplete' || ctx.endStrategy === 'legacy') {
    const annuity = computeAnnuityBase(ctx)
    if (ctx.floorlessAnnuityToTarget) return Math.max(0, annuity)
    return Math.max(annuity, netBaseExpenses)
  }

  return Math.max(0, netBaseExpenses)
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
