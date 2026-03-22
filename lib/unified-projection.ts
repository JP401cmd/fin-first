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
import type { Debt, RepaymentType, AmortizationRow } from '@/lib/debt-data'
import {
  amortizationSchedule,
  linearAmortization,
  interestOnlySchedule,
} from '@/lib/debt-data'
import type { SimCashflow, SimRow, SimResult } from '@/lib/fire-simulation'
import type { FireEndStrategy, FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { Box3Method } from '@/lib/bucket-projection'
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
    const value = Number(asset.current_value)
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
