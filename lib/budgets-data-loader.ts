// lib/budgets-data-loader.ts
// Server-side data loader for the Budgets page.
// Follows the same pattern as identity-data-loader.ts and core-data-loader.ts.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Budget, BudgetWithChildren } from '@/lib/budget-data'
import type { BudgetRollover } from '@/lib/budget-rollover'
import { formatPeriod } from '@/lib/budget-rollover'

// ── Helper ────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Types ─────────────────────────────────────────────────────

export type BudgetTransaction = {
  id?: string
  account_id?: string
  budget_id: string
  amount: number
  date: string
  description: string
  counterparty_name: string | null
  is_split_row?: boolean
}

export type BudgetGoal = {
  id: string
  name: string
  goal_type: string
  target_value: number
  current_value: number
  target_date: string | null
  icon: string
  color: string
  is_completed: boolean
  budget_id: string | null
}

export type BudgetAmountRow = {
  id: string
  budget_id: string
  effective_from: string
  amount: number
}

// ── Result type ───────────────────────────────────────────────

export interface BudgetsPageData {
  budgets: BudgetWithChildren[]
  spending: Record<string, number>
  transactions: BudgetTransaction[]
  rollovers: BudgetRollover[]
  budgetAmounts: BudgetAmountRow[]
  goals: BudgetGoal[]
  uncategorizedCount: number
  uncategorizedTotal: number
  currentPeriod: string  // e.g. '2026-03'
  monthStart: string     // e.g. '2026-03-01'
  monthEnd: string       // e.g. '2026-04-01'
}

// ── Loader ────────────────────────────────────────────────────

export const loadBudgetsData = cache(async (supabase: SupabaseClient): Promise<BudgetsPageData> => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  // Current month boundaries
  const now = new Date()
  const monthDate = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthStart = localDateStr(monthDate)
  const monthEnd = localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 1))
  const currentPeriod = formatPeriod(monthDate)

  // Parallel batch: budgets, transactions, rollovers, budget amounts, goals
  const [budgetsRes, txRes, rolloversRes, amountsRes, goalsRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('*')
      .eq('is_archived', false)
      .order('sort_order', { ascending: true }),
    supabase
      .from('transactions')
      .select('id, account_id, is_split, budget_id, amount, date, description, counterparty_name, transaction_type')
      .gte('date', monthStart)
      .lt('date', monthEnd)
      .order('date', { ascending: false }),
    supabase
      .from('budget_rollovers')
      .select('*')
      .eq('period', currentPeriod),
    supabase
      .from('budget_amounts')
      .select('*'),
    supabase
      .from('goals')
      .select('id, name, goal_type, target_value, current_value, target_date, icon, color, is_completed, budget_id')
      .order('sort_order', { ascending: true }),
  ])

  // ── Build budget tree ───────────────────────────────────────
  const allBudgets = (budgetsRes.data ?? []) as Budget[]
  const parents = allBudgets.filter((b) => !b.parent_id)
  const children = allBudgets.filter((b) => b.parent_id && Number(b.default_limit) > 0)

  const budgets: BudgetWithChildren[] = parents.map((parent) => ({
    ...parent,
    children: children
      .filter((c) => c.parent_id === parent.id)
      .sort((a, b) => a.sort_order - b.sort_order),
  }))

  // ── Build spending map and transaction list ─────────────────
  const txData = txRes.data ?? []
  const spending: Record<string, number> = {}
  const transactions: BudgetTransaction[] = []

  for (const t of txData) {
    if (t.budget_id) {
      spending[t.budget_id] = (spending[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
      transactions.push({
        id: t.id,
        account_id: t.account_id,
        budget_id: t.budget_id,
        amount: t.amount,
        date: t.date,
        description: t.description,
        counterparty_name: t.counterparty_name,
      })
    }
  }

  // ── Fetch splits for split transactions ─────────────────────
  const splitTxIds = txData.filter(t => t.is_split).map(t => t.id)

  if (splitTxIds.length > 0) {
    const { data: splits } = await supabase
      .from('transaction_splits')
      .select('transaction_id, budget_id, amount, transactions(id, account_id, date, description, counterparty_name)')
      .in('transaction_id', splitTxIds)

    if (splits) {
      for (const s of splits as unknown as Array<{
        transaction_id: string
        budget_id: string | null
        amount: number
        transactions: { id: string; account_id: string; date: string; description: string; counterparty_name: string | null } | null
      }>) {
        if (s.budget_id) {
          spending[s.budget_id] = (spending[s.budget_id] ?? 0) + Math.abs(Number(s.amount))
        }
        if (s.budget_id && s.transactions) {
          transactions.push({
            id: s.transaction_id,
            account_id: s.transactions.account_id,
            budget_id: s.budget_id,
            amount: s.amount,
            date: s.transactions.date,
            description: s.transactions.description,
            counterparty_name: s.transactions.counterparty_name,
            is_split_row: true,
          })
        }
      }
    }
  }

  // ── Uncategorized stats ─────────────────────────────────────
  const uncategorized = txData.filter(
    (t) =>
      !t.budget_id &&
      !t.is_split &&
      t.transaction_type !== 'transfer' &&
      t.transaction_type !== 'income' &&
      Number(t.amount) < 0,
  )
  const uncategorizedCount = uncategorized.length
  const uncategorizedTotal = uncategorized.reduce(
    (sum, t) => sum + Math.abs(Number(t.amount)),
    0,
  )

  return {
    budgets,
    spending,
    transactions,
    rollovers: (rolloversRes.data ?? []) as BudgetRollover[],
    budgetAmounts: (amountsRes.data ?? []) as BudgetAmountRow[],
    goals: (goalsRes.data ?? []) as BudgetGoal[],
    uncategorizedCount,
    uncategorizedTotal,
    currentPeriod,
    monthStart,
    monthEnd,
  }
})
