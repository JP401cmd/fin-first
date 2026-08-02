// lib/budgets-data-loader.ts
// Server-side data loader for the Budgets page.
// Follows the same pattern as identity-data-loader.ts and core-data-loader.ts.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
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
  monthlyAverages: Record<string, { avg: number; months: number }>
}

// ── Loader ────────────────────────────────────────────────────

export const loadBudgetsData = cache(async (supabase: SupabaseClient): Promise<BudgetsPageData> => {
  const user = await getCachedUser(supabase)
  if (!user) {
    throw new Error('Not authenticated')
  }

  // Current month boundaries
  const now = new Date()
  const monthDate = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthStart = localDateStr(monthDate)
  const monthEnd = localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 1))
  const currentPeriod = formatPeriod(monthDate)

  // 12-month historical window (exclusive of current month) for averages.
  const twelveMonthsAgoStart = localDateStr(new Date(now.getFullYear(), now.getMonth() - 12, 1))

  // Parallel batch: budgets, transactions, rollovers, budget amounts, goals, 12mo history
  const [budgetsRes, txRes, rolloversRes, amountsRes, goalsRes, historyTxRes] = await Promise.all([
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
      .select('id, user_id, budget_id, period, carried_amount, rollover_type, created_at')
      .eq('period', currentPeriod),
    supabase
      .from('budget_amounts')
      .select('id, budget_id, effective_from, amount'),
    supabase
      .from('goals')
      .select('id, name, goal_type, target_value, current_value, target_date, icon, color, is_completed, budget_id')
      .order('sort_order', { ascending: true }),
    // Expliciete `.limit(1000)` = de PostgREST-cap (supabase/config.toml
    // max_rows = 1000): een client-`.limit()` boven die grens is een no-op, dus dit
    // maakt de bestaande stille afkap zichtbaar i.p.v. impliciet. Byte-identiek aan
    // de vroegere ongelimiteerde query (die óók op 1000 werd afgekapt). Voor een
    // tx-rijke gebruiker kappen de 12-maands gemiddelden hieronder dus stil af; de
    // structurele route is het maandaggregaat (ADR 0050 — kan per definitie niet
    // afkappen) of keyset-paginatie. Beide vallen buiten deze wijziging.
    supabase
      .from('transactions')
      .select('id, budget_id, amount, date, transaction_type, is_split')
      .gte('date', twelveMonthsAgoStart)
      .lt('date', monthStart)
      .limit(1000),
  ])

  // ── Build budget tree ───────────────────────────────────────
  const allBudgets = (budgetsRes.data ?? []) as Budget[]
  const parents = allBudgets.filter((b) => !b.parent_id)
  const children = allBudgets.filter((b) => !!b.parent_id)

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

  // ── Fetch splits for split transactions (current month + history in parallel) ──
  // Both splits queries depend only on their own preceding transaction batch
  // (txData resp. historyTx), not on each other — so we start them together and
  // await them as a pair to avoid a sequential round-trip.
  const splitTxIds = txData.filter(t => t.is_split).map(t => t.id)

  const historyTx = (historyTxRes.data ?? []) as Array<{
    id: string
    budget_id: string | null
    amount: number
    date: string
    transaction_type: string | null
    is_split: boolean | null
  }>
  const historySplitTxIds = historyTx.filter(t => t.is_split).map(t => t.id)

  const splitsPromise = splitTxIds.length > 0
    ? supabase
        .from('transaction_splits')
        .select('transaction_id, budget_id, amount, transactions(id, account_id, date, description, counterparty_name)')
        .in('transaction_id', splitTxIds)
    : null
  const historySplitsPromise = historySplitTxIds.length > 0
    ? supabase
        .from('transaction_splits')
        .select('transaction_id, budget_id, amount, transactions!inner(transaction_type, date)')
        .in('transaction_id', historySplitTxIds)
    : null

  const [splitsRes, historySplitsRes] = await Promise.all([splitsPromise, historySplitsPromise])

  if (splitsRes) {
    const { data: splits } = splitsRes
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

  // ── 12-month averages per budget ────────────────────────────
  // Excludes transfers (they are not real spending/income). Averages are
  // computed over the number of distinct months in which the budget had
  // any activity, not over a fixed 12-month denominator — this avoids
  // pulling seasonal budgets (e.g. vakantie) down to near-zero.
  let historySplits: Array<{ transaction_id: string; budget_id: string | null; amount: number; transaction_type: string | null; date: string }> = []
  if (historySplitsRes) {
    const { data: splits } = historySplitsRes
    if (splits) {
      historySplits = (splits as unknown as Array<{
        transaction_id: string
        budget_id: string | null
        amount: number
        transactions: { transaction_type: string | null; date: string } | null
      }>).map((s) => ({
        transaction_id: s.transaction_id,
        budget_id: s.budget_id,
        amount: s.amount,
        transaction_type: s.transactions?.transaction_type ?? null,
        date: s.transactions?.date ?? '',
      }))
    }
  }

  const aggregates = new Map<string, { total: number; months: Set<string> }>()
  const addToAggregate = (budgetId: string, amount: number, date: string, transactionType: string | null) => {
    if (transactionType === 'transfer' || transactionType === 'joint_transfer') return
    if (!date) return
    const monthKey = date.slice(0, 7)
    let entry = aggregates.get(budgetId)
    if (!entry) {
      entry = { total: 0, months: new Set() }
      aggregates.set(budgetId, entry)
    }
    entry.total += Math.abs(Number(amount) || 0)
    entry.months.add(monthKey)
  }

  for (const t of historyTx) {
    // Parent row of a split: skip — amounts live on the splits.
    if (t.is_split) continue
    if (!t.budget_id) continue
    addToAggregate(t.budget_id, t.amount, t.date, t.transaction_type)
  }
  for (const s of historySplits) {
    if (!s.budget_id) continue
    addToAggregate(s.budget_id, s.amount, s.date, s.transaction_type)
  }

  const monthlyAverages: Record<string, { avg: number; months: number }> = {}
  for (const [budgetId, { total, months }] of aggregates) {
    const count = months.size
    if (count === 0) continue
    monthlyAverages[budgetId] = { avg: total / count, months: count }
  }

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
    monthlyAverages,
  }
})
