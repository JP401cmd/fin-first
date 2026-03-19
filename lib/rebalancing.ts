/**
 * Rebalancing utilities — drift calculation, trade suggestions, and Box 3 awareness.
 *
 * Pure module: no database calls, no side effects.
 * Builds on top of portfolio-allocation.ts types and extends with advanced logic.
 */

import {
  type AllocationViewMode,
  type HoldingForAllocation,
  type TargetAllocation,
  type AllocationSlice,
  computeAllocationSlices,
  CATEGORY_LABELS,
  ASSET_CLASS_LABELS,
  SECTOR_LABELS,
  GEOGRAPHY_LABELS,
} from './portfolio-allocation'

// ── Types ────────────────────────────────────────────────────

/** Result of drift computation for a single category. */
export type DriftResult = {
  /** Category key (e.g. 'aandelen', 'europa') */
  category: string
  /** Human-readable label */
  label: string
  /** Current allocation percentage (0–100) */
  current_pct: number
  /** Target allocation percentage (0–100) */
  target_pct: number
  /** Drift = current_pct − target_pct (positive = overweight, negative = underweight) */
  drift_pct: number
  /** Absolute drift in EUR */
  drift_amount: number
  /** Number of holdings in this category */
  holding_count: number
}

/** Suggested trade action for a single category. */
export type Trade = {
  /** Category key */
  category: string
  /** Human-readable label */
  label: string
  /** Buy or sell */
  action: 'buy' | 'sell'
  /** Trade amount in EUR */
  amount: number
  /** Per-holding suggestions: which specific holdings to buy/sell */
  holdingSuggestions: HoldingSuggestion[]
  /** Box 3 disclaimer when isBox3Window() is true */
  box3Disclaimer: string | null
}

/** Suggestion for a specific holding within a trade. */
export type HoldingSuggestion = {
  holdingId: string
  holdingName: string
  ticker: string | null
  action: 'buy' | 'sell'
  amount: number
}

/** Constraints for trade suggestion generation. */
export type TradeConstraints = {
  /** Only suggest trades when drift exceeds this % (default: 5) */
  threshold: number
  /** Minimum trade amount in EUR (default: 100) */
  minTradeAmount: number
  /** Add Box 3 peildatum disclaimer when in Nov-Dec window */
  avoidBox3Window: boolean
}

/** Full rebalancing report. */
export type RebalancingReport = {
  /** View mode used for analysis */
  viewMode: AllocationViewMode
  /** Total portfolio value in EUR */
  totalValue: number
  /** Drift results per category */
  drifts: DriftResult[]
  /** Suggested trades (filtered by constraints) */
  trades: Trade[]
  /** Holdings that lack classification for this view mode */
  unclassifiedHoldings: UnclassifiedHolding[]
  /** Whether we're in the Box 3 peildatum window (Nov-Dec) */
  isBox3Window: boolean
  /** Timestamp of report generation */
  generatedAt: string
}

/** Unclassified holding warning. */
export type UnclassifiedHolding = {
  id: string
  name: string
  ticker: string | null
  value: number
  /** Which classification field is missing */
  missingField: AllocationViewMode
}

// ── Default constraints ──────────────────────────────────────

export const DEFAULT_CONSTRAINTS: TradeConstraints = {
  threshold: 5,
  minTradeAmount: 100,
  avoidBox3Window: true,
}

// ── Box 3 peildatum awareness ────────────────────────────────

/**
 * Returns true if the given date (default: now) falls in November or December.
 * Box 3 tax is assessed on January 1st, so trades in Nov-Dec affect the peildatum.
 */
export function isBox3Window(date: Date = new Date()): boolean {
  const month = date.getMonth() // 0-indexed: 10 = Nov, 11 = Dec
  return month === 10 || month === 11
}

const BOX3_DISCLAIMER =
  'Let op: transacties in november-december beïnvloeden je Box 3-peildatum op 1 januari. ' +
  'Overweeg of rebalancing vóór of na de jaarwisseling fiscaal gunstiger is.'

// ── Drift computation ────────────────────────────────────────

/**
 * Compute drift per category: compare actual allocation vs target allocation.
 *
 * @param holdings  Array of holdings with classification metadata
 * @param targets   Target allocation percentages per category
 * @param viewMode  Which classification dimension to use
 * @returns         DriftResult per category that has a target
 */
export function computeDrift(
  holdings: HoldingForAllocation[],
  targets: TargetAllocation[],
  viewMode: AllocationViewMode,
): DriftResult[] {
  if (targets.length === 0) return []

  const slices = computeAllocationSlices(holdings, viewMode)
  const totalValue = holdings.reduce((sum, h) => sum + Math.max(0, h.value), 0)
  if (totalValue <= 0) return []

  const labels = CATEGORY_LABELS[viewMode]

  return targets.map((t) => {
    const slice = slices.find((s) => s.key === t.category)
    const currentPct = slice?.pct ?? 0
    const driftPct = currentPct - t.target_pct
    const driftAmount = (Math.abs(driftPct) / 100) * totalValue

    return {
      category: t.category,
      label: labels[t.category] || t.category,
      current_pct: Math.round(currentPct * 10) / 10,
      target_pct: t.target_pct,
      drift_pct: Math.round(driftPct * 10) / 10,
      drift_amount: Math.round(driftAmount),
      holding_count: slice?.holdingCount ?? 0,
    }
  })
}

// ── Trade suggestions ────────────────────────────────────────

/**
 * Generate concrete buy/sell trade suggestions based on drift results.
 *
 * @param drifts       Output of computeDrift()
 * @param holdings     Original holdings (used for per-holding suggestions)
 * @param viewMode     Classification dimension
 * @param constraints  Thresholds and filters
 * @returns            Array of Trade suggestions sorted by absolute amount descending
 */
export function suggestTrades(
  drifts: DriftResult[],
  holdings: HoldingForAllocation[],
  viewMode: AllocationViewMode,
  constraints: Partial<TradeConstraints> = {},
): Trade[] {
  const c: TradeConstraints = { ...DEFAULT_CONSTRAINTS, ...constraints }
  const inBox3Window = isBox3Window()
  const disclaimer = c.avoidBox3Window && inBox3Window ? BOX3_DISCLAIMER : null

  return drifts
    .filter((d) => Math.abs(d.drift_pct) >= c.threshold)
    .filter((d) => d.drift_amount >= c.minTradeAmount)
    .map((d) => {
      const action: 'buy' | 'sell' = d.drift_pct < 0 ? 'buy' : 'sell'
      const holdingSuggestions = buildHoldingSuggestions(
        holdings,
        viewMode,
        d.category,
        action,
        d.drift_amount,
      )

      return {
        category: d.category,
        label: d.label,
        action,
        amount: d.drift_amount,
        holdingSuggestions,
        box3Disclaimer: disclaimer,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Build per-holding suggestions for a trade.
 * For 'sell': distribute sell amount proportionally across holdings in the category.
 * For 'buy': suggest buying into the largest holding(s) in the category (or a new one).
 */
function buildHoldingSuggestions(
  holdings: HoldingForAllocation[],
  viewMode: AllocationViewMode,
  category: string,
  action: 'buy' | 'sell',
  totalAmount: number,
): HoldingSuggestion[] {
  // Get holdings in this category
  const categoryHoldings = holdings.filter((h) => {
    const field = h[viewMode]
    const key = field && field !== '' ? field : 'anders'
    return key === category && h.value > 0
  })

  if (categoryHoldings.length === 0) {
    // No existing holdings — for 'buy', can't split further
    return []
  }

  const categoryTotal = categoryHoldings.reduce((s, h) => s + h.value, 0)

  if (action === 'sell') {
    // Distribute sell proportionally by value
    return categoryHoldings.map((h) => {
      const proportion = categoryTotal > 0 ? h.value / categoryTotal : 1 / categoryHoldings.length
      return {
        holdingId: h.id,
        holdingName: h.name,
        ticker: h.ticker,
        action: 'sell' as const,
        amount: Math.round(totalAmount * proportion),
      }
    })
  }

  // For 'buy': suggest buying into existing holdings proportionally
  return categoryHoldings.map((h) => {
    const proportion = categoryTotal > 0 ? h.value / categoryTotal : 1 / categoryHoldings.length
    return {
      holdingId: h.id,
      holdingName: h.name,
      ticker: h.ticker,
      action: 'buy' as const,
      amount: Math.round(totalAmount * proportion),
    }
  })
}

// ── Unclassified holdings ────────────────────────────────────

/**
 * Return holdings that lack a classification for the given view mode.
 * These should be flagged to the user with a warning to add metadata.
 */
export function getUnclassifiedHoldings(
  holdings: HoldingForAllocation[],
  viewMode: AllocationViewMode,
): UnclassifiedHolding[] {
  return holdings
    .filter((h) => {
      const field = h[viewMode]
      return !field || field === ''
    })
    .map((h) => ({
      id: h.id,
      name: h.name,
      ticker: h.ticker,
      value: h.value,
      missingField: viewMode,
    }))
}

// ── Full report builder ──────────────────────────────────────

/**
 * Generate a complete rebalancing report for a portfolio.
 *
 * @param holdings     All holdings with classification metadata
 * @param targets      Target allocations per category
 * @param viewMode     Classification dimension (asset_class | sector | geography)
 * @param constraints  Trade suggestion constraints (optional, uses defaults)
 * @returns            Full RebalancingReport
 */
export function generateRebalancingReport(
  holdings: HoldingForAllocation[],
  targets: TargetAllocation[],
  viewMode: AllocationViewMode,
  constraints: Partial<TradeConstraints> = {},
): RebalancingReport {
  const totalValue = holdings.reduce((sum, h) => sum + Math.max(0, h.value), 0)
  const drifts = computeDrift(holdings, targets, viewMode)
  const trades = suggestTrades(drifts, holdings, viewMode, constraints)
  const unclassifiedHoldings = getUnclassifiedHoldings(holdings, viewMode)
  const box3Window = isBox3Window()

  return {
    viewMode,
    totalValue,
    drifts,
    trades,
    unclassifiedHoldings,
    isBox3Window: box3Window,
    generatedAt: new Date().toISOString(),
  }
}

// ── Notification generation ──────────────────────────────────

/**
 * Notification shape matching the DashboardData Notification interface.
 * Defined here to avoid circular import with widget-renderer.
 */
export interface RebalanceNotification {
  id: string
  type: 'rebalance'
  message: string
  severity: 'info' | 'warning' | 'critical'
  createdAt: string
  actionHref: string
}

/**
 * Generate rebalance notifications from drift results.
 *
 * Severity mapping:
 * - drift > threshold: warning
 * - drift > 2× threshold: critical
 * - Box 3 peildatum window (Nov/Dec): info
 *
 * @param drifts      Output of computeDrift()
 * @param threshold   Drift threshold percentage (default: 5)
 * @param box3Window  Whether currently in Nov-Dec Box 3 window
 * @returns           Array of Notification objects for the meldingen system
 */
export function generateRebalanceNotifications(
  drifts: DriftResult[],
  threshold = 5,
  box3Window = false,
): RebalanceNotification[] {
  const notifications: RebalanceNotification[] = []
  const now = new Date().toISOString()

  for (const drift of drifts) {
    const absDrift = Math.abs(drift.drift_pct)
    if (absDrift < threshold) continue

    const severity: 'warning' | 'critical' = absDrift >= threshold * 2 ? 'critical' : 'warning'
    const action = drift.drift_pct > 0 ? 'Overweeg te verkopen' : 'Overweeg bij te kopen'
    const sign = drift.drift_pct > 0 ? '+' : ''

    notifications.push({
      id: `rebalance-drift-${drift.category}`,
      type: 'rebalance',
      message: `${drift.label}-allocatie wijkt ${sign}${drift.drift_pct.toFixed(1)}% af (${drift.current_pct.toFixed(1)}% vs ${drift.target_pct.toFixed(1)}%). ${action} €${drift.drift_amount.toLocaleString('nl-NL')}.`,
      severity,
      createdAt: now,
      actionHref: '/core/assets',
    })
  }

  // Box 3 peildatum notification (info severity, only Nov-Dec)
  if (box3Window) {
    notifications.push({
      id: 'rebalance-box3-peildatum',
      type: 'rebalance',
      message: 'Peildatum 1 januari nadert. Overweeg rebalancing vóór jaareinde voor belastingoptimalisatie.',
      severity: 'info',
      createdAt: now,
      actionHref: '/core/assets',
    })
  }

  return notifications
}
