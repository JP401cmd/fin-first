/**
 * Unified Projection Engine — Fase 0: Types & Interfaces.
 *
 * Gedeelde types die zowel de bucket-projection (per-asset-type vermogensprognose)
 * als de fire-simulation (FIRE projectie) kunnen vervangen/combineren.
 *
 * Bevat:
 * - UnifiedProjectionRow: per-jaar rij met per-asset-type detail + schuld afbouw
 * - UnifiedProjectionInput: gecombineerde invoer voor beide projectiesystemen
 * - UnifiedProjectionResult: resultaat compatibel met bestaand SimResult
 * - toSimRow() / toSimResult(): backwards-compatible mapping functies
 *
 * Pure types, geen Supabase dependency.
 */

import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { SimCashflow, SimRow, SimResult } from '@/lib/fire-simulation'
import type { FireEndStrategy, FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { Box3Method } from '@/lib/bucket-projection'

// ── Per-asset-type bucket detail ────────────────────────────────────────────

/** Per-asset-type financiele snapshot voor een enkel projectiejaar. */
export interface AssetBucketDetail {
  /** Waarde aan het begin van het jaar */
  startValue: number
  /** Rendement over het jaar (nominaal) */
  growth: number
  /** Bijdragen / besparingen dit jaar */
  contributions: number
  /** Box 3 belastingdrag dit jaar */
  box3Drag: number
  /** Waarde aan het einde van het jaar */
  endValue: number
}

// ── Per-schuld afbouwdetail ─────────────────────────────────────────────────

/** Per-schuld aflossingsdetail voor een enkel projectiejaar. */
export interface DebtBalanceDetail {
  /** Uitstaand saldo aan begin van het jaar */
  startBalance: number
  /** Betaalde rente dit jaar */
  interestPaid: number
  /** Afgeloste hoofdsom dit jaar */
  principalPaid: number
  /** Uitstaand saldo aan einde van het jaar */
  endBalance: number
}

// ── Unified Projection Row ──────────────────────────────────────────────────

/**
 * Een enkele rij in de unified projectie — combineert per-asset-type rendement,
 * Box 3 per type, schuldaflossing per schuld, en fase-informatie.
 */
export interface UnifiedProjectionRow {
  /** Jaar-index (0 = huidig jaar) */
  year: number
  /** Leeftijd van de gebruiker in dit projectiejaar */
  age: number
  /** Fase van de simulatie */
  phase: 'accumulation' | 'transition' | 'withdrawal'

  // ── Per-asset-type detail ─────────────────────────────────
  /** Rendement en waardeontwikkeling per vermogenstype */
  assetBuckets: Partial<Record<AssetType, AssetBucketDetail>>

  // ── Per-schuld detail ─────────────────────────────────────
  /** Aflossingsvoortgang per schuld (key = debt.id) */
  debtBalances: Record<string, DebtBalanceDetail>

  // ── Aggregaten ────────────────────────────────────────────
  /** Totale waarde van alle assets */
  totalAssets: number
  /** Totale uitstaande schulden */
  totalDebts: number
  /** Netto vermogen (totalAssets - totalDebts) */
  netWorth: number

  // ── Kasstromen ────────────────────────────────────────────
  /** Bruto inkomen dit jaar (salaris + extra inkomsten) */
  grossIncome: number
  /** Besparingen / inleg dit jaar */
  savings: number
  /** Onttrekking dit jaar (alleen in withdrawal fase) */
  withdrawal: number
  /** Netto kasstroom uit life events / extra cashflows */
  cashflowNet: number
  /** Totaal rendement over alle asset types */
  totalGrowth: number
  /** Totale Box 3 belasting dit jaar (som van alle asset types) */
  totalBox3: number
  /** Cumulatieve Box 3 belasting tot en met dit jaar */
  cumulativeBox3: number

  // ── Inflatie ──────────────────────────────────────────────
  /** Inflatiefactor: (1 + inflationRate)^year, altijd >= 1.0 */
  inflationFactor: number
}

// ── Unified Projection Input ────────────────────────────────────────────────

/**
 * Gecombineerde invoer voor de unified projection engine.
 * Bevat alle data die zowel bucket-projection als fire-simulation nodig hebben.
 */
export interface UnifiedProjectionInput {
  // ── Vermogen & schulden ───────────────────────────────────
  /** Alle actieve assets van de gebruiker */
  assets: Asset[]
  /** Alle actieve schulden van de gebruiker */
  debts: Debt[]

  // ── Leeftijd & horizon ────────────────────────────────────
  /** Huidige leeftijd van de gebruiker */
  currentAge: number
  /** Eindleeftijd van de simulatie */
  endAge: number

  // ── Kasstromen ────────────────────────────────────────────
  /** Jaarlijkse uitgaven (bruto) */
  yearlyExpenses: number
  /** Jaarlijkse besparingen */
  annualSavings: number
  /** Maandelijks surplus (inkomen - uitgaven) uit transactieanalyse */
  monthlySurplus: number
  /** Bruto maandinkomen */
  monthlyIncome: number
  /** Jaarlijkse inkomensgroei (decimaal, bijv. 0.02) */
  incomeGrowthRate: number

  // ── Rendement & inflatie ──────────────────────────────────
  /** Bruto verwacht rendement als fallback (decimaal, bijv. 0.07) */
  grossReturn: number
  /** Inflatiepercentage (decimaal, bijv. 0.02) */
  inflationRate: number

  // ── Box 3 ─────────────────────────────────────────────────
  /** Box 3 berekeningsmethode */
  box3Method: Box3Method

  // ── Life events & extra cashflows ─────────────────────────
  /** Externe kasstromen (AOW, pensioen, life events, etc.) */
  cashflows: SimCashflow[]

  // ── Strategie ─────────────────────────────────────────────
  /** FIRE eindstrategie configuratie */
  strategyConfig: FireStrategyConfig
  /** Onttrekkingsstrategie configuratie */
  withdrawalStrategy: WithdrawalStrategyConfig

  // ── Overig ────────────────────────────────────────────────
  /** Geforceerde FIRE-leeftijd (voor pensioen-modus) */
  forcedFireAge?: number
  /** Heeft de gebruiker een partner (voor Box 3 vrijstelling) */
  hasPartner: boolean
}

// ── Unified Projection Result ───────────────────────────────────────────────

/**
 * Resultaat van de unified projection engine.
 * Backwards-compatible met bestaand SimResult via toSimResult().
 */
export interface UnifiedProjectionResult {
  /** Alle projectierijen */
  rows: UnifiedProjectionRow[]

  // ── FIRE uitkomsten (compatibel met SimResult) ────────────
  /** Berekende FIRE-leeftijd als geheel getal (null als niet bereikbaar) */
  fireAge: number | null
  /** Fractionele FIRE-leeftijd met sub-jaar precisie (bijv. 52.3) */
  fireAgeFractional: number | null
  /** Of FIRE bereikbaar is binnen de eindhorizon */
  fireReachable: boolean
  /** Portfoliowaarde op het moment van FIRE */
  firePortfolioAtFire: number
  /** Minimaal benodigde portfolio bij FIRE */
  requiredFirePortfolio: number
  /** Impliciete onttrekkingsratio (jaarlijkse uitgaven / benodigde portfolio) */
  implicitWithdrawalRate: number
  /** Gebruikte eindstrategie */
  strategy: FireEndStrategy
  /** Doel-eindvermogen (0 voor deplete, legacy bedrag, 0 voor perpetual) */
  targetEndPortfolio: number
  /** Effectieve eindleeftijd voor weergave (grafiek x-as) */
  displayEndAge: number
}

// ── Backwards-compatible mapping functies ────────────────────────────────────

/**
 * Converteer een UnifiedProjectionRow naar een legacy SimRow.
 *
 * Alle bestaande SimRow velden zijn afleidbaar uit de UnifiedProjectionRow:
 * - startPortfolio → totalAssets (begin van jaar)
 * - growth → totalGrowth
 * - savings → savings
 * - withdrawal → withdrawal
 * - cashflowNet → cashflowNet
 * - endPortfolio → totalAssets (einde van jaar, na alle mutaties)
 * - grossIncome → grossIncome
 * - grossExpenses → yearlyExpenses afgeleid uit withdrawal + savings context
 * - phase → 'accumulation' | 'retirement' (transition → accumulation voor legacy)
 * - age → age
 */
export function toSimRow(row: UnifiedProjectionRow): SimRow {
  // Bereken startPortfolio als som van alle asset bucket startValues
  const startPortfolio = Object.values(row.assetBuckets).reduce(
    (sum, bucket) => sum + (bucket?.startValue ?? 0),
    0,
  )

  // Bereken endPortfolio als som van alle asset bucket endValues
  const endPortfolio = Object.values(row.assetBuckets).reduce(
    (sum, bucket) => sum + (bucket?.endValue ?? 0),
    0,
  )

  // Map phase: transition → accumulation voor legacy SimRow (kent alleen 2 fases)
  const legacyPhase: 'accumulation' | 'retirement' =
    row.phase === 'withdrawal' ? 'retirement' : 'accumulation'

  // grossExpenses: in accumulation = 0 (savings al apart), in retirement = withdrawal
  // Dit matcht het bestaande SimRow patroon waar grossExpenses de jaarlijkse kosten zijn
  const grossExpenses = row.phase === 'withdrawal'
    ? row.withdrawal + row.savings  // savings is negatief in withdrawal, maar typisch 0
    : row.grossIncome - row.savings - row.cashflowNet

  return {
    age: row.age,
    phase: legacyPhase,
    startPortfolio,
    growth: row.totalGrowth,
    savings: row.savings,
    withdrawal: row.withdrawal,
    cashflowNet: row.cashflowNet,
    endPortfolio,
    grossIncome: row.grossIncome,
    grossExpenses,
  }
}

/**
 * Converteer een UnifiedProjectionResult naar een legacy SimResult.
 *
 * Alle SimResult velden worden direct overgenomen; alleen de rows
 * worden via toSimRow() geconverteerd. classic25xTarget wordt berekend
 * vanuit de implicitWithdrawalRate en requiredFirePortfolio.
 */
export function toSimResult(result: UnifiedProjectionResult): SimResult {
  // Bereken classic25xTarget: als we requiredFirePortfolio en implicitWithdrawalRate hebben,
  // dan yearlyExpenses = requiredFirePortfolio × implicitWithdrawalRate
  const yearlyExpenses = result.requiredFirePortfolio > 0 && result.implicitWithdrawalRate > 0
    ? Math.round(result.requiredFirePortfolio * result.implicitWithdrawalRate)
    : 0
  const classic25xTarget = Math.round(yearlyExpenses * 25)

  return {
    rows: result.rows.map(toSimRow),
    fireAge: result.fireAge,
    fireAgeFractional: result.fireAgeFractional,
    firePortfolioAtFire: result.firePortfolioAtFire,
    requiredFirePortfolio: result.requiredFirePortfolio,
    fireReachable: result.fireReachable,
    implicitWithdrawalRate: result.implicitWithdrawalRate,
    classic25xTarget,
    strategy: result.strategy,
    targetEndPortfolio: result.targetEndPortfolio,
    displayEndAge: result.displayEndAge,
  }
}
