/**
 * Housing strategy in de FIRE-projectie.
 *
 * Vier modes voor hoe de eigen woning meedoet in `runSimulation()`:
 *
 *   include_full     — default; eigen woning telt 100% mee in FIRE-pot
 *                      (= huidig gedrag). Geen wijziging aan startvermogen
 *                      of cashflows.
 *   exclude_from_fire — eigen woning + linked mortgage worden voor de FIRE-
 *                      pot weggefilterd (`initialPortfolioDelta`). Mortgage-
 *                      cashflow blijft als kostenpost in de bestaande
 *                      `yearlyExpenses` — gebruiker blijft wonen.
 *   downsize         — bij trigger (fixed_age | on_depletion):
 *                        + one-time inkomst = verkoopopbrengst - mortgage-balance
 *                        + recurring inkomst = bespaarde maandlast (oude hypotheek)
 *                        + recurring uitgave = nieuwe maandhuur (auto-schat of override)
 *   reverse_mortgage — bij trigger:
 *                        + recurring inkomst = opeethypotheek-uitkering
 *                        (schaduw-schuld stapelt buiten de portfolio-flow;
 *                         alleen voor display)
 *
 * Trigger-modes:
 *   fixed_age    — strategie activeert op leeftijd `triggerAge`.
 *   on_depletion — strategie activeert wanneer liquide vermogen onder
 *                  `depletionThresholdYears × yearlyExpenses` zakt.
 *                  MVP-benadering: lineair zonder rendement (conservatief
 *                  → trigger iets vroeger dan werkelijkheid).
 *
 * Deze module is een PRE-processor: geroepen vóór `runSimulation()`,
 * produceert een set synthetische `SimCashflow`s + portfolio-delta. De
 * sim-engine blijft onwetend van housing-strategie.
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { SimCashflow } from '@/lib/fire-simulation'

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
  /** Som van openstaande mortgage-balances gekoppeld aan eigen_huis. */
  mortgageBalance: number
  /** Som van maandelijkse mortgage-betalingen (rente + aflossing) voor eigen_huis. */
  mortgageMonthlyPayment: number
  /** True wanneer gebruiker geen eigen_huis-asset heeft (strategie is dan no-op). */
  hasEigenHuis: boolean
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
}

/**
 * Bereken het adjustment-object dat de sim-engine moet toepassen.
 * Pure functie — geen Supabase, geen side-effects.
 */
export function applyHousingStrategy(input: ApplyHousingStrategyInput): HousingAdjustment {
  const { config, context, currentAge, endAge, yearlyExpenses, currentLiquidPortfolio } = input

  if (!context.hasEigenHuis) return NO_HOUSING_ADJUSTMENT

  switch (config.mode) {
    case 'include_full':
      return NO_HOUSING_ADJUSTMENT

    case 'exclude_from_fire': {
      // Equity = eigen woning waarde minus gekoppelde hypotheek. We halen
      // beide uit de FIRE-pot — woonkost (hypotheek-cashflow) blijft in
      // de bestaande yearlyExpenses van de gebruiker.
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
      const saleProceeds =
        context.wozValue * config.salePricePct * (1 - config.salesCostsPct) - context.mortgageBalance
      const newMonthly =
        config.newMonthlyHousingCost ?? estimateMonthlyHousingCostAfterSale(context.wozValue)
      const cashflows: SimCashflow[] = []

      // Eenmalige verkoopopbrengst op trigger-leeftijd.
      if (saleProceeds !== 0) {
        cashflows.push({
          id: 'housing-strategy-downsize-sale',
          name: 'Verkoop eigen woning',
          type: 'one_time',
          direction: saleProceeds > 0 ? 'income' : 'expense',
          amount: Math.abs(saleProceeds),
          fromAge: triggerAge,
          toAge: null,
          indexed: false,
        })
      }
      // Bespaarde maandlast (oude hypotheek) — recurring inkomst vanaf trigger.
      if (context.mortgageMonthlyPayment > 0) {
        cashflows.push({
          id: 'housing-strategy-downsize-mortgage-saved',
          name: 'Bespaard: oude hypotheek',
          type: 'recurring',
          direction: 'income',
          amount: context.mortgageMonthlyPayment,
          fromAge: triggerAge,
          toAge: endAge,
          indexed: false,
        })
      }
      // Nieuwe maandhuur — recurring uitgave vanaf trigger.
      if (newMonthly > 0) {
        cashflows.push({
          id: 'housing-strategy-downsize-new-rent',
          name: 'Nieuwe woonlast (huur)',
          type: 'recurring',
          direction: 'expense',
          amount: newMonthly,
          fromAge: triggerAge,
          toAge: endAge,
          indexed: true,
        })
      }

      // Net als exclude_from_fire halen we de equity vanaf dag 1 uit de
      // FIRE-pot. Bij triggerAge groeit de pot weer met `saleProceeds` (=
      // sale - costs - mortgageBalance), dus over de hele looptijd komt
      // ~96% van de overwaarde terug in de pot (4% verkoopkosten).
      const equity = context.eigenHuisValue - context.mortgageBalance
      return {
        initialPortfolioDelta: -equity,
        cashflows,
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
      const equity = Math.max(0, context.eigenHuisValue - context.mortgageBalance)
      const remainingYears = Math.max(1, endAge - triggerAge)
      const monthlyPayout =
        config.monthlyPayout ??
        estimateReverseMortgagePayout(equity, config.maxLoanPct, remainingYears)
      const cashflows: SimCashflow[] = []

      if (monthlyPayout > 0) {
        cashflows.push({
          id: 'housing-strategy-reverse-mortgage-payout',
          name: 'Opeethypotheek-uitkering',
          type: 'recurring',
          direction: 'income',
          amount: monthlyPayout,
          fromAge: triggerAge,
          toAge: endAge,
          indexed: false,
        })
      }

      // Schaduw-schuld voor display: principal × (1+r)^years; verzamelde rente
      // boven principal. Houdt geen rekening met partial early payouts;
      // overschatting voor display-doel acceptabel.
      const principal = monthlyPayout * 12 * remainingYears
      const shadowDebtAtEndAge =
        principal * Math.pow(1 + config.interestRate, remainingYears) - principal

      return {
        initialPortfolioDelta: 0,
        cashflows,
        resolvedTriggerAge: triggerAge,
        shadowDebtAtEndAge,
      }
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
