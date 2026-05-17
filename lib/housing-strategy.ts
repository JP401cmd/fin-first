/**
 * Housing strategy in de FIRE-projectie.
 *
 * Vier modes:
 *   include_full     — default; eigen woning telt 100% mee in FIRE-pot.
 *   exclude_from_fire — eigen woning + linked mortgage worden via
 *                       `filterAssetsForFire` uit de FIRE-pot gehaald.
 *                       Geen tijdlijn-events nodig — woonkost blijft in
 *                       het bestaande budget.
 *   downsize         — bij trigger (fixed_age | on_depletion):
 *                        één virtueel LifeEvent "Verkoop eigen woning" met
 *                        meerdere sub-cashflows in metadata.cashflows
 *                        (verkoopopbrengst, bespaarde hypotheek, nieuwe huur).
 *                        Filter haalt eigen_huis + mortgage uit de pot vanaf
 *                        dag 1, sale-cashflow voegt netto-opbrengst toe bij
 *                        trigger.
 *   reverse_mortgage — bij trigger: één virtueel LifeEvent voor de
 *                        maandelijkse uitkering. Asset blijft in pot.
 *
 * Trigger-modes:
 *   fixed_age    — strategie activeert op leeftijd `triggerAge`.
 *   on_depletion — strategie activeert wanneer liquide vermogen onder
 *                  `depletionThresholdYears × yearlyExpenses` zakt.
 *                  MVP-benadering: lineair zonder rendement (conservatief
 *                  → trigger iets vroeger dan werkelijkheid).
 *
 * Pipeline (vervangt eerdere SimCashflow-synthese):
 *   1. Server-side loaders roepen `getHousingLifeEvents()` aan en plakken
 *      de virtuele events achter de echte life_events uit Supabase.
 *   2. De bestaande LifeEvent → SimCashflow pipeline (`lifeEventsToCashflows`)
 *      converteert ze net als gewone events.
 *   3. UI-componenten herkennen ze via `metadata.source === 'housing-strategy'`
 *      en renderen read-only.
 *   4. `filterAssetsForFire` blijft verantwoordelijk voor het verwijderen
 *      van eigen_huis + linked mortgage uit de assets/debts.
 *
 * `applyHousingStrategy` blijft bestaan voor backwards-compat (tests, oude
 * callers) maar produceert geen cashflows meer — die komen via de events.
 */

import type { Asset } from '@/lib/asset-data'
import { type Debt, amortizationSchedule } from '@/lib/debt-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import type { LifeEvent, UserDefinedCashflow } from '@/lib/horizon-data'

// ── Types ────────────────────────────────────────────────────

export type HousingStrategyTrigger = 'fixed_age' | 'on_depletion'

export type HousingStrategyMode =
  | 'include_full'
  | 'exclude_from_fire'
  | 'downsize'
  | 'reverse_mortgage'

interface IncludeFullConfig {
  mode: 'include_full'
}

interface ExcludeConfig {
  mode: 'exclude_from_fire'
}

export interface DownsizeConfig {
  mode: 'downsize'
  trigger: HousingStrategyTrigger
  /** Trigger-leeftijd voor fixed_age; fallback-leeftijd voor on_depletion (als depletion nooit triggert). */
  triggerAge: number
  /** Drempel in jaren liquide-vermogen voor on_depletion trigger. Bv. 2 = trigger als liquide < 2 × jaaruitgaven. */
  depletionThresholdYears: number
  /** % van WOZ-waarde dat de verkoopopbrengst representeert. Default 1.00. */
  salePricePct: number
  /** % verkoopkosten (makelaar + notaris + verhuizen). Default 0.04. */
  salesCostsPct: number
  /** Nieuwe maandlast na verkoop (huur of kleinere hypotheek). null = auto-schatting. */
  newMonthlyHousingCost: number | null
}

export interface ReverseMortgageConfig {
  mode: 'reverse_mortgage'
  trigger: HousingStrategyTrigger
  triggerAge: number
  depletionThresholdYears: number
  /** Max % van overwaarde dat als lening kan worden opgenomen. Default 0.50 (NL-marktstandaard 35-65%). */
  maxLoanPct: number
  /** Jaarlijkse rente op opeethypotheek (decimal). Default 0.055 (5.5% NL marktrate 2026). */
  interestRate: number
  /** Maandelijkse uitkering. null = lineair berekend uit maxLoanPct over resterende verwachte levensduur. */
  monthlyPayout: number | null
}

export type HousingStrategyConfig =
  | IncludeFullConfig
  | ExcludeConfig
  | DownsizeConfig
  | ReverseMortgageConfig

export const DEFAULT_HOUSING_STRATEGY: HousingStrategyConfig = { mode: 'include_full' }

export const HOUSING_STRATEGY_LABELS: Record<HousingStrategyMode, string> = {
  include_full: 'Volledig meetellen',
  exclude_from_fire: 'Uitsluiten van FIRE-pot',
  downsize: 'Verkopen op leeftijd / bij behoefte',
  reverse_mortgage: 'Opeethypotheek',
}

export const HOUSING_STRATEGY_DESCRIPTIONS: Record<HousingStrategyMode, string> = {
  include_full:
    'Je eigen woning telt voor 100% mee in je FIRE-pot. Eenvoudig, maar onrealistisch: je hebt het geld nooit liquide zonder verkoop of opeethypotheek.',
  exclude_from_fire:
    'Je eigen woning blijft buiten de FIRE-berekening. Conservatief en realistisch — past bij internationale FIRE-canon. Je blijft wonen, dus woonkosten blijven onveranderd.',
  downsize:
    'Op een gekozen moment (vaste leeftijd OF wanneer liquide vermogen krap wordt) verkoop je je huis. Opbrengst gaat naar belegbaar vermogen, oude hypotheek stopt, een nieuwe woonlast (huur of kleinere hypotheek) verschijnt.',
  reverse_mortgage:
    'Op een gekozen moment open je een opeethypotheek / verzilverhypotheek. Je blijft wonen en ontvangt maandelijks geld uit de overwaarde. De rente stapelt zich op tegen je toekomstige schuld.',
}

// ── Defaults ─────────────────────────────────────────────────

export const DEFAULT_DOWNSIZE_CONFIG: DownsizeConfig = {
  mode: 'downsize',
  trigger: 'fixed_age',
  triggerAge: 67,
  depletionThresholdYears: 2,
  salePricePct: 1.0,
  salesCostsPct: 0.04,
  newMonthlyHousingCost: null,
}

export const DEFAULT_REVERSE_MORTGAGE_CONFIG: ReverseMortgageConfig = {
  mode: 'reverse_mortgage',
  trigger: 'fixed_age',
  triggerAge: 67,
  depletionThresholdYears: 2,
  maxLoanPct: 0.5,
  interestRate: 0.055,
  monthlyPayout: null,
}

// ── Parsing ──────────────────────────────────────────────────

/**
 * Parse-met-fallback: leest JSONB uit profile en valideert structuur.
 * Bij malformed / missing config: terug naar DEFAULT_HOUSING_STRATEGY.
 */
export function parseHousingStrategy(raw: unknown): HousingStrategyConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_HOUSING_STRATEGY
  const obj = raw as Record<string, unknown>
  const mode = obj.mode

  if (mode === 'include_full') return { mode: 'include_full' }
  if (mode === 'exclude_from_fire') return { mode: 'exclude_from_fire' }

  if (mode === 'downsize') {
    return {
      mode: 'downsize',
      trigger: parseTrigger(obj.trigger),
      triggerAge: toFiniteNumber(obj.triggerAge, DEFAULT_DOWNSIZE_CONFIG.triggerAge),
      depletionThresholdYears: toFiniteNumber(
        obj.depletionThresholdYears,
        DEFAULT_DOWNSIZE_CONFIG.depletionThresholdYears,
      ),
      salePricePct: toFiniteNumber(obj.salePricePct, DEFAULT_DOWNSIZE_CONFIG.salePricePct),
      salesCostsPct: toFiniteNumber(obj.salesCostsPct, DEFAULT_DOWNSIZE_CONFIG.salesCostsPct),
      newMonthlyHousingCost:
        obj.newMonthlyHousingCost === null || obj.newMonthlyHousingCost === undefined
          ? null
          : toFiniteNumber(obj.newMonthlyHousingCost, 0),
    }
  }

  if (mode === 'reverse_mortgage') {
    return {
      mode: 'reverse_mortgage',
      trigger: parseTrigger(obj.trigger),
      triggerAge: toFiniteNumber(obj.triggerAge, DEFAULT_REVERSE_MORTGAGE_CONFIG.triggerAge),
      depletionThresholdYears: toFiniteNumber(
        obj.depletionThresholdYears,
        DEFAULT_REVERSE_MORTGAGE_CONFIG.depletionThresholdYears,
      ),
      maxLoanPct: toFiniteNumber(obj.maxLoanPct, DEFAULT_REVERSE_MORTGAGE_CONFIG.maxLoanPct),
      interestRate: toFiniteNumber(obj.interestRate, DEFAULT_REVERSE_MORTGAGE_CONFIG.interestRate),
      monthlyPayout:
        obj.monthlyPayout === null || obj.monthlyPayout === undefined
          ? null
          : toFiniteNumber(obj.monthlyPayout, 0),
    }
  }

  return DEFAULT_HOUSING_STRATEGY
}

function parseTrigger(raw: unknown): HousingStrategyTrigger {
  return raw === 'on_depletion' ? 'on_depletion' : 'fixed_age'
}

function toFiniteNumber(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : fallback
}

// ── Context-derivation ───────────────────────────────────────

export interface HousingContext {
  /** Som van actieve eigen_huis assets — `current_value` × inclusion_pct/100. */
  eigenHuisValue: number
  /** Best estimate van WOZ-waarde (fallback: current_value). */
  wozValue: number
  /** Som van openstaande mortgage-balances gekoppeld aan eigen_huis (huidig moment). */
  mortgageBalance: number
  /** Som van maandelijkse mortgage-betalingen (rente + aflossing) voor eigen_huis (huidig moment). */
  mortgageMonthlyPayment: number
  /** True wanneer gebruiker geen eigen_huis-asset heeft (strategie is dan no-op). */
  hasEigenHuis: boolean
  /** Onderliggende hypotheek-schulden gekoppeld aan eigen_huis — voor amortisatie-projectie naar trigger-moment. */
  eigenHuisMortgages: Debt[]
  /**
   * Eigen-huis-assets zelf (alleen actieve `eigen_huis`-rijen) — bewaard zodat
   * downstream-helpers WOZ- en marktwaarde over tijd kunnen projecteren via
   * het asset-specifieke `expected_return`. Zonder deze referentie zou de
   * trigger-leeftijd over 10-20 jaar nog steeds de huidige WOZ als
   * verkoopopbrengst gebruiken (onrealistisch). Niet gefilterd op
   * `net_worth_inclusion_pct` — projectie-helpers passen dat zelf toe.
   */
  eigenHuisAssets: Asset[]
}

export function deriveHousingContext(assets: Asset[], debts: Debt[]): HousingContext {
  const eigenHuisAssets = assets.filter((a) => a.is_active && a.asset_type === 'eigen_huis')
  if (eigenHuisAssets.length === 0) {
    return {
      eigenHuisValue: 0,
      wozValue: 0,
      mortgageBalance: 0,
      mortgageMonthlyPayment: 0,
      hasEigenHuis: false,
      eigenHuisMortgages: [],
      eigenHuisAssets: [],
    }
  }

  const eigenHuisIds = new Set(eigenHuisAssets.map((a) => a.id))

  const eigenHuisValue = eigenHuisAssets.reduce(
    (sum, a) => sum + Number(a.current_value) * (Number(a.net_worth_inclusion_pct ?? 100) / 100),
    0,
  )
  const wozValue = eigenHuisAssets.reduce(
    (sum, a) => sum + (Number(a.woz_value) || Number(a.current_value) || 0),
    0,
  )

  const eigenHuisMortgages = debts.filter(
    (d) =>
      d.is_active &&
      d.debt_type === 'mortgage' &&
      d.linked_asset_id !== null &&
      eigenHuisIds.has(d.linked_asset_id),
  )

  const mortgageBalance = eigenHuisMortgages.reduce(
    (sum, d) => sum + Number(d.current_balance) * (Number(d.net_worth_inclusion_pct ?? 100) / 100),
    0,
  )
  const mortgageMonthlyPayment = eigenHuisMortgages.reduce(
    (sum, d) => sum + Number(d.monthly_payment || 0),
    0,
  )

  return {
    eigenHuisValue,
    wozValue,
    mortgageBalance,
    mortgageMonthlyPayment,
    hasEigenHuis: true,
    eigenHuisMortgages,
    eigenHuisAssets,
  }
}

/**
 * Projecteer de waarde van eigen-huis-assets `monthsForward` maanden vooruit
 * via compound growth op het asset-specifieke `expected_return`. Wordt
 * gebruikt door:
 *   - de downsize-cashflow (verkoopopbrengst is WOZ-bij-trigger × prijsfactor),
 *   - de reverse_mortgage-equity-projectie,
 *   - de chart-injectie in vermogensopbouw (vastgoed-bar over tijd).
 *
 * Conventies:
 *   - `wozValue` wordt opgebouwd uit `woz_value` (fallback `current_value`).
 *   - `currentValue` wordt opgebouwd uit `current_value` (fallback `woz_value`).
 *   - `net_worth_inclusion_pct` wordt per asset toegepast — consistent met
 *     `deriveHousingContext`.
 *   - Negatieve of NaN `expected_return` valt terug op 0 (geen groei).
 *   - Bij `monthsForward <= 0` retourneert dezelfde basiswaarden zonder
 *     compounding.
 *
 * Retourneert het AGGREGAAT over alle eigen-huis-assets.
 */
export function projectEigenHuisValuesAt(
  eigenHuisAssets: Asset[],
  monthsForward: number,
): { wozValue: number; currentValue: number } {
  const years = Math.max(0, monthsForward) / 12
  let wozValue = 0
  let currentValue = 0
  for (const a of eigenHuisAssets) {
    if (!a.is_active || a.asset_type !== 'eigen_huis') continue
    const inclusion = Number(a.net_worth_inclusion_pct ?? 100) / 100
    const ret = Number.isFinite(Number(a.expected_return)) ? Number(a.expected_return) / 100 : 0
    const factor = Math.pow(1 + ret, years)
    const baseWoz = Number(a.woz_value) || Number(a.current_value) || 0
    const baseCurrent = Number(a.current_value) || baseWoz
    wozValue += baseWoz * factor * inclusion
    currentValue += baseCurrent * factor * inclusion
  }
  return { wozValue, currentValue }
}

// ── Mortgage-projectie naar trigger-moment ───────────────────

export interface ProjectedMortgageState {
  /** Geprojecteerd uitstaand saldo van alle eigen-huis-hypotheken bij trigger. */
  balance: number
  /** Som van maandelijkse betalingen die nog actief zijn bij trigger (0 als alle hypotheken afgelost). */
  monthlyPayment: number
}

export interface MortgageProjection {
  /** ID van de oorspronkelijke debt-rij. */
  debtId: string
  /** Naam (voor display in cashflow-label). */
  name: string
  /** Geprojecteerd uitstaand saldo bij monthsForward. */
  balanceAtFuture: number
  /** Maandlast op die toekomst (0 als hypotheek dan al afgelost). */
  monthlyPaymentAtFuture: number
  /**
   * Resterende maanden vanaf monthsForward tot oorspronkelijke einddatum.
   * 0 = onbekend of geen end_date (cashflow loopt dan tot sim-einde).
   * Wordt gebruikt om "bespaarde hypotheekbetaling" te beperken tot het
   * moment waarop de hypotheek hoe-dan-ook zou aflopen.
   */
  remainingMonthsAtFuture: number
}

/**
 * Per-hypotheek projectie van saldo + maandlast + resterende looptijd.
 * Zie `projectMortgageStateAt` voor de aggregatie.
 */
export function projectMortgageDetailsAt(
  mortgages: Debt[],
  monthsForward: number,
): MortgageProjection[] {
  const now = Date.now()
  const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44

  // Edge-case: trigger is nu (on_depletion-trigger kan direct vuren wanneer
  // liquide vermogen al onder threshold zit). Geen amortisatie nodig —
  // huidige saldo + maandlast als output. Voorkomt `schedule[-1]` access.
  if (monthsForward <= 0) {
    return mortgages.map((d) => {
      const inclusionPct = Number(d.net_worth_inclusion_pct ?? 100) / 100
      const monthlyPayment = Number(d.monthly_payment || 0)
      const totalMonthsToEnd = d.end_date
        ? Math.round((new Date(d.end_date).getTime() - now) / MS_PER_MONTH)
        : 0
      return {
        debtId: d.id,
        name: d.name,
        balanceAtFuture: Number(d.current_balance) * inclusionPct,
        monthlyPaymentAtFuture: monthlyPayment,
        remainingMonthsAtFuture: Math.max(0, totalMonthsToEnd),
      }
    })
  }

  const result: MortgageProjection[] = []

  for (const d of mortgages) {
    const inclusionPct = Number(d.net_worth_inclusion_pct ?? 100) / 100
    const currentBalance = Number(d.current_balance) * inclusionPct
    const monthlyPayment = Number(d.monthly_payment || 0)
    const repaymentType = d.repayment_type ?? 'annuiteit'
    const rate = Number(d.interest_rate || 0)

    // Totaal maanden tussen nu en oorspronkelijke einddatum (kan negatief
    // zijn als end_date al voorbij is).
    const totalMonthsToEnd = d.end_date
      ? Math.round((new Date(d.end_date).getTime() - now) / MS_PER_MONTH)
      : null

    let balanceAtFuture = 0
    let monthlyAtFuture = 0

    if (currentBalance > 0) {
      if (repaymentType === 'aflossingsvrij') {
        // Saldo blijft. Maar bij einddatum vóór trigger moet (her)gefinancierd
        // of afgelost zijn → balance & maandlast vervallen.
        if (totalMonthsToEnd === null || monthsForward < totalMonthsToEnd) {
          balanceAtFuture = currentBalance
          monthlyAtFuture = monthlyPayment
        }
      } else if (monthlyPayment > 0) {
        // Annuïteit / lineair via amortizationSchedule.
        const schedule = amortizationSchedule(currentBalance, rate, monthlyPayment)
        if (schedule.length > monthsForward) {
          balanceAtFuture = schedule[monthsForward - 1].balance * inclusionPct
          monthlyAtFuture = monthlyPayment
        }
        // else: hypotheek volledig afgelost vóór trigger.
      } else {
        // Geen maandbetaling — saldo onveranderd (rare edge-case).
        balanceAtFuture = currentBalance
      }
    }

    // Resterende mnd op de oorspronkelijke amortisatie-horizon ná trigger.
    // Alleen relevant als de hypotheek bij trigger nog actief is.
    let remainingMonthsAtFuture = 0
    if (monthlyAtFuture > 0 && totalMonthsToEnd !== null) {
      remainingMonthsAtFuture = Math.max(0, totalMonthsToEnd - monthsForward)
    }

    result.push({
      debtId: d.id,
      name: d.name,
      balanceAtFuture,
      monthlyPaymentAtFuture: monthlyAtFuture,
      remainingMonthsAtFuture,
    })
  }

  return result
}

/**
 * Aggregeer per-hypotheek projecties tot een totaal saldo + maandlast.
 *
 * - Annuïteit / lineair: vooruit-simulatie met `amortizationSchedule`
 *   vanuit `current_balance` en huidige maandlast. Voor lineair is dit een
 *   benadering (de huidige betaling verschilt van de pad-betaling), maar
 *   redelijk voor de planning-horizon.
 * - Aflossingsvrij: saldo blijft gelijk; eind-datum-check.
 * - Hypotheek afgelost vóór trigger: balance = 0 én monthlyPayment = 0
 *   (geen "bespaarde lasten" want er was niets meer te besparen).
 */
export function projectMortgageStateAt(
  mortgages: Debt[],
  monthsForward: number,
): ProjectedMortgageState {
  if (monthsForward <= 0) {
    return {
      balance: mortgages.reduce(
        (s, d) => s + Number(d.current_balance) * (Number(d.net_worth_inclusion_pct ?? 100) / 100),
        0,
      ),
      monthlyPayment: mortgages.reduce((s, d) => s + Number(d.monthly_payment || 0), 0),
    }
  }
  const details = projectMortgageDetailsAt(mortgages, monthsForward)
  return {
    balance: details.reduce((s, p) => s + p.balanceAtFuture, 0),
    monthlyPayment: details.reduce((s, p) => s + p.monthlyPaymentAtFuture, 0),
  }
}

// ── Cost & payout estimators ─────────────────────────────────

/**
 * Schatting maandelijkse woonlast (huur of kleinere hypotheek) ná verkoop.
 * Heuristiek: 4% van WOZ-waarde / 12 ≈ NL-gemiddelde middenhuur-niveau.
 * Bij €400K WOZ ≈ €1.333/mnd. Gebruiker kan dit overschrijven via config.
 */
export function estimateMonthlyHousingCostAfterSale(wozValue: number): number {
  if (!Number.isFinite(wozValue) || wozValue <= 0) return 0
  return Math.round((wozValue * 0.04) / 12)
}

/**
 * Schatting maandelijkse opeethypotheek-uitkering.
 * Lineair: (overwaarde × maxLoanPct) / resterende verwachte levensjaren / 12.
 * Bij €300K overwaarde, 50% loan, 20 jaar uitkering ≈ €625/mnd.
 */
export function estimateReverseMortgagePayout(
  equity: number,
  maxLoanPct: number,
  remainingYears: number,
): number {
  if (!Number.isFinite(equity) || equity <= 0) return 0
  const years = Math.max(1, remainingYears)
  return Math.round((equity * maxLoanPct) / years / 12)
}

// ── Downsize-trigger: crossover liquide vs overwaarde ────────

export interface OnDepletionTriggerResult {
  /** Geresolveerde trigger-leeftijd (= verkoop-moment). */
  triggerAge: number
  /** Geprojecteerd liquide vermogen op trigger-moment. */
  liquidAtTrigger: number
  /** Geprojecteerde overwaarde op trigger-moment. */
  equityAtTrigger: number
  /**
   * Waarom dit moment?
   *   - 'immediate': liquide < overwaarde nu reeds (en gebruiker is post-opbouw).
   *   - 'crossover': in toekomst zakt liquide onder overwaarde.
   *   - 'fallback': geen crossover binnen fallback-leeftijd OF gebruiker zit nog in opbouwfase.
   *   - 'still_accumulating': gebruiker spaart nog netto — verkoop niet nodig; uitsluitend
   *     fallback-leeftijd wordt gebruikt.
   */
  reason: 'immediate' | 'crossover' | 'fallback' | 'still_accumulating'
  /**
   * Fase waarin de gebruiker zich bevindt (op currentAge).
   *   - 'accumulation': annualSavings >= yearlyExpenses (netto sparen, vermogen groeit).
   *   - 'decumulation': annualSavings < yearlyExpenses (netto interen, vermogen daalt).
   * Volgens de definitie mag de trigger alleen in 'decumulation' vuren — het huis is
   * pas "nodig" wanneer je niet meer netto spaart.
   */
  phase: 'accumulation' | 'decumulation'
  /** Jaarlijkse netto-afname van liquide vermogen (= yearlyExpenses − annualSavings, ≥0). */
  netDeclinePerYear: number
}

/**
 * Bepaal het verkoopmoment voor downsize × on_depletion.
 *
 * Definitie:
 *   Verkoop is "nodig" wanneer **het totale vermogen daalt onder het
 *   eigen-huis-vermogen** (= WOZ − resterende hypotheek).
 *
 *   Totaal vermogen = liquide portfolio + equity. Met `equity = WOZ −
 *   hypotheek` betekent `totaal < equity` algebraïsch dat
 *   `liquide < 0`. Praktisch: de trigger vuurt op het moment dat het
 *   liquide deel op raakt — vanaf dan is er geen cash meer en moet het
 *   huis worden gemonetiseerd.
 *
 * Phase-gate:
 *   - Opbouw-fase (annualSavings ≥ yearlyExpenses): vermogen groeit
 *     netto, liquide raakt nooit op via deze projectie. **Geen trigger**;
 *     fallback-leeftijd wordt het uiterste moment.
 *   - Tussen-/afbouw-fase (annualSavings < yearlyExpenses): liquide teert
 *     met `netDecline = expenses − savings` per jaar. Trigger op de
 *     leeftijd waarop het liquide saldo nul bereikt.
 *
 * Projectiemodel (yearly compounding):
 *   - Wanneer `grossReturn` én `inflationRate` zijn gegeven, gebruikt de
 *     loop het **reële rendement** = `(1+gross) / (1+infl) − 1` per jaar:
 *     `liquid[t+1] = liquid[t] × (1+realReturn) − declineUsed`.
 *     Hierdoor valt de trigger ECHT later wanneer het rendement de
 *     drawdown gedeeltelijk compenseert (realistischer dan lineair).
 *   - Wanneer beide ontbreken (legacy callers): `realReturn = 0` →
 *     gedrag identiek aan de oude lineaire `yearsToZero = ceil(...)`.
 *   - Overwaarde wordt op trigger-moment apart geprojecteerd via
 *     `projectMortgageStateAt` (amortisatie van hypotheek). De WOZ-groei
 *     loopt apart via `projectEigenHuisValuesAt` op de callsite.
 *
 * Returns:
 *   - `immediate`: in afbouw én liquide nu reeds ≤ 0.
 *   - `crossover`: in afbouw, liquide bereikt 0 binnen fallback-window.
 *   - `still_accumulating`: nog in opbouw — trigger niet relevant.
 *   - `fallback`: in afbouw, maar liquide raakt niet op vóór fallback.
 */
export function resolveDownsizeTriggerOnDepletion(
  currentAge: number,
  fallbackAge: number,
  yearlyExpenses: number,
  currentLiquidPortfolio: number,
  context: HousingContext,
  annualSavings: number = 0,
  currentNetCashflowYearly?: number,
  grossReturn?: number,
  inflationRate?: number,
): OnDepletionTriggerResult {
  const safeFallback = Math.max(currentAge, fallbackAge)
  // Phase-gate. Voorkeur: directe cashflow-meting (`currentNetCashflowYearly`).
  // Anders fallback op `annualSavings vs yearlyExpenses` — minder accuraat.
  // Definitie van opbouw: gebruiker is netto aan het sparen (cashflow ≥ 0).
  const cashflowKnown = currentNetCashflowYearly !== undefined
  const cashflowYearly = cashflowKnown ? currentNetCashflowYearly! : annualSavings - yearlyExpenses
  const isAccumulating = cashflowYearly >= 0
  const phase: 'accumulation' | 'decumulation' = isAccumulating ? 'accumulation' : 'decumulation'
  // In afbouw daalt liquide met de WERKELIJKE drawdown (= -cashflow). Als
  // alleen `annualSavings` bekend is, gebruik die als drempel (=
  // yearlyExpenses - annualSavings).
  const declineUsed = cashflowKnown
    ? Math.max(0, -cashflowYearly)
    : Math.max(0, yearlyExpenses - annualSavings)

  // Reëel rendement (na inflatie) op liquide vermogen. Default 0 wanneer
  // de caller geen rendement-parameters meegeeft — dan gedraagt deze
  // functie zich identiek aan de oude lineaire MVP.
  const realReturn =
    grossReturn !== undefined && Number.isFinite(grossReturn)
      ? (1 + grossReturn) / (1 + (inflationRate ?? 0)) - 1
      : 0

  // Helper: liquide + equity op gegeven leeftijd onder zelfde compounding-model.
  const projectAt = (age: number) => {
    const yearsElapsed = Math.max(0, age - currentAge)
    // Itereer per jaar: rendement bovenop, drawdown eraf. Identiek aan de
    // hoofd-loop hieronder zodat reason='fallback' consistent is.
    let liquid = currentLiquidPortfolio
    for (let y = 1; y <= yearsElapsed; y++) {
      liquid = liquid * (1 + realReturn) - declineUsed
      if (liquid < 0) liquid = 0
    }
    const projection = projectMortgageStateAt(context.eigenHuisMortgages, yearsElapsed * 12)
    const equity = Math.max(0, context.wozValue - projection.balance)
    return { liquid, equity }
  }

  if (!context.hasEigenHuis) {
    const { liquid, equity } = projectAt(safeFallback)
    return {
      triggerAge: safeFallback,
      liquidAtTrigger: liquid,
      equityAtTrigger: equity,
      reason: 'fallback',
      phase,
      netDeclinePerYear: declineUsed,
    }
  }

  // Phase-gate: opbouw → geen trigger, val terug op fallback-leeftijd.
  if (isAccumulating) {
    const { equity } = projectAt(safeFallback)
    return {
      triggerAge: safeFallback,
      liquidAtTrigger: currentLiquidPortfolio,
      equityAtTrigger: equity,
      reason: 'still_accumulating',
      phase,
      netDeclinePerYear: declineUsed,
    }
  }

  // Decumulation: liquide nu al op? → trigger direct.
  if (currentLiquidPortfolio <= 0) {
    const equityNow = Math.max(0, context.eigenHuisValue - context.mortgageBalance)
    return {
      triggerAge: currentAge,
      liquidAtTrigger: 0,
      equityAtTrigger: equityNow,
      reason: 'immediate',
      phase,
      netDeclinePerYear: declineUsed,
    }
  }

  // Yearly compounding loop. Met realReturn=0 vervalt dit naar het oude
  // lineaire model. Met positief realReturn (bv. 5% gross / 2% infl ≈ 3%
  // reëel) wordt de drawdown deels gecompenseerd → trigger later.
  // `declineUsed > 0` hier door `!isAccumulating`, dus de loop termineert
  // sowieso binnen het fallback-window of valt door naar 'fallback'.
  let liquid = currentLiquidPortfolio
  let yearsElapsed = 0
  let triggered = false
  const maxYears = Math.max(0, safeFallback - currentAge)
  for (let y = 1; y <= maxYears; y++) {
    liquid = liquid * (1 + realReturn) - declineUsed
    yearsElapsed = y
    if (liquid <= 0) {
      triggered = true
      break
    }
  }

  if (triggered) {
    const projectedTriggerAge = currentAge + yearsElapsed
    const { equity } = projectAt(projectedTriggerAge)
    return {
      triggerAge: projectedTriggerAge,
      liquidAtTrigger: 0,
      equityAtTrigger: equity,
      reason: 'crossover',
      phase,
      netDeclinePerYear: declineUsed,
    }
  }

  // Liquide raakt niet op binnen het fallback-window → uiterste leeftijd.
  const { liquid: liquidAtFallback, equity: equityAtFallback } = projectAt(safeFallback)
  return {
    triggerAge: safeFallback,
    liquidAtTrigger: liquidAtFallback,
    equityAtTrigger: equityAtFallback,
    reason: 'fallback',
    phase,
    netDeclinePerYear: declineUsed,
  }
}

// ── Trigger resolution ───────────────────────────────────────

/**
 * Bepaal de leeftijd waarop de strategie activeert.
 *
 * fixed_age:    direct uit config.
 * on_depletion: schat het jaar waarop liquide vermogen onder de threshold zakt.
 *               MVP-benadering: lineair zonder rendement
 *               (yearsToTrigger = (liquid - threshold) / yearlyExpenses).
 *               Negeert rendement → conservatief (trigger iets vroeger).
 *               Als liquide al onder threshold zit: trigger op currentAge.
 *               Bij yearlyExpenses ≤ 0: fallback naar config.triggerAge.
 */
export function resolveTriggerAge(
  trigger: HousingStrategyTrigger,
  triggerAge: number,
  depletionThresholdYears: number,
  currentAge: number,
  yearlyExpenses: number,
  currentLiquidPortfolio: number,
): number {
  if (trigger === 'fixed_age') return Math.max(currentAge, triggerAge)
  if (yearlyExpenses <= 0) return Math.max(currentAge, triggerAge)
  const threshold = depletionThresholdYears * yearlyExpenses
  if (currentLiquidPortfolio <= threshold) return currentAge
  const yearsToTrigger = (currentLiquidPortfolio - threshold) / yearlyExpenses
  const predicted = currentAge + Math.floor(yearsToTrigger)
  return Math.min(predicted, triggerAge) // fallback-leeftijd is bovengrens
}

// ── Adjustment-resultaat ─────────────────────────────────────

export interface HousingAdjustment {
  /** Bedrag dat van het startvermogen wordt afgetrokken (eigen woning uitsluiten). */
  initialPortfolioDelta: number
  /** Synthetische cashflows die aan de bestaande lijst worden toegevoegd. */
  cashflows: SimCashflow[]
  /** Geresolveerde trigger-leeftijd (null voor include_full / exclude_from_fire). */
  resolvedTriggerAge: number | null
  /** Schaduw-schuld bij endAge (alleen reverse_mortgage; display-only). */
  shadowDebtAtEndAge: number
}

export const NO_HOUSING_ADJUSTMENT: HousingAdjustment = {
  initialPortfolioDelta: 0,
  cashflows: [],
  resolvedTriggerAge: null,
  shadowDebtAtEndAge: 0,
}

export interface ApplyHousingStrategyInput {
  config: HousingStrategyConfig
  context: HousingContext
  currentAge: number
  endAge: number
  yearlyExpenses: number
  /** Liquide deel van het vermogen (= totaal minus eigen_huis). Gebruikt voor on_depletion. */
  currentLiquidPortfolio: number
  /**
   * Jaarlijks nettospaarsaldo (= monthlyContributions × 12).
   * Legacy parameter. Gebruikt als fallback wanneer `currentNetCashflowYearly`
   * niet is gegeven: phase-gate kijkt dan naar `annualSavings ≥ yearlyExpenses`.
   * Default 0 = onbekend → conservatief afbouw.
   */
  annualSavings?: number
  /**
   * **Huidig** jaarlijks netto-cashflow van de gebruiker (= (monthlyIncome
   * − monthlyExpenses) × 12). Positief = nog in **opbouw-fase**, negatief
   * = **tussen/afbouw-fase** (gebruiker teert in).
   *
   * Dit is de **autoritatieve** indicator voor phase-gating omdat
   * `annualSavings` (asset-contributions) 0 kan zijn ook als de gebruiker
   * netto spaart via z'n bankrekening. Wanneer gegeven, wint deze van
   * `annualSavings`.
   */
  currentNetCashflowYearly?: number
  /**
   * Bruto rendement op het liquide vermogen (decimaal, bv. 0.07). Gebruikt
   * voor portfolio-groei bij de `on_depletion`-trigger-projectie: zonder
   * rendement valt de trigger vroeger dan in werkelijkheid. Default
   * undefined → lineair model (legacy gedrag).
   */
  grossReturn?: number
  /**
   * Inflatiepercentage (decimaal, bv. 0.02). Gebruikt om reëel rendement
   * af te leiden bij de `on_depletion`-trigger-projectie. Wanneer
   * `grossReturn` is gegeven maar `inflationRate` niet, wordt 0 inflatie
   * aangenomen. Default undefined → samen met `grossReturn` zelf
   * undefined → lineair model.
   */
  inflationRate?: number
}

/**
 * Bereken trigger-leeftijd en (voor reverse_mortgage) verwachte
 * schaduw-schuld bij endAge. **Genereert geen SimCashflows meer** — die
 * komen sinds de tijdlijn-integratie via `getHousingLifeEvents` →
 * `lifeEventsToCashflows`. Equity-uitsluiting voor exclude/downsize wordt
 * door `filterAssetsForFire` afgehandeld.
 *
 * Pure functie — geen Supabase, geen side-effects.
 */
export function applyHousingStrategy(input: ApplyHousingStrategyInput): HousingAdjustment {
  const { config, context, currentAge, endAge, yearlyExpenses, currentLiquidPortfolio } = input

  if (!context.hasEigenHuis) return NO_HOUSING_ADJUSTMENT

  switch (config.mode) {
    case 'include_full':
      return NO_HOUSING_ADJUSTMENT

    case 'exclude_from_fire': {
      const equity = context.eigenHuisValue - context.mortgageBalance
      return {
        ...NO_HOUSING_ADJUSTMENT,
        initialPortfolioDelta: -equity,
      }
    }

    case 'downsize': {
      const triggerAge = resolveTriggerAge(
        config.trigger,
        config.triggerAge,
        config.depletionThresholdYears,
        currentAge,
        yearlyExpenses,
        currentLiquidPortfolio,
      )
      const equity = context.eigenHuisValue - context.mortgageBalance
      return {
        initialPortfolioDelta: -equity,
        cashflows: [],
        resolvedTriggerAge: triggerAge,
        shadowDebtAtEndAge: 0,
      }
    }

    case 'reverse_mortgage': {
      const triggerAge = resolveTriggerAge(
        config.trigger,
        config.triggerAge,
        config.depletionThresholdYears,
        currentAge,
        yearlyExpenses,
        currentLiquidPortfolio,
      )
      // Project hypotheek-saldo naar trigger; equity = woning − geprojecteerd saldo.
      const monthsToTrigger = Math.max(0, (triggerAge - currentAge) * 12)
      const projected = projectMortgageStateAt(context.eigenHuisMortgages, monthsToTrigger)
      const equity = Math.max(0, context.eigenHuisValue - projected.balance)
      const remainingYears = Math.max(1, endAge - triggerAge)
      const monthlyPayout =
        config.monthlyPayout ??
        estimateReverseMortgagePayout(equity, config.maxLoanPct, remainingYears)

      const principal = monthlyPayout * 12 * remainingYears
      const shadowDebtAtEndAge =
        principal * Math.pow(1 + config.interestRate, remainingYears) - principal

      return {
        initialPortfolioDelta: 0,
        cashflows: [],
        resolvedTriggerAge: triggerAge,
        shadowDebtAtEndAge,
      }
    }
  }
}

// ── Virtuele LifeEvents voor de tijdlijn ─────────────────────

/**
 * Markering die elke door housing-strategy gegenereerde LifeEvent draagt in
 * `metadata.source`. UI-componenten gebruiken dit om de events read-only te
 * tonen en met een "Beheerd via Eigen-woning-strategie"-badge te markeren.
 */
export const HOUSING_STRATEGY_EVENT_SOURCE = 'housing-strategy' as const

/**
 * ID-prefix voor virtuele LifeEvents zodat de events-API requests met deze IDs
 * kan weigeren (geen DB-row om bij te werken).
 */
export const HOUSING_STRATEGY_EVENT_ID_PREFIX = 'housing-strategy:' as const

export function isHousingStrategyEvent(event: { id: string }): boolean {
  return event.id.startsWith(HOUSING_STRATEGY_EVENT_ID_PREFIX)
}

/**
 * Genereer virtuele LifeEvents voor de gekozen housing strategy zodat ze in
 * de event-tijdlijn op /horizon zichtbaar worden. Worden niet naar de DB
 * geschreven — bestaan alleen in-memory en worden door `lifeEventsToCashflows`
 * (de bestaande LifeEvent → SimCashflow-pipeline) opgepikt voor de simulatie.
 *
 * Per mode:
 *   include_full / exclude_from_fire → [] (geen tijdlijn-impact)
 *   downsize → 3 events op trigger-leeftijd:
 *     - Verkoop eigen woning (one_time_cost = -saleProceeds → income)
 *     - Einde hypotheekbetaling (monthly_cost_change = -mortgage → income)
 *     - Nieuwe woonkosten (monthly_cost_change = +newMonthlyHousingCost)
 *   reverse_mortgage → 1 event op trigger-leeftijd:
 *     - Opeethypotheek-uitkering (monthly_income_change = monthlyPayout)
 */
export function getHousingLifeEvents(input: ApplyHousingStrategyInput): LifeEvent[] {
  const {
    config,
    context,
    currentAge,
    endAge,
    yearlyExpenses,
    currentLiquidPortfolio,
    annualSavings = 0,
    currentNetCashflowYearly,
    grossReturn,
    inflationRate,
  } = input
  if (!context.hasEigenHuis) return []

  const baseMetadata = { source: HOUSING_STRATEGY_EVENT_SOURCE, strategy: config.mode }

  switch (config.mode) {
    case 'include_full':
    case 'exclude_from_fire':
      return []

    case 'downsize': {
      // Trigger-moment. Voor on_depletion gebruiken we de nieuwe crossover-
      // definitie (liquide vermogen < overwaarde tijdens afbouw); voor
      // fixed_age direct de geconfigureerde leeftijd.
      let triggerAge: number
      let depletion: OnDepletionTriggerResult | null = null
      if (config.trigger === 'on_depletion') {
        depletion = resolveDownsizeTriggerOnDepletion(
          currentAge,
          config.triggerAge,
          yearlyExpenses,
          currentLiquidPortfolio,
          context,
          annualSavings,
          currentNetCashflowYearly,
          grossReturn,
          inflationRate,
        )
        triggerAge = depletion.triggerAge
      } else {
        triggerAge = Math.max(currentAge, config.triggerAge)
      }
      // Projecteer per-hypotheek saldo + maandlast + resterende looptijd
      // naar trigger-moment. Daarmee weten we (a) hoeveel cash de verkoop
      // oplevert, (b) hoeveel bespaarde lasten je nog ontvangt en (c) tot
      // wanneer die besparing loopt (oorspronkelijke einddatum hypotheek).
      const monthsToTrigger = Math.max(0, (triggerAge - currentAge) * 12)
      const projections = projectMortgageDetailsAt(context.eigenHuisMortgages, monthsToTrigger)
      const mortgageBalanceAtTrigger = projections.reduce(
        (s, p) => s + p.balanceAtFuture,
        0,
      )
      const mortgagePaymentAtTrigger = projections.reduce(
        (s, p) => s + p.monthlyPaymentAtFuture,
        0,
      )
      // Langste resterende looptijd over alle hypotheken (voor display).
      const mortgageMaxRemainingMonths = projections.reduce(
        (m, p) => Math.max(m, p.remainingMonthsAtFuture),
        0,
      )

      // Projecteer woning-waarde naar trigger-moment via asset-specifiek
      // `expected_return`. Zonder deze stap zou een trigger over 20 jaar nog
      // steeds met de huidige WOZ rekenen — onrealistisch laag voor
      // verkoopopbrengsten. Fallback op huidige `wozValue` wanneer er
      // (theoretisch onmogelijk gegeven `hasEigenHuis`-guard) geen assets in
      // de context zitten.
      const projectedHouse =
        context.eigenHuisAssets.length > 0
          ? projectEigenHuisValuesAt(context.eigenHuisAssets, monthsToTrigger)
          : { wozValue: context.wozValue, currentValue: context.eigenHuisValue }
      const wozValueAtTrigger = projectedHouse.wozValue

      const saleProceeds =
        wozValueAtTrigger * config.salePricePct * (1 - config.salesCostsPct) -
        mortgageBalanceAtTrigger
      const newMonthly =
        config.newMonthlyHousingCost ?? estimateMonthlyHousingCostAfterSale(wozValueAtTrigger)

      // Eén LifeEvent met meerdere sub-cashflows in metadata.cashflows.
      // lifeEventsToCashflows pikt deze array op (zie fire-simulation.ts:817)
      // en converteert ze los; de generic one_time/monthly velden blijven 0.
      const cashflows: UserDefinedCashflow[] = []

      if (saleProceeds !== 0) {
        cashflows.push({
          id: 'sale',
          name: 'Verkoopopbrengst',
          type: 'one_time',
          direction: saleProceeds > 0 ? 'income' : 'expense',
          amount: Math.abs(saleProceeds),
          durationMonths: 0,
          indexed: false,
        })
      }
      // Per-hypotheek 'bespaarde maandlast'-cashflow met juiste resterende
      // looptijd. Loopt tot de oorspronkelijke einddatum van die hypotheek
      // (`remainingMonthsAtFuture`); daarna had je toch niet meer betaald.
      // Bij meerdere hypotheken levert dit één cashflow per hypotheek op.
      for (const p of projections) {
        if (p.monthlyPaymentAtFuture <= 0) continue
        cashflows.push({
          id: `mortgage-end-${p.debtId}`,
          name:
            projections.length > 1
              ? `Bespaarde hypotheekbetaling (${p.name})`
              : 'Bespaarde hypotheekbetaling',
          type: 'recurring',
          direction: 'income',
          amount: p.monthlyPaymentAtFuture,
          // 0 = blijvend (geen einddatum bekend); >0 = stopt na N mnd.
          durationMonths: p.remainingMonthsAtFuture,
          indexed: false,
        })
      }
      // Nieuwe huur loopt door tot eind van simulatie, geïndexeerd.
      if (newMonthly > 0) {
        cashflows.push({
          id: 'new-rent',
          name: 'Nieuwe woonkosten (huur)',
          type: 'recurring',
          direction: 'expense',
          amount: newMonthly,
          durationMonths: 0,
          indexed: true,
        })
      }

      if (cashflows.length === 0) return []

      return [
        {
          id: `${HOUSING_STRATEGY_EVENT_ID_PREFIX}downsize`,
          name: 'Verkoop eigen woning',
          event_type: 'verkoop_eigen_woning',
          target_age: triggerAge,
          target_date: null,
          // Generic velden blijven 0 — metadata.cashflows neemt het over.
          one_time_cost: 0,
          monthly_cost_change: 0,
          monthly_income_change: 0,
          duration_months: 0,
          icon: 'Home',
          is_active: true,
          sort_order: 1000,
          is_indexed: false,
          metadata: {
            ...baseMetadata,
            formula: 'downsize',
            cashflows,
            saleProceeds,
            wozValue: context.wozValue,
            // Geprojecteerde WOZ-waarde bij trigger (= huidig × (1+ret)^jaren).
            // Verschilt van `wozValue` zodra er jaren tussen nu en trigger zitten;
            // gebruikt door UI om "huidig vs. bij verkoop"-breakdown te tonen.
            wozValueAtTrigger,
            salePricePct: config.salePricePct,
            salesCostsPct: config.salesCostsPct,
            // Toon zowel huidig saldo als geprojecteerd saldo bij trigger.
            mortgageBalance: context.mortgageBalance,
            mortgageBalanceAtTrigger,
            mortgageMonthlyPayment: context.mortgageMonthlyPayment,
            mortgagePaymentAtTrigger,
            mortgageRemainingMonthsAtTrigger: mortgageMaxRemainingMonths,
            yearsToTrigger: triggerAge - currentAge,
            newMonthly,
            isAutoEstimate: config.newMonthlyHousingCost == null,
            // Trigger-uitleg (alleen bij on_depletion): laat zien waarom dit
            // moment. Geeft data voor UI-breakdown.
            depletion,
            triggerMode: config.trigger,
            currentLiquidPortfolio,
            yearlyExpenses,
            annualSavings,
            currentNetCashflowYearly,
          },
        },
      ]
    }

    case 'reverse_mortgage': {
      const triggerAge = resolveTriggerAge(
        config.trigger,
        config.triggerAge,
        config.depletionThresholdYears,
        currentAge,
        yearlyExpenses,
        currentLiquidPortfolio,
      )
      // Projecteer hypotheek-saldo naar trigger — overwaarde groeit terwijl
      // de hypotheek wordt afgelost. Woning-waarde groeit nu ook mee via
      // het asset-specifieke `expected_return` zodat de equity-projectie
      // realistisch is voor triggers over 10-20 jaar.
      const monthsToTrigger = Math.max(0, (triggerAge - currentAge) * 12)
      const projected = projectMortgageStateAt(context.eigenHuisMortgages, monthsToTrigger)
      const mortgageBalanceAtTrigger = projected.balance
      const projectedHouse =
        context.eigenHuisAssets.length > 0
          ? projectEigenHuisValuesAt(context.eigenHuisAssets, monthsToTrigger)
          : { wozValue: context.wozValue, currentValue: context.eigenHuisValue }
      const eigenHuisValueAtTrigger = projectedHouse.currentValue
      const equityAtTrigger = Math.max(0, eigenHuisValueAtTrigger - mortgageBalanceAtTrigger)
      const remainingYears = Math.max(1, endAge - triggerAge)
      const monthlyPayout =
        config.monthlyPayout ??
        estimateReverseMortgagePayout(equityAtTrigger, config.maxLoanPct, remainingYears)
      if (monthlyPayout <= 0) return []

      return [
        {
          id: `${HOUSING_STRATEGY_EVENT_ID_PREFIX}reverse-mortgage-payout`,
          name: 'Opeethypotheek-uitkering',
          event_type: 'opeethypotheek',
          target_age: triggerAge,
          target_date: null,
          one_time_cost: 0,
          monthly_cost_change: 0,
          monthly_income_change: monthlyPayout,
          duration_months: 0,
          icon: 'KeyRound',
          is_active: true,
          sort_order: 1000,
          is_indexed: false,
          metadata: {
            ...baseMetadata,
            formula: 'reverse-payout',
            // `equity` blijft de overwaarde-bij-trigger (gebruikt in payout-formule).
            equity: equityAtTrigger,
            maxLoanPct: config.maxLoanPct,
            interestRate: config.interestRate,
            remainingYears,
            monthlyPayout,
            isAutoEstimate: config.monthlyPayout == null,
            eigenHuisValue: context.eigenHuisValue,
            // Geprojecteerde marktwaarde bij trigger — verschilt van
            // `eigenHuisValue` wanneer er jaren tussen nu en trigger zitten.
            eigenHuisValueAtTrigger,
            // Display: huidig saldo + geprojecteerd saldo bij trigger.
            mortgageBalance: context.mortgageBalance,
            mortgageBalanceAtTrigger,
            yearsToTrigger: triggerAge - currentAge,
          },
        },
      ]
    }
  }
}

// ── Asset/debt filtering voor projectie-engines ──────────────

/**
 * Bepaal of we eigen woning + linked mortgage uit de assets/debts moeten
 * weglaten bij het opbouwen van de FIRE-projectie. True voor strategieën
 * waarbij het huis niet aan de FIRE-pot bijdraagt (exclude, downsize) —
 * de woonkost blijft wel als budget-cashflow staan; we modelleren de
 * inkomende verkoop/uitkering via synthetische cashflows.
 */
export function shouldFilterEigenHuisForFire(config: HousingStrategyConfig): boolean {
  return config.mode === 'exclude_from_fire' || config.mode === 'downsize'
}

/**
 * Filter assets en linked mortgage debts voor de unified projection engine.
 * Retourneert NIEUWE lijsten — input wordt niet gemuteerd.
 */
export function filterAssetsForFire(
  config: HousingStrategyConfig,
  assets: Asset[],
  debts: Debt[],
): { assets: Asset[]; debts: Debt[] } {
  if (!shouldFilterEigenHuisForFire(config)) return { assets, debts }
  const eigenHuisIds = new Set(
    assets.filter((a) => a.is_active && a.asset_type === 'eigen_huis').map((a) => a.id),
  )
  if (eigenHuisIds.size === 0) return { assets, debts }
  const filteredAssets = assets.filter((a) => a.asset_type !== 'eigen_huis')
  const filteredDebts = debts.filter(
    (d) => !(d.debt_type === 'mortgage' && d.linked_asset_id && eigenHuisIds.has(d.linked_asset_id)),
  )
  return { assets: filteredAssets, debts: filteredDebts }
}

// ── Display-helper: belegbaar vermogen voor FIRE ─────────────

/**
 * Bereken "Belegbaar vermogen voor pensioen" — totaal vermogen minus eigen
 * woning bij strategieën waar de woning niet meedoet.
 *
 * Gebruikt door Horizon-dashboard om twee getallen prominent te tonen.
 */
export function getFireEligibleNetWorth(
  totalNetWorth: number,
  context: HousingContext,
  config: HousingStrategyConfig,
): number {
  const equity = context.eigenHuisValue - context.mortgageBalance
  switch (config.mode) {
    case 'include_full':
    case 'reverse_mortgage':
      return totalNetWorth
    case 'exclude_from_fire':
    case 'downsize':
      return totalNetWorth - equity
  }
}
