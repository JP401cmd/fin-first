/**
 * Wealth composition projection engine.
 *
 * Groups 13 asset_types into 5 wealth layers + debts as a 6th (negative) layer.
 * Projects each group forward using individual asset returns and contributions,
 * models debt repayment per repayment_type, and distributes post-FIRE
 * withdrawals over liquid categories.
 */

import {
  type Asset,
  type AssetType,
  ASSET_TYPE_COLORS,
  ASSET_TYPE_LABELS,
  resolveDepreciation,
} from './asset-data'
import { resolveExpectedReturnPct } from './asset-return'
import {
  type Debt,
  type DebtType,
  DEBT_TYPE_COLORS,
  type RepaymentType,
  amortizationSchedule,
  linearAmortization,
  interestOnlySchedule,
} from './debt-data'
import type { SimRow } from './fire-simulation'
import type { UnifiedProjectionRow } from './unified-projection'

// ── Wealth Groups ───────────────────────────────────────────

export type WealthGroup =
  | 'spaargeld'
  | 'beleggingen'
  | 'pensioen'
  | 'vastgoed'
  | 'overig'

/**
 * Maps each of the 13 asset_types into one of 5 wealth groups.
 */
export const WEALTH_GROUPS: Record<AssetType, WealthGroup> = {
  cash: 'spaargeld',
  savings: 'spaargeld',
  investment: 'beleggingen',
  retirement: 'pensioen',
  levensverzekering: 'pensioen',
  eigen_huis: 'vastgoed',
  real_estate: 'vastgoed',
  crypto: 'overig',
  vehicle: 'overig',
  physical: 'overig',
  deelneming: 'overig',
  vordering: 'overig',
  other: 'overig',
}

export const WEALTH_GROUP_LABELS: Record<WealthGroup, string> = {
  spaargeld: 'Spaargeld',
  beleggingen: 'Beleggingen',
  pensioen: 'Pensioen',
  vastgoed: 'Vastgoed',
  overig: 'Overig',
}

/**
 * Derived from ASSET_TYPE_COLORS — pick representative colour per group.
 * Waarden zijn accent-aware `var(--color-kern-N)` (monochrome kern-ladder langs
 * de liquiditeits-as), niet de losse regenboog die deze comments ooit suggereerden.
 */
export const WEALTH_GROUP_COLORS: Record<WealthGroup, string> = {
  spaargeld: ASSET_TYPE_COLORS.savings,      // kern-700
  beleggingen: ASSET_TYPE_COLORS.investment, // kern-500
  pensioen: ASSET_TYPE_COLORS.retirement,    // kern-500
  vastgoed: ASSET_TYPE_COLORS.real_estate,   // kern-400
  overig: ASSET_TYPE_COLORS.other,           // kern-200
}

/** Colour for the debt (negative) layer */
export const DEBT_LAYER_COLOR = '#ef4444' // red-500

export const DEBT_LAYER_LABEL = 'Schulden'

/**
 * Schuldsoorten in de opbouw-staaf, in stapelvolgorde vanaf de nullijn. Tinten uit
 * de schuld-roodladder (`DEBT_TYPE_COLORS`, klasse I → III) plus een lichtere voor
 * de opeethypotheek; de tekort-lening houdt het risico-rood — die is een signaal.
 */
export type DebtLayer = 'hypotheek' | 'overig' | 'opeethypotheek' | 'tekortLening'

export const DEBT_LAYERS: readonly DebtLayer[] = ['hypotheek', 'overig', 'opeethypotheek', 'tekortLening']

export const DEBT_LAYER_FIELD = {
  hypotheek: 'schuldHypotheek',
  overig: 'schuldOverig',
  opeethypotheek: 'schuldOpeethypotheek',
  tekortLening: 'schuldTekortLening',
} as const satisfies Record<DebtLayer, keyof StackedRow>

export const DEBT_LAYER_LABELS: Record<DebtLayer, string> = {
  hypotheek: 'Hypotheek',
  overig: 'Overige schulden',
  opeethypotheek: 'Opeethypotheek',
  tekortLening: 'Tekort-lening',
}

export const DEBT_LAYER_COLORS: Record<DebtLayer, string> = {
  hypotheek: DEBT_TYPE_COLORS.mortgage, // oklch(0.50 0.09 25)
  overig: DEBT_TYPE_COLORS.payment_plan, // oklch(0.66 0.07 25)
  opeethypotheek: 'oklch(0.78 0.06 25)',
  tekortLening: DEBT_LAYER_COLOR,
}

// ── Buiten-doel-markering (gedeeld over grafiek én kassabon) ─

/**
 * Eén zin voor "dit bezit staat er wel, maar telt niet mee voor je doel".
 *
 * Twee oppervlakken zeggen dit: de Opbouw-grafiek (duidingsregel onder de
 * legenda) en de jaar-detail-kassabon (sub-regel bij de eigen woning). De
 * DRAGER mag per oppervlak verschillen — een vlak en een tekstregel hebben
 * andere middelen — maar de WOORDEN niet. Vandaar één constante.
 * Besluit 19-09-2026 bij ADR 0114 D3.
 */
export const BUITEN_DOEL_ZIN = 'telt niet mee voor je doel — je woont er'

/**
 * Inkttoken voor alles wat "telt niet mee" is. `--ink-meta` (niet `--ink-3`):
 * dat token is gemaakt voor kleine metadata-tekst en draagt een gemeten 5,41:1
 * op `--paper`, mét print-fallback in globals.css.
 */
export const BUITEN_DOEL_INKT = 'var(--ink-meta)'

/**
 * Eén naam voor de eigen woning, app-breed. Eerder heette hetzelfde blok
 * "Eigen huis" in de grafieklegenda en "Eigen woning" in de kassabon; dat is
 * één begrip met twee namen. `ASSET_TYPE_LABELS` is de app-brede bron.
 * (De kernel-CATEGORIE heet intern nog 'Eigen huis' — dat is een rekenbegrip,
 * geen schermtekst, en blijft ongemoeid.)
 */
export const EIGEN_WONING_LABEL = ASSET_TYPE_LABELS.eigen_huis
export const EIGEN_WONING_HYPOTHEEK_LABEL = `Hypotheek ${EIGEN_WONING_LABEL.toLowerCase()}`

// ── Types ───────────────────────────────────────────────────

export interface StackedRow {
  age: number
  spaargeld: number
  beleggingen: number
  pensioen: number
  vastgoed: number
  overig: number
  /**
   * Het deel van `vastgoed` dat de EIGEN WONING is (`eigen_huis`); afwezig = geen
   * eigen woning in deze rij. Bestaat omdat `vastgoed` ook beleggingsvastgoed
   * (`real_estate`) draagt, terwijl de woonstrategie 'Uitsluiten' uitsluitend het
   * eigen huis buiten de FIRE-pot zet (`filterAssetsForFire`). Zonder deze
   * splitsing kan een weergave die het uitgesloten huis wil dempen niet anders
   * dan de hele band dempen — en daarmee bezit dempen dat wél meetelt.
   */
  vastgoedEigenHuis?: number
  /** Negative value representing total outstanding debt */
  schulden: number
  /** Opsplitsing van `schulden` per soort (negatief); afwezig = alleen het totaal bekend. */
  schuldHypotheek?: number
  schuldOverig?: number
  schuldOpeethypotheek?: number
  schuldTekortLening?: number
  /**
   * Het deel van `schuldHypotheek` (negatief) dat aan de eigen woning gekoppeld is;
   * afwezig = onbekend of niet van toepassing. Tegenhanger van `vastgoedEigenHuis`:
   * 'Uitsluiten' haalt het huis én zijn gekoppelde hypotheek uit de FIRE-pot, een
   * hypotheek op een ánder pand blijft meetellen.
   */
  schuldEigenHuisHypotheek?: number
  /** Opname uit de opeethypotheek dit jaar (instroom, geen voorraad); afwezig = geen. */
  opeetOpname?: number
}

// ── Helpers ─────────────────────────────────────────────────

const ALL_GROUPS: WealthGroup[] = ['spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig']

/**
 * Project a single asset value year-by-year using compound growth + linear contributions.
 * value(year) = currentValue * (1 + expectedReturn)^year + monthlyContribution * 12 * year
 */
function projectAssetByYear(
  currentValue: number,
  expectedReturn: number,   // annual decimal, e.g. 0.07
  monthlyContribution: number,
  years: number,
  depreciation?: { rate: number; baseValue: number } | null,
): number[] {
  // Linear depreciation path: fixed annual write-off based on purchase value
  if (depreciation && depreciation.rate > 0) {
    const annualDep = depreciation.baseValue * (depreciation.rate / 100)
    const values: number[] = []
    let value = currentValue
    for (let y = 0; y <= years; y++) {
      values.push(Math.max(0, value))
      value = value - annualDep + monthlyContribution * 12
      if (value < 0) value = 0
    }
    return values
  }

  const values: number[] = []
  for (let y = 0; y <= years; y++) {
    const compounded = currentValue * Math.pow(1 + expectedReturn, y)
    const contributed = monthlyContribution * 12 * y
    values.push(compounded + contributed)
  }
  return values
}

/**
 * Project a single debt's remaining balance year-by-year.
 * Branches on repayment_type: annuiteit, lineair, aflossingsvrij.
 */
function projectDebtByYear(debt: Debt, years: number): number[] {
  const balance = Number(debt.current_balance)
  const rate = Number(debt.interest_rate)
  const payment = Number(debt.monthly_payment)
  const repaymentType = debt.repayment_type as RepaymentType | null
  const totalMonths = years * 12

  if (balance <= 0) {
    return new Array(years + 1).fill(0)
  }

  // Get monthly schedule then sample yearly
  let monthlyBalances: number[]

  if (repaymentType === 'aflossingsvrij') {
    let endMonths = totalMonths
    if (debt.end_date) {
      const end = new Date(debt.end_date)
      const now = new Date()
      endMonths = Math.max(0, Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    }
    const schedule = interestOnlySchedule(balance, rate, Math.min(totalMonths, endMonths))
    monthlyBalances = [balance]
    for (let m = 1; m <= totalMonths; m++) {
      if (m <= schedule.length) {
        monthlyBalances.push(schedule[m - 1].balance)
      } else {
        monthlyBalances.push(0) // balloon payment assumed after end date
      }
    }
  } else if (repaymentType === 'lineair') {
    let termMonths = 360
    if (debt.end_date) {
      const end = new Date(debt.end_date)
      const now = new Date()
      termMonths = Math.max(1, Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    } else if (payment > 0) {
      const monthlyRate = rate / 100 / 12
      const approxPrincipal = payment - (balance * monthlyRate / 2)
      if (approxPrincipal > 0) termMonths = Math.ceil(balance / approxPrincipal)
    }
    const schedule = linearAmortization(balance, rate, termMonths)
    monthlyBalances = [balance]
    for (let m = 1; m <= totalMonths; m++) {
      if (m <= schedule.length) {
        monthlyBalances.push(schedule[m - 1].balance)
      } else {
        monthlyBalances.push(0)
      }
    }
  } else {
    // Default: annuity
    if (payment <= 0) {
      // No payment — balance stays static
      return new Array(years + 1).fill(balance)
    }
    const schedule = amortizationSchedule(balance, rate, payment)
    monthlyBalances = [balance]
    for (let m = 1; m <= totalMonths; m++) {
      if (m <= schedule.length) {
        monthlyBalances.push(schedule[m - 1].balance)
      } else {
        monthlyBalances.push(0)
      }
    }
  }

  // Sample at year boundaries (month 0, 12, 24, …)
  const yearly: number[] = []
  for (let y = 0; y <= years; y++) {
    const m = y * 12
    yearly.push(m < monthlyBalances.length ? monthlyBalances[m] : 0)
  }
  return yearly
}

// ── Main projection ─────────────────────────────────────────

export interface ProjectWealthCompositionInput {
  assets: Asset[]
  debts: Debt[]
  currentAge: number
  endAge: number
  inflation: number    // annual decimal, e.g. 0.02
  fireAge?: number     // if set, withdrawals start at this age
  annualExpenses?: number // yearly spending (needed for post-FIRE withdrawals)
  /**
   * Profielrendement in PROCENTEN als terugval voor een bezitting zonder eigen
   * rendementsaanname (`expected_return = null`, ADR 0166) — keuze (a), dezelfde
   * ketting als `potRendement` in de kernel. Weggelaten → 0 (oude nul-basis).
   */
  terugvalRendementPct?: number
}

/**
 * Project wealth composition per group from currentAge to endAge.
 *
 * - Per asset group: compound growth using individual expected_return + monthly_contribution
 * - Per debt: amortization based on repayment_type
 * - After FIRE age: distribute inflation-adjusted annual expenses over liquid categories
 *   (beleggingen first, then spaargeld)
 *
 * @deprecated Gebruik `unifiedRowsToStackedRows()` met UnifiedProjectionRow[] voor
 * werkelijke per-asset-type data inclusief life events en correcte Box 3 per type.
 */
export function projectWealthComposition(
  input: ProjectWealthCompositionInput,
): StackedRow[] {
  const { assets, debts, currentAge, endAge, inflation, fireAge, annualExpenses, terugvalRendementPct = 0 } = input

  const years = Math.max(0, endAge - currentAge)
  if (years === 0) return []

  const activeAssets = assets.filter(a => a.is_active)
  const activeDebts = debts.filter(d => d.is_active && Number(d.current_balance) > 0)

  // Project each asset year-by-year
  const assetProjections = activeAssets.map(a => {
    const depreciation = resolveDepreciation(a)
    return {
      group: WEALTH_GROUPS[a.asset_type],
      values: projectAssetByYear(
        Number(a.current_value),
        // NULL → terugval (ADR 0166), nooit stil 0% via `Number(null)`.
        depreciation ? 0 : resolveExpectedReturnPct(a.expected_return, terugvalRendementPct) / 100,
        Number(a.monthly_contribution),
        years,
        depreciation,
      ),
    }
  })

  // Project each debt year-by-year
  const debtProjections = activeDebts.map(d => projectDebtByYear(d, years))

  // Aggregate per group per year
  const rows: StackedRow[] = []

  // Track running group values for withdrawal adjustments
  const groupValues: Record<WealthGroup, number[]> = {
    spaargeld: new Array(years + 1).fill(0),
    beleggingen: new Array(years + 1).fill(0),
    pensioen: new Array(years + 1).fill(0),
    vastgoed: new Array(years + 1).fill(0),
    overig: new Array(years + 1).fill(0),
  }

  // Sum asset projections into groups
  for (const ap of assetProjections) {
    for (let y = 0; y <= years; y++) {
      groupValues[ap.group][y] += ap.values[y]
    }
  }

  // Sum debt projections
  const debtTotals = new Array(years + 1).fill(0)
  for (const dp of debtProjections) {
    for (let y = 0; y <= years; y++) {
      debtTotals[y] += dp[y]
    }
  }

  // Apply post-FIRE withdrawals — subtract from liquid groups
  if (fireAge != null && annualExpenses != null && annualExpenses > 0) {
    for (let y = 0; y <= years; y++) {
      const age = currentAge + y
      if (age < fireAge) continue

      // Inflation-adjusted annual withdrawal
      const yearsAfterFire = age - fireAge
      const withdrawal = annualExpenses * Math.pow(1 + inflation, yearsAfterFire)

      // Also stop contributions after FIRE (already projected — subtract them)
      // Note: we keep the projection as-is and only subtract the withdrawal amount.
      // This is a simplification; contributions are assumed to stop.

      let remaining = withdrawal

      // Draw from beleggingen first
      if (remaining > 0 && groupValues.beleggingen[y] > 0) {
        const draw = Math.min(remaining, groupValues.beleggingen[y])
        groupValues.beleggingen[y] -= draw
        remaining -= draw
      }

      // Then from spaargeld
      if (remaining > 0 && groupValues.spaargeld[y] > 0) {
        const draw = Math.min(remaining, groupValues.spaargeld[y])
        groupValues.spaargeld[y] -= draw
        remaining -= draw
      }

      // If still remaining, draw from overig
      if (remaining > 0 && groupValues.overig[y] > 0) {
        const draw = Math.min(remaining, groupValues.overig[y])
        groupValues.overig[y] -= draw
        remaining -= draw
      }
    }
  }

  // Build StackedRow array
  for (let y = 0; y <= years; y++) {
    rows.push({
      age: currentAge + y,
      spaargeld: Math.round(groupValues.spaargeld[y]),
      beleggingen: Math.round(groupValues.beleggingen[y]),
      pensioen: Math.round(groupValues.pensioen[y]),
      vastgoed: Math.round(groupValues.vastgoed[y]),
      overig: Math.round(groupValues.overig[y]),
      schulden: -Math.round(debtTotals[y]),  // negative
    })
  }

  return rows
}

// ── Ratio-based engine (SimRow as source of truth) ──────────

/**
 * Derive wealth composition from SimRows.
 *
 * Instead of independently projecting total portfolio value, this function:
 * 1. Groups assets by WEALTH_GROUPS and computes per-group weighted return + initial value + contribution
 * 2. Runs a theoretical running-balance per group (compound growth)
 * 3. After FIRE: stops contributions, applies waterfall withdrawals
 *    (beleggingen → spaargeld → overig → pensioen → vastgoed)
 * 4. Converts group balances to ratios (floor 0, normalise to 100%)
 * 5. Multiplies ratios by SimRow.endPortfolio (single source of truth)
 * 6. Projects debts separately via projectDebtByYear()
 * 7. Returns StackedRow[] as drop-in replacement for projectWealthComposition()
 *
 * @deprecated Gebruik `unifiedRowsToStackedRows()` met UnifiedProjectionRow[] voor
 * werkelijke per-asset-type data inclusief life events en correcte Box 3 per type.
 */
export function deriveWealthCompositionFromSim(
  simRows: SimRow[],
  assets: Asset[],
  debts: Debt[],
  fireAge?: number | null,
  annualExpenses?: number | null,
  /** Profielrendement in PROCENTEN — terugval voor `expected_return = null` (ADR 0166); default 0. */
  terugvalRendementPct = 0,
): StackedRow[] {
  if (!simRows.length) return []

  const activeAssets = assets.filter(a => a.is_active)
  const activeDebts = debts.filter(d => d.is_active && Number(d.current_balance) > 0)

  // ── Step 1: Group assets and compute per-group aggregates ──

  interface GroupInfo {
    totalValue: number
    weightedReturn: number   // value-weighted annual return (decimal)
    totalContribution: number // annual contribution
  }

  const groupInfo: Record<WealthGroup, GroupInfo> = {
    spaargeld:    { totalValue: 0, weightedReturn: 0, totalContribution: 0 },
    beleggingen:  { totalValue: 0, weightedReturn: 0, totalContribution: 0 },
    pensioen:     { totalValue: 0, weightedReturn: 0, totalContribution: 0 },
    vastgoed:     { totalValue: 0, weightedReturn: 0, totalContribution: 0 },
    overig:       { totalValue: 0, weightedReturn: 0, totalContribution: 0 },
  }

  for (const a of activeAssets) {
    const g = WEALTH_GROUPS[a.asset_type]
    const val = Number(a.current_value)
    // decimal — NULL → terugval (ADR 0166), nooit stil 0% via `Number(null)`.
    const ret = resolveExpectedReturnPct(a.expected_return, terugvalRendementPct) / 100
    const contrib = Number(a.monthly_contribution) * 12
    groupInfo[g].totalValue += val
    // Accumulate value × return for weighted average later
    groupInfo[g].weightedReturn += val * ret
    groupInfo[g].totalContribution += contrib
  }

  // Compute value-weighted return per group
  for (const g of ALL_GROUPS) {
    if (groupInfo[g].totalValue > 0) {
      groupInfo[g].weightedReturn = groupInfo[g].weightedReturn / groupInfo[g].totalValue
    } else {
      groupInfo[g].weightedReturn = 0
    }
  }

  // ── Step 2: Running-balance projection per group ──

  const years = simRows.length
  const startAge = simRows[0].age
  const theoretical: Record<WealthGroup, number[]> = {
    spaargeld:    new Array(years),
    beleggingen:  new Array(years),
    pensioen:     new Array(years),
    vastgoed:     new Array(years),
    overig:       new Array(years),
  }

  // Initialize year 0
  for (const g of ALL_GROUPS) {
    theoretical[g][0] = groupInfo[g].totalValue
  }

  // Forward-project each group
  for (let y = 1; y < years; y++) {
    const age = startAge + y
    const isFired = fireAge != null && age >= fireAge

    for (const g of ALL_GROUPS) {
      const prev = theoretical[g][y - 1]
      const growth = prev * groupInfo[g].weightedReturn
      const contrib = isFired ? 0 : groupInfo[g].totalContribution
      theoretical[g][y] = prev + growth + contrib
    }

    // ── Step 3: Post-FIRE waterfall withdrawals ──
    if (isFired && annualExpenses != null && annualExpenses > 0) {
      // Inflation-adjusted withdrawal
      const yearsAfterFire = age - fireAge!
      const withdrawal = annualExpenses * Math.pow(1 + 0.02, yearsAfterFire) // default 2% inflation

      let remaining = withdrawal
      // Waterfall order: beleggingen → spaargeld → overig → pensioen → vastgoed
      const drawOrder: WealthGroup[] = ['beleggingen', 'spaargeld', 'overig', 'pensioen', 'vastgoed']
      for (const g of drawOrder) {
        if (remaining <= 0) break
        if (theoretical[g][y] > 0) {
          const draw = Math.min(remaining, theoretical[g][y])
          theoretical[g][y] -= draw
          remaining -= draw
        }
      }
    }

    // Floor each group at 0
    for (const g of ALL_GROUPS) {
      if (theoretical[g][y] < 0) theoretical[g][y] = 0
    }
  }

  // ── Step 4: Convert to ratios and multiply by SimRow.endPortfolio ──

  const rows: StackedRow[] = []

  // Project debts (step 6)
  const debtProjections = activeDebts.map(d => projectDebtByYear(d, years - 1))
  const debtTotals = new Array(years).fill(0)
  for (const dp of debtProjections) {
    for (let y = 0; y < years; y++) {
      debtTotals[y] += y < dp.length ? dp[y] : 0
    }
  }

  for (let y = 0; y < years; y++) {
    const totalTheoretical = ALL_GROUPS.reduce((sum, g) => sum + theoretical[g][y], 0)
    const endPortfolio = simRows[y].endPortfolio

    // Build ratio-based values
    const values: Record<WealthGroup, number> = {
      spaargeld: 0,
      beleggingen: 0,
      pensioen: 0,
      vastgoed: 0,
      overig: 0,
    }

    if (totalTheoretical > 0 && endPortfolio > 0) {
      // Step 5: ratios × endPortfolio
      let allocated = 0
      let largestGroup: WealthGroup = 'beleggingen'
      let largestVal = -1

      for (const g of ALL_GROUPS) {
        const ratio = theoretical[g][y] / totalTheoretical
        values[g] = Math.round(ratio * endPortfolio)
        allocated += values[g]

        if (theoretical[g][y] > largestVal) {
          largestVal = theoretical[g][y]
          largestGroup = g
        }
      }

      // Step 10: Assign rounding residual to largest group
      const residual = Math.round(endPortfolio) - allocated
      values[largestGroup] += residual
    } else if (endPortfolio > 0) {
      // No theoretical data but portfolio exists — put everything in largest initial group
      let largestGroup: WealthGroup = 'beleggingen'
      let largestVal = -1
      for (const g of ALL_GROUPS) {
        if (groupInfo[g].totalValue > largestVal) {
          largestVal = groupInfo[g].totalValue
          largestGroup = g
        }
      }
      values[largestGroup] = Math.round(endPortfolio)
    }

    // Floor each value at 0 (step 7)
    for (const g of ALL_GROUPS) {
      if (values[g] < 0) values[g] = 0
    }

    // Re-normalise if sum doesn't match endPortfolio after flooring
    const currentSum = ALL_GROUPS.reduce((s, g) => s + values[g], 0)
    if (currentSum > 0 && Math.round(endPortfolio) > 0 && currentSum !== Math.round(endPortfolio)) {
      const scale = Math.round(endPortfolio) / currentSum
      let newAllocated = 0
      let lg: WealthGroup = 'beleggingen'
      let lgv = -1
      for (const g of ALL_GROUPS) {
        values[g] = Math.round(values[g] * scale)
        newAllocated += values[g]
        if (values[g] > lgv) { lgv = values[g]; lg = g }
      }
      values[lg] += Math.round(endPortfolio) - newAllocated
    }

    rows.push({
      age: simRows[y].age,
      spaargeld: values.spaargeld,
      beleggingen: values.beleggingen,
      pensioen: values.pensioen,
      vastgoed: values.vastgoed,
      overig: values.overig,
      schulden: -Math.round(debtTotals[y]),
    })
  }

  return rows
}

// ── Unified Projection → StackedRow mapping ─────────────────

/**
 * Map UnifiedProjectionRow[] directe asset bucket data naar StackedRow[].
 *
 * In tegenstelling tot `deriveWealthCompositionFromSim()` (ratio-based) gebruikt
 * deze functie de werkelijke per-asset-type waarden uit `assetBuckets` en de
 * werkelijke schuldsaldi uit `debtBalances`. Hierdoor zijn life events, correcte
 * Box 3 per type, en surplus-allocatie automatisch meegenomen.
 *
 * @param rows - UnifiedProjectionRow[] uit runUnifiedProjection()
 * @param debtTypeById - schuldsoort per app-debt-id; gezet ⇒ ook de opsplitsing per
 *   schuldsoort. De synthetische kernel-sleutels 'opeethypotheek'/'tekort-lening'
 *   hebben geen id en worden op naam herkend.
 * @param eigenHuisMortgageIds - debt-ids van de hypotheken op de EIGEN WONING; gezet
 *   ⇒ ook `schuldEigenHuisHypotheek`. Tegenhanger van `vastgoedEigenHuis`, dat
 *   altijd wordt gevuld zodra er een `eigen_huis`-bucket is.
 * @returns StackedRow[] — drop-in voor WealthCompositionChart
 */
export function unifiedRowsToStackedRows(
  rows: UnifiedProjectionRow[],
  debtTypeById?: ReadonlyMap<string, DebtType>,
  eigenHuisMortgageIds?: ReadonlySet<string>,
): StackedRow[] {
  if (!rows.length) return []

  const layerOf = (key: string): DebtLayer => {
    if (key === 'tekort-lening') return 'tekortLening'
    if (key === 'opeethypotheek') return 'opeethypotheek'
    return debtTypeById?.get(key) === 'mortgage' ? 'hypotheek' : 'overig'
  }

  return rows.map((row) => {
    // ── Aggregate assetBuckets per WealthGroup ──
    const groupTotals: Record<WealthGroup, number> = {
      spaargeld: 0,
      beleggingen: 0,
      pensioen: 0,
      vastgoed: 0,
      overig: 0,
    }

    // Het eigen-huis-deel apart bijhouden — zie `StackedRow.vastgoedEigenHuis`.
    let eigenHuisValue = 0
    for (const [assetType, bucket] of Object.entries(row.assetBuckets)) {
      if (!bucket) continue
      const group = WEALTH_GROUPS[assetType as AssetType]
      if (group) {
        groupTotals[group] += bucket.endValue
      }
      if (assetType === 'eigen_huis') eigenHuisValue += bucket.endValue
    }

    // ── Aggregate debtBalances to single negative schulden value ──
    let totalDebtBalance = 0
    let eigenHuisMortgageBalance = 0
    const perLayer: Record<DebtLayer, number> = { hypotheek: 0, overig: 0, opeethypotheek: 0, tekortLening: 0 }
    for (const [key, debt] of Object.entries(row.debtBalances)) {
      if (debt) {
        totalDebtBalance += debt.endBalance
        perLayer[layerOf(key)] += debt.endBalance
        if (eigenHuisMortgageIds?.has(key)) eigenHuisMortgageBalance += debt.endBalance
      }
    }

    const stacked: StackedRow = {
      age: row.age,
      spaargeld: Math.round(groupTotals.spaargeld),
      beleggingen: Math.round(groupTotals.beleggingen),
      pensioen: Math.round(groupTotals.pensioen),
      vastgoed: Math.round(groupTotals.vastgoed),
      overig: Math.round(groupTotals.overig),
      schulden: -Math.round(totalDebtBalance),
    }
    if (eigenHuisValue > 0) stacked.vastgoedEigenHuis = Math.round(eigenHuisValue)
    if (debtTypeById) {
      for (const layer of DEBT_LAYERS) stacked[DEBT_LAYER_FIELD[layer]] = -Math.round(perLayer[layer])
    }
    if (eigenHuisMortgageBalance > 0) {
      stacked.schuldEigenHuisHypotheek = -Math.round(eigenHuisMortgageBalance)
    }
    if ((row.opeetOpname ?? 0) > 0) stacked.opeetOpname = Math.round(row.opeetOpname!)
    return stacked
  })
}
