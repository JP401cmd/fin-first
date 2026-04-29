/**
 * Hybrid projection — orchestreert opbouw + afbouw-per-asset tot één
 * `HybridYearRow[]` met stabiele per-asset/per-debt indices over beide fases.
 *
 * Kernprincipe: "tabellen rekenen, grafieken tekenen". Deze helper
 * pre-berekent alle velden die een UI-laag nodig heeft (per-asset values,
 * per-debt values, stromen, Box 3, AOW-splitsing) zodat chart-componenten
 * puur `HybridYearRow` kunnen consumeren zonder eigen math.
 *
 * Architectuur:
 *  1. AOW-cashflow wordt via `ensureAowCashflow` geïnjecteerd wanneer er
 *     geen AOW life-event bestaat.
 *  2. `computeOpbouwProjection` draait over het volledige display-bereik
 *     tot `endAge` — savings-inflow gaat als virtueel `__savings`-asset
 *     op index 0 wanneer gezet.
 *  3. `computeAfbouwRequiredSchedule` levert de required-curve; de
 *     snijding met de opbouw-curve bepaalt `fireAge` + `fireAgeFractional`.
 *  4. Pre-fire rijen (age < fireAge) komen uit de opbouw-projectie.
 *  5. Post-fire rijen (age >= fireAge) komen uit `computeAfbouwSchedulePerAsset`
 *     met als startpunt de opbouw-waarden op fireAge. De virtuele savings-
 *     asset wordt meegenomen in de afbouw zodat index-posities consistent
 *     blijven over beide fases.
 *
 * Fase-grens: `age < fireAge` is opbouw, `age >= fireAge` is afbouw. De
 * opbouw-reeks wordt dus gebruikt tot (maar niet inclusief) `fireAge`, en
 * afbouw vanaf `fireAge` inclusief. Zo zijn `age`-waarden monotonisch
 * stijgend zonder duplicaten.
 */

import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType } from '@/lib/debt-data'
import { ASSET_TYPE_COLORS } from '@/lib/asset-data'
import { DEBT_TYPE_COLORS } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import type { FireEndStrategy } from '@/lib/fire-strategy'

import {
  computeOpbouwProjection,
  SAVINGS_ASSET_ID,
  SAVINGS_ASSET_LABEL,
  SAVINGS_ASSET_COLOR,
  type SavingsInflowInput,
} from './opbouw-projection'
import {
  computeAfbouwRequiredSchedule,
  computeAfbouwSchedulePerAsset,
  ensureAowCashflow,
  type AfbouwDistributionStrategy,
  type WithdrawalStrategy,
} from './afbouw-projection'
import { findIntersection, interpolateIntersection } from './intersection'

// ── Public types ────────────────────────────────────────────────

/**
 * Eén rij per leeftijd met totalen, per-asset/per-debt detail én pre-
 * gesommeerde stromen. Keys zijn bewust identiek voor beide fases zodat de
 * UI-laag niet hoeft te forken op `phase`.
 *
 * Invariant: `perAssetValues.length` is constant over alle rijen binnen
 * hetzelfde resultaat. Als er een virtueel savings-asset is zit dat op
 * index 0; de echte assets beginnen op index 1.
 */
export interface HybridYearRow {
  age: number
  year: number
  phase: 'opbouw' | 'afbouw'
  // Totalen — zelfde keys ongeacht fase
  assets: number
  debts: number
  netWorth: number
  cumulativeBox3Tax: number
  box3TaxThisYear: number
  // Per-asset / per-debt (stabiele length over alle rows)
  perAssetValues: number[]
  perDebtValues: number[]
  // Stromen dit jaar (pre-gesommeerd)
  savingsInflowThisYear: number       // 0 na crossover
  eventCashflowNetThisYear: number    // events excl. AOW
  aowIncomeThisYear: number           // 0 voor aowAge
  withdrawalThisYear: number          // 0 pre-crossover
  portfolioGrowthThisYear: number
  // Per-asset detail voor modal/tooltip
  perAssetGrowth: number[]
  perAssetContribution: number[]      // opbouw: bijdrage dat jaar; afbouw: 0
  perAssetWithdrawal: number[]        // opbouw: 0; afbouw: share
  perDebtInterest: number[]
  perDebtRepayment: number[]
}

/**
 * Metadata per asset-layer — volgt dezelfde indices als `perAssetValues`.
 * `isVirtualSavings: true` markeert de virtuele savings-asset op index 0.
 */
export interface HybridAssetMeta {
  id: string
  label: string
  asset_type: string
  color: string
  isVirtualSavings: boolean
}

export interface HybridDebtMeta {
  id: string
  label: string
  debt_type: string
  color: string
}

export interface HybridProjectionResult {
  rows: HybridYearRow[]
  fireAge: number
  fireAgeFractional: number | null
  assetMeta: HybridAssetMeta[]
  debtMeta: HybridDebtMeta[]
  /**
   * Pure opbouw-curve (forward projection zonder afbouw-injectie) per
   * leeftijd. Gebruikt voor "Beide"/"Alleen huidige" chart-modes zodat de
   * visuele kruising met de required-curve samenvalt met de FIRE-marker.
   * Voor "Opbouw→Afbouw" mode gebruikt de chart juist `rows[i].netWorth`
   * (hybride), dat is de werkelijke netto-trajectorie.
   */
  pureOpbouwRows: Array<{ age: number; netWorth: number }>
  /**
   * Required-curve die **intern** is gebruikt om `fireAge` te bepalen.
   * Per-asset-solver-aware (strategy + withdrawalOrder). Consumers moeten
   * deze doorgeven aan de chart zodat de visuele kruising exact samenvalt
   * met de FIRE-marker — een apart berekende curve (zonder perAssetContext
   * of withdrawalStrategy) kan significant afwijken.
   */
  requiredSchedule: Array<{ age: number; requiredPortfolio: number | null }>
}

export interface HybridProjectionInputs {
  /** Raw assets zonder virtueel `__savings`-asset — dit wordt intern
   * gebouwd wanneer `savingsInflow` is gezet. */
  assets: Asset[]
  debts: Debt[]
  lifeEvents: LifeEvent[]
  cashflows: SimCashflow[]
  currentAge: number
  /** Display-einde (bijv. 100 bij perpetual/pensioen, eindleeftijd-config bij deplete/legacy). */
  endAge: number
  fireParams: {
    grossReturn: number
    inflationRate: number
    /** Optioneel portfolio-gewogen return — valt terug op `grossReturn` wanneer niet gezet. */
    weightedGrossReturn?: number
  }
  endStrategy: FireEndStrategy
  /** User-configured eindleeftijd (voor deplete/legacy — beïnvloedt required-curve). */
  endAgeConfig: number
  legacyAmount: number
  withdrawalStrategy: WithdrawalStrategy
  /**
   * Verdeling-toename: stuurt hoe inkomend geld (spaarquote + positieve
   * event-cashflows) over assets wordt verdeeld tijdens de opbouw-fase.
   */
  distributionStrategy: AfbouwDistributionStrategy
  /**
   * Verdeling-afname: stuurt hoe uitgaande levensgebeurtenis-cashflows
   * (negatieve events in opbouw) over assets worden verdeeld. Default =
   * `distributionStrategy` voor backward-compat.
   */
  outflowDistribution?: AfbouwDistributionStrategy
  /**
   * Onttrekkingsvolgorde: stuurt hoe de afbouw-withdrawal (pensioen-fase)
   * over assets wordt verdeeld. Default = `distributionStrategy` voor
   * backward-compat. Semantisch een andere knop dan de event-verdeling.
   */
  withdrawalOrder?: AfbouwDistributionStrategy
  hasPartner: boolean
  yearlyRetirementExpenses: number
  aowAge: number
  savingsInflow?: SavingsInflowInput
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Herken of een SimCashflow een AOW-bijdrage is. Matcht op de stabiele
 * prefix `le-aow-` uit `lifeEventsToCashflows`, op `__aow` uit
 * `ensureAowCashflow`, of op expliciete event-ids uit een life-event met
 * `event_type === 'aow'`.
 */
function isAowCashflow(cf: SimCashflow, aowEventIds: string[]): boolean {
  if (cf.id.startsWith('le-aow-')) return true
  if (cf.id === '__aow') return true
  for (const aowId of aowEventIds) {
    if (cf.id.includes(aowId)) return true
  }
  return false
}

/**
 * Sommeer cashflows voor één jaar `[yearStartAge, yearStartAge + 1)`.
 * Volgt exact dezelfde prorata-logica als `afbouw-projection.ts`: recurring
 * cashflows tellen per overlap-maand, one-time op de `fromAge`-trigger.
 *
 * Returns totaalbedrag plus AOW-deel apart — nodig om in opbouw-rijen het
 * AOW-aandeel los te laten trekken van de algemene event-cashflow.
 */
function sumCashflowsForYear(
  cashflows: SimCashflow[],
  yearStartAge: number,
  currentAge: number,
  inflationRate: number,
  aowEventIds: string[],
): { total: number; aowPart: number } {
  let total = 0
  let aowPart = 0
  const yearEndAge = yearStartAge + 1
  const yearsFromNow = yearStartAge - currentAge

  for (const cf of cashflows) {
    let contribution = 0
    if (cf.type === 'one_time') {
      if (cf.fromAge >= yearStartAge && cf.fromAge < yearEndAge) {
        const yearsFromNowOne = cf.fromAge - currentAge
        const inflationFactor = cf.indexed ? Math.pow(1 + inflationRate, yearsFromNowOne) : 1
        const amount = cf.amount * inflationFactor
        contribution = cf.direction === 'income' ? amount : -amount
      }
    } else {
      const cfEnd = cf.toAge ?? 999
      const overlapStart = Math.max(cf.fromAge, yearStartAge)
      const overlapEnd = Math.min(cfEnd, yearEndAge)
      if (overlapStart < overlapEnd) {
        const months = Math.round((overlapEnd - overlapStart) * 12)
        const inflationFactor = cf.indexed ? Math.pow(1 + inflationRate, yearsFromNow) : 1
        const monthlyAmount = cf.amount * inflationFactor
        const periodAmount = monthlyAmount * months
        contribution = cf.direction === 'income' ? periodAmount : -periodAmount
      }
    }

    total += contribution
    if (isAowCashflow(cf, aowEventIds)) {
      aowPart += contribution
    }
  }

  return { total, aowPart }
}

/**
 * Bouw asset-meta in de exacte index-volgorde die `computeOpbouwProjection`
 * hanteert: index 0 = virtueel savings-asset (als `savingsInflow` gezet is),
 * index 1+ = echte assets in input-volgorde.
 */
function buildAssetMeta(
  realAssets: Asset[],
  hasSavings: boolean,
  savingsLabel: string,
  savingsColor: string,
): HybridAssetMeta[] {
  const meta: HybridAssetMeta[] = []
  if (hasSavings) {
    meta.push({
      id: SAVINGS_ASSET_ID,
      label: savingsLabel,
      asset_type: 'cash',
      color: savingsColor,
      isVirtualSavings: true,
    })
  }
  for (const a of realAssets) {
    meta.push({
      id: a.id,
      label: a.name,
      asset_type: a.asset_type,
      color: ASSET_TYPE_COLORS[a.asset_type as AssetType] ?? ASSET_TYPE_COLORS.other,
      isVirtualSavings: false,
    })
  }
  return meta
}

/** Bouw debt-meta in input-volgorde. */
function buildDebtMeta(debts: Debt[]): HybridDebtMeta[] {
  return debts.map((d) => ({
    id: d.id,
    label: d.name,
    debt_type: d.debt_type,
    color: DEBT_TYPE_COLORS[d.debt_type as DebtType] ?? DEBT_TYPE_COLORS.other,
  }))
}

/**
 * Bouw een virtueel savings-asset dat 1:1 match met het asset dat
 * `computeOpbouwProjection` intern prepend. Nodig voor de afbouw-fase zodat
 * `perAssetValues` dezelfde index-volgorde blijft houden (savings op 0,
 * echte assets op 1+).
 *
 * Duplicate van de private builder in `opbouw-projection.ts` — die is
 * niet geëxporteerd en we willen hier geen circulaire import forceren.
 */
function buildVirtualSavingsAssetForAfbouw(inflow: SavingsInflowInput): Asset {
  const label = inflow.label ?? SAVINGS_ASSET_LABEL
  const nowIso = new Date().toISOString()
  return {
    id: SAVINGS_ASSET_ID,
    user_id: '',
    name: label,
    asset_type: 'cash',
    current_value: 0,
    purchase_value: 0,
    purchase_date: null,
    expected_return: 0,
    // monthly_contribution = 0 in afbouw: spaarquote stopt op FIRE-leeftijd.
    monthly_contribution: 0,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: nowIso,
    updated_at: nowIso,
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
  } as Asset
}

// ── Entry point ─────────────────────────────────────────────────

/**
 * Bouw een volledige hybrid projection over `[currentAge, endAge]`.
 *
 * Zie module-header voor het algoritme-overzicht. Deze functie doet geen
 * nieuwe math — alle berekeningen komen uit `computeOpbouwProjection` en
 * `computeAfbouwSchedulePerAsset`; deze helper vertaalt hun outputs naar
 * één uniforme rij-structuur met stabiele per-asset/per-debt indices.
 */
export function computeHybridProjection(
  inputs: HybridProjectionInputs,
): HybridProjectionResult {
  const {
    assets: realAssets,
    debts,
    lifeEvents,
    cashflows: rawCashflows,
    currentAge,
    endAge,
    fireParams,
    endStrategy,
    endAgeConfig,
    legacyAmount,
    withdrawalStrategy,
    distributionStrategy,
    outflowDistribution,
    withdrawalOrder,
    hasPartner,
    yearlyRetirementExpenses,
    aowAge,
    savingsInflow,
  } = inputs
  // Backward-compat: `outflowDistribution` (Verdeling Afname — events) en
  // `withdrawalOrder` (afbouw-schedule) vallen beide terug op
  // `distributionStrategy` als ze niet gezet zijn. Zo behoudt oude caller-
  // code het pre-split gedrag (alle drie dezelfde).
  const effectiveOutflowDistribution = outflowDistribution ?? distributionStrategy
  const effectiveWithdrawalOrder = withdrawalOrder ?? distributionStrategy

  const grossReturn = fireParams.grossReturn
  const inflationRate = fireParams.inflationRate
  const afbouwReturn = fireParams.weightedGrossReturn ?? grossReturn
  const projectionYears = Math.max(0, endAge - currentAge)

  // 1. Injecteer AOW-cashflow wanneer geen AOW life-event bestaat.
  const cashflows = ensureAowCashflow(rawCashflows, aowAge, endAge, hasPartner, lifeEvents)
  // AOW-event-ids verzamelen voor is-AOW-detectie in event-splitsing.
  const aowEventIds: string[] = lifeEvents
    .filter((ev) => ev.event_type === 'aow' && ev.is_active !== false)
    .map((ev) => ev.id)

  // 2. Per-event per-year cashflow-matrix voor `computeOpbouwProjection`.
  // We geven alle cashflows als één geaggregeerde event-kolom mee — de
  // opbouw-engine heeft alleen het totaal nodig voor `annualCashflowNet`,
  // niet per-event-allocatie (die gebruiken we hier niet).
  const perEventYearlyCashflows: number[][] = cashflows.map((cf) => {
    const arr = new Array<number>(projectionYears).fill(0)
    for (let yr = 0; yr < projectionYears; yr++) {
      const yearStartAge = currentAge + yr
      const { total } = sumCashflowsForYear(
        [cf],
        yearStartAge,
        currentAge,
        inflationRate,
        aowEventIds,
      )
      arr[yr] = total
    }
    return arr
  })

  // 3. Draai opbouw-projectie over het volledige display-bereik tot endAge.
  // `crossoverMonth: null` — we knippen hier niet op FIRE, dat gebeurt per
  // fase-split hieronder.
  const opbouw = computeOpbouwProjection({
    assets: realAssets,
    debts,
    projectionYears,
    currentAge,
    crossoverMonth: null,
    hasPartner,
    perEventYearlyCashflows,
    // `AfbouwDistributionStrategy` → opbouw `AllocationStrategy` mapping.
    // `cash_first` en `lowest_return_first` zijn equivalent (zie G2) — beide
    // pakken de asset met laagste `expected_return` eerst.
    // `highest_return_first` routed naar `hoogste_rendement`.
    allocationStrategy:
      distributionStrategy === 'proportional'
        ? 'spreiden'
        : distributionStrategy === 'highest_return_first'
          ? 'hoogste_rendement'
          : 'cash_first',
    // Addendum III: outflow-events volgen Verdeling-Afname.
    outflowAllocationStrategy:
      effectiveOutflowDistribution === 'proportional'
        ? 'spreiden'
        : effectiveOutflowDistribution === 'highest_return_first'
          ? 'hoogste_rendement'
          : 'cash_first',
    savingsInflow,
  })

  // 4. Required-curve + snijpunt bepalen — beiden in termen van leeftijd.
  // Strategy-aware: per onttrekkingsstrategie wordt een andere required-
  // curve berekend (SWR = analytisch; guardrails/VPW/bucket = iteratief via
  // `simulateScheduleByStrategy`). Zo verandert de FIRE-leeftijd mee met de
  // gekozen strategie.
  // Per-asset context voor de required-solver: geef de werkelijke asset-mix
  // op elke leeftijd door, plus debt-saldos. Zo heeft `withdrawalOrder`
  // invloed op de kruising (niet alleen op de afbouw-rijen na-crossover).
  const numAssetsForCtx = opbouw.perAssetYearly.length
  const numDebtsForCtx = opbouw.perDebtYearly.length
  // Cumulatief Box 3 per jaar-index (anker voor de solver).
  const cumBox3PerYear = opbouw.yearlyRows.map((r) => r.cumulativeBox3Tax)

  const perAssetContext = {
    // `computeAfbouwSchedulePerAsset` verwacht assets + virtueel __savings
    // wanneer savingsInflow actief is. De opbouw-projectie heeft die al op
    // index 0 — we reconstrueren dezelfde shape hier.
    assets: ((): Asset[] => {
      const out: Asset[] = []
      if (savingsInflow) out.push(buildVirtualSavingsAssetForAfbouw(savingsInflow))
      out.push(...realAssets)
      return out
    })(),
    debts,
    getStartAssetWeights: (age: number): number[] | null => {
      const yearIdx = age - currentAge - 1
      if (yearIdx < 0 || yearIdx >= opbouw.yearlyRows.length) return null
      const values: number[] = []
      for (let i = 0; i < numAssetsForCtx; i++) {
        values.push(opbouw.perAssetYearly[i]?.[yearIdx]?.value ?? 0)
      }
      const sum = values.reduce((s, v) => s + v, 0)
      if (sum <= 0) return null
      return values.map(v => v / sum)
    },
    getStartDebtValues: (age: number): number[] => {
      const yearIdx = age - currentAge - 1
      if (yearIdx < 0 || yearIdx >= opbouw.yearlyRows.length) {
        return new Array<number>(numDebtsForCtx).fill(0)
      }
      const values: number[] = []
      for (let i = 0; i < numDebtsForCtx; i++) {
        values.push(opbouw.perDebtYearly[i]?.[yearIdx]?.value ?? 0)
      }
      return values
    },
    withdrawalOrder: effectiveWithdrawalOrder,
    currentAgeAnchor: currentAge,
    cumBox3StartAtAge: (age: number): number => {
      const yearIdx = age - currentAge - 1
      if (yearIdx < 0) return 0
      if (yearIdx >= cumBox3PerYear.length) return cumBox3PerYear.at(-1) ?? 0
      return cumBox3PerYear[yearIdx] ?? 0
    },
  }

  const required = computeAfbouwRequiredSchedule({
    currentAge,
    endAge,
    strategy: endStrategy,
    yearlyExpenses: yearlyRetirementExpenses,
    aowHousehold: hasPartner ? 'samenwonend' : 'alleenstaand',
    inflation: inflationRate,
    grossReturn,
    legacyAmount,
    aowAge,
    withdrawalStrategy,
    cashflows,
    perAssetContext,
  })

  const opbouwAgePoints = opbouw.yearlyRows.map((r) => ({ age: r.age, netWorth: r.netWorth }))
  let fireAge: number
  let fireAgeFractional: number | null

  if (endStrategy === 'pensioen') {
    // Pensioen-modus: forceer FIRE op AOW-leeftijd (rounded voor discrete grid).
    fireAge = Math.round(aowAge)
    // Fractionele variant: rekent met de exacte aowAge wanneer de curves
    // daar interpoleerbaar zijn, anders gewoon de discrete leeftijd.
    const interp = interpolateIntersection(opbouwAgePoints, required, fireAge)
    fireAgeFractional = Number.isFinite(interp) ? interp : aowAge
  } else {
    const inter = findIntersection(opbouwAgePoints, required)
    // Fallback: als geen kruising gevonden, FIRE buiten display-range plaatsen
    // zodat alle rijen in opbouw-fase blijven.
    fireAge = inter.age ?? endAge + 1
    fireAgeFractional = inter.fractional
  }

  // 5. Asset-meta bouwen — is input voor zowel pre- als post-fire rijen.
  const savingsLabel = savingsInflow?.label ?? SAVINGS_ASSET_LABEL
  const savingsColor = savingsInflow?.color ?? SAVINGS_ASSET_COLOR
  const assetMeta = buildAssetMeta(
    realAssets,
    !!savingsInflow,
    savingsLabel,
    savingsColor,
  )
  const debtMeta = buildDebtMeta(debts)

  const numAssets = assetMeta.length
  const numDebts = debtMeta.length

  // 6. Pre-fire rijen (age < fireAge) uit opbouw-projectie.
  // Fase-grens: we include rijen waar `age < fireAge`. De rij op age===fireAge
  // komt uit de afbouw-fase zodat stromen (withdrawal ≠ 0) kloppen.
  const rows: HybridYearRow[] = []

  let prevCumulativeTax = 0
  // Index van de opbouw-rij die als startpunt voor afbouw dient.
  // We starten afbouw vanaf `fireAge`, dus we lezen de waarden van het
  // jaar daarvoor (yearIdx waar age === fireAge - 1) als fire-startpunt.
  let fireStartYearIdx = -1

  for (let yr = 0; yr < opbouw.yearlyRows.length; yr++) {
    const opbouwRow = opbouw.yearlyRows[yr]
    if (opbouwRow.age >= fireAge) {
      if (fireStartYearIdx < 0) fireStartYearIdx = yr - 1
      break
    }

    // Per-asset values vanuit opbouw.perAssetYearly[i][yr].value (rounded al).
    const perAssetValues: number[] = []
    const perAssetGrowth: number[] = []
    const perAssetContribution: number[] = []
    const perAssetWithdrawal: number[] = []
    for (let i = 0; i < numAssets; i++) {
      const row = opbouw.perAssetYearly[i]?.[yr]
      perAssetValues.push(row?.value ?? 0)
      perAssetGrowth.push(row?.growth ?? 0)
      perAssetContribution.push(row?.contribution ?? 0)
      perAssetWithdrawal.push(0)
    }

    // Per-debt values uit perDebtYearly.
    const perDebtValues: number[] = []
    const perDebtInterest: number[] = []
    const perDebtRepayment: number[] = []
    for (let i = 0; i < numDebts; i++) {
      const row = opbouw.perDebtYearly[i]?.[yr]
      perDebtValues.push(row?.value ?? 0)
      perDebtInterest.push(row?.growth ?? 0)
      perDebtRepayment.push(Math.abs(row?.contribution ?? 0))
    }

    // AOW-splitsing: sommeer alle cashflows voor dit jaar, trek AOW af
    // van de event-cashflow zodat de UI beide kan tonen.
    const yearStartAge = opbouwRow.age
    const { total: cashflowTotal, aowPart } = sumCashflowsForYear(
      cashflows,
      yearStartAge,
      currentAge,
      inflationRate,
      aowEventIds,
    )

    // Box 3 delta dit jaar = cumulatief_dit_jaar − cumulatief_vorig_jaar.
    const box3TaxThisYear = opbouwRow.cumulativeBox3Tax - prevCumulativeTax
    prevCumulativeTax = opbouwRow.cumulativeBox3Tax

    // Portfolio-groei-som (uit per-asset growth-delta).
    const portfolioGrowthThisYear = perAssetGrowth.reduce((s, v) => s + v, 0)

    rows.push({
      age: opbouwRow.age,
      year: opbouwRow.year,
      phase: 'opbouw',
      assets: opbouwRow.assets,
      debts: opbouwRow.debts,
      netWorth: opbouwRow.netWorth,
      cumulativeBox3Tax: opbouwRow.cumulativeBox3Tax,
      box3TaxThisYear,
      perAssetValues,
      perDebtValues,
      savingsInflowThisYear: opbouwRow.savingsInflowThisYear ?? 0,
      eventCashflowNetThisYear: cashflowTotal - aowPart,
      aowIncomeThisYear: aowPart,
      withdrawalThisYear: 0,
      portfolioGrowthThisYear,
      perAssetGrowth,
      perAssetContribution,
      perAssetWithdrawal,
      perDebtInterest,
      perDebtRepayment,
    })
  }

  // Als de loop niet brak (geen fireAge in range), dan is fireStartYearIdx
  // nog -1; in dat geval zijn we klaar (geen afbouw-fase).
  // Als de loop brak omdat de eerste rij al >= fireAge, dan starten we
  // afbouw vanaf currentAge zelf; maar dat vereist een startkapitaal uit
  // de initiële input (niet uit opbouw).
  const hasAfbouwPhase = fireStartYearIdx >= -1 && fireAge <= endAge

  if (hasAfbouwPhase) {
    // Startwaarden voor afbouw: de opbouw-waarden op fireAge − 1 (einde
    // van het laatste opbouw-jaar). Als fireAge === currentAge (geen
    // opbouw-fase), gebruik dan de initiële asset/debt-waarden.
    let startAssetValues: number[]
    let startDebtValues: number[]

    if (fireStartYearIdx >= 0) {
      startAssetValues = []
      for (let i = 0; i < numAssets; i++) {
        startAssetValues.push(
          opbouw.perAssetYearly[i]?.[fireStartYearIdx]?.value ?? 0,
        )
      }
      startDebtValues = []
      for (let i = 0; i < numDebts; i++) {
        startDebtValues.push(
          opbouw.perDebtYearly[i]?.[fireStartYearIdx]?.value ?? 0,
        )
      }
    } else {
      // Geen opbouw-fase → direct van initiële input starten.
      startAssetValues = []
      if (savingsInflow) {
        // Virtueel savings-asset op index 0 start op 0.
        startAssetValues.push(0)
      }
      for (const a of realAssets) {
        startAssetValues.push(Number(a.current_value))
      }
      startDebtValues = debts.map((d) => Number(d.current_balance))
    }

    // Bouw de assets-array voor afbouw (virtueel savings op index 0 indien
    // aanwezig, echte assets daarna).
    const afbouwAssets: Asset[] = []
    if (savingsInflow) {
      afbouwAssets.push(buildVirtualSavingsAssetForAfbouw(savingsInflow))
    }
    afbouwAssets.push(...realAssets)

    // Bridge-rij op age = fireAge zodat de hybride lijn visueel aansluit
    // tussen opbouw en afbouw. Zonder deze snapshot zou de eerste afbouw-rij
    // al 1 jaar onttrekking bevatten en een scherpe kniek veroorzaken.
    // De waarden komen rechtstreeks uit de opbouw-eindwaarden (fireStartYearIdx).
    if (fireAge <= endAge && fireStartYearIdx >= 0) {
      const bridgeYearIdx = fireStartYearIdx + 1
      const lastOpbouwRow = opbouw.yearlyRows[fireStartYearIdx]
      const assetsSum = startAssetValues.reduce((s, v) => s + v, 0)
      const debtsSum = startDebtValues.reduce((s, v) => s + v, 0)
      rows.push({
        age: fireAge,
        year: bridgeYearIdx,
        phase: 'afbouw',
        assets: assetsSum,
        debts: debtsSum,
        netWorth: lastOpbouwRow.netWorth,
        cumulativeBox3Tax: prevCumulativeTax,
        box3TaxThisYear: 0,
        perAssetValues: [...startAssetValues],
        perDebtValues: [...startDebtValues],
        savingsInflowThisYear: 0,
        eventCashflowNetThisYear: 0,
        aowIncomeThisYear: 0,
        withdrawalThisYear: 0,
        portfolioGrowthThisYear: 0,
        perAssetGrowth: new Array<number>(numAssets).fill(0),
        perAssetContribution: new Array<number>(numAssets).fill(0),
        perAssetWithdrawal: new Array<number>(numAssets).fill(0),
        perDebtInterest: new Array<number>(numDebts).fill(0),
        perDebtRepayment: new Array<number>(numDebts).fill(0),
      })
    }

    // Afbouw-schedule vanaf `fireAge + 1` tot endAge (bridge-rij dekt fireAge).
    // `computeAfbouwSchedulePerAsset` levert rijen met age = retirementAge + y.
    const afbouwRetirementAge = fireStartYearIdx >= 0 ? fireAge + 1 : fireAge
    const afbouwRows = computeAfbouwSchedulePerAsset({
      startAssetValues,
      assets: afbouwAssets,
      startDebtValues,
      debts,
      retirementAge: afbouwRetirementAge,
      endAge,
      yearlyExpenses: yearlyRetirementExpenses,
      grossReturn: afbouwReturn,
      inflationRate,
      strategy: endStrategy,
      legacyAmount,
      withdrawalStrategy,
      // Afbouw-schedule gebruikt de **Onttrekkingsvolgorde** (eigen setting),
      // niet Verdeling Toename/Afname (die gaan over events). Addendum III +
      // aanvulling: `withdrawalOrder` stuurt de afbouw-distributie.
      distributionStrategy: effectiveWithdrawalOrder,
      cashflows,
      hasPartner,
      aowEventIds: aowEventIds.length > 0 ? aowEventIds : undefined,
      // Geef pre-fire cumulatieve Box 3 door zodat de deplete-solver het
      // totale netto-vermogen (incl. pre-fire tax) correct kan targeten.
      cumBox3Start: prevCumulativeTax,
      // Anker cashflow-inflatie op het werkelijke currentAge zodat AOW en
      // andere events de juiste nominale waarde krijgen (niet vanaf fireAge).
      currentAgeAnchor: currentAge,
    })

    // Cumulatieve Box 3 anker voor de afbouw-fase: begin met het
    // opbouw-eind-cumulatief. `computeAfbouwSchedulePerAsset` rekent echter
    // zelf vanaf 0 — we moeten het aggregated-veld `cumulativeBox3Tax`
    // offsetten zodat de totaal-trend klopt.
    const box3Offset = prevCumulativeTax

    for (const afbouwRow of afbouwRows) {
      // Zelfde lengte-conventies als pre-fire rijen.
      if (afbouwRow.perAssetValues.length !== numAssets) {
        throw new Error(
          `afbouw perAssetValues length mismatch: got ${afbouwRow.perAssetValues.length}, expected ${numAssets}`,
        )
      }
      if (afbouwRow.perDebtValues.length !== numDebts) {
        throw new Error(
          `afbouw perDebtValues length mismatch: got ${afbouwRow.perDebtValues.length}, expected ${numDebts}`,
        )
      }

      const perAssetContribution = new Array<number>(numAssets).fill(0)

      rows.push({
        age: afbouwRow.age,
        year: afbouwRow.year,
        phase: 'afbouw',
        assets: afbouwRow.assets,
        debts: afbouwRow.debts,
        netWorth: afbouwRow.netWorth - box3Offset,
        cumulativeBox3Tax: afbouwRow.cumulativeBox3Tax + box3Offset,
        box3TaxThisYear: afbouwRow.box3TaxThisYear,
        perAssetValues: afbouwRow.perAssetValues,
        perDebtValues: afbouwRow.perDebtValues,
        savingsInflowThisYear: 0,
        eventCashflowNetThisYear: afbouwRow.eventCashflowNetThisYear,
        aowIncomeThisYear: afbouwRow.aowIncomeThisYear,
        withdrawalThisYear: afbouwRow.withdrawal,
        portfolioGrowthThisYear: afbouwRow.growth,
        perAssetGrowth: afbouwRow.perAssetGrowth,
        perAssetContribution,
        perAssetWithdrawal: afbouwRow.perAssetWithdrawal,
        perDebtInterest: afbouwRow.perDebtInterest,
        perDebtRepayment: afbouwRow.perDebtRepayment,
      })
    }
  }

  // Pure opbouw-rijen (zonder afbouw-fase) voor chart-modes die decision-
  // inzicht willen tonen: "Beide" en "Alleen huidige". De kruising met de
  // required-curve valt zo exact samen met de FIRE-marker.
  const pureOpbouwRows = opbouw.yearlyRows.map((r) => ({
    age: r.age,
    netWorth: r.netWorth,
  }))

  return {
    rows,
    fireAge,
    fireAgeFractional,
    assetMeta,
    debtMeta,
    pureOpbouwRows,
    requiredSchedule: required,
  }
}
