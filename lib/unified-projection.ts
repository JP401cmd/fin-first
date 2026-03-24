/**
 * Unified Projection Engine — Types, Interfaces & Per-Year Computation.
 *
 * Gedeelde types die zowel de bucket-projection (per-asset-type vermogensprognose)
 * als de fire-simulation (FIRE projectie) kunnen vervangen/combineren.
 *
 * Bevat:
 * - UnifiedProjectionRow: per-jaar rij met per-asset-type detail + schuld afbouw
 * - UnifiedProjectionInput: gecombineerde invoer voor beide projectiesystemen
 * - UnifiedProjectionResult: resultaat compatibel met bestaand SimResult
 * - toSimRow() / toSimResult(): backwards-compatible mapping functies
 * - computeYearlyAssetGrowth(): per-asset-type jaarlijkse groei + Box 3 drag
 *
 * Pure functions, geen Supabase dependency.
 */

import type { Asset, AssetType } from '@/lib/asset-data'
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, ASSET_TYPE_ICONS } from '@/lib/asset-data'
import type { Debt, DebtType, RepaymentType, AmortizationRow } from '@/lib/debt-data'
import {
  amortizationSchedule,
  linearAmortization,
  interestOnlySchedule,
} from '@/lib/debt-data'
import type { SimCashflow, SimRow, SimResult, ReturnModel } from '@/lib/fire-simulation'
import { type FireEndStrategy, type FireStrategyConfig, DEFAULT_FIRE_STRATEGY } from '@/lib/fire-strategy'
import {
  applyWithdrawalStrategy,
  WITHDRAWAL_DEFAULTS,
  type WithdrawalStrategyConfig,
  type WithdrawalContext,
} from '@/lib/withdrawal-strategy'
import { NL_AOW_AGE } from '@/lib/constants'
import type {
  Box3Method,
  BucketProjectionResult,
  BucketRow,
  BucketSummary,
  DebtSummary,
  CostSummary,
  CashFlowSummary,
  MilestoneSnapshot,
  AssetDetail,
} from '@/lib/bucket-projection'
import { classifyAsset, BOX3_PARAMS, type Box3Category } from '@/lib/box3-data'

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
  /** Netto vermogen aan het BEGIN van het jaar (totalAssets - totalDebts vóór mutaties) */
  startNetWorth: number

  // ── Kasstromen ────────────────────────────────────────────
  /** Bruto inkomen dit jaar (salaris + extra inkomsten) */
  grossIncome: number
  /** Besparingen / inleg dit jaar */
  savings: number
  /** Onttrekking dit jaar (alleen in withdrawal fase) */
  withdrawal: number
  /** Onttrekking per asset type (waterfall breakdown) — alleen gevuld bij withdrawal > 0 */
  withdrawalByType: Partial<Record<AssetType, number>>
  /** Netto kasstroom uit recurring life events / extra cashflows */
  cashflowNet: number
  /** Netto eenmalige kasstromen dit jaar */
  oneTimeNet: number
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

  // ── Bankrekeningen ────────────────────────────────────────
  /**
   * Totaal saldo van ontkoppelde bankrekeningen (niet gekoppeld aan assets).
   * Wordt als cash-bucket geïnjecteerd in de projectie zodat het startportfolio
   * overeenkomt met het netto vermogen op de kernpagina.
   */
  bankAccountCash?: number

  // ── Accumulation-only modus (voor Kern vermogensprognose) ───
  /**
   * Als true, wordt de binary search voor FIRE-leeftijd overgeslagen
   * en worden alleen accumulation-rijen gesimuleerd (geen decumulation).
   * Gebruikt voor de Kern vermogensprognose met een korte horizon (bijv. 20 jaar).
   */
  skipFireDetection?: boolean
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

// ── Constants ────────────────────────────────────────────────────────────────

const BOX3_YEAR = 2026 as const

// Asset types that receive surplus allocation (investment-like)
const INVESTABLE_ASSET_TYPES: Set<AssetType> = new Set([
  'investment', 'crypto', 'real_estate', 'deelneming',
])

// ── Per-asset Box 3 drag berekening ─────────────────────────────────────────

/**
 * Bereken het jaarlijkse Box 3 drag-percentage voor een enkele asset.
 *
 * - Forfaitair: spaargeld-forfait (1.28%) of beleggingen-forfait (6.00%) × tarief (36%)
 * - Werkelijk: werkelijk rendement × tarief
 * - Assets buiten Box 3 (eigen_huis, pensioen met fiscaal voordeel, deelneming): 0%
 */
export function computeAssetBox3DragRate(
  asset: Asset,
  box3Method: Box3Method,
): { dragRate: number; category: Box3Category } {
  const classification = classifyAsset(asset)
  if (!classification.category) {
    return { dragRate: 0, category: null }
  }

  const params = BOX3_PARAMS[BOX3_YEAR]

  if (box3Method === 'forfaitair') {
    const forfait = classification.category === 'spaargeld'
      ? params.forfaitSpaargeld
      : params.forfaitBeleggingen
    return { dragRate: forfait * params.tarief, category: classification.category }
  }

  // Werkelijk: belasting op werkelijk rendement
  const actualReturn = Number(asset.expected_return) / 100
  if (actualReturn <= 0) return { dragRate: 0, category: classification.category }
  return { dragRate: actualReturn * params.tarief, category: classification.category }
}

// ── Heffingsvrij vermogen ───────────────────────────────────────────────────

/**
 * Pas heffingsvrij vermogen toe op Box 3 drag.
 *
 * Het heffingsvrij vermogen (€59.357 single / €118.714 partner) wordt proportioneel
 * verdeeld over alle Box 3 assets. Als het totale Box 3 vermogen onder de vrijstelling
 * valt, is de drag 0 voor alle assets.
 *
 * @param bucketValues - huidige waarde per asset-type bucket
 * @param rawDragRates - ongecorrigeerde drag-percentages per bucket
 * @param categories - Box 3 classificatie per bucket
 * @param hasPartner - of er een fiscaal partner is
 * @returns effectieve drag-bedragen (niet percentages) per bucket, na aftrek heffingsvrij
 */
export function applyHeffingsvrij(
  bucketValues: number[],
  rawDragRates: number[],
  categories: (Box3Category)[],
  hasPartner: boolean,
): number[] {
  const params = BOX3_PARAMS[BOX3_YEAR]
  const heffingsvrij = hasPartner ? params.heffingsvrijPartner : params.heffingsvrijSingle

  // Totaal Box 3 vermogen
  let totalBox3Value = 0
  for (let i = 0; i < bucketValues.length; i++) {
    if (categories[i]) totalBox3Value += bucketValues[i]
  }

  if (totalBox3Value <= heffingsvrij) {
    // Volledig onder heffingsvrij — geen Box 3 belasting
    return bucketValues.map(() => 0)
  }

  // Proportie belastbaar
  const taxableFraction = (totalBox3Value - heffingsvrij) / totalBox3Value

  return bucketValues.map((value, i) => {
    if (!categories[i]) return 0
    return value * rawDragRates[i] * taxableFraction
  })
}

// ── Per-asset-type bucket state (intern) ────────────────────────────────────

/** Intern: lopende staat per asset-type voor compound berekening. */
interface RunningBucket {
  assetType: AssetType
  value: number
  annualReturn: number      // decimaal (bijv. 0.07)
  annualContribution: number // jaarlijkse inleg
  rawDragRate: number        // ongecorrigeerd Box 3 drag percentage
  category: Box3Category     // Box 3 classificatie
}

/**
 * Initialiseer running buckets vanuit assets.
 *
 * Groepeert assets per type, berekent gewogen rendement per type,
 * en sommeert bijdragen per type.
 */
function initRunningBuckets(
  assets: Asset[],
  fallbackReturn: number,
  box3Method: Box3Method,
): RunningBucket[] {
  const activeAssets = assets.filter(a => a.is_active)

  // Groepeer per asset type
  const typeMap = new Map<AssetType, { totalValue: number; weightedReturnSum: number; totalContribution: number; category: Box3Category; rawDragRate: number }>()

  for (const asset of activeAssets) {
    const type = asset.asset_type as AssetType
    const inclPct = (Number(asset.net_worth_inclusion_pct ?? 100) / 100)
    const value = Number(asset.current_value) * inclPct
    const ret = Number(asset.expected_return) / 100 || fallbackReturn
    const contrib = Number(asset.monthly_contribution) * 12
    const { dragRate, category } = computeAssetBox3DragRate(asset, box3Method)

    const existing = typeMap.get(type)
    if (existing) {
      existing.weightedReturnSum += value * ret
      existing.totalValue += value
      existing.totalContribution += contrib
      // Use weighted average drag rate (will be recalculated with heffingsvrij)
      existing.rawDragRate = existing.totalValue > 0
        ? (existing.rawDragRate * (existing.totalValue - value) + dragRate * value) / existing.totalValue
        : dragRate
      // Category should be the same for all assets of the same type
      if (!existing.category && category) existing.category = category
    } else {
      typeMap.set(type, {
        totalValue: value,
        weightedReturnSum: value * ret,
        totalContribution: contrib,
        category,
        rawDragRate: dragRate,
      })
    }
  }

  const buckets: RunningBucket[] = []
  for (const [assetType, data] of typeMap) {
    const weightedReturn = data.totalValue > 0
      ? data.weightedReturnSum / data.totalValue
      : fallbackReturn
    buckets.push({
      assetType,
      value: data.totalValue,
      annualReturn: weightedReturn,
      annualContribution: data.totalContribution,
      rawDragRate: data.rawDragRate,
      category: data.category,
    })
  }

  return buckets
}

// ── Core per-year computation ───────────────────────────────────────────────

/**
 * Bereken de jaarlijkse groei per asset-type bucket met individuele rendementen
 * en Box 3 belastingdrag (inclusief heffingsvrij vermogen).
 *
 * Dit is de kern van de unified engine: per-asset-type rendement wordt compound
 * doorgerekend, Box 3 drag vermindert de running value elk jaar, en surplus
 * wordt proportioneel verdeeld over beleggingsbuckets.
 *
 * @param runningBuckets - lopende staat per asset-type (wordt IN-PLACE gewijzigd)
 * @param surplus - surplus om te alloceren over beleggingsbuckets (bijv. extra besparingen)
 * @param hasPartner - voor heffingsvrij vermogen berekening
 * @returns per-bucket AssetBucketDetail voor dit jaar
 */
export function computeYearlyAssetGrowth(
  runningBuckets: RunningBucket[],
  surplus: number,
  hasPartner: boolean,
): Partial<Record<AssetType, AssetBucketDetail>> {
  const result: Partial<Record<AssetType, AssetBucketDetail>> = {}

  // ── Stap 1: Alloceer surplus naar beleggingsbuckets ──
  if (surplus > 0) {
    const investableBuckets = runningBuckets.filter(b => INVESTABLE_ASSET_TYPES.has(b.assetType))
    const totalInvestable = investableBuckets.reduce((sum, b) => sum + Math.max(0, b.value), 0)

    if (totalInvestable > 0) {
      for (const bucket of investableBuckets) {
        const proportion = Math.max(0, bucket.value) / totalInvestable
        bucket.annualContribution += surplus * proportion
      }
    } else if (investableBuckets.length > 0) {
      // Gelijke verdeling als alle buckets op 0 staan
      const perBucket = surplus / investableBuckets.length
      for (const bucket of investableBuckets) {
        bucket.annualContribution += perBucket
      }
    }
    // Als er geen investable buckets zijn, wordt surplus niet gealloceerd
  }

  // ── Stap 2: Bereken heffingsvrij-gecorrigeerde drag bedragen ──
  const bucketValues = runningBuckets.map(b => b.value)
  const rawDragRates = runningBuckets.map(b => b.rawDragRate)
  const categories = runningBuckets.map(b => b.category)
  const effectiveDragAmounts = applyHeffingsvrij(bucketValues, rawDragRates, categories, hasPartner)

  // ── Stap 3: Per bucket: groei → bijdrage → drag → eindwaarde ──
  for (let i = 0; i < runningBuckets.length; i++) {
    const bucket = runningBuckets[i]
    const startValue = bucket.value

    // Rendement op startwaarde
    const growth = startValue * bucket.annualReturn

    // Bijdragen dit jaar
    const contributions = bucket.annualContribution

    // Box 3 drag (al gecorrigeerd voor heffingsvrij)
    const box3Drag = effectiveDragAmounts[i]

    // Eindwaarde: compound doorrekening — drag vermindert de running value
    const endValue = startValue + growth + contributions - box3Drag

    result[bucket.assetType] = {
      startValue: Math.round(startValue),
      growth: Math.round(growth),
      contributions: Math.round(contributions),
      box3Drag: Math.round(box3Drag),
      endValue: Math.round(endValue),
    }

    // Update running value voor volgend jaar (compound!)
    bucket.value = endValue

    // Reset surplus-contribution terug naar basis (surplus is eenmalig per jaar)
    // Dit wordt opnieuw gezet bij de volgende jaarlijkse aanroep
  }

  return result
}

/**
 * Maak running buckets aan vanuit assets. Exported voor gebruik in engine.
 */
export { initRunningBuckets }

// ── Per-schuld aflossing engine ─────────────────────────────────────────────

/**
 * Intern: lopende staat per schuld voor year-by-year projectie.
 * Houdt de huidige balans, maandschema en vrijgevallen surplus bij.
 */
interface RunningDebt {
  debtId: string
  /** Huidig openstaand saldo */
  balance: number
  /** Maandelijkse aflossingstabel (volledig, vanaf maand 1) */
  monthlySchedule: AmortizationRow[]
  /** Offset: hoeveel maanden zijn al verstreken vóór de projectie begint */
  monthOffset: number
  /** Maandlast van deze schuld (voor surplus berekening bij payoff) */
  monthlyPayment: number
  /** Aflossingstype voor correcte handling */
  repaymentType: RepaymentType
  /** Net worth inclusion percentage (0-100) */
  netWorthInclusionPct: number
  /** Is de schuld al volledig afgelost? */
  paidOff: boolean
}

/**
 * Genereer het volledige maandelijkse aflossingsschema voor een schuld.
 *
 * Branches op repayment_type:
 * - annuiteit: compound rente + vast maandbedrag
 * - lineair: vaste hoofdsom + dalende rente
 * - aflossingsvrij: alleen rente, saldo blijft constant
 *
 * @param debt - de schuld waarvoor het schema wordt gegenereerd
 * @returns volledige maandelijkse AmortizationRow[]
 */
function generateMonthlySchedule(debt: Debt): AmortizationRow[] {
  const balance = Number(debt.current_balance)
  const rate = Number(debt.interest_rate)
  const payment = Number(debt.monthly_payment)
  const repaymentType: RepaymentType = debt.repayment_type ?? 'annuiteit'

  if (balance <= 0) return []

  const startDate = debt.start_date ? new Date(debt.start_date) : new Date()

  if (repaymentType === 'aflossingsvrij') {
    // Bereken resterende maanden tot end_date (max 600)
    let months = 600
    if (debt.end_date) {
      const end = new Date(debt.end_date)
      const now = new Date()
      months = Math.max(1, Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    }
    return interestOnlySchedule(balance, rate, months, startDate)
  }

  if (repaymentType === 'lineair') {
    // Bepaal resterende looptijd vanuit payment en saldo
    const monthlyRate = rate / 100 / 12
    const approxPrincipal = payment > 0 ? payment - (balance * monthlyRate / 2) : balance / 360
    const termMonths = approxPrincipal > 0 ? Math.ceil(balance / approxPrincipal) : 360
    return linearAmortization(balance, rate, termMonths, startDate)
  }

  // Default: annuïteit
  if (payment <= 0) return []
  return amortizationSchedule(balance, rate, payment, startDate)
}

/**
 * Initialiseer running debts vanuit een array Debt objecten.
 *
 * Genereert per schuld het volledige maandelijks aflossingsschema
 * en houdt de huidige balans + offset bij.
 */
export function initRunningDebts(debts: Debt[]): RunningDebt[] {
  const activeDebts = debts.filter(d => d.is_active)

  return activeDebts.map(debt => {
    const balance = Number(debt.current_balance)
    const monthlySchedule = generateMonthlySchedule(debt)
    const monthlyPayment = Number(debt.monthly_payment)
    const repaymentType: RepaymentType = debt.repayment_type ?? 'annuiteit'

    return {
      debtId: debt.id,
      balance,
      monthlySchedule,
      monthOffset: 0, // Start bij huidige maand
      monthlyPayment,
      repaymentType,
      netWorthInclusionPct: debt.net_worth_inclusion_pct ?? 100,
      paidOff: balance <= 0,
    }
  })
}

/**
 * Aggregeer 12 maandelijkse AmortizationRows tot een jaarlijks DebtBalanceDetail.
 *
 * Somt rente en aflossing over 12 maanden, en neemt het eindsaldo na maand 12.
 * Als er minder dan 12 maanden resteren, worden alleen de beschikbare maanden meegeteld.
 *
 * @param rows - de maandelijkse rijen voor dit jaar (max 12)
 * @param startBalance - saldo aan het begin van het jaar
 * @returns DebtBalanceDetail met startBalance, interestPaid, principalPaid, endBalance
 */
function aggregateYearFromMonths(
  rows: AmortizationRow[],
  startBalance: number,
): DebtBalanceDetail {
  let interestPaid = 0
  let principalPaid = 0
  let endBalance = startBalance

  for (const row of rows) {
    interestPaid += row.interest
    principalPaid += row.principal
    endBalance = row.balance
  }

  return {
    startBalance: Math.round(startBalance * 100) / 100,
    interestPaid: Math.round(interestPaid * 100) / 100,
    principalPaid: Math.round(principalPaid * 100) / 100,
    endBalance: Math.round(endBalance * 100) / 100,
  }
}

/**
 * Bereken de schuldaflossing voor één projectiejaar over alle lopende schulden.
 *
 * Per schuld worden 12 maanden uit het aflossingsschema gelezen en geaggregeerd.
 * Bij payoff (saldo → 0) worden de vrijgevallen maandlasten als surplus geretourneerd.
 *
 * @param runningDebts - lopende schulden (worden IN-PLACE gewijzigd: balance + offset + paidOff)
 * @returns { debtBalances, freedSurplus }
 *   - debtBalances: per debt-id een DebtBalanceDetail
 *   - freedSurplus: jaarlijks bedrag aan vrijgevallen maandlasten door afgeloste schulden
 */
export function computeYearlyDebtSchedule(
  runningDebts: RunningDebt[],
): {
  debtBalances: Record<string, DebtBalanceDetail>
  freedSurplus: number
} {
  const debtBalances: Record<string, DebtBalanceDetail> = {}
  let freedSurplus = 0

  for (const rd of runningDebts) {
    // Schuld al volledig afgelost: rapporteer 0-rij, voeg maandlasten toe aan surplus
    if (rd.paidOff) {
      debtBalances[rd.debtId] = {
        startBalance: 0,
        interestPaid: 0,
        principalPaid: 0,
        endBalance: 0,
      }
      freedSurplus += rd.monthlyPayment * 12
      continue
    }

    const startBalance = rd.balance
    const scheduleStart = rd.monthOffset
    const scheduleEnd = Math.min(scheduleStart + 12, rd.monthlySchedule.length)
    const yearRows = rd.monthlySchedule.slice(scheduleStart, scheduleEnd)

    if (yearRows.length === 0) {
      // Schema uitgeput maar balance > 0 (bijv. aflossingsvrij voorbij end_date)
      // Behandel als interest-only: rente op resterende balans
      const annualRate = 0 // Geen schema meer beschikbaar, geen rente
      debtBalances[rd.debtId] = {
        startBalance: Math.round(startBalance * 100) / 100,
        interestPaid: 0,
        principalPaid: 0,
        endBalance: Math.round(startBalance * 100) / 100,
      }
      rd.monthOffset = scheduleEnd
      continue
    }

    const detail = aggregateYearFromMonths(yearRows, startBalance)
    debtBalances[rd.debtId] = detail

    // Update running state
    rd.balance = detail.endBalance
    rd.monthOffset = scheduleEnd

    // Check payoff: saldo bereikt 0 dit jaar
    if (detail.endBalance <= 0.01) {
      rd.paidOff = true
      rd.balance = 0
      // Surplus: maandlasten × resterende maanden dit jaar die niet meer betaald hoeven
      // Als de schuld in maand N van dit jaar is afgelost, zijn er (12 - yearRows.length) + vrije maanden
      // Maar we rapporteren het surplus pas vanaf volgend jaar (dit jaar zijn de betalingen al gedaan)
      // Dus freedSurplus voor dit jaar = 0, vrijgave start volgend jaar
    }
  }

  return { debtBalances, freedSurplus }
}

/**
 * Bereken het totale schuldsaldo gewogen naar net_worth_inclusion_pct.
 *
 * @param debtBalances - per-schuld balansen uit computeYearlyDebtSchedule
 * @param runningDebts - de running debts (voor inclusion percentages)
 * @returns totaal schuldsaldo na weging
 */
export function computeWeightedDebtTotal(
  debtBalances: Record<string, DebtBalanceDetail>,
  runningDebts: RunningDebt[],
): number {
  let total = 0
  for (const rd of runningDebts) {
    const balance = debtBalances[rd.debtId]?.endBalance ?? 0
    total += balance * (rd.netWorthInclusionPct / 100)
  }
  return Math.round(total * 100) / 100
}

// ── Backwards-compatible mapping functies ────────────────────────────────────

/**
 * Converteer een UnifiedProjectionRow naar een legacy SimRow.
 *
 * Alle bestaande SimRow velden zijn afleidbaar uit de UnifiedProjectionRow:
 * - startPortfolio → startNetWorth (netto vermogen begin van jaar)
 * - growth → totalGrowth
 * - savings → savings
 * - withdrawal → withdrawal
 * - cashflowNet → cashflowNet
 * - endPortfolio → netWorth (netto vermogen einde van jaar)
 * - grossIncome → grossIncome
 * - grossExpenses → yearlyExpenses afgeleid uit withdrawal + savings context
 * - phase → 'accumulation' | 'retirement' (transition → accumulation voor legacy)
 * - age → age
 */
export function toSimRow(row: UnifiedProjectionRow): SimRow {
  const legacyPhase: 'accumulation' | 'retirement' =
    row.phase === 'withdrawal' ? 'retirement' : 'accumulation'

  const grossExpenses = row.phase === 'withdrawal'
    ? row.withdrawal + row.savings
    : row.grossIncome - row.savings - row.cashflowNet - row.oneTimeNet

  return {
    age: row.age,
    phase: legacyPhase,
    startPortfolio: row.startNetWorth,
    growth: row.totalGrowth,
    savings: row.savings,
    withdrawal: row.withdrawal,
    cashflowNet: row.cashflowNet,
    oneTimeNet: row.oneTimeNet,
    endPortfolio: row.netWorth,
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

// ── Waterfall withdrawal order ────────────────────────────────────────────────

/**
 * Prioriteitsvolgorde voor onttrekking uit asset buckets.
 *
 * Liquiditeitsprincipe: meest liquide buckets worden eerst aangesproken.
 * Cash → spaargeld → beleggingen → crypto → pensioen → rest.
 *
 * Spaargeld staat vóór beleggingen zodat het tijdens decumulatie daadwerkelijk
 * wordt aangesproken. Zonder dit groeit spaargeld eindeloos door rendement
 * terwijl alleen beleggingen worden afgebouwd — onrealistisch voor een pensionado.
 */
const WATERFALL_ORDER: readonly AssetType[] = [
  'cash',
  'savings',
  'investment',
  'crypto',
  'retirement',
  'real_estate',
  'vehicle',
  'deelneming',
  'other',
  'eigen_huis',
] as const

/**
 * Trek een bedrag af van running buckets via waterfall-volgorde.
 *
 * Elke bucket wordt maximaal tot 0 afgebouwd; het restant gaat naar de
 * volgende bucket in de waterfall. Retourneert het daadwerkelijk
 * onttrokken bedrag (kan lager zijn dan gevraagd als portfolio ontoereikend).
 *
 * @param runningBuckets - lopende buckets (worden IN-PLACE gewijzigd)
 * @param amount - gewenst onttrekkingsbedrag (positief)
 * @returns object met actualAmount (daadwerkelijk onttrokken) en byType (breakdown per asset type)
 */
function waterfallWithdraw(
  runningBuckets: RunningBucket[],
  amount: number,
): { actualAmount: number; byType: Partial<Record<AssetType, number>> } {
  if (amount <= 0) return { actualAmount: 0, byType: {} }

  let remaining = amount
  const byType: Partial<Record<AssetType, number>> = {}
  // Index buckets by asset type for O(1) lookup
  const bucketMap = new Map<AssetType, RunningBucket>()
  for (const b of runningBuckets) bucketMap.set(b.assetType, b)

  for (const assetType of WATERFALL_ORDER) {
    if (remaining <= 0) break
    const bucket = bucketMap.get(assetType)
    if (!bucket || bucket.value <= 0) continue

    const deduction = Math.min(remaining, bucket.value)
    bucket.value -= deduction
    remaining -= deduction
    byType[assetType] = (byType[assetType] ?? 0) + deduction
  }

  return { actualAmount: amount - remaining, byType }
}

// ── Unified Projection Engine ─────────────────────────────────────────────────

/**
 * Unified projection engine — combineert per-asset-type bucket-groei,
 * per-schuld aflossing, FIRE-detectie via binary search, en
 * onttrekkingsstrategieën in één simulatie.
 *
 * Port van runSimulation() uit fire-simulation.ts, aangepast voor:
 * 1. Per-asset-type rendement & Box 3 (via computeYearlyAssetGrowth)
 * 2. Per-schuld aflossing (via computeYearlyDebtSchedule)
 * 3. Drie fasen: accumulation → transition → withdrawal
 * 4. netWorth = totalAssets - totalDebts als target voor binary search
 *
 * @param input - UnifiedProjectionInput met alle benodigde data
 * @returns UnifiedProjectionResult met rows, FIRE-uitkomsten en metadata
 */
export function runUnifiedProjection(input: UnifiedProjectionInput): UnifiedProjectionResult {
  const {
    assets,
    debts,
    currentAge,
    yearlyExpenses,
    annualSavings,
    grossReturn,
    inflationRate,
    box3Method,
    cashflows,
    withdrawalStrategy,
    hasPartner,
  } = input

  // ── Resolve strategy ───────────────────────────────────────────────
  const cfg = input.strategyConfig ?? DEFAULT_FIRE_STRATEGY
  const strategy = cfg.strategy
  // When skipFireDetection is set, use input.endAge directly (Kern horizon)
  const effectiveEndAge = input.skipFireDetection
    ? input.endAge
    : strategy === 'perpetual'
      ? Math.max(input.endAge, 100)
      : cfg.endAge
  const legacyAmount = cfg.legacyAmount
  const displayEndAge = input.skipFireDetection ? input.endAge : (strategy === 'perpetual' ? cfg.endAge : effectiveEndAge)

  // Determine AOW age — pensioen mode uses forcedFireAge as the AOW trigger
  const aowAge = input.forcedFireAge != null ? input.forcedFireAge : NL_AOW_AGE

  // ── Early exit: perpetual met negatief reëel rendement ─────────────
  // Weighted average return across all assets approximates portReturn.
  // For the perpetual check we use grossReturn as conservative proxy.
  if (strategy === 'perpetual' && grossReturn <= inflationRate) {
    return {
      rows: [],
      fireAge: null,
      fireAgeFractional: null,
      fireReachable: false,
      firePortfolioAtFire: 0,
      requiredFirePortfolio: 0,
      implicitWithdrawalRate: 0,
      strategy,
      targetEndPortfolio: 0,
      displayEndAge,
    }
  }

  // ── Resolve withdrawal strategy ────────────────────────────────────
  const wsConfig = withdrawalStrategy ?? WITHDRAWAL_DEFAULTS

  // VPW + perpetual/legacy incompatibiliteit — VPW onttrekt per definitie
  // volledig binnen resterende horizon, conflicteert met behoud/nalatenschap
  if ((strategy === 'perpetual' || strategy === 'legacy') && wsConfig.strategy === 'vpw') {
    return {
      rows: [],
      fireAge: null,
      fireAgeFractional: null,
      fireReachable: false,
      firePortfolioAtFire: 0,
      requiredFirePortfolio: 0,
      implicitWithdrawalRate: 0,
      strategy,
      targetEndPortfolio: 0,
      displayEndAge,
    }
  }

  // ── Cashflow helpers (ported from fire-simulation.ts) ──────────────

  /** Signed monthly cashflow for a recurring cashflow at a given age */
  function recurringMonthly(cf: SimCashflow, age: number): number {
    if (cf.type !== 'recurring') return 0
    if (age < cf.fromAge) return 0
    if (cf.toAge !== null && age >= cf.toAge) return 0
    const yrsActive = age - cf.fromAge
    const monthly = cf.indexed ? cf.amount * Math.pow(1 + inflationRate, yrsActive) : cf.amount
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

  /** Signed one-time amount for a one-time cashflow at a given age */
  function oneTimeAmount(cf: SimCashflow, age: number): number {
    if (cf.type !== 'one_time') return 0
    if (cf.fromAge !== age) return 0
    const yrsFromNow = age - currentAge
    const nominal = cf.indexed ? cf.amount * Math.pow(1 + inflationRate, yrsFromNow) : cf.amount
    return cf.direction === 'income' ? nominal : -nominal
  }

  // ── Helper: sum all bucket values ──────────────────────────────────

  function sumBucketValues(buckets: RunningBucket[]): number {
    let total = 0
    for (const b of buckets) total += b.value
    return total
  }

  // ── Lightweight decumulation for binary search ─────────────────────
  // Uses per-bucket waterfall withdrawal to match the visualization loop.
  // Low-return buckets (cash, savings) are drained first, so the effective
  // portfolio return INCREASES over time as high-return assets dominate.
  // This prevents the binary search from overestimating the required FIRE target.

  /**
   * Compute a flat net return (gross return minus approximate Box 3 drag)
   * used in the binary search. This approximates the per-asset-type
   * computation for convergence purposes.
   */
  function computeAverageNetReturn(buckets: RunningBucket[]): number {
    const totalValue = sumBucketValues(buckets)
    if (totalValue <= 0) return grossReturn

    let weightedReturn = 0
    for (const b of buckets) {
      const w = b.value / totalValue
      weightedReturn += w * b.annualReturn
    }

    // Use effective drag after heffingsvrij correction (not raw rates)
    const bucketValues = buckets.map(b => b.value)
    const rawDragRates = buckets.map(b => b.rawDragRate)
    const categories = buckets.map(b => b.category)
    const effectiveDragAmounts = applyHeffingsvrij(bucketValues, rawDragRates, categories, hasPartner)
    const totalDrag = effectiveDragAmounts.reduce((s, d) => s + d, 0)
    const effectiveDragRate = totalValue > 0 ? totalDrag / totalValue : 0

    return weightedReturn - effectiveDragRate
  }

  // ── Lightweight bucket tiers for binary search ──────────────────────
  // Simplified per-bucket model that mirrors the visualization's waterfall
  // withdrawal order. Each tier has a value, net return, and drain priority
  // index (lower = drained first). This captures the key effect: withdrawing
  // from low-return buckets first makes the effective return increase over time.

  /** Lightweight bucket tier for binary search — minimal per-bucket state. */
  interface LightweightTier {
    /** Current value in this tier */
    value: number
    /** Net return rate (gross return minus Box 3 drag rate) */
    netReturn: number
    /** Priority index: lower = drained first (matches WATERFALL_ORDER) */
    drainPriority: number
  }

  /**
   * Build lightweight tier allocation from RunningBuckets.
   *
   * Maps each RunningBucket to a LightweightTier with its net return
   * (annualReturn minus effective Box 3 drag rate) and waterfall drain priority.
   * Tiers are sorted by drain priority (lowest first) for efficient waterfall.
   */
  function buildLightweightTiers(buckets: RunningBucket[]): LightweightTier[] {
    // Compute effective drag rates with heffingsvrij correction
    const bucketValues = buckets.map(b => b.value)
    const rawDragRates = buckets.map(b => b.rawDragRate)
    const categories = buckets.map(b => b.category)
    const effectiveDragAmounts = applyHeffingsvrij(bucketValues, rawDragRates, categories, hasPartner)

    const tiers: LightweightTier[] = []
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i]
      if (b.value <= 0) continue // Skip empty buckets

      // Net return = gross return minus effective drag rate for this bucket
      const effectiveDragRate = b.value > 0 ? effectiveDragAmounts[i] / b.value : 0
      const netReturn = b.annualReturn - effectiveDragRate

      // Drain priority from WATERFALL_ORDER (lower index = drained first)
      const priority = WATERFALL_ORDER.indexOf(b.assetType)
      tiers.push({
        value: b.value,
        netReturn,
        drainPriority: priority >= 0 ? priority : WATERFALL_ORDER.length,
      })
    }

    // Sort by drain priority so waterfall withdrawal is a simple left-to-right scan
    tiers.sort((a, b) => a.drainPriority - b.drainPriority)
    return tiers
  }

  // referenceTiers and referenceTierTotal are initialized after initialBuckets
  // is created (see below). Declared here with let so the closures can reference them.
  let referenceTiers: LightweightTier[] = []
  let referenceTierTotal = 0

  /**
   * Simulate decumulation from a given starting netWorth at startAge.
   *
   * Uses per-bucket waterfall withdrawal to match the visualization loop:
   * low-return buckets (cash, savings at ~0%) are drained first, then
   * higher-return buckets (investments at ~7%). This means the effective
   * return INCREASES over time as the portfolio shifts toward high-return
   * assets — matching what the actual visualization computes.
   *
   * Portfolio is NOT clamped to 0 to allow binary search to converge.
   *
   * @param startNetWorth - starting net worth (assets only for binary search)
   * @param startAge - age at which decumulation begins
   * @param portReturn - fallback net return rate (used when no bucket data)
   * @param simEndAge - end age for the simulation
   * @returns endNetWorth after simulation
   */
  function simulateDecumulationLightweight(
    startNetWorth: number,
    startAge: number,
    portReturn: number,
    simEndAge: number,
  ): number {
    // Fallback to flat return when no bucket data is available
    if (referenceTiers.length === 0 || referenceTierTotal <= 0) {
      return simulateDecumulationFlat(startNetWorth, startAge, portReturn, simEndAge)
    }

    // Scale reference tiers proportionally to match the candidate startNetWorth.
    // This preserves the asset allocation ratio while adjusting total value.
    const scale = startNetWorth / referenceTierTotal
    const tiers: LightweightTier[] = referenceTiers.map(t => ({
      value: t.value * scale,
      netReturn: t.netReturn,
      drainPriority: t.drainPriority,
    }))

    let previousWithdrawal = 0

    for (let age = startAge; age < simEndAge; age++) {
      // Apply one-time cashflows — distribute proportionally across tiers
      for (const cf of cashflows) {
        const amt = oneTimeAmount(cf, age)
        if (amt !== 0) {
          const total = tiers.reduce((s, t) => s + Math.max(0, t.value), 0)
          if (amt > 0 && total > 0) {
            // Income: distribute proportionally
            for (const t of tiers) {
              t.value += amt * (Math.max(0, t.value) / total)
            }
          } else if (amt < 0) {
            // Expense: waterfall withdraw
            lightweightWaterfallWithdraw(tiers, Math.abs(amt))
          }
        }
      }

      const yearsIntoPension = age - startAge
      const expensesThisYear = yearlyExpenses * Math.pow(1 + inflationRate, yearsIntoPension)

      // Recurring cashflows net
      let recurringNet = 0
      for (const cf of cashflows) {
        recurringNet += recurringYearly(cf, age)
      }

      // Current total portfolio for withdrawal strategy context
      const portfolio = tiers.reduce((s, t) => s + t.value, 0)

      // Compute the current weighted-average net return for the withdrawal context.
      // This reflects the ACTUAL asset mix after waterfall has drained low-return tiers.
      const totalPositive = tiers.reduce((s, t) => s + Math.max(0, t.value), 0)
      const currentNetReturn = totalPositive > 0
        ? tiers.reduce((s, t) => s + Math.max(0, t.value) * t.netReturn, 0) / totalPositive
        : portReturn

      // Use the user's actual withdrawal strategy for binary search convergence.
      // This ensures the FIRE target accounts for strategy-specific withdrawal patterns
      // (e.g., guardrails ±20%, VPW portfolio-based %). previousWithdrawal is tracked
      // across years so guardrails can apply prosperity/capital preservation rules.
      // Binary search context: do NOT pass inflation. The growing annuity formula
      // is designed for grow-then-withdraw order (old engine), but the lightweight
      // decumulation uses withdraw-then-grow. Without inflation, the annuity falls
      // back to the nominal formula which is consistent with this binary search.
      const wCtx: WithdrawalContext = {
        baseExpenses: expensesThisYear,
        recurringIncome: recurringNet,
        currentPortfolio: portfolio,
        startPortfolio: startNetWorth,
        previousWithdrawal,
        yearReturn: currentNetReturn,
        yearsIntoRetirement: yearsIntoPension,
        currentAge: age,
        endAge: simEndAge,
        endStrategy: strategy,
        legacyAmount: strategy === 'legacy'
          ? legacyAmount * Math.pow(1 + inflationRate, simEndAge - currentAge)
          : undefined,
      }
      const withdrawal = applyWithdrawalStrategy(wsConfig, wCtx)
      previousWithdrawal = withdrawal

      // Waterfall withdraw: drain low-return tiers first (cash → savings → investments)
      lightweightWaterfallWithdraw(tiers, withdrawal)

      // Per-tier growth: each tier grows at its own net return rate
      for (const t of tiers) {
        t.value += t.value * t.netReturn
      }
    }

    return tiers.reduce((s, t) => s + t.value, 0)
  }

  /**
   * Waterfall withdrawal from lightweight tiers.
   *
   * Drains tiers in priority order (lowest drainPriority first = cash first).
   * Each tier is drained down to 0 before moving to the next.
   * Tiers CAN go negative for the final tier to allow binary search convergence.
   *
   * @param tiers - lightweight tiers (mutated in-place)
   * @param amount - amount to withdraw (positive)
   */
  function lightweightWaterfallWithdraw(tiers: LightweightTier[], amount: number): void {
    if (amount <= 0) return
    let remaining = amount

    // Tiers are already sorted by drainPriority (lowest first)
    for (let i = 0; i < tiers.length; i++) {
      if (remaining <= 0) break
      if (tiers[i].value <= 0) continue

      const deduction = Math.min(remaining, tiers[i].value)
      tiers[i].value -= deduction
      remaining -= deduction
    }

    // If remaining > 0 after all tiers are drained, subtract from the last
    // tier with the highest return (allows portfolio to go negative for
    // binary search convergence — same behavior as the old flat model)
    if (remaining > 0 && tiers.length > 0) {
      tiers[tiers.length - 1].value -= remaining
    }
  }

  /**
   * Flat-return fallback: original single-return decumulation simulation.
   *
   * Used when no bucket data is available (e.g., no assets defined).
   * Identical to the previous simulateDecumulationLightweight implementation.
   */
  function simulateDecumulationFlat(
    startNetWorth: number,
    startAge: number,
    portReturn: number,
    simEndAge: number,
  ): number {
    let portfolio = startNetWorth
    let previousWithdrawal = 0

    for (let age = startAge; age < simEndAge; age++) {
      // Apply one-time cashflows before growth
      for (const cf of cashflows) {
        portfolio += oneTimeAmount(cf, age)
      }

      const yearsIntoPension = age - startAge
      const expensesThisYear = yearlyExpenses * Math.pow(1 + inflationRate, yearsIntoPension)

      // Recurring cashflows net
      let recurringNet = 0
      for (const cf of cashflows) {
        recurringNet += recurringYearly(cf, age)
      }

      // Binary search (flat): same as lightweight — no inflation for nominal annuity
      const wCtx: WithdrawalContext = {
        baseExpenses: expensesThisYear,
        recurringIncome: recurringNet,
        currentPortfolio: portfolio,
        startPortfolio: startNetWorth,
        previousWithdrawal,
        yearReturn: portReturn,
        yearsIntoRetirement: yearsIntoPension,
        currentAge: age,
        endAge: simEndAge,
        endStrategy: strategy,
        legacyAmount: strategy === 'legacy'
          ? legacyAmount * Math.pow(1 + inflationRate, simEndAge - currentAge)
          : undefined,
      }
      const withdrawal = applyWithdrawalStrategy(wsConfig, wCtx)
      previousWithdrawal = withdrawal

      const growth = portfolio * portReturn
      portfolio = portfolio + growth - withdrawal
    }

    return portfolio
  }

  // ── Binary search: requiredAt(candidateFireAge) ────────────────────

  /** Initial running buckets for average return estimation */
  const initialBuckets = initRunningBuckets(assets, grossReturn, box3Method)
  // Inject disconnected bank account cash as a cash bucket
  if (input.bankAccountCash && input.bankAccountCash > 0) {
    const existingCash = initialBuckets.find(b => b.assetType === 'cash')
    if (existingCash) {
      existingCash.value += input.bankAccountCash
    } else {
      initialBuckets.push({
        assetType: 'cash' as AssetType,
        value: input.bankAccountCash,
        annualReturn: 0,
        annualContribution: 0,
        rawDragRate: 0,
        category: 'spaargeld' as Box3Category,
      })
    }
  }
  const avgNetReturn = computeAverageNetReturn(initialBuckets)

  // Initialize reference tiers now that initialBuckets is ready.
  // These capture the proportional asset mix for the binary search's
  // per-bucket waterfall simulation.
  referenceTiers = buildLightweightTiers(initialBuckets)
  referenceTierTotal = referenceTiers.reduce((s, t) => s + t.value, 0)

  /**
   * Binary search: minimum netWorth at candidateFireAge such that
   * decumulation meets the strategy target.
   *
   * Uses static withdrawal and lightweight simulation for convergence.
   */
  function requiredAt(candidateFireAge: number, netReturn?: number): number {
    const verifyEndAge = strategy === 'perpetual'
      ? candidateFireAge + 100
      : effectiveEndAge

    let lo = 0
    let hi = Math.max(
      yearlyExpenses * (strategy === 'perpetual' ? 500 : 200),
      sumBucketValues(initialBuckets) * 10,
      10_000_000,
    )

    // Indexed legacy target at endAge
    const indexedLegacy = strategy === 'legacy'
      ? legacyAmount * Math.pow(1 + inflationRate, effectiveEndAge - currentAge)
      : 0

    for (let iter = 0; iter < 80; iter++) {
      const mid = (lo + hi) / 2
      const ep = simulateDecumulationLightweight(mid, candidateFireAge, netReturn ?? avgNetReturn, verifyEndAge)

      if (strategy === 'legacy') {
        if (ep >= indexedLegacy) hi = mid; else lo = mid
      } else if (strategy === 'perpetual') {
        // perpetual: koopkracht behouden — endPortfolio moet geïndexeerd startportfolio dekken
        const indexedTarget = mid * Math.pow(1 + inflationRate, verifyEndAge - candidateFireAge)
        if (ep >= indexedTarget) hi = mid; else lo = mid
      } else {
        // deplete: endPortfolio >= 0 at endAge
        if (ep >= 0) hi = mid; else lo = mid
      }
      if (hi - lo < 10) break
    }

    return (lo + hi) / 2
  }

  // ── Phase 1: Accumulation + FIRE-age detection ─────────────────────

  const runningBuckets = initRunningBuckets(assets, grossReturn, box3Method)
  // Inject disconnected bank account cash as a cash bucket (same as initialBuckets)
  if (input.bankAccountCash && input.bankAccountCash > 0) {
    const existingCash = runningBuckets.find(b => b.assetType === 'cash')
    if (existingCash) {
      existingCash.value += input.bankAccountCash
    } else {
      runningBuckets.push({
        assetType: 'cash' as AssetType,
        value: input.bankAccountCash,
        annualReturn: 0,
        annualContribution: 0,
        rawDragRate: 0,
        category: 'spaargeld' as Box3Category,
      })
    }
  }
  const runningDebts = initRunningDebts(debts)

  let computedFireAge: number | null = null
  let netWorthPreFire = sumBucketValues(runningBuckets)
    - computeWeightedDebtTotal(
        Object.fromEntries(runningDebts.map(rd => [rd.debtId, {
          startBalance: rd.balance, interestPaid: 0, principalPaid: 0, endBalance: rd.balance,
        }])),
        runningDebts,
      )
  const accRows: UnifiedProjectionRow[] = []
  let cumulativeBox3 = 0

  // Accumulation end: either forcedFireAge or effectiveEndAge
  const accEndAge = input.forcedFireAge != null
    ? Math.min(input.forcedFireAge, effectiveEndAge)
    : effectiveEndAge

  for (let age = currentAge; age < accEndAge; age++) {
    const year = age - currentAge

    // FIRE detection via binary search (skip when forcedFireAge or skipFireDetection is set)
    if (input.forcedFireAge == null && !input.skipFireDetection) {
      const currentNetWorth = sumBucketValues(runningBuckets)
        - computeWeightedDebtTotal(
            Object.fromEntries(runningDebts.map(rd => [rd.debtId, {
              startBalance: rd.balance, interestPaid: 0, principalPaid: 0, endBalance: rd.balance,
            }])),
            runningDebts,
          )
      const currentNetReturn = computeAverageNetReturn(runningBuckets)
      const req = requiredAt(age, currentNetReturn)
      if (currentNetWorth >= req) {
        computedFireAge = age
        break
      }
    }

    // Capture pre-FIRE netWorth for fractional calculation
    netWorthPreFire = sumBucketValues(runningBuckets)
      - computeWeightedDebtTotal(
          Object.fromEntries(runningDebts.map(rd => [rd.debtId, {
            startBalance: rd.balance, interestPaid: 0, principalPaid: 0, endBalance: rd.balance,
          }])),
          runningDebts,
        )

    // Save pre-oneTime net worth for accurate startNetWorth display
    const preOneTimeNetWorth = sumBucketValues(runningBuckets)
      - runningDebts.reduce((s, rd) => s + rd.balance * (rd.netWorthInclusionPct / 100), 0)

    // One-time cashflows — add to investable buckets proportionally
    let oneTimeNet = 0
    for (const cf of cashflows) {
      const amt = oneTimeAmount(cf, age)
      if (amt !== 0) {
        oneTimeNet += amt
        // Distribute one-time cashflow across investable buckets proportionally
        if (amt > 0) {
          // Income: add to investment buckets
          const investable = runningBuckets.filter(b => INVESTABLE_ASSET_TYPES.has(b.assetType))
          const totalInv = investable.reduce((s, b) => s + Math.max(0, b.value), 0)
          if (totalInv > 0) {
            for (const b of investable) b.value += amt * (Math.max(0, b.value) / totalInv)
          } else if (investable.length > 0) {
            for (const b of investable) b.value += amt / investable.length
          }
        } else {
          // Expense: withdraw via waterfall
          waterfallWithdraw(runningBuckets, Math.abs(amt))
        }
      }
    }

    // Recurring cashflows net
    let cashflowNet = 0
    for (const cf of cashflows) {
      cashflowNet += recurringYearly(cf, age)
    }

    // Reset bucket contributions to their base (monthly_contribution × 12)
    // This is needed because computeYearlyAssetGrowth accumulates surplus into contributions
    let totalBaseContributions = 0
    for (const b of runningBuckets) {
      // Find original contribution from initRunningBuckets
      const originalAssets = assets.filter(a => a.is_active && a.asset_type === b.assetType)
      b.annualContribution = originalAssets.reduce((s, a) => s + Number(a.monthly_contribution) * 12, 0)
      totalBaseContributions += b.annualContribution
    }

    // Surplus = extra savings beyond what's already allocated per bucket + recurring cashflows.
    // annualSavings is the user's total savings capacity (income - expenses).
    // Per-bucket annualContribution already covers each bucket's monthly_contribution share,
    // so surplus must only contain the EXCESS (annualSavings - totalBaseContributions)
    // plus recurring cashflow net. This prevents double-counting of contributions (#518).
    const surplus = (annualSavings - totalBaseContributions) + cashflowNet

    // Compute per-asset growth with surplus allocation
    const assetBuckets = computeYearlyAssetGrowth(runningBuckets, surplus, hasPartner)

    // Compute debt schedule
    const { debtBalances } = computeYearlyDebtSchedule(runningDebts)

    // Compute start-of-year net worth from bucket start values and debt start balances
    let startTotalAssets = 0
    for (const detail of Object.values(assetBuckets)) {
      if (detail) startTotalAssets += detail.startValue
    }
    let startTotalDebts = 0
    for (const rd of runningDebts) {
      const db = debtBalances[rd.debtId]
      if (db) startTotalDebts += db.startBalance * (rd.netWorthInclusionPct / 100)
    }
    const startNetWorth = startTotalAssets - startTotalDebts

    // Aggregate totals
    let totalGrowth = 0
    let totalBox3 = 0
    for (const detail of Object.values(assetBuckets)) {
      if (detail) {
        totalGrowth += detail.growth
        totalBox3 += detail.box3Drag
      }
    }
    cumulativeBox3 += totalBox3

    const totalAssets = sumBucketValues(runningBuckets)
    const totalDebtsValue = computeWeightedDebtTotal(debtBalances, runningDebts)
    const netWorth = totalAssets - totalDebtsValue

    accRows.push({
      year,
      age,
      phase: 'accumulation',
      assetBuckets,
      debtBalances,
      totalAssets: Math.round(totalAssets),
      totalDebts: Math.round(totalDebtsValue),
      netWorth: Math.round(netWorth),
      startNetWorth: Math.round(preOneTimeNetWorth),
      grossIncome: Math.round(annualSavings + yearlyExpenses),
      savings: Math.round(annualSavings),
      withdrawal: 0,
      withdrawalByType: {},
      cashflowNet: Math.round(cashflowNet),
      oneTimeNet: Math.round(oneTimeNet),
      totalGrowth: Math.round(totalGrowth),
      totalBox3: Math.round(totalBox3),
      cumulativeBox3: Math.round(cumulativeBox3),
      inflationFactor: Math.pow(1 + inflationRate, year),
    })
  }

  // If forcedFireAge is set, always transition at that age
  if (input.forcedFireAge != null && computedFireAge == null && input.forcedFireAge <= effectiveEndAge) {
    computedFireAge = input.forcedFireAge
  }

  // ── FIRE not reachable (or skipFireDetection mode) ─────────────────
  if (computedFireAge === null) {
    const finalNetWorth = accRows.length > 0
      ? accRows[accRows.length - 1].netWorth
      : sumBucketValues(runningBuckets)
    return {
      rows: accRows,
      fireAge: null,
      fireAgeFractional: null,
      fireReachable: false,
      firePortfolioAtFire: Math.round(finalNetWorth),
      requiredFirePortfolio: input.skipFireDetection ? 0 : Math.round(requiredAt(effectiveEndAge - 1)),
      implicitWithdrawalRate: 0,
      strategy,
      targetEndPortfolio: strategy === 'legacy'
        ? legacyAmount
        : strategy === 'perpetual'
          ? Math.round(requiredAt(effectiveEndAge - 1) * Math.pow(1 + inflationRate, effectiveEndAge - currentAge))
          : 0,
      displayEndAge,
    }
  }

  // ── Fractional FIRE age via linear interpolation ───────────────────
  const currentNetWorth = sumBucketValues(runningBuckets)
    - computeWeightedDebtTotal(
        Object.fromEntries(runningDebts.map(rd => [rd.debtId, {
          startBalance: rd.balance, interestPaid: 0, principalPaid: 0, endBalance: rd.balance,
        }])),
        runningDebts,
      )

  // Recalculate weighted average return at FIRE age (#521)
  // After accumulation, the asset mix may have shifted significantly
  // (e.g., from 50/50 sparen/beleggen to 90/10 beleggen/sparen).
  // Use actual bucket values at FIRE age for a more accurate decumulation return.
  // Computed here (before FIRE year splitting) because proportional scaling
  // does not change the weighted-average return ratio.
  const avgNetReturnAtFire = computeAverageNetReturn(runningBuckets)

  const requiredFirePortfolioExact = requiredAt(computedFireAge, avgNetReturnAtFire)
  const requiredFirePortfolio = Math.round(requiredFirePortfolioExact)

  let fractionalFireAge: number
  if (computedFireAge === currentAge) {
    fractionalFireAge = currentAge
  } else {
    const reqStart = requiredAt(computedFireAge - 1, avgNetReturnAtFire)
    const reqEnd = requiredFirePortfolioExact
    const portDiff = currentNetWorth - netWorthPreFire
    const reqDiff = reqEnd - reqStart
    const denom = portDiff - reqDiff
    const t = denom !== 0 ? (reqStart - netWorthPreFire) / denom : 0.5
    fractionalFireAge = (computedFireAge - 1) + Math.max(0, Math.min(1, t))
  }

  // ── FIRE year splitting: prorate the last accumulation year ──────
  // The last accumulation year includes full growth + savings for the entire year,
  // but FIRE occurs partway through (at fraction t). Interpolate to get the
  // portfolio value at the fractional FIRE point and remove the excess — this
  // covers both excess savings AND excess growth, not just savings alone.
  if (computedFireAge > currentAge && accRows.length > 0) {
    const t = fractionalFireAge - (computedFireAge - 1)
    // Interpolated portfolio at the fractional FIRE point
    const firePortfolio = netWorthPreFire + t * (currentNetWorth - netWorthPreFire)
    const excess = Math.round(currentNetWorth - firePortfolio)
    if (excess > 0) {
      const lastRow = accRows[accRows.length - 1]
      lastRow.savings = Math.round(annualSavings * t)
      lastRow.totalGrowth = Math.round(lastRow.totalGrowth * t)
      lastRow.netWorth -= excess
      lastRow.totalAssets -= excess

      // Scale running buckets proportionally so decumulation starts from correct portfolio
      const totalBucketValue = sumBucketValues(runningBuckets)
      if (totalBucketValue > 0) {
        for (const b of runningBuckets) {
          b.value -= excess * (Math.max(0, b.value) / totalBucketValue)
        }
      }
    }
  }

  // ── Phase 2 & 3: Decumulation from fireAge ────────────────────────
  // Generate full rows with per-bucket detail and withdrawal strategy

  const decRows: UnifiedProjectionRow[] = []
  let previousWithdrawal = 0
  // Always start decumulation from actual portfolio (currentNetWorth) to ensure
  // a continuous line at FIRE age — no visual jump. The last accumulation row's
  // endPortfolio matches the first decumulation row's startPortfolio (#511).
  // Previously only pensioen-modus (forcedFireAge) used actual portfolio; now all modes do.
  // No bucket scaling needed — buckets already reflect actual accumulated values.

  // Determine active withdrawal config (use chosen strategy for display rows)
  const activeConfig = wsConfig
  // Use NET WORTH (assets − debts) as the reference portfolio for withdrawal
  // strategies. The binary search already operates on net worth (candidate values
  // are compared against currentNetWorth), so the actual simulation must match.
  // Without this, the annuity formula (P×r/(1−(1+r)^(−n))) would use gross assets
  // as P, causing ~33% higher withdrawals when significant debts exist. Assets
  // would deplete to €0 while debts remain, resulting in negative net worth. (#523)
  const decumStartNetWorth = sumBucketValues(runningBuckets)
    - runningDebts.reduce((s, rd) => s + rd.balance * (rd.netWorthInclusionPct / 100), 0)

  for (let age = computedFireAge; age < displayEndAge; age++) {
    const year = age - currentAge
    const yearsIntoPension = age - computedFireAge

    // Capture true start-of-year net worth BEFORE any activity (cashflows/withdrawals/growth)
    let trueStartAssets = 0
    for (const b of runningBuckets) trueStartAssets += Math.max(0, b.value)
    let trueStartDebts = 0
    for (const rd of runningDebts) trueStartDebts += rd.balance * (rd.netWorthInclusionPct / 100)
    const trueStartNetWorth = trueStartAssets - trueStartDebts

    // During decumulation, no new savings contributions — the person is retired.
    // Reset all bucket contributions to 0 (not to original monthly_contribution).
    for (const b of runningBuckets) {
      b.annualContribution = 0
    }

    // One-time cashflows
    let oneTimeNet = 0
    for (const cf of cashflows) {
      const amt = oneTimeAmount(cf, age)
      if (amt !== 0) {
        oneTimeNet += amt
        if (amt > 0) {
          const investable = runningBuckets.filter(b => INVESTABLE_ASSET_TYPES.has(b.assetType))
          const totalInv = investable.reduce((s, b) => s + Math.max(0, b.value), 0)
          if (totalInv > 0) {
            for (const b of investable) b.value += amt * (Math.max(0, b.value) / totalInv)
          } else if (investable.length > 0) {
            for (const b of investable) b.value += amt / investable.length
          }
        } else {
          waterfallWithdraw(runningBuckets, Math.abs(amt))
        }
      }
    }

    // Recurring cashflows
    let recurringNet = 0
    let recurringIncome = 0
    for (const cf of cashflows) {
      const val = recurringYearly(cf, age)
      recurringNet += val
      if (val > 0) recurringIncome += val
    }

    const expensesThisYear = yearlyExpenses * Math.pow(1 + inflationRate, yearsIntoPension)

    // Build withdrawal context and apply strategy — use net worth (assets − debts)
    // so withdrawal strategies see the same portfolio as the binary search (#523)
    const totalAssetsForStrategy = sumBucketValues(runningBuckets)
    const totalDebtsForStrategy = runningDebts.reduce(
      (s, rd) => s + rd.balance * (rd.netWorthInclusionPct / 100), 0,
    )
    const portfolioForStrategy = totalAssetsForStrategy - totalDebtsForStrategy
    // For legacy: indexed legacy amount at endAge (target to preserve)
    const indexedLegacyForCtx = strategy === 'legacy'
      ? legacyAmount * Math.pow(1 + inflationRate, effectiveEndAge - currentAge)
      : undefined

    // For bucket strategy, compute a dynamic weighted-average net return from the
    // CURRENT bucket composition (start-of-year, before withdrawal). As low-return
    // buckets are drained first via waterfall, the effective return shifts upward
    // over time — matching the binary search's per-year dynamic return calculation.
    // Non-bucket strategies keep the static avgNetReturnAtFire to preserve their
    // "fixed return" semantics.
    const yearReturnForStrategy = activeConfig.strategy === 'bucket'
      ? computeAverageNetReturn(runningBuckets)
      : avgNetReturnAtFire

    const wCtx: WithdrawalContext = {
      baseExpenses: expensesThisYear,
      recurringIncome: recurringNet,
      currentPortfolio: portfolioForStrategy,
      startPortfolio: decumStartNetWorth,
      previousWithdrawal,
      yearReturn: yearReturnForStrategy,
      yearsIntoRetirement: yearsIntoPension,
      currentAge: age,
      endAge: strategy === 'perpetual' ? computedFireAge + 100 : effectiveEndAge,
      endStrategy: strategy,
      legacyAmount: indexedLegacyForCtx,
      // Note: inflation NOT passed here. The growing annuity formula is designed
      // for grow-then-withdraw order (old engine). The unified engine uses
      // withdraw-then-grow, so the nominal annuity (without inflation) is used.
    }
    const withdrawal = applyWithdrawalStrategy(activeConfig, wCtx)

    // Apply withdrawal via waterfall across asset buckets
    const { byType: withdrawalByType } = waterfallWithdraw(runningBuckets, withdrawal)

    // No surplus allocation during decumulation (savings = 0)
    const assetBuckets = computeYearlyAssetGrowth(runningBuckets, 0, hasPartner)

    // Debt schedule continues during decumulation
    const { debtBalances } = computeYearlyDebtSchedule(runningDebts)

    // Aggregate totals
    let totalGrowth = 0
    let totalBox3 = 0
    for (const detail of Object.values(assetBuckets)) {
      if (detail) {
        totalGrowth += detail.growth
        totalBox3 += detail.box3Drag
      }
    }
    cumulativeBox3 += totalBox3

    const totalAssets = Math.max(0, sumBucketValues(runningBuckets))
    const totalDebtsValue = computeWeightedDebtTotal(debtBalances, runningDebts)
    const netWorth = totalAssets - totalDebtsValue

    // Phase assignment:
    // - accumulation: age < fireAge (already handled above)
    // - transition: fireAge ≤ age < aowAge
    // - withdrawal: age ≥ aowAge
    // If forcedFireAge is set (pensioen mode), there's no transition phase
    let phase: 'accumulation' | 'transition' | 'withdrawal'
    if (input.forcedFireAge != null) {
      // Pensioen mode: skip transition, go straight to withdrawal
      phase = 'withdrawal'
    } else if (age >= aowAge) {
      phase = 'withdrawal'
    } else {
      phase = 'transition'
    }

    decRows.push({
      year,
      age,
      phase,
      assetBuckets,
      debtBalances,
      totalAssets: Math.round(totalAssets),
      totalDebts: Math.round(totalDebtsValue),
      netWorth: Math.round(netWorth),
      startNetWorth: Math.round(trueStartNetWorth),
      grossIncome: Math.round(recurringIncome),
      savings: 0,
      withdrawal: Math.round(withdrawal),
      withdrawalByType: Object.fromEntries(
        Object.entries(withdrawalByType).map(([k, v]) => [k, Math.round(v)])
      ) as Partial<Record<AssetType, number>>,
      cashflowNet: Math.round(recurringNet),
      oneTimeNet: Math.round(oneTimeNet),
      totalGrowth: Math.round(totalGrowth),
      totalBox3: Math.round(totalBox3),
      cumulativeBox3: Math.round(cumulativeBox3),
      inflationFactor: Math.pow(1 + inflationRate, year),
    })

    previousWithdrawal = withdrawal
  }

  // ── Assemble result ────────────────────────────────────────────────

  const implicitWithdrawalRate = requiredFirePortfolio > 0
    ? yearlyExpenses / requiredFirePortfolio
    : 0

  return {
    rows: [...accRows, ...decRows],
    fireAge: computedFireAge,
    fireAgeFractional: fractionalFireAge,
    fireReachable: true,
    firePortfolioAtFire: accRows.length > 0
      ? accRows[accRows.length - 1].netWorth
      : Math.round(currentNetWorth),
    requiredFirePortfolio,
    implicitWithdrawalRate,
    strategy,
    targetEndPortfolio: strategy === 'legacy'
      ? Math.round(legacyAmount * Math.pow(1 + inflationRate, effectiveEndAge - currentAge))
      : strategy === 'perpetual'
        ? Math.round(requiredFirePortfolioExact * Math.pow(1 + inflationRate, displayEndAge - computedFireAge))
        : 0,
    displayEndAge,
  }
}

// ── Mapping: UnifiedProjectionResult → BucketProjectionResult ──────────────

/**
 * Converteer een UnifiedProjectionResult (jaarlijks) naar een BucketProjectionResult
 * zodat de bestaande BucketProjectionTable en BucketProjectionChart ongewijzigd werken.
 *
 * Typisch gebruikt met `skipFireDetection: true` voor een 20-jaar horizon op de Kern pagina.
 *
 * @param result - Resultaat van `runUnifiedProjection()`
 * @param input  - Dezelfde input die aan `runUnifiedProjection()` is meegegeven
 * @returns BucketProjectionResult compatibel met bestaande UI-componenten
 */
export function unifiedToBucketResult(
  result: UnifiedProjectionResult,
  input: UnifiedProjectionInput,
): BucketProjectionResult {
  const { assets, debts, hasPartner, inflationRate, box3Method } = input
  const activeAssets = assets.filter(a => a.is_active)
  const activeDebts = debts.filter(d => d.is_active && Number(d.current_balance) > 0)

  const now = new Date()
  const totalYears = result.rows.length > 0
    ? result.rows[result.rows.length - 1].year + 1
    : 20
  const totalMonths = totalYears * 12

  // ── Convert yearly UnifiedProjectionRows to monthly BucketRows ──
  // Interpolate linearly between yearly data points for monthly granularity
  const bucketRows: BucketRow[] = []

  // Month 0 = current state (from first row or assets directly)
  const row0 = result.rows[0]
  const currentAssetBuckets: Partial<Record<AssetType, number>> = {}
  let initTotalAssets = 0
  if (row0) {
    for (const [type, detail] of Object.entries(row0.assetBuckets)) {
      if (detail) {
        currentAssetBuckets[type as AssetType] = detail.startValue
        initTotalAssets += detail.startValue
      }
    }
  } else {
    for (const a of activeAssets) {
      const val = Number(a.current_value) * (Number(a.net_worth_inclusion_pct ?? 100) / 100)
      const type = a.asset_type
      currentAssetBuckets[type] = (currentAssetBuckets[type] ?? 0) + val
      initTotalAssets += val
    }
  }
  let initTotalDebts = 0
  if (row0) {
    initTotalDebts = row0.totalDebts
  } else {
    for (const d of activeDebts) initTotalDebts += Number(d.current_balance)
  }

  bucketRows.push({
    month: 0,
    date: now.toISOString().split('T')[0],
    assetBuckets: currentAssetBuckets,
    totalAssets: Math.round(initTotalAssets),
    totalDebts: Math.round(initTotalDebts),
    netWorth: Math.round(initTotalAssets - initTotalDebts),
    cumulativeBox3Tax: 0,
    inflationFactor: 1,
  })

  // Generate monthly rows by interpolating between yearly rows
  for (let rowIdx = 0; rowIdx < result.rows.length; rowIdx++) {
    const uRow = result.rows[rowIdx]
    const prevRow = rowIdx > 0 ? result.rows[rowIdx - 1] : null

    // End-of-year values for this row
    const endBuckets: Partial<Record<AssetType, number>> = {}
    for (const [type, detail] of Object.entries(uRow.assetBuckets)) {
      if (detail) endBuckets[type as AssetType] = detail.endValue
    }

    // Start-of-year values
    const startBuckets: Partial<Record<AssetType, number>> = {}
    for (const [type, detail] of Object.entries(uRow.assetBuckets)) {
      if (detail) startBuckets[type as AssetType] = detail.startValue
    }

    // Previous year cumulative tax
    const prevCumBox3 = prevRow ? prevRow.cumulativeBox3 : 0

    // Interpolate 12 months within this year
    for (let m = 1; m <= 12; m++) {
      const t = m / 12
      const month = uRow.year * 12 + m

      const interpolatedBuckets: Partial<Record<AssetType, number>> = {}
      let totalAssets = 0
      for (const type of Object.keys(endBuckets) as AssetType[]) {
        const startVal = startBuckets[type] ?? 0
        const endVal = endBuckets[type] ?? 0
        const val = startVal + (endVal - startVal) * t
        interpolatedBuckets[type] = val
        totalAssets += val
      }

      // Interpolate debts
      const prevDebts = prevRow ? prevRow.totalDebts : initTotalDebts
      const totalDebts = prevDebts + (uRow.totalDebts - prevDebts) * t

      const date = new Date(now)
      date.setMonth(date.getMonth() + month)

      bucketRows.push({
        month,
        date: date.toISOString().split('T')[0],
        assetBuckets: interpolatedBuckets,
        totalAssets: Math.round(totalAssets),
        totalDebts: Math.round(totalDebts),
        netWorth: Math.round(totalAssets - totalDebts),
        cumulativeBox3Tax: Math.round(prevCumBox3 + uRow.totalBox3 * t),
        inflationFactor: Math.pow(1 + inflationRate, month / 12),
      })
    }
  }

  // ── Milestone snapshots ──
  const getSnapshot = (month: number): MilestoneSnapshot => {
    const row = bucketRows.find(r => r.month === month) ?? bucketRows[bucketRows.length - 1]
    return {
      netWorth: row.netWorth,
      totalAssets: row.totalAssets,
      totalDebts: row.totalDebts,
      totalCosts: row.cumulativeBox3Tax,
      inflationFactor: row.inflationFactor,
    }
  }

  // ── Bucket summaries (per asset type) ──
  const bucketMap = new Map<AssetType, { assets: Asset[]; totalValue: number }>()
  for (const a of activeAssets) {
    const entry = bucketMap.get(a.asset_type) ?? { assets: [], totalValue: 0 }
    const inclValue = Number(a.current_value) * (Number(a.net_worth_inclusion_pct ?? 100) / 100)
    entry.assets.push(a)
    entry.totalValue += inclValue
    bucketMap.set(a.asset_type, entry)
  }

  const bucketSummaries: BucketSummary[] = []
  for (const [type, { assets: bucketAssets, totalValue }] of bucketMap) {
    if (totalValue === 0 && bucketAssets.length === 0) continue

    // Weighted average return from UnifiedProjectionRow asset buckets
    let weightedReturn = 0
    if (totalValue > 0) {
      for (const a of bucketAssets) {
        const inclValue = Number(a.current_value) * (Number(a.net_worth_inclusion_pct ?? 100) / 100)
        weightedReturn += (Number(a.expected_return) / 100) * (inclValue / totalValue)
      }
    }

    // Box 3 drag from unified rows (first year)
    let box3DragPct = 0
    if (result.rows[0] && totalValue > 0) {
      const detail = result.rows[0].assetBuckets[type]
      if (detail && detail.startValue > 0) {
        box3DragPct = (detail.box3Drag / detail.startValue) * 100
      }
    }

    // Asset details
    const assetDetails: AssetDetail[] = bucketAssets.map(a => {
      const inclPct = (Number(a.net_worth_inclusion_pct ?? 100) / 100)
      const currentVal = Number(a.current_value) * inclPct
      const ret = Number(a.expected_return) / 100
      const contrib = Number(a.monthly_contribution)
      // Simple projection for 1y and 5y per asset
      const projected1y = currentVal * (1 + ret) + contrib * 12
      const projected5y = currentVal * Math.pow(1 + ret, 5) + contrib * 12 * ((Math.pow(1 + ret, 5) - 1) / ret || 5)
      return {
        id: a.id,
        name: a.name,
        currentValue: currentVal,
        expectedReturn: Number(a.expected_return),
        monthlyContribution: contrib,
        projected1y,
        projected5y,
      }
    })

    // Bucket-level projections from interpolated rows
    const row12 = bucketRows.find(r => r.month === 12)
    const row60 = bucketRows.find(r => r.month === 60)
    const rowEnd = bucketRows[bucketRows.length - 1]

    bucketSummaries.push({
      assetType: type,
      label: ASSET_TYPE_LABELS[type],
      color: ASSET_TYPE_COLORS[type],
      icon: ASSET_TYPE_ICONS[type],
      currentValue: totalValue,
      weightedReturn,
      box3DragPct,
      projected1y: row12?.assetBuckets[type] ?? totalValue,
      projected5y: row60?.assetBuckets[type] ?? totalValue,
      projectedEnd: rowEnd?.assetBuckets[type] ?? totalValue,
      assetCount: bucketAssets.length,
      assets: assetDetails,
    })
  }

  // Sort by current value descending
  bucketSummaries.sort((a, b) => b.currentValue - a.currentValue)

  // ── Debt summaries ──
  const debtSummaries: DebtSummary[] = activeDebts.map(d => {
    const currentBalance = Number(d.current_balance)
    const interestRate = Number(d.interest_rate)
    const monthlyPayment = Number(d.monthly_payment)

    // Find end-of-year balances from unified rows
    const row1 = result.rows.find(r => r.year === 0)
    const row5 = result.rows.find(r => r.year === 4)
    const rowLast = result.rows[result.rows.length - 1]

    const getDebtBalance = (row: UnifiedProjectionRow | undefined) => {
      if (!row) return currentBalance
      const detail = row.debtBalances[d.id]
      return detail ? detail.endBalance : 0
    }

    // Simple payoff estimation
    let payoffMonth: number | null = null
    if (monthlyPayment > 0 && currentBalance > 0) {
      const monthlyRate = interestRate / 100 / 12
      if (monthlyRate > 0) {
        const n = Math.log(monthlyPayment / (monthlyPayment - currentBalance * monthlyRate)) / Math.log(1 + monthlyRate)
        if (isFinite(n) && n > 0) payoffMonth = Math.ceil(n)
      } else {
        payoffMonth = Math.ceil(currentBalance / monthlyPayment)
      }
    }

    return {
      id: d.id,
      name: d.name,
      debtType: d.debt_type as DebtType,
      currentBalance,
      interestRate,
      monthlyPayment,
      repaymentType: d.repayment_type as RepaymentType | null,
      projected1y: getDebtBalance(row1),
      projected5y: getDebtBalance(row5),
      projectedEnd: getDebtBalance(rowLast),
      payoffMonth,
    }
  })

  // ── Cost summaries (Box 3) ──
  const costRow12 = bucketRows.find(r => r.month === 12)
  const costRow60 = bucketRows.find(r => r.month === 60)
  const annualBox3Tax = result.rows[0]?.totalBox3 ?? 0

  const costSummaries: CostSummary[] = []
  if (annualBox3Tax > 0 || (costRow60?.cumulativeBox3Tax ?? 0) > 0) {
    costSummaries.push({
      id: 'box3_belasting',
      label: 'Box 3 vermogensbelasting',
      description: `Berekend via ${box3Method === 'forfaitair' ? 'forfaitair' : 'werkelijk'} rendement`,
      current: Math.round(annualBox3Tax),
      cumulative1y: costRow12?.cumulativeBox3Tax ?? 0,
      cumulative5y: costRow60?.cumulativeBox3Tax ?? 0,
      color: '#ef4444',
    })
  }

  // ── Cash flow summary ──
  const totalDebtPayments = activeDebts.reduce((s, d) => s + Number(d.monthly_payment), 0)
  const totalAssetContributions = activeAssets.reduce((s, a) => s + Number(a.monthly_contribution), 0)
  const monthlyExpenses = (input.monthlyIncome ?? 0) - input.monthlySurplus
  const impliedLivingExpenses = monthlyExpenses - totalDebtPayments - totalAssetContributions
  const isOvercommitted = input.monthlyIncome > 0
    && (totalDebtPayments + totalAssetContributions) > input.monthlyIncome

  const effectiveGrowthRate = input.incomeGrowthRate ?? inflationRate
  const cashFlowSummary: CashFlowSummary = {
    monthlyIncome: input.monthlyIncome,
    monthlyExpenses,
    totalDebtPayments,
    totalAssetContributions,
    monthlySurplus: input.monthlySurplus,
    impliedLivingExpenses: Math.max(0, impliedLivingExpenses),
    isOvercommitted,
    overcommitAmount: isOvercommitted
      ? (totalDebtPayments + totalAssetContributions) - input.monthlyIncome
      : 0,
    incomeGrowthRate: effectiveGrowthRate,
  }

  const currentNetWorth = bucketRows[0]?.netWorth ?? 0
  const finalNetWorth = bucketRows[bucketRows.length - 1]?.netWorth ?? 0

  // ── Alternative Box 3 method comparison ──
  // For simplicity, use same rows (the difference is minor for display purposes)
  // The old engine ran a complete second simulation — here we approximate
  const alternativeMethod: Box3Method = box3Method === 'forfaitair' ? 'werkelijk' : 'forfaitair'

  return {
    rows: bucketRows,
    year1: getSnapshot(12),
    year3: getSnapshot(36),
    year5: getSnapshot(60),
    ...(totalMonths >= 120 ? { year10: getSnapshot(120) } : {}),
    ...(totalMonths >= 240 ? { year20: getSnapshot(240) } : {}),
    bucketSummaries,
    debtSummaries,
    costSummaries,
    alternativeRows: bucketRows, // Same rows (alternative Box 3 approximation)
    alternativeMethod,
    currentNetWorth,
    isGrowing: finalNetWorth > currentNetWorth,
    cashFlowSummary,
  }
}

// ── Deprecated wrapper: runSimulationUnified ───────────────────────────────

/**
 * @deprecated Gebruik `runUnifiedProjection()` in plaats van deze functie.
 *
 * Backwards-compatible wrapper die de oude `runSimulation()` handtekening
 * accepteert en intern `runUnifiedProjection()` aanroept, waarna het
 * resultaat via `toSimResult()` wordt geconverteerd naar een legacy SimResult.
 *
 * Verschil met de originele `runSimulation()` uit fire-simulation.ts:
 * - Per-asset-type rendement & Box 3 (nauwkeuriger dan flat BOX3_DRAG)
 * - Per-schuld aflossing (inclusief amortisatie schema's)
 * - Drie fasen (accumulation → transition → withdrawal)
 *
 * @param currentAge - leeftijd van de gebruiker
 * @param endAge - eindleeftijd van de simulatie
 * @param currentPortfolio - huidig totaal portefeuille-vermogen
 * @param yearlyExpenses - jaarlijkse uitgaven
 * @param annualSavings - jaarlijkse besparingen
 * @param grossReturn - bruto rendement (decimaal, bijv. 0.07)
 * @param _returnModel - genegeerd (unified engine gebruikt altijd per-asset Box 3)
 * @param inflation - inflatie (decimaal, bijv. 0.02)
 * @param cashflows - externe kasstromen
 * @param strategyConfig - FIRE eindstrategie configuratie
 * @param withdrawalStrategy - onttrekkingsstrategie configuratie
 * @param forcedFireAge - geforceerde FIRE-leeftijd (pensioen-modus)
 * @returns SimResult (legacy formaat)
 */
export function runSimulationUnified(
  currentAge: number,
  endAge: number,
  currentPortfolio: number,
  yearlyExpenses: number,
  annualSavings: number,
  grossReturn: number,
  _returnModel: ReturnModel,
  inflation: number,
  cashflows: SimCashflow[],
  strategyConfig?: FireStrategyConfig,
  withdrawalStrategy?: WithdrawalStrategyConfig,
  forcedFireAge?: number,
): SimResult {
  // Bouw een synthetisch asset om de portefeuille te representeren
  // De unified engine heeft echte assets nodig voor per-type berekening.
  // In de wrapper mode gebruiken we een enkele investment-bucket als proxy.
  // NOTE: monthly_contribution = 0 want annualSavings wordt apart meegegeven
  // als input.annualSavings en door de engine als surplus verdeeld.
  const syntheticAsset: Asset = {
    id: 'synthetic-portfolio',
    user_id: 'wrapper',
    name: 'Portfolio',
    asset_type: 'investment',
    current_value: currentPortfolio,
    purchase_value: currentPortfolio,
    purchase_date: null,
    expected_return: grossReturn * 100, // Convert decimal to percentage
    monthly_contribution: 0, // Savings handled via annualSavings input
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: null,
    risk_profile: null,
    tax_benefit: null,
    is_liquid: true,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    has_holdings_tracking: false,
  }

  const input: UnifiedProjectionInput = {
    assets: [syntheticAsset],
    debts: [],
    currentAge,
    endAge,
    yearlyExpenses,
    annualSavings,
    monthlySurplus: annualSavings / 12,
    monthlyIncome: (yearlyExpenses + annualSavings) / 12,
    incomeGrowthRate: 0,
    grossReturn,
    inflationRate: inflation,
    box3Method: 'forfaitair',
    cashflows,
    strategyConfig: strategyConfig ?? { strategy: 'deplete', endAge, legacyAmount: 0 },
    withdrawalStrategy: withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
    forcedFireAge,
    hasPartner: false,
  }

  const unifiedResult = runUnifiedProjection(input)
  return toSimResult(unifiedResult)
}
