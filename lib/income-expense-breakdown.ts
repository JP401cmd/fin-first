/**
 * Vermogensstromen breakdown engine.
 *
 * Transforms UnifiedProjectionRow data into chart-ready stacked structures
 * showing flows TO and FROM net worth.
 *
 * Inflows (aanvulling): Besparingen, Rendement, positive life events
 * Outflows (onttrekking): Box 3, Rente per schuld, Levensonderhoud, negative life events
 *
 * Uses UnifiedProjectionRow for rich data (debt interest, Box 3 per type).
 * Falls back to SimRow when unified data is not available.
 */

import type { SimRow } from '@/lib/fire-simulation'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { Debt } from '@/lib/debt-data'

// ── Layer & row types ───────────────────────────────────────

export interface BreakdownLayer {
  id: string
  label: string
  color: string
  isFixed: boolean
}

export interface BreakdownRow {
  age: number
  phase: 'accumulation' | 'retirement'
  incomeBySource: Record<string, number>
  expenseBySource: Record<string, number>
  totalIncome: number
  totalExpenses: number
  surplus: number
}

export interface BreakdownResult {
  rows: BreakdownRow[]
  incomeLayers: BreakdownLayer[]
  expenseLayers: BreakdownLayer[]
}

// ── Color palettes ──────────────────────────────────────────

const FIXED_COLORS: Record<string, string> = {
  savings: 'var(--horizon-400, #c4a06b)',
  growth: 'var(--horizon-600, #8a6e42)',
  withdrawal: 'var(--kern-400, #a07860)',
  box3: 'var(--kern-600, #6b4339)',
}

const FIXED_LABELS: Record<string, string> = {
  savings: 'Besparingen',
  growth: 'Rendement',
  withdrawal: 'Levensonderhoud',
  box3: 'Box 3 belasting',
}

/** Blues/purples — complementary to the gold horizon palette */
const INCOME_EVENT_PALETTE = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#a78bfa', '#7dd3fc', '#818cf8', '#38bdf8',
]

/** Ambers/oranges — complementary to the brown kern palette */
const EXPENSE_EVENT_PALETTE = [
  '#f59e0b', '#d97706', '#b45309', '#f97316', '#ea580c', '#fbbf24', '#fb923c',
]

/** Reds for debt interest */
const DEBT_INTEREST_COLOR = '#ef4444'

const FIXED_INCOME_IDS: Set<string> = new Set(['savings', 'growth'])
const FIXED_EXPENSE_IDS: Set<string> = new Set(['withdrawal', 'box3'])

// ── Helpers ─────────────────────────────────────────────────

function buildLayer(id: string, label: string, color: string, isFixed: boolean): BreakdownLayer {
  return { id, label, color, isFixed }
}

function pickEventColor(palette: string[], index: number): string {
  return palette[index % palette.length]
}

// ── Main: unified rows (rich data) ─────────────────────────

/**
 * Build a chart-ready vermogensstromen breakdown from UnifiedProjectionRow data.
 *
 * Uses the rich unified data for:
 * - Per-schuld rentekosten (interestPaid)
 * - Totale Box 3 belasting
 * - Per-asset rendement
 * - Besparingen, onttrekking
 *
 * SimRows provide per-cashflow breakdown (life event names).
 */
export function buildBreakdown(
  unifiedRows: UnifiedProjectionRow[],
  simRows: SimRow[],
  debts?: Debt[],
): BreakdownResult {
  if (!unifiedRows.length) {
    return { rows: [], incomeLayers: [], expenseLayers: [] }
  }

  // Build debt name lookup
  const debtNames = new Map<string, string>()
  if (debts) {
    for (const d of debts) debtNames.set(d.id, d.name)
  }

  // Build SimRow lookup by age for cashflow breakdown items
  const simByAge = new Map<number, SimRow>()
  for (const sr of simRows) simByAge.set(sr.age, sr)

  // ── Pass 1: discover all unique source IDs ──

  const incomeEventIds: string[] = []
  const expenseEventIds: string[] = []
  const incomeLabels = new Map<string, string>()
  const expenseLabels = new Map<string, string>()
  const debtIds: string[] = []

  for (const uRow of unifiedRows) {
    // Discover debt IDs
    for (const [dId, detail] of Object.entries(uRow.debtBalances)) {
      if (detail.interestPaid > 0 && !debtNames.has(dId) === false) {
        // Already in debtNames
      }
      if (detail.interestPaid > 0 && !debtIds.includes(dId)) {
        debtIds.push(dId)
      }
    }

    // Discover cashflow event IDs from SimRow breakdown
    const sr = simByAge.get(uRow.age)
    if (sr?.incomeBreakdown) {
      for (const item of sr.incomeBreakdown) {
        if (!FIXED_INCOME_IDS.has(item.id) && !incomeLabels.has(item.id)) {
          incomeEventIds.push(item.id)
        }
        incomeLabels.set(item.id, item.label)
      }
    }
    if (sr?.expenseBreakdown) {
      for (const item of sr.expenseBreakdown) {
        if (!FIXED_EXPENSE_IDS.has(item.id) && !expenseLabels.has(item.id)) {
          expenseEventIds.push(item.id)
        }
        expenseLabels.set(item.id, item.label)
      }
    }
  }

  // Build candidate layers
  const candidateIncomeLayers: BreakdownLayer[] = [
    buildLayer('savings', FIXED_LABELS.savings, FIXED_COLORS.savings, true),
    buildLayer('growth', FIXED_LABELS.growth, FIXED_COLORS.growth, true),
    ...incomeEventIds.map((id, i) =>
      buildLayer(id, incomeLabels.get(id)!, pickEventColor(INCOME_EVENT_PALETTE, i), false),
    ),
  ]

  const candidateExpenseLayers: BreakdownLayer[] = [
    buildLayer('withdrawal', FIXED_LABELS.withdrawal, FIXED_COLORS.withdrawal, true),
    buildLayer('box3', FIXED_LABELS.box3, FIXED_COLORS.box3, true),
    // Debt interest layers — one per debt
    ...debtIds.map((dId, i) =>
      buildLayer(
        `debt-interest-${dId}`,
        `Rente ${debtNames.get(dId) ?? 'schuld'}`,
        i === 0 ? DEBT_INTEREST_COLOR : pickEventColor(EXPENSE_EVENT_PALETTE, expenseEventIds.length + i),
        false,
      ),
    ),
    ...expenseEventIds.map((id, i) =>
      buildLayer(id, expenseLabels.get(id)!, pickEventColor(EXPENSE_EVENT_PALETTE, i), false),
    ),
  ]

  // Track which layers actually have data
  const incomeIdsWithData = new Set<string>()
  const expenseIdsWithData = new Set<string>()

  // ── Pass 2: build BreakdownRow per age ──

  const breakdownRows: BreakdownRow[] = unifiedRows.map((uRow) => {
    const incomeBySource: Record<string, number> = {}
    const expenseBySource: Record<string, number> = {}
    const sr = simByAge.get(uRow.age)
    const phase = uRow.phase === 'withdrawal' ? 'retirement' : 'accumulation'

    // -- Inflows --

    // Besparingen (only in accumulation)
    if (uRow.savings > 0 && phase === 'accumulation') {
      incomeBySource['savings'] = Math.round(uRow.savings)
    }

    // Rendement (bruto = totalGrowth + totalBox3, since totalGrowth is already net of box3)
    const grossGrowth = uRow.totalGrowth + uRow.totalBox3
    if (grossGrowth > 0) {
      incomeBySource['growth'] = Math.round(grossGrowth)
    }

    // Positive life event cashflows from SimRow breakdown
    if (sr?.incomeBreakdown) {
      for (const item of sr.incomeBreakdown) {
        if (!FIXED_INCOME_IDS.has(item.id) && item.amount > 0) {
          incomeBySource[item.id] = (incomeBySource[item.id] ?? 0) + item.amount
        }
      }
    }

    // -- Outflows --

    // Levensonderhoud (withdrawal in retirement)
    if (uRow.withdrawal > 0) {
      expenseBySource['withdrawal'] = Math.round(uRow.withdrawal)
    }

    // Box 3 belasting
    if (uRow.totalBox3 > 0) {
      expenseBySource['box3'] = Math.round(uRow.totalBox3)
    }

    // Rente per schuld
    for (const [dId, detail] of Object.entries(uRow.debtBalances)) {
      if (detail.interestPaid > 0) {
        expenseBySource[`debt-interest-${dId}`] = Math.round(detail.interestPaid)
      }
    }

    // Negative life event cashflows from SimRow breakdown
    if (sr?.expenseBreakdown) {
      for (const item of sr.expenseBreakdown) {
        if (!FIXED_EXPENSE_IDS.has(item.id) && item.amount > 0) {
          expenseBySource[item.id] = (expenseBySource[item.id] ?? 0) + item.amount
        }
      }
    }

    // Track active sources
    for (const [id, val] of Object.entries(incomeBySource)) {
      if (val > 0) incomeIdsWithData.add(id)
    }
    for (const [id, val] of Object.entries(expenseBySource)) {
      if (val > 0) expenseIdsWithData.add(id)
    }

    const totalIncome = Object.values(incomeBySource).reduce((s, v) => s + v, 0)
    const totalExpenses = Object.values(expenseBySource).reduce((s, v) => s + v, 0)

    return {
      age: uRow.age,
      phase,
      incomeBySource,
      expenseBySource,
      totalIncome,
      totalExpenses,
      surplus: totalIncome - totalExpenses,
    }
  })

  // Filter layers to only those with data
  const incomeLayers = candidateIncomeLayers.filter(l => incomeIdsWithData.has(l.id))
  const expenseLayers = candidateExpenseLayers.filter(l => expenseIdsWithData.has(l.id))

  return { rows: breakdownRows, incomeLayers, expenseLayers }
}

// ── Fallback: SimRow-only (for regression tests / legacy paths) ─────────

/**
 * Simplified breakdown using only SimRow data (no debt interest detail).
 * Used when UnifiedProjectionRow data is not available.
 */
export function buildBreakdownFromSimRows(rows: SimRow[]): BreakdownResult {
  if (!rows.length) {
    return { rows: [], incomeLayers: [], expenseLayers: [] }
  }

  const incomeEventIds: string[] = []
  const expenseEventIds: string[] = []
  const incomeLabels = new Map<string, string>()
  const expenseLabels = new Map<string, string>()

  for (const row of rows) {
    if (row.incomeBreakdown) {
      for (const item of row.incomeBreakdown) {
        if (!FIXED_INCOME_IDS.has(item.id) && !incomeLabels.has(item.id)) {
          incomeEventIds.push(item.id)
        }
        incomeLabels.set(item.id, item.label)
      }
    }
    if (row.expenseBreakdown) {
      for (const item of row.expenseBreakdown) {
        if (!FIXED_EXPENSE_IDS.has(item.id) && !expenseLabels.has(item.id)) {
          expenseEventIds.push(item.id)
        }
        expenseLabels.set(item.id, item.label)
      }
    }
  }

  const candidateIncomeLayers: BreakdownLayer[] = [
    buildLayer('savings', FIXED_LABELS.savings, FIXED_COLORS.savings, true),
    buildLayer('growth', FIXED_LABELS.growth, FIXED_COLORS.growth, true),
    ...incomeEventIds.map((id, i) =>
      buildLayer(id, incomeLabels.get(id)!, pickEventColor(INCOME_EVENT_PALETTE, i), false),
    ),
  ]
  const candidateExpenseLayers: BreakdownLayer[] = [
    buildLayer('withdrawal', FIXED_LABELS.withdrawal, FIXED_COLORS.withdrawal, true),
    buildLayer('box3', FIXED_LABELS.box3, FIXED_COLORS.box3, true),
    ...expenseEventIds.map((id, i) =>
      buildLayer(id, expenseLabels.get(id)!, pickEventColor(EXPENSE_EVENT_PALETTE, i), false),
    ),
  ]

  const incomeIdsWithData = new Set<string>()
  const expenseIdsWithData = new Set<string>()

  const breakdownRows: BreakdownRow[] = rows.map((row) => {
    const incomeBySource: Record<string, number> = {}
    const expenseBySource: Record<string, number> = {}

    if (row.incomeBreakdown && row.incomeBreakdown.length > 0) {
      for (const item of row.incomeBreakdown) {
        incomeBySource[item.id] = (incomeBySource[item.id] ?? 0) + item.amount
      }
    } else {
      if (row.savings > 0) incomeBySource['savings'] = row.savings
      if (row.growth > 0) incomeBySource['growth'] = row.growth
    }

    if (row.expenseBreakdown && row.expenseBreakdown.length > 0) {
      for (const item of row.expenseBreakdown) {
        expenseBySource[item.id] = (expenseBySource[item.id] ?? 0) + item.amount
      }
    } else {
      if (row.withdrawal > 0) expenseBySource['withdrawal'] = row.withdrawal
    }

    for (const [id, val] of Object.entries(incomeBySource)) {
      if (val > 0) incomeIdsWithData.add(id)
    }
    for (const [id, val] of Object.entries(expenseBySource)) {
      if (val > 0) expenseIdsWithData.add(id)
    }

    const totalIncome = Object.values(incomeBySource).reduce((s, v) => s + v, 0)
    const totalExpenses = Object.values(expenseBySource).reduce((s, v) => s + v, 0)

    return {
      age: row.age,
      phase: row.phase,
      incomeBySource,
      expenseBySource,
      totalIncome,
      totalExpenses,
      surplus: totalIncome - totalExpenses,
    }
  })

  const incomeLayers = candidateIncomeLayers.filter(l => incomeIdsWithData.has(l.id))
  const expenseLayers = candidateExpenseLayers.filter(l => expenseIdsWithData.has(l.id))

  return { rows: breakdownRows, incomeLayers, expenseLayers }
}
