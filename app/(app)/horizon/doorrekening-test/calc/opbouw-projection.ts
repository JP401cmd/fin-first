/**
 * Opbouw projection — pure helpers + bundled entry.
 *
 * Verplaatst uit `opbouw-client.tsx` (Fase 1a van
 * `doorrekening-overzicht-aggregatie.md`). Geen gedragswijziging: de helpers
 * zijn een-op-een overgezet. Het nieuwe bundel-entry
 * `computeOpbouwProjection` hergebruikt dezelfde functies om één samenhangend
 * resultaat te leveren dat later door zowel opbouw-client als overzicht
 * (aggregatie) kan worden geconsumeerd.
 *
 * Box 3 blijft bewust forfaitair-fictief (per user-keuze). NIET aligneren
 * met `lib/unified-projection.ts`.
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { NL_FICTIEF_BELEGGINGEN, BOX3_TARIEF } from '@/lib/constants'

// Heffingsvrij vermogen 2026 (single / partner)
const HEFFINGSVRIJ_SINGLE = 59_357
const HEFFINGSVRIJ_PARTNER = 118_714

// ── Virtuele savings-asset (Fase G1 — hybride doorrekening) ───
//
// De `savingsInflow`-parameter op `computeOpbouwProjection` injecteert een
// virtueel cash-asset dat puur de maandelijkse spaarquote vertegenwoordigt.
// Zo blijft de projectie "rekent in tabellen, niet in de grafiek": elke
// consumer ziet savings-inleg als een reguliere asset-layer in
// `perAssetYearly[0]` en in `yearlyRows[i].assets`, zonder extra math in de
// UI-laag.

/** Stabiele id voor het virtuele savings-asset; nooit botsend met echte UUID's. */
export const SAVINGS_ASSET_ID = '__savings'
/** Standaard legend-kleur (tailwind emerald-400). */
export const SAVINGS_ASSET_COLOR = '#34d399'
/** Standaard legend-label in NL. */
export const SAVINGS_ASSET_LABEL = 'Spaarquote-inleg'

/** Input voor een virtueel cash-asset dat een spaarquote-inleg modelleert. */
export interface SavingsInflowInput {
  /** Euro per maand die als virtuele savings-asset wordt toegevoegd. */
  monthlyAmount: number
  /** Label voor legend/tooltip. Default: `SAVINGS_ASSET_LABEL`. */
  label?: string
  /** Hex-kleur voor legend. Default: `SAVINGS_ASSET_COLOR`. */
  color?: string
}

// ── Shared types ──────────────────────────────────────────────

export interface YearRow {
  year: number
  value: number
  growth: number
  contribution: number
}

export interface MonthRow {
  month: number
  startValue: number
  rendement: number
  inleg: number
  endValue: number
}

export interface AmortizationRow {
  month: number
  startBalance: number
  interest: number
  repayment: number
  endBalance: number
}

export type AllocationStrategy = 'spreiden' | 'cash_first' | 'hoogste_rendement'

/** Per-event allocation record: how an event's cashflow was distributed across assets in a given year */
export interface EventAssetAllocation {
  /** Amount allocated to each asset (positive = deposit, negative = withdrawal) */
  perAsset: number[]
}

/** Result from simulateAssetsWithEvents including per-event allocation tracking */
export interface EventSimulationResult {
  yearlyAssetValues: number[][] /* [assetIdx][year] */
  /** Per-event per-year allocation details: [eventIdx][year] */
  yearlyEventAllocations: EventAssetAllocation[][]
}

// ── Projection helpers ────────────────────────────────────────

/**
 * Project an asset yearly, optionally stopping monthly contributions after
 * the crossover month (kruispunt). Returns continue after crossover.
 */
export function projectAssetYearly(asset: Asset, years: number, crossoverMonth?: number | null): YearRow[] {
  const monthlyRate = Number(asset.expected_return) / 100 / 12
  const monthlyContrib = Number(asset.monthly_contribution)
  const totalMonths = years * 12
  let value = Number(asset.current_value)

  // Month-by-month simulation with crossover-aware contributions
  const monthlyValues: number[] = []
  for (let m = 1; m <= totalMonths; m++) {
    const growth = value * monthlyRate
    // Stop contributions after crossover month (if set), but keep returns
    const contrib = (crossoverMonth != null && m > crossoverMonth) ? 0 : monthlyContrib
    value = Math.max(0, value + growth + contrib)
    monthlyValues.push(value)
  }

  const rows: YearRow[] = []
  for (let y = 1; y <= years; y++) {
    const idx = y * 12 - 1
    const prevIdx = (y - 1) * 12 - 1
    const prev = prevIdx >= 0 ? monthlyValues[prevIdx] : Number(asset.current_value)
    const curr = monthlyValues[idx] ?? prev
    // Sum actual contributions for this year
    let yearContrib = 0
    for (let m = (y - 1) * 12 + 1; m <= y * 12; m++) {
      if (crossoverMonth != null && m > crossoverMonth) continue
      yearContrib += monthlyContrib
    }
    rows.push({
      year: y,
      value: Math.round(curr),
      growth: Math.round(curr - prev - yearContrib),
      contribution: Math.round(yearContrib),
    })
  }
  return rows
}

export function projectDebtYearly(debt: Debt, years: number): YearRow[] {
  const monthlyRate = Number(debt.interest_rate) / 100 / 12
  const monthly = Number(debt.monthly_payment)
  let balance = Number(debt.current_balance)
  const rows: YearRow[] = []

  for (let y = 1; y <= years; y++) {
    let yearInterest = 0
    let yearPayment = 0
    for (let m = 0; m < 12; m++) {
      if (balance <= 0) break
      const interest = balance * monthlyRate
      yearInterest += interest
      const payment = Math.min(monthly, balance + interest)
      yearPayment += payment
      balance = Math.max(0, balance + interest - payment)
    }
    rows.push({
      year: y,
      value: Math.round(balance),
      growth: Math.round(yearInterest),
      contribution: Math.round(-yearPayment),
    })
  }
  return rows
}

// ── Box 3 belasting berekening ───────────────────────────────

/**
 * Bereken Box 3 belasting op basis van netto vermogen (peildatum 1 januari).
 * Fictief rendement × tarief, na aftrek heffingsvrij vermogen.
 */
export function computeBox3Tax(netWorth: number, hasPartner: boolean): number {
  const heffingsvrij = hasPartner ? HEFFINGSVRIJ_PARTNER : HEFFINGSVRIJ_SINGLE
  // Grondslag = netto vermogen minus heffingsvrij, minimaal 0
  const grondslag = Math.max(0, netWorth - heffingsvrij)
  // Fictief rendement over de grondslag
  const fictief = grondslag * NL_FICTIEF_BELEGGINGEN
  // Belasting = fictief rendement × tarief
  return Math.round(fictief * BOX3_TARIEF)
}

// ── Withdrawal strategy for life event impacts (features #665, #666) ────

/**
 * Apply a withdrawal from assets using the chosen strategy.
 * Mutates the `values` array in-place. Assets can never go below 0 —
 * any remainder cascades to the next asset.
 */
function applyWithdrawal(
  values: number[],
  assets: Asset[],
  amount: number,
  strategy: AllocationStrategy,
) {
  let remaining = amount

  if (strategy === 'spreiden') {
    // Proportional: withdraw from each asset by its value share
    const total = values.reduce((s, v) => s + v, 0)
    if (total <= 0) return
    for (let i = 0; i < values.length; i++) {
      const share = values[i] / total
      const withdraw = Math.min(values[i], remaining * share)
      values[i] -= withdraw
      remaining -= withdraw
    }
    // Handle rounding remainder — cascade through assets
    if (remaining > 0.01) {
      for (let i = 0; i < values.length; i++) {
        const withdraw = Math.min(values[i], remaining)
        values[i] -= withdraw
        remaining -= withdraw
        if (remaining <= 0.01) break
      }
    }
  } else if (strategy === 'cash_first') {
    // Cash first: withdraw from lowest-returning asset first
    const indices = assets.map((_, i) => i)
    indices.sort(
      (a, b) => Number(assets[a].expected_return) - Number(assets[b].expected_return),
    )
    for (const idx of indices) {
      if (remaining <= 0.01) break
      const withdraw = Math.min(values[idx], remaining)
      values[idx] -= withdraw
      remaining -= withdraw
    }
  } else {
    // hoogste_rendement: withdraw from highest-returning asset first
    const indices = assets.map((_, i) => i)
    indices.sort(
      (a, b) => Number(assets[b].expected_return) - Number(assets[a].expected_return),
    )
    for (const idx of indices) {
      if (remaining <= 0.01) break
      const withdraw = Math.min(values[idx], remaining)
      values[idx] -= withdraw
      remaining -= withdraw
    }
  }
}

/**
 * Apply a deposit (positive cashflow) to assets using the chosen strategy.
 * Mutates the `values` array in-place.
 */
function applyDeposit(
  values: number[],
  assets: Asset[],
  amount: number,
  strategy: AllocationStrategy,
) {
  if (values.length === 0) return

  if (strategy === 'spreiden') {
    // Proportional: distribute across assets by current value share
    const total = values.reduce((s, v) => s + v, 0)
    if (total > 0) {
      for (let i = 0; i < values.length; i++) {
        values[i] += amount * (values[i] / total)
      }
    } else {
      // All zero: distribute equally
      const share = amount / values.length
      for (let i = 0; i < values.length; i++) {
        values[i] += share
      }
    }
  } else if (strategy === 'cash_first') {
    // Cash first: add to lowest-returning asset first
    const indices = assets.map((_, i) => i)
    indices.sort(
      (a, b) => Number(assets[a].expected_return) - Number(assets[b].expected_return),
    )
    values[indices[0]] += amount
  } else {
    // hoogste_rendement: add to highest-returning asset first
    const indices = assets.map((_, i) => i)
    indices.sort(
      (a, b) => Number(assets[b].expected_return) - Number(assets[a].expected_return),
    )
    values[indices[0]] += amount
  }
}

/**
 * Run a joint month-by-month asset simulation that applies life event
 * cashflows each month via the chosen allocation strategy.
 *
 * Positive cashflows (income events) are deposited using `applyDeposit`.
 * Negative cashflows (expense events) are withdrawn using `applyWithdrawal`.
 *
 * Returns yearly snapshots (end of each 12-month period) per asset,
 * plus per-event allocation tracking for the TotalTable.
 */
export function simulateAssetsWithEvents(
  assets: Asset[],
  totalMonths: number,
  perEventYearlyCashflows: number[][],
  strategy: AllocationStrategy,
  crossoverMonth: number | null,
  /**
   * Addendum III: aparte strategie voor negatieve event-cashflows (outflow).
   * Default = `strategy` (backward-compat). Wanneer apart meegegeven volgen
   * negatieve events de Verdeling-Afname-setting en positieve events de
   * Verdeling-Toename-setting.
   */
  outflowStrategy?: AllocationStrategy,
): EventSimulationResult {
  const depositStrategy = strategy
  const withdrawalStrategy = outflowStrategy ?? strategy
  const numEvents = perEventYearlyCashflows.length
  // Initialize per-asset values
  const values = assets.map((a) => Number(a.current_value))
  const rates = assets.map((a) => Number(a.expected_return) / 100 / 12)
  const contribs = assets.map((a) => Number(a.monthly_contribution))

  // Convert per-event yearly cashflows to monthly by dividing evenly across 12 months.
  // monthlyPerEvent: Map<month, number[]> where number[] is per-event monthly cashflow
  const monthlyPerEvent = new Map<number, number[]>()
  for (let ei = 0; ei < numEvents; ei++) {
    const yearlyCf = perEventYearlyCashflows[ei]
    for (let yr = 0; yr < yearlyCf.length; yr++) {
      const annual = yearlyCf[yr]
      if (annual === 0) continue
      const monthly = annual / 12
      for (let m = yr * 12 + 1; m <= (yr + 1) * 12 && m <= totalMonths; m++) {
        let arr = monthlyPerEvent.get(m)
        if (!arr) { arr = new Array(numEvents).fill(0); monthlyPerEvent.set(m, arr) }
        arr[ei] += monthly
      }
    }
  }

  // Track yearly snapshots (end of each 12-month period)
  const yearlyValues: number[][] = assets.map(() => [])
  // Track per-event per-year cumulative allocations per asset
  // yearlyAllocAccum[eventIdx][assetIdx] accumulates within the current year
  const yearlyAllocAccum: number[][] = Array.from({ length: numEvents }, () => new Array(assets.length).fill(0))
  const yearlyEventAllocations: EventAssetAllocation[][] = Array.from({ length: numEvents }, () => [])

  for (let m = 1; m <= totalMonths; m++) {
    // 1. Apply returns
    for (let i = 0; i < values.length; i++) {
      values[i] += values[i] * rates[i]
    }

    // 2. Apply contributions (stop after crossover)
    for (let i = 0; i < values.length; i++) {
      if (crossoverMonth != null && m > crossoverMonth) continue
      values[i] += contribs[i]
    }

    // 3. Apply per-event cashflows using the chosen allocation strategy
    const evCfs = monthlyPerEvent.get(m)
    if (evCfs) {
      for (let ei = 0; ei < numEvents; ei++) {
        const cf = evCfs[ei]
        if (cf === 0) continue
        // Snapshot before applying this event to track per-asset delta
        const before = values.slice()
        if (cf < 0) {
          applyWithdrawal(values, assets, -cf, withdrawalStrategy)
        } else {
          applyDeposit(values, assets, cf, depositStrategy)
        }
        // Record per-asset delta for this event
        for (let ai = 0; ai < assets.length; ai++) {
          yearlyAllocAccum[ei][ai] += values[ai] - before[ai]
        }
      }
    }

    // Ensure no negative values
    for (let i = 0; i < values.length; i++) {
      values[i] = Math.max(0, values[i])
    }

    // Record yearly snapshot at end of each 12-month period
    if (m % 12 === 0) {
      for (let i = 0; i < values.length; i++) {
        yearlyValues[i].push(Math.round(values[i]))
      }
      // Record and reset per-event allocation accumulators
      for (let ei = 0; ei < numEvents; ei++) {
        yearlyEventAllocations[ei].push({ perAsset: yearlyAllocAccum[ei].map(v => Math.round(v)) })
        yearlyAllocAccum[ei].fill(0)
      }
    }
  }

  return { yearlyAssetValues: yearlyValues, yearlyEventAllocations }
}

// ── Per-asset monthly & amortization detail ───────────────────

export function computeAssetMonthly(asset: Asset, totalMonths: number, crossoverMonth?: number | null): MonthRow[] {
  const monthlyRate = Number(asset.expected_return) / 100 / 12
  const monthlyContrib = Number(asset.monthly_contribution)
  let value = Number(asset.current_value)
  const rows: MonthRow[] = []

  for (let m = 1; m <= totalMonths; m++) {
    const startValue = value
    const rendement = startValue * monthlyRate
    // Stop contributions after crossover month, returns continue
    const inleg = (crossoverMonth != null && m > crossoverMonth) ? 0 : monthlyContrib
    const endValue = startValue + rendement + inleg
    rows.push({
      month: m,
      startValue: Math.round(startValue * 100) / 100,
      rendement: Math.round(rendement * 100) / 100,
      inleg: Math.round(inleg * 100) / 100,
      endValue: Math.round(endValue * 100) / 100,
    })
    value = endValue
  }
  return rows
}

export function computeAmortization(debt: Debt, maxMonths: number): AmortizationRow[] {
  const monthlyRate = Number(debt.interest_rate) / 100 / 12
  const monthly = Number(debt.monthly_payment)
  let balance = Number(debt.current_balance)
  const rows: AmortizationRow[] = []

  for (let m = 1; m <= maxMonths; m++) {
    if (balance <= 0.005) break
    const interest = balance * monthlyRate
    const payment = Math.min(monthly, balance + interest)
    const repayment = payment - interest
    const endBalance = Math.max(0, balance - repayment)

    rows.push({
      month: m,
      startBalance: Math.round(balance * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      repayment: Math.round(repayment * 100) / 100,
      endBalance: Math.round(endBalance * 100) / 100,
    })

    balance = endBalance
  }
  return rows
}

// ── Bundled entry: computeOpbouwProjection ───────────────────

export interface OpbouwProjectionInputs {
  assets: Asset[]
  debts: Debt[]
  /** Aantal jaren om vooruit te projecteren. */
  projectionYears: number
  /** Huidige leeftijd; rows krijgen `age = currentAge + yr`. */
  currentAge: number
  /** Kruispunt-maand (startMaand = 1). `null` → contributions blijven altijd lopen. */
  crossoverMonth: number | null
  /** Partner-status voor Box 3 heffingsvrij. */
  hasPartner: boolean
  /** Per-event per-jaar netto cashflow. Lege array = geen events. */
  perEventYearlyCashflows: number[][]
  /** Allocatie-strategie voor event-cashflows over assets. */
  allocationStrategy: AllocationStrategy
  /**
   * Addendum III: aparte strategie voor negatieve event-cashflows (outflow)
   * binnen de opbouw-fase. Default = `allocationStrategy` — zodat callers
   * die alleen inflow-gedrag willen tunen de oude semantiek behouden.
   */
  outflowAllocationStrategy?: AllocationStrategy
  /** Jaarlijkse sparen-inleg; wordt per jaar opgenomen totdat crossover bereikt is. */
  annualSavings?: number
  /**
   * Virtueel cash-asset dat de spaarquote-inleg modelleert. Wanneer gezet
   * wordt er een extra asset **vóór** de echte assets geprepend: alle
   * outputs (`perAssetYearly`, `yearlyRows[i].assets`) bevatten deze layer
   * op index 0. Zonder deze parameter blijft het gedrag exact identiek aan
   * de pre-G1-implementatie.
   */
  savingsInflow?: SavingsInflowInput
}

export interface OpbouwProjectionRow {
  year: number
  age: number
  /** Totaal per-asset eind-jaar (incl. net_worth_inclusion_pct). */
  assets: number
  /** Totaal schulden eind-jaar. */
  debts: number
  /** assets − debts − cumulativeBox3Tax. */
  netWorth: number
  cumulativeBox3Tax: number
  /** Geaggregeerde event-cashflows (sum over events) dat jaar. */
  annualCashflowNet: number
  /** Contributions dat jaar (stopt na crossoverMonth). */
  annualSavings: number
  /**
   * Totale savings-inleg dit jaar (savingsInflow.monthlyAmount × 12 pre-
   * crossover, 0 post-crossover). `undefined` wanneer `savingsInflow` niet
   * gezet is — backward-compat met pre-G1-consumers.
   */
  savingsInflowThisYear?: number
}

export interface OpbouwProjectionResult {
  yearlyRows: OpbouwProjectionRow[]
  perAssetYearly: YearRow[][]
  perDebtYearly: YearRow[][]
  perEventYearlyCashflows: number[][]
}

/**
 * Bouw een virtueel cash-asset dat de spaarquote-inleg modelleert.
 *
 * Het virtuele asset wordt behandeld als een reguliere `Asset` door alle
 * bestaande helpers (`projectAssetYearly`, `simulateAssetsWithEvents`): het
 * heeft `asset_type: 'cash'`, `expected_return: 0` en een monthly
 * contribution gelijk aan de opgegeven inleg. Alle overige velden krijgen
 * defensieve defaults zodat downstream code (bijv. legend, inclusion-pct,
 * household-filter) het asset correct kan renderen zonder null-checks.
 */
function buildVirtualSavingsAsset(inflow: SavingsInflowInput): Asset {
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
    monthly_contribution: inflow.monthlyAmount,
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
    // Virtual savings-asset modelleert alleen inleg, geen app-tracking.
    // Defaults matchen het databaseschema zodat helpers die op `Asset`
    // vertrouwen niet over undefined struikelen.
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
  }
}

/**
 * Bundle-entry die alle pure helpers samenbrengt tot één resultaat.
 *
 * Bedoeld als bron voor zowel opbouw-client (drill-down tabellen) als
 * overzicht (aggregatie-chart). De `netWorth`-waarde gebruikt hier
 * uitsluitend opbouw's eigen formules (Box 3 forfaitair, asset-projecties
 * via `projectAssetYearly`/`simulateAssetsWithEvents`) — **niet**
 * `runSimulation`.
 *
 * Wanneer `inputs.savingsInflow` gezet is wordt er een virtueel cash-asset
 * vooraan de interne assets-lijst gezet. Alle outputs (`perAssetYearly`,
 * event-allocation-arrays, `yearlyRows[i].assets`) gebruiken dan index 0
 * voor savings en `[1..]` voor de echte assets. Zonder de parameter blijft
 * het gedrag exact identiek aan de pre-G1-implementatie (backward-compat).
 */
export function computeOpbouwProjection(inputs: OpbouwProjectionInputs): OpbouwProjectionResult {
  const {
    assets: realAssets,
    debts,
    projectionYears,
    currentAge,
    crossoverMonth,
    hasPartner,
    perEventYearlyCashflows,
    allocationStrategy,
    savingsInflow,
  } = inputs

  // Prepend het virtuele savings-asset wanneer `savingsInflow` gezet is; anders
  // blijft `assets` een pure verwijzing naar `realAssets`. Zo zijn
  // index-posities identiek aan vroeger wanneer savingsInflow ontbreekt.
  const virtualSavingsAsset = savingsInflow ? buildVirtualSavingsAsset(savingsInflow) : null
  const assets: Asset[] = virtualSavingsAsset ? [virtualSavingsAsset, ...realAssets] : realAssets

  // Event-cashflows moeten qua event-as exact hetzelfde blijven; de asset-as
  // wordt intern door `simulateAssetsWithEvents` uit `assets.length` afgeleid,
  // dus geen padding hier nodig.

  const totalMonths = projectionYears * 12
  const inclusionWeights = assets.map(a => (a.net_worth_inclusion_pct ?? 100) / 100)

  // Per-asset yearly projections — events OFF (base case).
  const perAssetYearly: YearRow[][] = assets.map(a => projectAssetYearly(a, projectionYears, crossoverMonth))
  const perDebtYearly: YearRow[][] = debts.map(d => projectDebtYearly(d, projectionYears))

  // If any events have non-zero cashflow, run the joint event-aware sim to
  // get event-adjusted per-asset yearly values. Otherwise fall back to the
  // plain per-asset projections above.
  const hasEvents = perEventYearlyCashflows.some(evCf => evCf.some(v => v !== 0))
  const eventSim = hasEvents
    ? simulateAssetsWithEvents(assets, totalMonths, perEventYearlyCashflows, allocationStrategy, crossoverMonth, inputs.outflowAllocationStrategy)
    : null

  // Pre-bereken savingsInflowThisYear per jaar: monthlyAmount × 12 zolang we
  // pre-crossover zijn (t.o.v. jaar-einde-maand), 0 zodra het jaar volledig
  // na crossoverMonth ligt. Voor het crossover-jaar zelf rekenen we exact
  // het aantal maanden vóór crossoverMonth × monthlyAmount (consistent met
  // `projectAssetYearly` dat monthly-contribs stopt strikt ná crossoverMonth).
  const savingsYearlyTotals: number[] = []
  if (savingsInflow) {
    const monthly = savingsInflow.monthlyAmount
    for (let yr = 0; yr < projectionYears; yr++) {
      let yearTotal = 0
      for (let m = yr * 12 + 1; m <= (yr + 1) * 12; m++) {
        if (crossoverMonth != null && m > crossoverMonth) continue
        yearTotal += monthly
      }
      savingsYearlyTotals.push(yearTotal)
    }
  }

  const yearlyRows: OpbouwProjectionRow[] = []
  let cumulativeBox3Tax = 0

  for (let yr = 0; yr < projectionYears; yr++) {
    // Total assets (weighted by inclusion %).
    let assetSum = 0
    if (eventSim) {
      for (let i = 0; i < assets.length; i++) {
        assetSum += (eventSim.yearlyAssetValues[i]?.[yr] ?? 0) * inclusionWeights[i]
      }
    } else {
      for (let i = 0; i < assets.length; i++) {
        assetSum += (perAssetYearly[i]?.[yr]?.value ?? 0) * inclusionWeights[i]
      }
    }

    // Total debts (unweighted).
    let debtSum = 0
    for (let i = 0; i < debts.length; i++) {
      debtSum += perDebtYearly[i]?.[yr]?.value ?? 0
    }

    // Box 3 op netto na vorige jaren belasting (peildatum-logica: vorige cumulatief).
    const rawNet = assetSum - debtSum
    const preTaxNet = rawNet - cumulativeBox3Tax
    const yearTax = computeBox3Tax(preTaxNet, hasPartner)
    cumulativeBox3Tax += yearTax
    const netWorth = rawNet - cumulativeBox3Tax

    // Aggregate event cashflow this year (sum over events).
    let annualCashflowNet = 0
    for (let ei = 0; ei < perEventYearlyCashflows.length; ei++) {
      annualCashflowNet += perEventYearlyCashflows[ei]?.[yr] ?? 0
    }

    // Contributions this year (from per-asset projections, already crossover-aware).
    let annualContribYear = 0
    for (let i = 0; i < assets.length; i++) {
      annualContribYear += perAssetYearly[i]?.[yr]?.contribution ?? 0
    }

    const row: OpbouwProjectionRow = {
      year: yr + 1,
      age: currentAge + yr,
      assets: assetSum,
      debts: debtSum,
      netWorth,
      cumulativeBox3Tax,
      annualCashflowNet,
      annualSavings: annualContribYear,
    }
    if (savingsInflow) {
      row.savingsInflowThisYear = savingsYearlyTotals[yr] ?? 0
    }
    yearlyRows.push(row)
  }

  return {
    yearlyRows,
    perAssetYearly,
    perDebtYearly,
    perEventYearlyCashflows,
  }
}
