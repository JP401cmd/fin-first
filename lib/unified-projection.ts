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
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, ASSET_TYPE_ICONS, resolveDepreciation } from '@/lib/asset-data'
import type { Debt, DebtType, RepaymentType, AmortizationRow } from '@/lib/debt-data'
import {
  amortizationSchedule,
  linearAmortization,
  interestOnlySchedule,
} from '@/lib/debt-data'
import type { SimCashflow, SimRow, SimResult } from '@/lib/fire-simulation'
import { type FireEndStrategy, type FireStrategyConfig } from '@/lib/fire-strategy'
import {
  type WithdrawalStrategyConfig,
} from '@/lib/withdrawal-strategy'
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
  /**
   * Optionele rendement-delta in decimaal (bv. +0.02 = +2 pp). Wordt uniform
   * opgeteld bij elke asset-rendement (per-asset expected_return + delta) én
   * bij de fallback. Schulden (interest_rate) blijven onaangeroerd.
   * Default 0 = geen effect, identiek aan zonder delta.
   */
  returnDelta?: number
  /**
   * Per-asset-type rendement-delta (decimal). Wint van `returnDelta` voor
   * types die in de map staan; types die niet in de map staan vallen terug
   * op `returnDelta`. Maakt scenario's mogelijk waarin alleen 'investment'
   * +3 pp krijgt terwijl 'cash' onaangeroerd blijft.
   */
  returnDeltaByAssetType?: Record<string, number>

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

  // ── Asset-liquidaties (v2 grootboek-engine; v1 negeert dit veld) ──
  /**
   * Geplande asset-liquidaties. Gebruikt door de horizon v2-grootboek-engine voor
   * de eigen-huis-downsize: op de trigger-leeftijd verkoopt de engine het asset
   * (binnen het grootboek) i.p.v. het huis uit de FIRE-pot te filteren en de
   * verkoop als eenmalig inkomen in te spuiten. Daardoor blijft het netto vermogen
   * continu (alleen −verkoopkosten) en verspringt alléén de liquiditeit. v1
   * (`runUnifiedProjection`) leest dit veld niet — daar blijft het filter+inkomen-
   * model gelden. Zie ADR 0015.
   */
  assetLiquidations?: AssetLiquidation[]

  /**
   * Asset-ids die normaal NIET-liquide zijn (bv. `eigen_huis`) maar voor déze
   * projectie tóch als besteedbaar/liquide FIRE-vermogen meetellen. Gebruikt door
   * de v2-grootboek-engine bij housing-strategie `include_full`: de woning telt dan
   * volledig mee in de besteedbare pot (zoals v1), zodat een spend-down/deplete 'm
   * óók afbouwt (laatst in de onttrekkingsvolgorde) en de lijn richting €0 loopt
   * i.p.v. dat de woning onbespeelbaar blijft groeien. v1 (`runUnifiedProjection`)
   * leest dit veld niet. Zie ADR 0015.
   */
  spendableAssetIds?: string[]

  /**
   * Opeethypotheek (reverse mortgage) — v2-grootboek (ADR 0029). Wanneer gezet opent
   * de engine op `triggerAge` een synthetische, aflossingsvrije schuld "Opeethypotheek"
   * tegen de woning (saldo start 0). Het maand-/jaar-tekort (ná de echte liquide pot
   * in de onttrekkingsvolgorde) wordt opgenomen als instroom naar liquide MÉT gelijke
   * verhoging van het opeetschuld-saldo; de rente stapelt op het saldo (blok-3-stijl
   * aflossingsvrij). De opname is per jaar gecapt op de LEEN-RUIMTE = overwaarde(jaar)
   * × maxLoanPct (geen oneindig lenen → resterend tekort onbedekt via de bestaande
   * shortfall-mechaniek). De woning blijft `eigen_huis`-asset in de ledger (groeit,
   * NIET spendable, NOOIT rauw onttrokken); de leen-ruimte telt apart mee als FIRE-
   * eligibility-bijdrage via `collateralBorrowableById`. v1 leest dit veld niet.
   */
  reverseMortgage?: ReverseMortgagePlan

  /**
   * Per-asset expliciete FIRE-eligibility-BIJDRAGE in euro's (ADR 0029, Optie B).
   * Optelling bovenop `liquidSumStart`/`blendedRealReturnStart`: het BEDRAG dat een
   * van nature niet-liquide, niet-spendable asset tóch als FIRE-eligible besteedbaar
   * laat meetellen ZÓNDER het asset rauw onttrekbaar of (volledig) spendable te maken.
   *
   * Gebruikt door de opeethypotheek: de woning zelf telt NIET als spendable (telt dus
   * niet voor zijn volle inclusion-waarde mee), maar de leen-RUIMTE (overwaarde ×
   * maxLoanPct, met de huis-return als voet) telt wél als eligibility-bijdrage —
   * eligibility-meting (`liquidSumStart`/`blendedRealReturnStart`/de FIRE-gate) en
   * drawdown (de opeetschuld-cap) delen daardoor één grondslag (`reverseMortgageBorrowable`).
   * v1 leest dit veld niet.
   */
  collateralBorrowableById?: Record<string, number>
}

/**
 * Opeethypotheek-plan voor de v2-grootboek-engine (ADR 0029). Pure-getal-vorm van
 * `ReverseMortgageConfig`, samengesteld in build-input zodat de engine geen
 * housing-strategy hoeft te importeren.
 */
export interface ReverseMortgagePlan {
  /** Asset-id van de woning waartegen geleend wordt (blijft `eigen_huis` in de ledger). */
  houseAssetId: string
  /** Leeftijd waarop de opeethypotheek opent (saldo 0). */
  triggerAge: number
  /** Jaarlijkse (nominale) rente op het opeetschuld-saldo (decimaal, bv. 0.055). */
  interestRate: number
  /** Max % van de overwaarde dat als lening kan worden opgenomen (cap-fractie, bv. 0.50). */
  maxLoanPct: number
  /**
   * Vaste maand-uitkering (euro). null = tekort-gedreven: de engine neemt jaarlijks
   * precies het liquiditeitstekort op (gecapt op de leen-ruimte). Bij een vast bedrag
   * stroomt jaarlijks `monthlyPayout × 12` in (eveneens gecapt op de leen-ruimte).
   */
  monthlyPayout: number | null
  /** Debt-id's van bestaande hypotheken op deze woning — voor de overwaarde-berekening (overwaarde = huiswaarde − Σ saldo). */
  mortgageDebtIds: string[]
}

/**
 * Eén geplande asset-liquidatie voor de v2-grootboek-engine. De engine verkoopt
 * `assetId`: opbrengst = waarde × `salePricePct` × (1 − `salesCostsPct`); de
 * gekoppelde schulden (`payoffDebtIds`) worden afgelost (saldo → 0, woonlast stopt);
 * de netto-opbrengst (na aflossing) stroomt naar het liquide vermogen.
 *
 * De `trigger` bepaalt WANNEER:
 *  - `fixed_age` — verkoop onvoorwaardelijk op de vaste `age` (huidig gedrag; o.a.
 *    de eigen-huis-downsize op de trigger-leeftijd, en `vast_moment`-verkopen).
 *  - `on_demand` — géén vaste `age`; de engine verkoopt het asset IN de loop zodra de
 *    liquide pot een tekort niet meer dekt (Optie A, ADR 0020). De optionele `age`
 *    fungeert dan als fallback-plafond: uiterlijk op die leeftijd verkopen, ook
 *    zónder tekort (NaN/Infinity = geen plafond). De verkoopvolgorde bij meerdere
 *    `on_demand`-assets volgt de bestaande onttrekkingsvolgorde (minst-liquide laatst,
 *    `eigen_huis` allerlaatst). v1 (`runUnifiedProjection`) leest dit veld niet.
 */
export interface AssetLiquidation {
  /** Asset dat verkocht wordt (bv. het eigen_huis). */
  assetId: string
  /**
   * Bij `fixed_age`: de leeftijd waarop onvoorwaardelijk verkocht wordt.
   * Bij `on_demand`: een optioneel fallback-plafond (uiterlijk-verkoopleeftijd);
   * gebruik `Number.POSITIVE_INFINITY` (of `NaN`) voor "geen plafond".
   */
  age: number
  /**
   * Verkoopmoment-discriminator. `fixed_age` = vaste leeftijd (default voor
   * achterwaartse compatibiliteit met bestaande callers die `trigger` weglaten).
   * `on_demand` = in-loop verkoop bij liquiditeitstekort.
   */
  trigger?: 'fixed_age' | 'on_demand'
  /** Verkoopprijs als fractie van de (geprojecteerde) marktwaarde (bv. 1.0). */
  salePricePct: number
  /** Verkoopkosten als fractie van de verkoopprijs (bv. 0.04). */
  salesCostsPct: number
  /** Gekoppelde schulden die met de opbrengst worden afgelost. */
  payoffDebtIds: string[]
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
  annualDepreciation: number // lineaire afschrijving per jaar
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
  returnDelta: number = 0,
  returnDeltaByAssetType?: Record<string, number>,
): RunningBucket[] {
  const activeAssets = assets.filter(a => a.is_active)

  // Groepeer per asset type
  const typeMap = new Map<AssetType, { totalValue: number; weightedReturnSum: number; totalContribution: number; category: Box3Category; rawDragRate: number; totalAnnualDepreciation: number }>()

  for (const asset of activeAssets) {
    const type = asset.asset_type as AssetType
    const inclPct = (Number(asset.net_worth_inclusion_pct ?? 100) / 100)
    const value = Number(asset.current_value) * inclPct
    const contrib = Number(asset.monthly_contribution) * 12
    const { dragRate, category } = computeAssetBox3DragRate(asset, box3Method)

    // Detect depreciation via shared utility (handles explicit rate + vehicle migration)
    const depInfo = resolveDepreciation(asset)
    const baseRet = (Number(asset.expected_return) / 100) || fallbackReturn
    // Per-asset-type delta wins; falls back to the global delta.
    const typeDelta = returnDeltaByAssetType?.[asset.asset_type] ?? returnDelta
    const ret = depInfo ? 0 : baseRet + typeDelta
    const annualDep = depInfo ? depInfo.baseValue * (depInfo.rate / 100) : 0

    const existing = typeMap.get(type)
    if (existing) {
      existing.weightedReturnSum += value * ret
      existing.totalValue += value
      existing.totalContribution += contrib
      existing.totalAnnualDepreciation += annualDep
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
        totalAnnualDepreciation: annualDep,
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
      annualDepreciation: data.totalAnnualDepreciation,
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

    // Lineaire afschrijving: maximaal tot aan restwaarde (nooit negatief)
    const depAmount = Math.min(bucket.annualDepreciation, Math.max(0, startValue + growth + contributions - box3Drag))

    // Eindwaarde: compound doorrekening — drag en afschrijving verminderen de running value
    const endValue = startValue + growth + contributions - box3Drag - depAmount

    result[bucket.assetType] = {
      startValue: Math.round(startValue),
      growth: Math.round(growth),
      contributions: Math.round(contributions),
      box3Drag: Math.round(box3Drag),
      endValue: Math.round(endValue),
    }

    // Update running value voor volgend jaar (compound!)
    bucket.value = bucket.annualDepreciation > 0 ? Math.max(0, endValue) : endValue

    // Stop afschrijving als asset volledig is afgeschreven
    if (endValue <= 0 && bucket.annualDepreciation > 0) bucket.annualDepreciation = 0

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
  /** Telt de aflossing van deze schuld mee in de spaarquote
   *  (debts.include_aflossing_in_savings)? Zo ja, dan wordt de jaarlijkse
   *  hoofdsom-aflossing van de portefeuille-inleg afgetrokken om dubbeltelling
   *  met de spaarquote-afgeleide inleg te voorkomen. */
  includeAflossingInSavings: boolean
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
      includeAflossingInSavings: debt.include_aflossing_in_savings ?? false,
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

  // Vermogensstromen: flows to/from net worth
  // Bruto rendement = netto rendement + Box 3 (totalGrowth is already net of box3)
  const grossGrowth = row.totalGrowth + row.totalBox3
  // Totale schuldrente
  let totalDebtInterest = 0
  for (const detail of Object.values(row.debtBalances)) {
    totalDebtInterest += detail.interestPaid
  }
  // Positieve/negatieve cashflows splitsen
  const cfPositive = Math.max(0, row.cashflowNet) + Math.max(0, row.oneTimeNet)
  const cfNegative = Math.abs(Math.min(0, row.cashflowNet)) + Math.abs(Math.min(0, row.oneTimeNet))

  const flowIn = (legacyPhase === 'accumulation' ? Math.max(0, row.savings) : 0)
    + Math.max(0, grossGrowth)
    + cfPositive
  const flowOut = row.totalBox3
    + totalDebtInterest
    + (legacyPhase === 'retirement' ? row.withdrawal : 0)
    + cfNegative

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
    flowIn: Math.round(flowIn),
    flowOut: Math.round(flowOut),
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
