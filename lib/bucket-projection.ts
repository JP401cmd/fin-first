/**
 * @deprecated Gebruik `runUnifiedProjection()` met `skipFireDetection: true` +
 * `unifiedToBucketResult()` uit `@/lib/unified-projection` in plaats van deze module.
 *
 * Per-bucket vermogensprognose engine (legacy).
 *
 * Projects assets per type with individual expected returns,
 * models debt repayment schedules, and applies Box 3 tax drag
 * using either forfaitair or werkelijk rendement method.
 *
 * Behouden als referentie en fallback. De Kern pagina gebruikt nu de unified engine.
 */

import { projectAsset, resolveDepreciation, type Asset, type AssetType, ASSET_TYPE_COLORS, ASSET_TYPE_LABELS, ASSET_TYPE_ICONS } from './asset-data'
import {
  amortizationSchedule,
  linearAmortization,
  interestOnlySchedule,
  type Debt,
  type DebtType,
  type RepaymentType,
} from './debt-data'
import { classifyAsset, BOX3_PARAMS, type Box3Category } from './box3-data'

// ── Types ────────────────────────────────────────────────────

export type Box3Method = 'forfaitair' | 'werkelijk'

export interface BucketProjectionInput {
  assets: Asset[]
  debts: Debt[]
  hasPartner: boolean
  inflationRate: number        // decimal (0.02)
  box3Method: Box3Method
  months: number               // default 60 (5 years)
  monthlySurplus: number       // income - expenses (from transactions)
  monthlyIncome?: number       // for cash flow summary display
  incomeGrowthRate?: number    // annual decimal, default = inflationRate
}

export interface BucketRow {
  month: number
  date: string
  assetBuckets: Partial<Record<AssetType, number>>
  totalAssets: number
  totalDebts: number
  netWorth: number
  cumulativeBox3Tax: number
  inflationFactor: number      // (1 + inflationRate)^(month/12), always >= 1.0
}

export interface CashFlowSummary {
  monthlyIncome: number
  monthlyExpenses: number       // = income - surplus
  totalDebtPayments: number     // sum of all debt monthly_payments
  totalAssetContributions: number // sum of all asset monthly_contributions
  monthlySurplus: number        // input value (residual after all flows)
  impliedLivingExpenses: number // expenses - debtPayments - contributions
  isOvercommitted: boolean     // contributions + payments > income
  overcommitAmount: number     // how much over (0 if balanced)
  incomeGrowthRate: number     // effective annual decimal
}

export type MilestoneSnapshot = { netWorth: number; totalAssets: number; totalDebts: number; totalCosts: number; inflationFactor: number }

export interface BucketProjectionResult {
  rows: BucketRow[]
  year1: MilestoneSnapshot
  year3: MilestoneSnapshot
  year5: MilestoneSnapshot
  year10?: MilestoneSnapshot
  year20?: MilestoneSnapshot
  bucketSummaries: BucketSummary[]
  debtSummaries: DebtSummary[]
  costSummaries: CostSummary[]
  alternativeRows: BucketRow[]
  alternativeMethod: Box3Method
  currentNetWorth: number
  isGrowing: boolean
  cashFlowSummary: CashFlowSummary
}

export interface BucketSummary {
  assetType: AssetType
  label: string
  color: string
  icon: string
  currentValue: number
  weightedReturn: number
  box3DragPct: number
  projected1y: number
  projected5y: number
  projectedEnd: number
  assetCount: number
  assets: AssetDetail[]
}

export interface AssetDetail {
  id: string
  name: string
  currentValue: number
  expectedReturn: number
  monthlyContribution: number
  projected1y: number
  projected5y: number
}

export interface DebtSummary {
  id: string
  name: string
  debtType: DebtType
  currentBalance: number
  interestRate: number
  monthlyPayment: number
  repaymentType: RepaymentType | null
  projected1y: number
  projected5y: number
  projectedEnd: number
  payoffMonth: number | null
}

export interface CostSummary {
  id: string
  label: string
  description: string
  current: number        // annual cost at current values
  cumulative1y: number
  cumulative5y: number
  color: string
}

// ── Helpers ──────────────────────────────────────────────────

const BOX3_YEAR = 2026 as const

/**
 * Compute annual Box 3 drag percentage for a single asset.
 */
function computeBox3DragForAsset(
  asset: Asset,
  method: Box3Method,
): number {
  const classification = classifyAsset(asset)
  if (!classification.category) return 0 // excluded from Box 3

  const params = BOX3_PARAMS[BOX3_YEAR]

  if (method === 'forfaitair') {
    const forfait = classification.category === 'spaargeld'
      ? params.forfaitSpaargeld
      : params.forfaitBeleggingen
    return forfait * params.tarief
  }

  // werkelijk: tax on actual return
  const actualReturn = Number(asset.expected_return) / 100
  if (actualReturn <= 0) return 0
  return actualReturn * params.tarief
}

/**
 * Generate debt balance array for `months` months.
 * Returns array of length `months + 1` (index 0 = current balance).
 */
function projectDebtBalances(debt: Debt, months: number): number[] {
  const balance = Number(debt.current_balance)
  const rate = Number(debt.interest_rate)
  const payment = Number(debt.monthly_payment)
  const repaymentType = debt.repayment_type
  const inclusionPct = Number(debt.net_worth_inclusion_pct ?? 100) / 100

  if (balance <= 0) return new Array(months + 1).fill(0)

  const balances = new Array(months + 1).fill(0)
  balances[0] = balance * inclusionPct

  if (repaymentType === 'aflossingsvrij') {
    // Interest-only: balance stays the same
    let remainingMonths = months
    if (debt.end_date) {
      const end = new Date(debt.end_date)
      const now = new Date()
      remainingMonths = Math.max(0, Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    }
    const schedule = interestOnlySchedule(balance, rate, Math.min(months, remainingMonths))
    for (let m = 1; m <= months; m++) {
      if (m <= schedule.length) {
        balances[m] = schedule[m - 1].balance * inclusionPct
      } else {
        // After end date: assume balloon payment (balance goes to 0)
        balances[m] = 0
      }
    }
    return balances
  }

  if (repaymentType === 'lineair') {
    // Calculate term from end_date or estimate
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
    for (let m = 1; m <= months; m++) {
      if (m <= schedule.length) {
        balances[m] = schedule[m - 1].balance * inclusionPct
      } else {
        balances[m] = 0
      }
    }
    return balances
  }

  // Default: annuity
  if (payment <= 0) {
    // No payment info — keep balance static
    for (let m = 1; m <= months; m++) balances[m] = balance * inclusionPct
    return balances
  }

  const schedule = amortizationSchedule(balance, rate, payment)
  for (let m = 1; m <= months; m++) {
    if (m <= schedule.length) {
      balances[m] = schedule[m - 1].balance * inclusionPct
    } else {
      balances[m] = 0
    }
  }
  return balances
}

/**
 * Distribute heffingsvrij over Box 3 assets proportionally,
 * reducing the effective Box 3 drag per asset.
 */
function applyHeffingsvrij(
  assetValues: number[],
  annualDrags: number[],
  categories: (Box3Category)[],
  hasPartner: boolean,
): number[] {
  const params = BOX3_PARAMS[BOX3_YEAR]
  const heffingsvrij = hasPartner ? params.heffingsvrijPartner : params.heffingsvrijSingle

  // Total Box 3 value
  let totalBox3Value = 0
  for (let i = 0; i < assetValues.length; i++) {
    if (categories[i]) totalBox3Value += assetValues[i]
  }

  if (totalBox3Value <= heffingsvrij) {
    // All under heffingsvrij — no Box 3 tax
    return assetValues.map(() => 0)
  }

  // Proportion taxable
  const taxableFraction = (totalBox3Value - heffingsvrij) / totalBox3Value

  return annualDrags.map((drag, i) => {
    if (!categories[i]) return 0
    return drag * taxableFraction
  })
}

// ── Main computation ─────────────────────────────────────────

export function computeBucketProjection(input: BucketProjectionInput): BucketProjectionResult {
  const { assets, debts, hasPartner, box3Method, months, monthlySurplus } = input

  const activeAssets = assets.filter(a => a.is_active)
  const activeDebts = debts.filter(d => d.is_active && Number(d.current_balance) > 0)

  const now = new Date()

  // ── Per-asset projections (without Box 3 drag) ──
  const assetProjections = activeAssets.map(a => {
    const value = Number(a.current_value)
    const ret = Number(a.expected_return)
    const contrib = Number(a.monthly_contribution)
    const inclusionPct = Number(a.net_worth_inclusion_pct ?? 100) / 100
    const depreciation = resolveDepreciation(a)
    const rows = projectAsset(value, depreciation ? 0 : ret, contrib, months, undefined, depreciation)
    return { asset: a, rows, inclusionPct }
  })

  // ── Per-asset Box 3 classification and drags ──
  const classifications = activeAssets.map(a => classifyAsset(a))
  const categories = classifications.map(c => c.category)
  const rawAnnualDrags = activeAssets.map(a => computeBox3DragForAsset(a, box3Method))
  const currentValues = activeAssets.map(a => Number(a.current_value) * (Number(a.net_worth_inclusion_pct ?? 100) / 100))

  // ── Per-debt balance schedules ──
  const debtBalanceArrays = activeDebts.map(d => projectDebtBalances(d, months))

  // ── Build monthly rows ──
  function buildRows(method: Box3Method): BucketRow[] {
    const drags = method === box3Method
      ? rawAnnualDrags
      : activeAssets.map(a => computeBox3DragForAsset(a, method))

    const rows: BucketRow[] = []
    // Track running asset values with drag applied
    const runningValues = currentValues.slice()
    let cumulativeTax = 0
    // Track accumulated surplus cash (linear, no return on checking account)
    let surplusCash = 0

    const effectiveGrowth = input.incomeGrowthRate ?? input.inflationRate

    // Month 0 = current state
    {
      const buckets: Partial<Record<AssetType, number>> = {}
      let totalAssets = 0
      for (let i = 0; i < activeAssets.length; i++) {
        const type = activeAssets[i].asset_type
        buckets[type] = (buckets[type] ?? 0) + runningValues[i]
        totalAssets += runningValues[i]
      }
      let totalDebts = 0
      for (let i = 0; i < activeDebts.length; i++) totalDebts += debtBalanceArrays[i][0]

      rows.push({
        month: 0,
        date: now.toISOString().split('T')[0],
        assetBuckets: buckets,
        totalAssets,
        totalDebts,
        netWorth: totalAssets - totalDebts,
        cumulativeBox3Tax: 0,
        inflationFactor: 1,
      })
    }

    for (let m = 1; m <= months; m++) {
      // Update running values from base projection
      for (let i = 0; i < activeAssets.length; i++) {
        const projRow = assetProjections[i].rows[m - 1]
        runningValues[i] = projRow ? projRow.value * assetProjections[i].inclusionPct : runningValues[i]
      }

      // Compute total debts this month to check net worth
      let totalDebtsThisMonth = 0
      for (let i = 0; i < activeDebts.length; i++) {
        totalDebtsThisMonth += debtBalanceArrays[i][m] ?? 0
      }
      const currentTotalAssets = runningValues.reduce((s, v) => s + v, 0) + surplusCash
      const netWorthBeforeTax = currentTotalAssets - totalDebtsThisMonth

      // Apply heffingsvrij-adjusted Box 3 drag (monthly) — only when net worth is positive
      if (netWorthBeforeTax > 0) {
        const adjustedDrags = applyHeffingsvrij(runningValues, drags, categories, hasPartner)
        for (let i = 0; i < activeAssets.length; i++) {
          const monthlyDrag = adjustedDrags[i] / 12
          const dragAmount = runningValues[i] * monthlyDrag
          runningValues[i] = Math.max(0, runningValues[i] - dragAmount)
          cumulativeTax += dragAmount
        }
      }

      // Accumulate surplus cash with income growth (step-wise per year boundary)
      const yearIndex = Math.floor((m - 1) / 12)
      const indexedSurplus = monthlySurplus * Math.pow(1 + effectiveGrowth, yearIndex)
      surplusCash += indexedSurplus

      // Aggregate buckets
      const buckets: Partial<Record<AssetType, number>> = {}
      let totalAssets = 0
      for (let i = 0; i < activeAssets.length; i++) {
        const type = activeAssets[i].asset_type
        buckets[type] = (buckets[type] ?? 0) + runningValues[i]
        totalAssets += runningValues[i]
      }

      // Add surplus cash to cash bucket
      if (surplusCash !== 0) {
        const cashBucketKey: AssetType = 'cash'
        buckets[cashBucketKey] = (buckets[cashBucketKey] ?? 0) + surplusCash
        totalAssets += surplusCash
      }

      let totalDebts = 0
      for (let i = 0; i < activeDebts.length; i++) {
        totalDebts += debtBalanceArrays[i][m] ?? 0
      }

      const date = new Date(now)
      date.setMonth(date.getMonth() + m)

      rows.push({
        month: m,
        date: date.toISOString().split('T')[0],
        assetBuckets: buckets,
        totalAssets: Math.round(totalAssets),
        totalDebts: Math.round(totalDebts),
        netWorth: Math.round(totalAssets - totalDebts),
        cumulativeBox3Tax: Math.round(cumulativeTax),
        inflationFactor: Math.pow(1 + input.inflationRate, m / 12),
      })
    }

    return rows
  }

  const primaryRows = buildRows(box3Method)
  const alternativeMethod: Box3Method = box3Method === 'forfaitair' ? 'werkelijk' : 'forfaitair'
  const alternativeRows = buildRows(alternativeMethod)

  // ── Milestone snapshots ──
  const getSnapshot = (rows: BucketRow[], month: number): MilestoneSnapshot => {
    const row = rows.find(r => r.month === month) ?? rows[rows.length - 1]
    return { netWorth: row.netWorth, totalAssets: row.totalAssets, totalDebts: row.totalDebts, totalCosts: row.cumulativeBox3Tax, inflationFactor: row.inflationFactor }
  }

  // ── Bucket summaries ──
  const bucketMap = new Map<AssetType, { assets: typeof activeAssets; totalValue: number }>()
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

    // Weighted average return
    let weightedReturn = 0
    if (totalValue > 0) {
      for (const a of bucketAssets) {
        const inclValue = Number(a.current_value) * (Number(a.net_worth_inclusion_pct ?? 100) / 100)
        weightedReturn += (Number(a.expected_return) / 100) * (inclValue / totalValue)
      }
    }

    // Average Box 3 drag
    let avgDrag = 0
    const bucketIndices = bucketAssets.map(a => activeAssets.indexOf(a))
    const adjustedDrags = applyHeffingsvrij(currentValues, rawAnnualDrags, categories, hasPartner)
    for (const idx of bucketIndices) {
      if (idx >= 0) avgDrag += adjustedDrags[idx]
    }
    if (bucketAssets.length > 0) avgDrag /= bucketAssets.length

    // Asset details with projections
    const assetDetails: AssetDetail[] = bucketAssets.map(a => {
      const idx = activeAssets.indexOf(a)
      const proj = assetProjections[idx]
      const inclPct = proj.inclusionPct
      return {
        id: a.id,
        name: a.name,
        currentValue: Number(a.current_value) * inclPct,
        expectedReturn: Number(a.expected_return),
        monthlyContribution: Number(a.monthly_contribution),
        projected1y: (proj.rows[11]?.value ?? Number(a.current_value)) * inclPct,
        projected5y: (proj.rows[59]?.value ?? Number(a.current_value)) * inclPct,
      }
    })

    // Bucket-level projections from primary rows
    const row12 = primaryRows.find(r => r.month === 12)
    const row60 = primaryRows.find(r => r.month === 60)
    const rowEnd = primaryRows[primaryRows.length - 1]

    bucketSummaries.push({
      assetType: type,
      label: ASSET_TYPE_LABELS[type],
      color: ASSET_TYPE_COLORS[type],
      icon: ASSET_TYPE_ICONS[type],
      currentValue: totalValue,
      weightedReturn,
      box3DragPct: avgDrag * 100,
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
  const debtSummaries: DebtSummary[] = activeDebts.map((d, i) => {
    const balances = debtBalanceArrays[i]
    const payoffIdx = balances.findIndex((b, idx) => idx > 0 && b <= 0.01)
    return {
      id: d.id,
      name: d.name,
      debtType: d.debt_type as DebtType,
      currentBalance: balances[0],
      interestRate: Number(d.interest_rate),
      monthlyPayment: Number(d.monthly_payment),
      repaymentType: d.repayment_type as RepaymentType | null,
      projected1y: balances[12] ?? balances[balances.length - 1],
      projected5y: balances[60] ?? balances[balances.length - 1],
      projectedEnd: balances[balances.length - 1],
      payoffMonth: payoffIdx > 0 ? payoffIdx : null,
    }
  })

  // ── Cost summaries ──
  const costRow12 = primaryRows.find(r => r.month === 12)
  const costRow60 = primaryRows.find(r => r.month === 60)

  // Compute annual Box 3 tax at current values for display
  const adjustedDragsNow = applyHeffingsvrij(currentValues, rawAnnualDrags, categories, hasPartner)
  let annualBox3Tax = 0
  for (let i = 0; i < activeAssets.length; i++) {
    annualBox3Tax += currentValues[i] * adjustedDragsNow[i]
  }

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

  const currentNetWorth = primaryRows[0]?.netWorth ?? 0
  const finalNetWorth = primaryRows[primaryRows.length - 1]?.netWorth ?? 0

  // ── Cash flow summary ──
  const totalDebtPayments = activeDebts.reduce((s, d) => s + Number(d.monthly_payment), 0)
  const totalAssetContributions = activeAssets.reduce((s, a) => s + Number(a.monthly_contribution), 0)
  const monthlyExpenses = (input.monthlyIncome ?? 0) - input.monthlySurplus
  const impliedLivingExpenses = monthlyExpenses - totalDebtPayments - totalAssetContributions
  const isOvercommitted = input.monthlyIncome != null && input.monthlyIncome > 0
    && (totalDebtPayments + totalAssetContributions) > input.monthlyIncome

  const effectiveGrowthRate = input.incomeGrowthRate ?? input.inflationRate
  const cashFlowSummary: CashFlowSummary = {
    monthlyIncome: input.monthlyIncome ?? 0,
    monthlyExpenses,
    totalDebtPayments,
    totalAssetContributions,
    monthlySurplus: input.monthlySurplus,
    impliedLivingExpenses: Math.max(0, impliedLivingExpenses),
    isOvercommitted,
    overcommitAmount: isOvercommitted
      ? (totalDebtPayments + totalAssetContributions) - (input.monthlyIncome ?? 0)
      : 0,
    incomeGrowthRate: effectiveGrowthRate,
  }

  return {
    rows: primaryRows,
    year1: getSnapshot(primaryRows, 12),
    year3: getSnapshot(primaryRows, 36),
    year5: getSnapshot(primaryRows, 60),
    ...(months >= 120 ? { year10: getSnapshot(primaryRows, 120) } : {}),
    ...(months >= 240 ? { year20: getSnapshot(primaryRows, 240) } : {}),
    bucketSummaries,
    debtSummaries,
    costSummaries,
    alternativeRows,
    alternativeMethod,
    currentNetWorth,
    isGrowing: finalNetWorth > currentNetWorth,
    cashFlowSummary,
  }
}
