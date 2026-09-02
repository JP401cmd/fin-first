/**
 * Withdrawal Strategy types, resolver, and engine — single source of truth.
 *
 * Twee strategieën (DB genormaliseerd, remote-migratie 20260703115225 — de vroegere
 * 'vpw'/'bucket' zijn samengevoegd tot 'static'):
 * 1. static  — Vaste onttrekking (klassieke SWR, bijv. 4% regel)
 * 2. guardrails — Guyton-Klinger guardrails: verlaag/verhoog onttrekking
 *    op basis van portfolioprestatie, begrensd door floor en ceiling
 *
 * applyWithdrawalStrategy() is een PURE functie — geen side effects,
 * geen database calls, geen UI.
 */

// ── Types ────────────────────────────────────────────────────────────

import type { FireEndStrategy } from '@/lib/fire-strategy'

export type WithdrawalStrategyType = 'static' | 'guardrails'

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
  endStrategy?: FireEndStrategy
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
  const validStrategies: WithdrawalStrategyType[] = ['static', 'guardrails']

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

// ── Onttrekkingsprofiel-curve (V4, horizon-kernel) ───────────────────
//
// De 3-fasen-curve (go-go / slow-go / no-go) uit `profiles.withdrawal_profile_config`
// (JSONB). ADDITIEF op de bestaande enum/`WithdrawalStrategyConfig` — die blijft de
// v2-engine voeden tot FASE 6. Deze curve wordt ALLEEN door de horizon-kernel-adapter
// (`lib/horizon-kernel/adapter/params.ts`) geconsumeerd.
//
// PURE VALIDATIE, GEEN DEFAULTS: een ontbrekend/ongeldig veld blijft `null` in het
// resultaat; de adapter vult het per veld met de Excel-default (P!B71-75, single source
// in `adapter/defaults.ts#EXCEL_FASE_CURVE`). Zo wonen de default-getallen op één plek
// en blijft de solo-run byte-identiek wanneer de kolom NULL is (→ `parse` geeft `null`).

/**
 * V4 (F4) — het expliciet gekozen onttrekkingsPROFIEL. Woont additief in
 * `withdrawal_profile_config.profiel` naast de 3-fasen-curve. De oude enum
 * (`WithdrawalStrategyType`) blijft tot FASE 6 het veld waarop de draaiende v2-engine
 * leunt; dit profiel is de nieuwe, rijkere taal die (voorlopig alléén) de horizon-kernel
 * consumeert. Mapping profiel→enum bij opslaan: vast/afnemend/oplopend → 'static',
 * guardrails → 'guardrails' (zie de onttrekkings-UI; F6-opruimpunt).
 */
export type WithdrawalProfiel = 'vast' | 'afnemend' | 'oplopend' | 'guardrails'

export const WITHDRAWAL_PROFIELEN: readonly WithdrawalProfiel[] = [
  'vast',
  'afnemend',
  'oplopend',
  'guardrails',
] as const

/** Geparste onttrekkingsprofiel-curve; elk veld `null` = ontbrekend/ongeldig → adapter valt terug op Excel-default. */
export interface WithdrawalProfileConfig {
  /**
   * V4 — expliciet gekozen profiel. `null` = niet gezet → de kernel-adapter valt terug
   * op de bestaande enum→profiel-mapping (byte-identiek aan vóór F4).
   */
  profiel: WithdrawalProfiel | null
  /** P!B71 — go-go fase t/m leeftijd. */
  gogoTotLeeftijd: number | null
  /** P!B72 — go-go factor (%). */
  gogoPct: number | null
  /** P!B73 — slow-go fase t/m leeftijd. */
  slowgoTotLeeftijd: number | null
  /** P!B74 — slow-go factor (%). */
  slowgoPct: number | null
  /** P!B75 — no-go factor (%) daarna. */
  nogoPct: number | null

  // ── Roadmap M — flex-spending (must/nice, inert-by-default) ──
  /**
   * Pas de onttrekkingsprofiel-factor alléén op het NICE-deel van de post-FIRE uitgave
   * toe (must blijft onaangetast). `false`/ontbrekend → factor op de hele term (Excel-
   * oracle-gedrag; de kernel-adapter zet `flexNiceOnly` dan níet).
   */
  flexNiceOnly: boolean
  /**
   * Expliciete nice-%-override als fractie (0..1). `null` → de adapter leidt de
   * nice-fractie af uit de budgetten ((uitgave − must)/uitgave).
   */
  flexNiceFractie: number | null
  /**
   * Grotere neerwaartse stap op nice bij een guardrails-dip (0..1). `null` → de
   * reguliere guardrail-/fase-factor op nice.
   */
  flexCutStep: number | null
}

function finiteOrNull(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : null
}

function profielOrNull(raw: unknown): WithdrawalProfiel | null {
  return typeof raw === 'string' && (WITHDRAWAL_PROFIELEN as readonly string[]).includes(raw)
    ? (raw as WithdrawalProfiel)
    : null
}

/**
 * Lees de onttrekkingsprofiel-curve uit een profielobject.
 * NULL/ontbrekend/niet-object → `null` (adapter gebruikt volledig de Excel-defaults).
 * Aanwezig → per-veld gevalideerd (finite → waarde, anders `null` → adapter vult per veld).
 */
export function parseWithdrawalProfileConfig(profile: {
  withdrawal_profile_config?: unknown
} | null | undefined): WithdrawalProfileConfig | null {
  let raw = profile?.withdrawal_profile_config
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  return {
    profiel: profielOrNull(o.profiel),
    gogoTotLeeftijd: finiteOrNull(o.gogo_tot_leeftijd),
    gogoPct: finiteOrNull(o.gogo_pct),
    slowgoTotLeeftijd: finiteOrNull(o.slowgo_tot_leeftijd),
    slowgoPct: finiteOrNull(o.slowgo_pct),
    nogoPct: finiteOrNull(o.nogo_pct),
    // Roadmap M — flex-spending. `flex_nice_only` alleen `true` bij een expliciete boolean;
    // fractie/cut-step blijven `null` (→ afgeleid/regulier) tenzij een geldig getal.
    flexNiceOnly: o.flex_nice_only === true,
    flexNiceFractie: finiteOrNull(o.flex_nice_fractie),
    flexCutStep: finiteOrNull(o.flex_cut_step),
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
): number {
  switch (config.strategy) {
    case 'static':
      return applyStatic(ctx)
    case 'guardrails':
      return applyGuardrails(config, ctx)
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

// ── Bucket-allocatie (losstaande wiskunde) ───────────────────────────
//
// De 'vpw'/'bucket'-ONTTREKKINGSstrategieën zijn met migratie 20260703115225
// samengevoegd tot 'static'; hun engine-functies zijn verwijderd. De pure
// bucket-ALLOCATIE-helpers hieronder (initBucketState/rebalanceBuckets) staan
// los van de onttrekkingskeuze en blijven als getest hulpstuk bestaan; ze
// hebben momenteel geen productie-consument (opruimkandidaat — zie stap 5C).

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
