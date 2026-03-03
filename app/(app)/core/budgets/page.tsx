'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Plus, X, Pencil, Save, Trash2,
  GitFork, CircleDot, AlertTriangle, CheckCircle2, Heart,
  TrendingUp, AlertCircle, BarChart3, EyeOff, MessageCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDefaultBudgets, type Budget, type BudgetWithChildren } from '@/lib/budget-data'
import { BudgetIcon, formatCurrency, getTypeColors, iconMap, iconOptions, type BudgetType } from '@/components/app/budget-shared'
import { buildSegments, typeColors, childTypeColors } from '@/components/app/budget-donut'
import { type BudgetRollover, formatPeriod, getCarriedAmount, getPreviousPeriod, computeRollover } from '@/lib/budget-rollover'
import { BudgetTree } from '@/components/app/budget-tree'
import { BudgetDonut } from '@/components/app/budget-donut'
import { useDailyExpenseRate, eurToFreedomTime } from '@/components/app/freedom-time-label'
import { BudgetSparkline, SparklineWithLabel, type SparklineDataPoint } from '@/components/app/budget-sparkline'
import { computeBudgetForecast, getConfidenceLabel, getConfidenceColors, type BudgetForecast } from '@/lib/budget-forecast'
import { OwnershipToggle, OwnershipBadge, useHouseholdStatus, type OwnershipType } from '@/components/app/ownership-toggle'
import { usePerspective } from '@/components/app/perspective-provider'
import { SpendingConfidenceBadge, SpendingVarianceDetailPanel, calculateSpendingVariance, type SpendingVarianceData } from '@/components/app/spending-confidence-indicator'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { GoalForm } from '@/components/app/goal-form'
import { EnvelopeTransferSheet } from '@/components/app/envelope-transfer-sheet'
import { UncategorizedTransactionsBanner } from '@/components/app/uncategorized-transactions-banner'
import { TransactionForm } from '@/components/app/transaction-form'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'


type Goal = {
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

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function BudgetsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { perspective } = usePerspective()
  const { openWithMessage } = useChatContext()
  const [budgets, setBudgets] = useState<BudgetWithChildren[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null)
  const [modalStep, setModalStep] = useState<'detail' | 'edit'>('detail')
  const [viewMode, setViewMode] = useState<'tree' | 'donut'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('budgets-view-mode')
      if (stored === 'tree' || stored === 'donut') return stored
    }
    return 'tree'
  })
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [spending, setSpending] = useState<Record<string, number>>({})
  const [transactions, setTransactions] = useState<{ id?: string; account_id?: string; budget_id: string; amount: number; date: string; description: string; counterparty_name: string | null; is_split_row?: boolean }[]>([])
  const [rollovers, setRollovers] = useState<BudgetRollover[]>([])
  const [budgetAmounts, setBudgetAmounts] = useState<{ id: string; budget_id: string; effective_from: string; amount: number }[]>([])
  const [showAllocationModal, setShowAllocationModal] = useState(false)
  const [goals, setGoals] = useState<Goal[]>([])
  const [budgetRolloverHistory, setBudgetRolloverHistory] = useState<BudgetRollover[]>([])
  const [loadingRolloverHistory, setLoadingRolloverHistory] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEnvelopeTransfer, setShowEnvelopeTransfer] = useState(false)
  const [copyingMonth, setCopyingMonth] = useState(false)
  const [uncategorizedCount, setUncategorizedCount] = useState(0)
  const [uncategorizedTotal, setUncategorizedTotal] = useState(0)

  const monthStart = localDateStr(monthDate)
  const monthEnd = localDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))

  const loadSpending = useCallback(async () => {
    const supabase = createClient()
    let spendQuery = supabase
      .from('transactions')
      .select('id, account_id, is_split, budget_id, amount, date, description, counterparty_name, transaction_type')
      .gte('date', monthStart)
      .lt('date', monthEnd)
      .order('date', { ascending: false })

    if (perspective === 'personal') {
      spendQuery = spendQuery.eq('ownership', 'personal')
    }

    const { data } = await spendQuery

    if (data && data.length > 0) {
      const map: Record<string, number> = {}
      for (const t of data) {
        if (t.budget_id) {
          map[t.budget_id] = (map[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
        }
      }

      // Add spending from split transactions
      const splitTxIds = data.filter(t => t.is_split).map(t => t.id)
      let splitRows: typeof transactions = []
      if (splitTxIds.length > 0) {
        const { data: splits } = await supabase
          .from('transaction_splits')
          .select('transaction_id, budget_id, amount, transactions(id, account_id, date, description, counterparty_name)')
          .in('transaction_id', splitTxIds)
        if (splits) {
          for (const s of splits) {
            if (s.budget_id) {
              map[s.budget_id] = (map[s.budget_id] ?? 0) + Math.abs(Number(s.amount))
            }
          }
          splitRows = (splits as unknown as Array<{
            transaction_id: string
            budget_id: string | null
            amount: number
            transactions: { id: string; account_id: string; date: string; description: string; counterparty_name: string | null } | null
          }>)
            .filter(s => s.budget_id && s.transactions)
            .map(s => ({
              id: s.transaction_id,
              account_id: (s.transactions as { account_id: string }).account_id,
              budget_id: s.budget_id as string,
              amount: s.amount,
              date: (s.transactions as { date: string }).date,
              description: (s.transactions as { description: string }).description,
              counterparty_name: (s.transactions as { counterparty_name: string | null }).counterparty_name,
              is_split_row: true,
            }))
        }
      }

      setSpending(map)
      setTransactions([
        ...data.filter(t => t.budget_id) as typeof transactions,
        ...splitRows,
      ])

      // Compute uncategorized expenses (no budget_id, not a transfer, not income)
      const uncategorized = data.filter(
        (t) =>
          !t.budget_id &&
          !t.is_split &&
          t.transaction_type !== 'transfer' &&
          t.transaction_type !== 'income' &&
          Number(t.amount) < 0,
      )
      setUncategorizedCount(uncategorized.length)
      setUncategorizedTotal(
        uncategorized.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0),
      )
    } else {
      setSpending({})
      setTransactions([])
      setUncategorizedCount(0)
      setUncategorizedTotal(0)
    }

    // Fetch rollovers for the current month period
    const currentPeriod = formatPeriod(monthDate)
    const { data: rolloverData } = await supabase
      .from('budget_rollovers')
      .select('*')
      .eq('period', currentPeriod)

    // Fetch budget amount overrides
    const { data: amountsData } = await supabase
      .from('budget_amounts')
      .select('*')
    if (amountsData) setBudgetAmounts(amountsData as { id: string; budget_id: string; effective_from: string; amount: number }[])

    // Auto-compute rollovers if none exist for the current period
    if (!rolloverData || rolloverData.length === 0) {
      const prevPeriod = getPreviousPeriod(currentPeriod)
      const prevMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1)
      const prevStart = localDateStr(prevMonthDate)
      const prevEnd = localDateStr(monthDate)

      // Fetch previous month rollovers and spending
      const [prevRolloversRes, prevTxRes, budgetsForRolloverRes] = await Promise.all([
        supabase.from('budget_rollovers').select('*').eq('period', prevPeriod),
        supabase.from('transactions').select('id, is_split, budget_id, amount').gte('date', prevStart).lt('date', prevEnd),
        supabase.from('budgets').select('id, default_limit, rollover_type, parent_id').not('parent_id', 'is', null),
      ])

      const prevRollovers = (prevRolloversRes.data ?? []) as BudgetRollover[]
      const prevTx = prevTxRes.data ?? []
      const childBudgets = budgetsForRolloverRes.data ?? []

      // Calculate previous month spending per budget
      const prevSpending: Record<string, number> = {}
      for (const t of prevTx) {
        if (t.budget_id) {
          prevSpending[t.budget_id] = (prevSpending[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
        }
      }

      // Add spending from split transactions (previous month)
      const prevSplitTxIds = prevTx.filter(t => t.is_split).map(t => t.id)
      if (prevSplitTxIds.length > 0) {
        const { data: prevSplits } = await supabase
          .from('transaction_splits')
          .select('budget_id, amount')
          .in('transaction_id', prevSplitTxIds)
        if (prevSplits) {
          for (const s of prevSplits) {
            if (s.budget_id) {
              prevSpending[s.budget_id] = (prevSpending[s.budget_id] ?? 0) + Math.abs(Number(s.amount))
            }
          }
        }
      }

      // Only compute rollovers if there was spending data in the previous month
      if (prevTx.length > 0) {
        const newRollovers: { budget_id: string; period: string; carried_amount: number; rollover_type: string }[] = []

        for (const budget of childBudgets) {
          if (budget.rollover_type === 'reset') continue
          const prevCarry = getCarriedAmount(prevRollovers, prevPeriod)
          const { carry } = computeRollover(
            Number(budget.default_limit),
            prevSpending[budget.id] ?? 0,
            prevCarry,
            budget.rollover_type ?? 'reset',
          )
          if (carry > 0) {
            newRollovers.push({
              budget_id: budget.id,
              period: currentPeriod,
              carried_amount: carry,
              rollover_type: budget.rollover_type ?? 'reset',
            })
          }
        }

        if (newRollovers.length > 0) {
          await supabase.from('budget_rollovers').insert(newRollovers)
          const { data: freshRollovers } = await supabase
            .from('budget_rollovers')
            .select('*')
            .eq('period', currentPeriod)
          setRollovers((freshRollovers ?? []) as BudgetRollover[])
          return
        }
      }
    }

    setRollovers((rolloverData ?? []) as BudgetRollover[])
  }, [monthStart, monthEnd, monthDate, perspective])

  const loadBudgets = useCallback(async () => {
    try {
      const supabase = createClient()
      let query = supabase
        .from('budgets')
        .select('*')
        .eq('is_archived', false)
        .order('sort_order', { ascending: true })

      // Filter by perspective: personal shows only own budgets, household shows all
      if (perspective === 'personal') {
        query = query.eq('ownership', 'personal')
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        await seedBudgets(supabase)
        return
      }

      const parents = (data as Budget[]).filter((b) => !b.parent_id)
      const children = (data as Budget[]).filter((b) => b.parent_id && Number(b.default_limit) > 0)

      const tree: BudgetWithChildren[] = parents.map((parent) => ({
        ...parent,
        children: children
          .filter((c) => c.parent_id === parent.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      }))

      setBudgets(tree)
    } catch (err) {
      console.error('Error loading budgets:', err)
      setError('Kon budgetten niet laden. Probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }, [perspective])

  const loadGoals = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('goals')
      .select('id, name, goal_type, target_value, current_value, target_date, icon, color, is_completed, budget_id')
      .order('sort_order', { ascending: true })
    if (data) setGoals(data as Goal[])
  }, [])

  async function seedBudgets(supabase: ReturnType<typeof createClient>) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Guard: check if budgets already exist (race condition protection)
    const { count } = await supabase.from('budgets').select('id', { count: 'exact', head: true })
    if (count && count > 0) { await loadBudgets(); return }

    const defaults = getDefaultBudgets()

    for (const parent of defaults) {
      const { data: parentData, error: parentError } = await supabase
        .from('budgets')
        .insert({
          user_id: user.id,
          name: parent.name,
          slug: parent.slug,
          icon: parent.icon,
          description: parent.description,
          default_limit: parent.default_limit,
          budget_type: parent.budget_type,
          is_essential: parent.is_essential,
          priority_score: parent.priority_score,
          sort_order: parent.sort_order,
        })
        .select('id')
        .single()

      if (parentError || !parentData) continue

      if (parent.children) {
        const childRows = parent.children.map((child, idx) => ({
          user_id: user.id,
          parent_id: parentData.id,
          name: child.name,
          slug: child.slug,
          icon: child.icon,
          description: child.description,
          default_limit: child.default_limit,
          budget_type: parent.budget_type,
          sort_order: idx,
        }))

        await supabase.from('budgets').insert(childRows)
      }
    }

    await loadBudgets()
  }

  useEffect(() => {
    loadBudgets()
    loadGoals()
  }, [loadBudgets, loadGoals])

  // Run loadSpending independently — no longer gated on loadBudgets completing.
  // loadSpending has no dependency on budgets state, so it can fetch in parallel.
  useEffect(() => {
    loadSpending()
  }, [loadSpending])

  useEffect(() => {
    if (!selectedBudgetId) { setBudgetRolloverHistory([]); return }
    setLoadingRolloverHistory(true)
    const supabase = createClient()
    supabase
      .from('budget_rollovers')
      .select('id, budget_id, period, carried_amount, rollover_type, created_at')
      .eq('budget_id', selectedBudgetId)
      .order('period', { ascending: false })
      .then(({ data }) => {
        setBudgetRolloverHistory((data ?? []) as BudgetRollover[])
        setLoadingRolloverHistory(false)
      })
  }, [selectedBudgetId])

  // Open modal from URL search params (e.g. ?budget=id&edit=true)
  useEffect(() => {
    if (loading || budgets.length === 0) return
    const budgetParam = searchParams.get('budget')
    if (budgetParam) {
      const exists = budgets.some(b => b.id === budgetParam || b.children.some(c => c.id === budgetParam))
      if (exists) {
        setSelectedBudgetId(budgetParam)
        setModalStep(searchParams.get('edit') === 'true' ? 'edit' : 'detail')
      }
      // Clean up URL params without triggering navigation
      router.replace('/core/budgets', { scroll: false })
    }
  }, [loading, budgets, searchParams, router])

  function openBudgetModal(id: string) {
    setSelectedBudgetId(id)
    setModalStep('detail')
  }

  function closeBudgetModal() {
    setSelectedBudgetId(null)
    setModalStep('detail')
  }

  // Find the selected budget (parent or child)
  const selectedBudget = selectedBudgetId
    ? budgets.find((b) => b.id === selectedBudgetId) ??
      budgets.flatMap((b) => b.children).find((c) => c.id === selectedBudgetId) ?? null
    : null
  const selectedParent = selectedBudgetId
    ? budgets.find((b) => b.id === selectedBudgetId || b.children.some((c) => c.id === selectedBudgetId)) ?? null
    : null
  // Siblings for ordering: parents of same type, or children of same parent
  const selectedSiblings: Budget[] = selectedBudget
    ? selectedBudget.parent_id
      ? (selectedParent?.children ?? [])
      : budgets.filter((b) => b.budget_type === selectedBudget.budget_type)
    : []

  function prevMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }

  function nextMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  function toggleViewMode(mode: 'tree' | 'donut') {
    setViewMode(mode)
    localStorage.setItem('budgets-view-mode', mode)
  }

  function getSpent(b: Budget): number {
    return spending[b.id] ?? 0
  }

  function getParentSpent(parent: BudgetWithChildren): number {
    if (parent.children.length === 0) return getSpent(parent)
    return parent.children.reduce((sum, c) => sum + getSpent(c), 0)
  }

  // Pre-indexed lookups: O(1) access instead of O(N) filter on every call.
  const budgetAmountsIndex = useMemo(() => {
    const idx: Record<string, { budget_id: string; effective_from: string; amount: number }[]> = {}
    for (const a of budgetAmounts) {
      if (!idx[a.budget_id]) idx[a.budget_id] = []
      idx[a.budget_id].push(a)
    }
    return idx
  }, [budgetAmounts])

  const rolloversIndex = useMemo(() => {
    const idx: Record<string, BudgetRollover[]> = {}
    for (const r of rollovers) {
      if (!idx[r.budget_id]) idx[r.budget_id] = []
      idx[r.budget_id].push(r)
    }
    return idx
  }, [rollovers])

  const currentPeriodLabel = useMemo(() => formatPeriod(monthDate), [monthDate])
  const displayDate = useMemo(() => localDateStr(monthDate), [monthDate])

  function getEffectiveLimit(budget: Budget): number {
    const budgetRollovers = rolloversIndex[budget.id] ?? []
    const carry = getCarriedAmount(budgetRollovers, currentPeriodLabel)

    // Check budget_amounts for period-specific limit override
    const applicable = (budgetAmountsIndex[budget.id] ?? [])
      .filter(a => a.effective_from <= displayDate)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))

    const baseLimit = applicable.length > 0
      ? Number(applicable[0].amount)
      : Number(budget.default_limit)

    return baseLimit + carry
  }

  function getParentEffectiveLimit(parent: BudgetWithChildren): number {
    if (parent.children.length === 0) return getEffectiveLimit(parent)
    return parent.children.reduce((sum, c) => sum + getEffectiveLimit(c), 0)
  }

  function getBudgetCarry(budget: Budget): number {
    const budgetRollovers = rolloversIndex[budget.id] ?? []
    return getCarriedAmount(budgetRollovers, currentPeriodLabel)
  }

  async function copyFromLastMonth() {
    if (copyingMonth) return
    setCopyingMonth(true)
    const supabase = createClient()
    const prevPeriod = getPreviousPeriod(formatPeriod(monthDate))
    const prevDate = `${prevPeriod}-01`
    const currentDate = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`

    // Read all budget_amounts from previous month
    const { data: prevAmounts } = await supabase
      .from('budget_amounts')
      .select('budget_id, amount')
      .eq('effective_from', prevDate)

    if (prevAmounts && prevAmounts.length > 0) {
      // Delete existing current-month amounts for these budgets
      const budgetIds = prevAmounts.map(a => a.budget_id)
      await supabase.from('budget_amounts').delete()
        .in('budget_id', budgetIds)
        .eq('effective_from', currentDate)

      // Insert previous month's amounts for current month
      await supabase.from('budget_amounts').insert(
        prevAmounts.map(a => ({
          budget_id: a.budget_id,
          effective_from: currentDate,
          amount: Number(a.amount),
        }))
      )

      await loadSpending()
    }
    setCopyingMonth(false)
  }

  const incomeBudgets = budgets.filter((b) => b.budget_type === 'income')
  const expenseBudgets = budgets.filter((b) => b.budget_type === 'expense')
  const savingsBudgets = budgets.filter((b) => b.budget_type === 'savings')
  const debtBudgets = budgets.filter((b) => b.budget_type === 'debt')
  const archiveBudgets = budgets.filter((b) => b.budget_type === 'archive')

  const totalIncome = incomeBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalIncomeActual = incomeBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)
  const totalExpenseBudget = expenseBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalExpenseSpent = expenseBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)
  const totalSavingsBudget = savingsBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalSavingsActual = savingsBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)
  const totalDebtBudget = debtBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalDebtActual = debtBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)

  const totalAllocated = totalExpenseBudget + totalSavingsBudget + totalDebtBudget
  const teVerdelen = totalIncome - totalAllocated
  const dekkingsgraad = totalIncome > 0 ? (totalAllocated / totalIncome) * 100 : 0

  // G3: Budget insights voor AI-kaart (overschreden + bijna vol)
  const childBudgetsFlat = budgets.flatMap(g =>
    g.children.length > 0 ? g.children : (g.budget_type !== 'income' ? [g as Budget] : [])
  )
  const overschredenInzichten = childBudgetsFlat
    .filter(b => {
      const lim = getEffectiveLimit(b)
      return lim > 0 && (spending[b.id] ?? 0) >= lim
    })
    .map(b => {
      const lim = getEffectiveLimit(b)
      const spent = spending[b.id] ?? 0
      return { name: b.name, spent, limit: lim, pct: Math.round((spent / lim) * 100) }
    })
  const bijnaVolInzichten = childBudgetsFlat
    .filter(b => {
      const lim = getEffectiveLimit(b)
      const pct = lim > 0 ? (spending[b.id] ?? 0) / lim : 0
      return pct >= 0.8 && pct < 1.0
    })
    .map(b => {
      const lim = getEffectiveLimit(b)
      const spent = spending[b.id] ?? 0
      return { name: b.name, spent, limit: lim, pct: Math.round((spent / lim) * 100) }
    })
  const hasAIInsights = overschredenInzichten.length > 0 || bijnaVolInzichten.length > 0

  // F2-09: beschikbaar per sub-budget (effectieve limiet incl. rollover − uitgegeven)
  const beschikbaarMap: Record<string, number> = {}
  for (const group of budgets) {
    const items = group.children.length > 0 ? group.children : [group as Budget]
    for (const b of items) {
      beschikbaarMap[b.id] = getEffectiveLimit(b) - (spending[b.id] ?? 0)
    }
  }

  // F2-10: dekkingsratio werkelijk ontvangen inkomen vs. verwacht inkomen
  const coverageRatio = totalIncome > 0 ? Math.min(1, totalIncomeActual / totalIncome) : 1

  const monthLabel = monthDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        {/* Month selector skeleton */}
        <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
          <div className="mb-6 flex items-center justify-between gap-2">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-[var(--subtle)]" />
            <div className="h-6 w-36 animate-pulse rounded-md bg-[var(--subtle)]" />
            <div className="h-9 w-9 animate-pulse rounded-lg bg-[var(--subtle)]" />
            <div className="ml-auto hidden h-8 w-36 animate-pulse rounded-[var(--r)] bg-[var(--subtle)] sm:block" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="h-3 w-16 animate-pulse rounded bg-[var(--subtle)]" />
                <div className="h-7 w-24 animate-pulse rounded-md bg-[var(--subtle)]" />
                <div className="h-3 w-20 animate-pulse rounded bg-[var(--subtle)]" />
              </div>
            ))}
          </div>
        </section>

        {/* View mode toggle skeleton */}
        <div className="mt-6 flex items-center gap-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-8 w-20 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
          ))}
        </div>

        {/* Budget tree skeleton */}
        <div className="mt-6 space-y-4">
          {[1,2,3].map(group => (
            <div key={group} className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
              {/* Group header */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 animate-pulse rounded-lg bg-[var(--subtle)]" />
                  <div>
                    <div className="h-4 w-28 animate-pulse rounded bg-[var(--subtle)]" />
                    <div className="mt-1 h-3 w-20 animate-pulse rounded bg-[var(--subtle)]" />
                  </div>
                </div>
                <div className="h-5 w-16 animate-pulse rounded bg-[var(--subtle)]" />
              </div>
              {/* Progress bar skeleton */}
              <div className="mb-4 h-1.5 w-full animate-pulse rounded-full bg-[var(--subtle)]" />
              {/* Child rows */}
              <div className="space-y-2 pl-4">
                {[1,2,3].map(child => (
                  <div key={child} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 animate-pulse rounded-md bg-[var(--subtle)]" />
                      <div className="h-4 w-24 animate-pulse rounded bg-[var(--subtle)]" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-20 animate-pulse rounded-full bg-[var(--subtle)]" />
                      <div className="h-4 w-14 animate-pulse rounded bg-[var(--subtle)]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); loadBudgets() }} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Month selector */}
      <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
        <div className="mb-6 flex items-center justify-between gap-2">
          <button
            onClick={prevMonth}
            className="rounded-lg p-2 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold capitalize text-[var(--ink)]">
            {monthLabel}
          </h2>
          <button
            onClick={nextMonth}
            className="rounded-lg p-2 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={copyFromLastMonth}
            disabled={copyingMonth}
            title="Kopieer budgetbedragen van vorige maand"
            className="ml-auto hidden sm:inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] disabled:opacity-50"
          >
            {copyingMonth ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border border-[var(--ink-3)] border-t-transparent" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Kopieer vorige maand
          </button>
        </div>

        {/* Totals split: Income / Expenses / Savings / Debt — budget limits as primary */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 text-center sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-emerald-600 uppercase">Inkomen</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{formatCurrency(totalIncome)}</p>
            <p className="text-xs text-[var(--ink-3)]">{formatCurrency(totalIncomeActual)} ontvangen</p>
          </div>
          <div>
            <p className="text-xs font-medium text-kern-600 uppercase">Uitgaven</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{formatCurrency(totalExpenseBudget)}</p>
            <p className="text-xs text-[var(--ink-3)]">{formatCurrency(totalExpenseSpent)} besteed</p>
          </div>
          <div>
            <p className="text-xs font-medium text-wil-600 uppercase">Sparen</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{formatCurrency(totalSavingsBudget)}</p>
            <p className="text-xs text-[var(--ink-3)]">{formatCurrency(totalSavingsActual)} gespaard</p>
            <p className="text-[10px] text-wil-500/70">vrijheid opbouwen</p>
          </div>
          <div>
            <p className="text-xs font-medium text-red-600 uppercase">Schulden</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{formatCurrency(totalDebtBudget)}</p>
            <p className="text-xs text-[var(--ink-3)]">{formatCurrency(totalDebtActual)} afgelost</p>
            <p className="text-[10px] text-red-500/70">vrijheid terugkopen</p>
          </div>
        </div>

        {/* Te Verdelen + Dekkingsgraad */}
        <div className={`mt-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${teVerdelen >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${teVerdelen >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>Te Verdelen</p>
            <p className={`mt-0.5 font-mono text-lg font-bold ${teVerdelen >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {teVerdelen >= 0 ? '' : '–'}{formatCurrency(Math.abs(teVerdelen))}
            </p>
            <p className={`text-[11px] ${teVerdelen >= 0 ? 'text-emerald-600/70' : 'text-red-600/70'}`}>
              {dekkingsgraad.toFixed(0)}% van inkomen toegewezen
            </p>
            {dekkingsgraad > 100 && (
              <p className="mt-1 text-[11px] font-medium text-red-600">
                Je hebt {formatCurrency(Math.abs(teVerdelen))} meer toegewezen dan je verwacht te verdienen.
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowEnvelopeTransfer(true)}
              className="rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              Verplaats →
            </button>
            <button
              type="button"
              onClick={() => setShowAllocationModal(true)}
              className="rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              Budgetplan instellen
            </button>
          </div>
        </div>

        <UncategorizedTransactionsBanner
          count={uncategorizedCount}
          totalAmount={uncategorizedTotal}
          onClick={() => router.push('/core/cash?filterBudget=uncategorized')}
          formatCurrency={formatCurrency}
        />
      </section>

      {/* G3: Will AI Budget Insights kaart */}
      {hasAIInsights && (
        <div className="mt-4 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
          {/* Kleur-accent bovenaan — editorial pattern */}
          <div className="h-1 bg-wil-500" />
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-wil-50 px-2 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-[0.08em] text-wil-700">Will</span>
              <span className="font-sans text-xs font-semibold text-[var(--ink-2)]">Budgetanalyse</span>
            </div>
            <button
              type="button"
              onClick={() => openWithMessage('Analyseer mijn budgetten en geef me de belangrijkste inzichten over overschreden en bijna-volle categorieën')}
              className="min-h-[44px] px-2 font-sans text-[11px] italic text-wil-600 hover:underline"
            >
              Vraag Will →
            </button>
          </div>
          {/* Inzichten */}
          <div className="space-y-2 px-4 py-3">
            {overschredenInzichten.slice(0, 2).map(inzicht => (
              <div key={inzicht.name} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <p className="font-serif text-[13px] italic leading-snug text-[var(--ink-2)]">
                  <strong className="not-italic font-semibold">{inzicht.name}</strong> is {inzicht.pct}% vol —{' '}
                  <span className="text-[var(--ink-3)]">{formatCurrency(inzicht.spent)} van {formatCurrency(inzicht.limit)}</span>
                </p>
              </div>
            ))}
            {bijnaVolInzichten.slice(0, Math.max(0, 2 - Math.min(overschredenInzichten.length, 2))).map(inzicht => (
              <div key={inzicht.name} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-wil-400" />
                <p className="font-serif text-[13px] italic leading-snug text-[var(--ink-2)]">
                  <strong className="not-italic font-semibold">{inzicht.name}</strong> is bijna vol — {inzicht.pct}%{' '}
                  <span className="text-[var(--ink-3)]">({formatCurrency(inzicht.spent)} van {formatCurrency(inzicht.limit)})</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View toggle + New budget button */}
      <div className="mt-3 sm:mt-6 flex items-center justify-between">
        <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-0.5">
          <button
            onClick={() => toggleViewMode('tree')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'tree'
                ? 'bg-zinc-900 text-white'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            <GitFork className="h-3.5 w-3.5" />
            Boom
          </button>
          <button
            onClick={() => toggleViewMode('donut')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'donut'
                ? 'bg-zinc-900 text-white'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            <CircleDot className="h-3.5 w-3.5" />
            Ring
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
        >
          <Plus className="h-4 w-4" />
          Nieuw budget
        </button>
      </div>

      {/* Budget groups */}
      {viewMode === 'tree' ? (
        <>
          {/* F2-10: Inkomensdekking — één keer boven de secties */}
          {coverageRatio < 0.99 && totalIncome > 0 && (
            <div className={`mt-4 flex items-center gap-2 rounded-[var(--r)] border px-3 py-2 ${
              coverageRatio >= 0.8
                ? 'border-kern-200 bg-kern-50 text-kern-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="font-sans text-[11px]">
                <strong>{Math.round(coverageRatio * 100)}% gedekt</strong> — {formatCurrency(totalIncomeActual)} van {formatCurrency(totalIncome)} verwacht inkomen ontvangen
              </span>
            </div>
          )}

          {incomeBudgets.length > 0 && (
            <div className="mt-4 sm:mt-8">
              <h3 className="mb-4 label-editorial text-[var(--ink-2)]">Inkomen</h3>
              <BudgetTree
                groups={incomeBudgets}
                spending={spending}
                budgetType="income"
                onNavigate={(id) => openBudgetModal(id)}
                beschikbaarMap={beschikbaarMap}
              />
            </div>
          )}
          {expenseBudgets.length > 0 && (
            <div className="mt-4 sm:mt-8">
              <h3 className="mb-4 label-editorial text-[var(--ink-2)]">Uitgaven</h3>
              <BudgetTree
                groups={expenseBudgets}
                spending={spending}
                budgetType="expense"
                onNavigate={(id) => openBudgetModal(id)}
                beschikbaarMap={beschikbaarMap}
              />
            </div>
          )}
          {savingsBudgets.length > 0 && (
            <div className="mt-4 sm:mt-8">
              <h3 className="mb-4 label-editorial text-[var(--ink-2)]">Sparen <span className="ml-1 font-normal normal-case tracking-normal text-wil-400/70">— vrijheid opbouwen</span></h3>
              <BudgetTree
                groups={savingsBudgets}
                spending={spending}
                budgetType="savings"
                onNavigate={(id) => openBudgetModal(id)}
                beschikbaarMap={beschikbaarMap}
              />
            </div>
          )}
          {debtBudgets.length > 0 && (
            <div className="mt-4 sm:mt-8">
              <h3 className="mb-4 label-editorial text-[var(--ink-2)]">Schulden <span className="ml-1 font-normal normal-case tracking-normal text-red-400/70">— vrijheid terugkopen</span></h3>
              <BudgetTree
                groups={debtBudgets}
                spending={spending}
                budgetType="debt"
                onNavigate={(id) => openBudgetModal(id)}
                beschikbaarMap={beschikbaarMap}
              />
            </div>
          )}
          {archiveBudgets.length > 0 && (
            <div className="mt-4 sm:mt-8">
              <button
                type="button"
                className="mb-4 flex items-center gap-2 label-editorial text-[var(--ink-4)] hover:text-[var(--ink-3)] transition-colors"
                onClick={() => setShowArchive((prev) => !prev)}
              >
                <EyeOff className="h-3.5 w-3.5" />
                Verborgen
                <span className="ml-1 text-[10px] normal-case tracking-normal font-normal text-[var(--ink-4)]">
                  ({archiveBudgets.length} {archiveBudgets.length === 1 ? 'categorie' : 'categorieën'})
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showArchive ? 'rotate-180' : ''}`} />
              </button>
              {showArchive && (
                <BudgetTree
                  groups={archiveBudgets}
                  spending={spending}
                  budgetType="archive"
                  onNavigate={(id) => openBudgetModal(id)}
                />
              )}
            </div>
          )}
        </>
      ) : (
        <BudgetDonut
          groups={[...incomeBudgets, ...expenseBudgets, ...savingsBudgets, ...debtBudgets]}
          spending={spending}
          onNavigate={(id) => openBudgetModal(id)}
        />
      )}

      {/* Budget allocation modal */}
      {showAllocationModal && (
        <BudgetAllocationModal
          budgets={budgets}
          budgetAmounts={budgetAmounts}
          monthDate={monthDate}
          totalIncome={totalIncome}
          rollovers={rollovers}
          onClose={() => setShowAllocationModal(false)}
          onSaved={() => {
            setShowAllocationModal(false)
            loadSpending()
          }}
        />
      )}

      {/* Budget detail modal */}
      {selectedBudget && modalStep === 'detail' && (
        <BudgetDetailModal
          budget={selectedBudget}
          parent={selectedParent}
          siblings={selectedSiblings}
          spending={spending}
          transactions={transactions}
          allBudgets={budgets}
          rollovers={rollovers}
          monthDate={monthDate}
          getSpent={getSpent}
          getEffectiveLimit={getEffectiveLimit}
          getBudgetCarry={getBudgetCarry}
          goals={goals.filter(g => g.budget_id === selectedBudget?.id)}
          rolloverHistory={budgetRolloverHistory}
          onClose={closeBudgetModal}
          onEdit={() => setModalStep('edit')}
          onSelectChild={(id) => openBudgetModal(id)}
          onDelete={async () => {
            closeBudgetModal()
            await loadBudgets()
            await loadSpending()
          }}
          onReorder={async () => {
            await loadBudgets()
          }}
          onGoalCreated={async () => {
            await loadGoals()
            await loadSpending()
          }}
        />
      )}


      {/* Budget edit modal */}
      {selectedBudget && modalStep === 'edit' && (
        <BudgetEditModal
          budget={selectedBudget}
          isParent={selectedParent?.id === selectedBudget.id && (selectedParent?.children.length ?? 0) > 0}
          childrenLimitSum={
            selectedParent?.id === selectedBudget.id && (selectedParent?.children.length ?? 0) > 0
              ? selectedParent!.children.reduce((sum, c) => sum + Number(c.default_limit), 0)
              : undefined
          }
          onClose={() => setModalStep('detail')}
          onSaved={() => {
            setModalStep('detail')
            loadBudgets()
            loadSpending()
          }}
        />
      )}

      {/* Budget create modal */}
      {showCreateModal && (
        <BudgetCreateModal
          parentBudgets={budgets}
          onClose={() => setShowCreateModal(false)}
          onSaved={() => {
            setShowCreateModal(false)
            loadBudgets()
            loadSpending()
          }}
        />
      )}

      {/* Envelope transfer sheet */}
      {showEnvelopeTransfer && (
        <EnvelopeTransferSheet
          budgets={budgets}
          budgetAmounts={budgetAmounts}
          monthDate={monthDate}
          onClose={() => setShowEnvelopeTransfer(false)}
          onSaved={() => {
            setShowEnvelopeTransfer(false)
            loadSpending()
          }}
        />
      )}
    </div>
  )
}

// ── Budget allocation modal ──────────────────────────────────

function BudgetAllocationModal({
  budgets,
  budgetAmounts,
  monthDate,
  totalIncome,
  rollovers,
  onClose,
  onSaved,
}: {
  budgets: BudgetWithChildren[]
  budgetAmounts: { id: string; budget_id: string; effective_from: string; amount: number }[]
  monthDate: Date
  totalIncome: number
  rollovers: BudgetRollover[]
  onClose: () => void
  onSaved: () => void
}) {
  const displayDate = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`

  const [localLimits, setLocalLimits] = useState<Record<string, string>>(() => {
    const result: Record<string, string> = {}
    const nonIncomeBudgets = budgets.filter(b => b.budget_type !== 'income' && b.budget_type !== 'archive')
    for (const parent of nonIncomeBudgets) {
      const items = parent.children.length > 0 ? parent.children : [parent]
      for (const b of items) {
        const applicable = budgetAmounts
          .filter(a => a.budget_id === b.id && a.effective_from <= displayDate)
          .sort((a, z) => z.effective_from.localeCompare(a.effective_from))
        result[b.id] = String(applicable.length > 0 ? applicable[0].amount : b.default_limit)
      }
    }
    return result
  })

  const [saving, setSaving] = useState(false)

  // Rollovers are automatic carry-overs that already count as allocated on the main page.
  // Include them here so that "te verdelen" matches the main page calculation.
  const currentPeriod = formatPeriod(monthDate)
  const totalCarry = Object.keys(localLimits).reduce((sum, budgetId) => {
    const budgetRollovers = rollovers.filter(r => r.budget_id === budgetId)
    return sum + getCarriedAmount(budgetRollovers, currentPeriod)
  }, 0)

  const localTotal = Object.values(localLimits).reduce((sum, v) => sum + (Number(v) || 0), 0)
  const localTeVerdelen = totalIncome - localTotal - totalCarry

  async function handleSave() {
    if (saving) return
    setSaving(true)
    const effectiveDate = displayDate
    const supabase = createClient()

    for (const [budgetId, amount] of Object.entries(localLimits)) {
      await supabase.from('budget_amounts').delete()
        .eq('budget_id', budgetId).eq('effective_from', effectiveDate)
      await supabase.from('budget_amounts').insert({
        budget_id: budgetId,
        effective_from: effectiveDate,
        amount: Number(amount),
      })
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--paper)] shadow-xl"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Budgetplan instellen</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-4">
          {/* Inkomen referentie (readonly) */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">Verwacht inkomen</p>
            <p className="font-mono text-base font-bold text-[var(--ink)]">{formatCurrency(totalIncome)}</p>
          </div>

          {/* Per budget-groep */}
          {(['expense', 'savings', 'debt'] as const).map(type => {
            const groups = budgets.filter(b => b.budget_type === type)
            if (groups.length === 0) return null
            const typeLabel = type === 'expense' ? 'Uitgaven' : type === 'savings' ? 'Sparen' : 'Schulden'
            return (
              <div key={type} className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">{typeLabel}</p>
                {groups.map(parent => {
                  const items = parent.children.length > 0 ? parent.children : [parent]
                  return items.map(b => (
                    <div key={b.id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink-2)]">{b.name}</span>
                      <div className="relative w-28">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-3)]">€</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={localLimits[b.id] ?? ''}
                          onChange={e => setLocalLimits(prev => ({ ...prev, [b.id]: e.target.value }))}
                          className="w-full rounded-[var(--r)] border border-[var(--border-md)] py-1.5 pl-6 pr-2 text-right font-mono text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                        />
                      </div>
                    </div>
                  ))
                })}
              </div>
            )
          })}
        </div>

        {/* Footer: live te verdelen + opslaan */}
        <div className="space-y-3 border-t border-[var(--border-ed)] px-6 py-4">
          <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${localTeVerdelen >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            <span className="text-xs font-medium text-[var(--ink-2)]">Te Verdelen</span>
            <span className={`font-mono text-sm font-bold ${localTeVerdelen >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {localTeVerdelen >= 0 ? '' : '–'}{formatCurrency(Math.abs(localTeVerdelen))}
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Budget legend (donut-style, under Sankey) ────────────────


// ── Budget detail modal ──────────────────────────────────────

function BudgetDetailModal({
  budget,
  parent,
  siblings,
  spending,
  transactions,
  allBudgets,
  rollovers,
  monthDate,
  getSpent,
  getEffectiveLimit,
  getBudgetCarry,
  goals,
  rolloverHistory,
  onClose,
  onEdit,
  onSelectChild,
  onDelete,
  onReorder,
  onGoalCreated,
}: {
  budget: Budget
  parent: BudgetWithChildren | null
  siblings: Budget[]
  spending: Record<string, number>
  transactions: { id?: string; account_id?: string; budget_id: string; amount: number; date: string; description: string; counterparty_name: string | null; is_split_row?: boolean }[]
  allBudgets: BudgetWithChildren[]
  rollovers: BudgetRollover[]
  monthDate: Date
  getSpent: (b: Budget) => number
  getEffectiveLimit: (b: Budget) => number
  getBudgetCarry: (b: Budget) => number
  goals: Goal[]
  rolloverHistory: BudgetRollover[]
  onClose: () => void
  onEdit: () => void
  onSelectChild: (id: string) => void
  onDelete: () => void
  onReorder: () => void
  onGoalCreated?: () => void
}) {
  const { perspective } = usePerspective()
  const { openWithMessage } = useChatContext()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const [showCreateGoalForm, setShowCreateGoalForm] = useState(false)
  const [goalForm, setGoalForm] = useState({ name: '', target_value: '', target_date: '' })
  const [goalSaving, setGoalSaving] = useState(false)
  const [goalError, setGoalError] = useState('')
  const [showRolloverOverride, setShowRolloverOverride] = useState(false)
  const [overrideAmount, setOverrideAmount] = useState('')
  const [overrideSaving, setOverrideSaving] = useState(false)
  const [showForecastExpanded, setShowForecastExpanded] = useState(false)
  const [showForecastModal, setShowForecastModal] = useState(false)
  type FullTx = { id: string; account_id: string; budget_id: string | null; date: string; amount: number; description: string; counterparty_name: string | null; counterparty_iban: string | null; is_income: boolean; notes: string | null; category_source: string; is_split?: boolean }
  const [txToEdit, setTxToEdit] = useState<FullTx | null>(null)

  async function openTransaction(id: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('transactions')
      .select('id, account_id, budget_id, date, amount, description, counterparty_name, counterparty_iban, is_income, notes, category_source, is_split')
      .eq('id', id)
      .single()
    if (data) setTxToEdit(data as FullTx)
  }

  type HistTxRow = { id: string; account_id: string; amount: number; date: string; description: string; counterparty_name: string | null }
  const [selectedHistMonth, setSelectedHistMonth] = useState<string | null>(null)
  const [histMonthTx, setHistMonthTx] = useState<HistTxRow[]>([])
  const [histMonthTxLoading, setHistMonthTxLoading] = useState(false)

  async function selectHistMonth(monthStart: string) {
    if (selectedHistMonth === monthStart) {
      setSelectedHistMonth(null)
      setHistMonthTx([])
      return
    }
    setSelectedHistMonth(monthStart)
    setHistMonthTxLoading(true)
    const supabase = createClient()
    const d = new Date(monthStart)
    const monthEnd = localDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 1))
    const { data } = await supabase
      .from('transactions')
      .select('id, account_id, amount, date, description, counterparty_name')
      .in('budget_id', budgetIds)
      .gte('date', monthStart)
      .lt('date', monthEnd)
      .order('date', { ascending: false })
    setHistMonthTx((data ?? []) as HistTxRow[])
    setHistMonthTxLoading(false)
  }

  async function handleCreateGoal() {
    if (!goalForm.name.trim() || !goalForm.target_value) {
      setGoalError('Naam en doelbedrag zijn verplicht')
      return
    }
    setGoalSaving(true)
    setGoalError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGoalError('Niet ingelogd'); setGoalSaving(false); return }
    const { error: insertError } = await supabase.from('goals').insert({
      user_id: user.id,
      name: goalForm.name.trim(),
      goal_type: 'savings',
      target_value: parseFloat(goalForm.target_value),
      current_value: 0,
      target_date: goalForm.target_date || null,
      budget_id: budget.id,
      icon: 'Target',
      color: 'teal',
    })
    if (insertError) { setGoalError(insertError.message); setGoalSaving(false); return }
    setGoalSaving(false)
    setShowCreateGoalForm(false)
    setGoalForm({ name: '', target_value: '', target_date: '' })
    onGoalCreated?.()
  }

  async function handleRolloverOverride() {
    if (!overrideAmount) return
    setOverrideSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setOverrideSaving(false); return }
    const period = formatPeriod(monthDate)
    const existingRollover = rolloverHistory.find(r => r.period === period)
    if (existingRollover) {
      await supabase.from('budget_rollovers')
        .update({ carried_amount: parseFloat(overrideAmount) })
        .eq('id', existingRollover.id)
    } else {
      await supabase.from('budget_rollovers').insert({
        user_id: user.id,
        budget_id: budget.id,
        period,
        carried_amount: parseFloat(overrideAmount),
        rollover_type: budget.rollover_type ?? 'carry-over',
      })
    }
    setOverrideSaving(false)
    setShowRolloverOverride(false)
    setOverrideAmount('')
    onGoalCreated?.() // reuse to trigger parent refresh (loadSpending)
  }

  // Ordering helpers
  const sortedSiblings = [...siblings].sort((a, b) => a.sort_order - b.sort_order)
  const currentIndex = sortedSiblings.findIndex((s) => s.id === budget.id)
  const canMoveUp = currentIndex > 0
  const canMoveDown = currentIndex < sortedSiblings.length - 1

  async function moveBudget(direction: 'up' | 'down') {
    if (reordering) return
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    const target = sortedSiblings[targetIndex]
    if (!target) return
    setReordering(true)
    const supabase = createClient()
    await Promise.all([
      supabase.from('budgets').update({ sort_order: target.sort_order }).eq('id', budget.id),
      supabase.from('budgets').update({ sort_order: budget.sort_order }).eq('id', target.id),
    ])
    setReordering(false)
    onReorder()
  }
  const { dailyExpenseRate, loading: rateLoading, source: rateSource } = useDailyExpenseRate()
  const hasFreedomData = !rateLoading && rateSource === 'transactions' && dailyExpenseRate > 0
  const budgetType = (budget.budget_type ?? 'expense') as BudgetType
  const colors = getTypeColors(budgetType)
  const children = parent && 'children' in parent ? (parent as BudgetWithChildren).children : []
  const isParent = children.length > 0 && parent?.id === budget.id

  const spent = isParent
    ? children.reduce((sum, c) => sum + getSpent(c), 0)
    : getSpent(budget)
  const limit = isParent
    ? children.reduce((sum, c) => sum + getEffectiveLimit(c), 0)
    : getEffectiveLimit(budget)
  const remaining = limit - spent
  const pct = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0
  const carry = isParent
    ? children.reduce((sum, c) => sum + getBudgetCarry(c), 0)
    : getBudgetCarry(budget)
  const cumulativeCarry = rolloverHistory.reduce((sum, r) => sum + Number(r.carried_amount), 0)

  // Filter transactions for this budget (or children if parent)
  const budgetIds = isParent ? children.map(c => c.id) : [budget.id]
  const budgetTx = transactions.filter(t => budgetIds.includes(t.budget_id))

  // 12-month spending history + limit changes (fetched on mount)
  const [history, setHistory] = useState<{ month: string; label: string; spent: number; limit: number }[]>([])
  const [limitHistory, setLimitHistory] = useState<{ date: string; amount: number }[]>([])
  // Per-child sparkline data (budgetId -> SparklineDataPoint[])
  const [childSparklines, setChildSparklines] = useState<Record<string, SparklineDataPoint[]>>({})
  useEffect(() => {
    async function loadHistory() {
      const supabase = createClient()
      const now = new Date()
      const months: { month: string; start: string; end: string; label: string }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const start = localDateStr(d)
        const end = localDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 1))
        const label = d.toLocaleDateString('nl-NL', { month: 'short' })
        months.push({ month: start, start, end, label })
      }

      const [{ data: txData }, { data: splitTxInRange }, { data: amountData }] = await Promise.all([
        supabase
          .from('transactions')
          .select('budget_id, amount, date')
          .in('budget_id', budgetIds)
          .gte('date', months[0].start)
          .lt('date', months[months.length - 1].end),
        supabase
          .from('transactions')
          .select('id, date')
          .gte('date', months[0].start)
          .lt('date', months[months.length - 1].end)
          .eq('is_split', true),
        supabase
          .from('budget_amounts')
          .select('budget_id, effective_from, amount')
          .in('budget_id', budgetIds),
      ])

      // Fetch split amounts for these budgets within the date range
      const splitTxIds = (splitTxInRange ?? []).map(t => t.id)
      const splitDateMap: Record<string, string> = {}
      for (const t of (splitTxInRange ?? [])) splitDateMap[t.id] = t.date
      let splitRows: { budget_id: string; amount: number; date: string }[] = []
      if (splitTxIds.length > 0) {
        const { data: splitData } = await supabase
          .from('transaction_splits')
          .select('budget_id, amount, transaction_id')
          .in('budget_id', budgetIds)
          .in('transaction_id', splitTxIds)
        if (splitData) {
          splitRows = splitData
            .filter(s => s.budget_id && splitDateMap[s.transaction_id])
            .map(s => ({ budget_id: s.budget_id, amount: Number(s.amount), date: splitDateMap[s.transaction_id] }))
        }
      }

      // Build limit change timeline
      const changes = (amountData ?? [])
        .sort((a, b) => a.effective_from.localeCompare(b.effective_from))
        .map(a => ({ date: a.effective_from, amount: Number(a.amount) }))
      setLimitHistory(changes)

      const result = months.map(m => {
        const monthTx = (txData ?? []).filter(t => t.date >= m.start && t.date < m.end && budgetIds.includes(t.budget_id))
        const monthSplits = splitRows.filter(s => s.date >= m.start && s.date < m.end)
        const monthSpent = monthTx.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
          + monthSplits.reduce((s, r) => s + Math.abs(r.amount), 0)

        // Calculate effective limit for this month
        let monthLimit = 0
        for (const bid of budgetIds) {
          const bud = isParent ? children.find(c => c.id === bid) : budget
          const applicable = (amountData ?? [])
            .filter(a => a.budget_id === bid && a.effective_from <= m.start)
            .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
          monthLimit += applicable.length > 0
            ? Number(applicable[0].amount)
            : Number(bud?.default_limit ?? 0)
        }

        return { month: m.start, label: m.label, spent: monthSpent, limit: monthLimit }
      })

      setHistory(result)

      // Build per-child sparkline data
      if (isParent && children.length > 0) {
        const childData: Record<string, SparklineDataPoint[]> = {}
        for (const child of children) {
          childData[child.id] = months.map(m => {
            const monthTx = (txData ?? []).filter(t => t.date >= m.start && t.date < m.end && t.budget_id === child.id)
            const monthChildSplits = splitRows.filter(s => s.date >= m.start && s.date < m.end && s.budget_id === child.id)
            const monthSpent = monthTx.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
              + monthChildSplits.reduce((s, r) => s + Math.abs(r.amount), 0)
            return { month: m.month, label: m.label, spent: monthSpent }
          })
        }
        setChildSparklines(childData)
      }
    }

    loadHistory()
  }, [budget.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const maxHistoryValue = Math.max(...history.map(h => Math.max(h.spent, h.limit)), 1)
  const budgetGroups = allBudgets.map(b => ({ parent: b as Budget, children: (b as BudgetWithChildren).children ?? [] }))

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--paper)] shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center gap-3 border-b border-[var(--border-ed)] bg-gradient-to-r ${colors.headerGradient} px-6 py-4`}>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors.bgDark}`}>
            <BudgetIcon name={budget.icon} className={`h-5 w-5 ${colors.text}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-[var(--ink)]">{budget.name}</h2>
              {perspective === 'household' && budget.ownership === 'shared' && (
                <OwnershipBadge ownership="shared" />
              )}
            </div>
            {budget.description && <p className="truncate text-xs text-[var(--ink-3)]">{budget.description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Spending summary */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Limiet</p>
              <p className="mt-0.5 text-lg font-bold text-[var(--ink)]">{formatCurrency(limit)}</p>
              {hasFreedomData && limit >= 100 && (
                <p className="text-sm italic text-[var(--ink-3)]" data-testid="modal-limit-freedom">
                  ≈ {eurToFreedomTime(limit, dailyExpenseRate).formattedDagen}
                </p>
              )}
            </div>
            <div className="rounded-lg bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Besteed</p>
              <p className="mt-0.5 text-lg font-bold text-[var(--ink)]">{formatCurrency(spent)}</p>
              {hasFreedomData && spent >= 100 && (
                <p className="text-sm italic text-[var(--ink-3)]" data-testid="modal-spent-freedom">
                  ≈ {eurToFreedomTime(spent, dailyExpenseRate).formattedDagen}
                </p>
              )}
            </div>
            <div className="rounded-lg bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Resterend</p>
              <p className={`mt-0.5 text-lg font-bold ${remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(remaining)}
              </p>
              {hasFreedomData && Math.abs(remaining) >= 100 && (
                <p className={`text-sm italic text-[var(--ink-3)]`} data-testid="modal-remaining-freedom">
                  {remaining >= 0
                    ? `nog ${eurToFreedomTime(remaining, dailyExpenseRate).formattedDagen}`
                    : <span className="text-red-500">{eurToFreedomTime(Math.abs(remaining), dailyExpenseRate).formattedDagen} ingeleverd</span>
                  }
                </p>
              )}
            </div>
          </div>

          <div className="mt-3">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: spent > limit ? '#ef4444' : pct > 80 ? colors.barHexWarn : colors.barHex,
                }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between">
              {hasFreedomData && remaining >= 100 && (
                <p className="text-sm italic text-[var(--ink-3)]" data-testid="modal-bar-freedom">
                  nog {eurToFreedomTime(remaining, dailyExpenseRate).formattedDagen} deze maand
                </p>
              )}
              {hasFreedomData && remaining <= 0 && spent > limit && Math.abs(remaining) >= 100 && (
                <p className="text-sm italic text-[var(--ink-3)]" data-testid="modal-bar-freedom-over">
                  <span className="text-red-500">{formatCurrency(Math.abs(remaining))} over — {eurToFreedomTime(Math.abs(remaining), dailyExpenseRate).formattedDagen} ingeleverd</span>
                </p>
              )}
              {!hasFreedomData && <span />}
              <p className="text-right text-xs text-[var(--ink-3)]">{pct}% besteed</p>
            </div>
          </div>

          {carry > 0 && (
            <div className={`mt-2 flex items-center gap-1.5 rounded border px-2 py-1.5 ${colors.bg} ${colors.border}`}>
              <span className={`text-xs font-medium ${colors.text}`}>Doorgeschoven:</span>
              <span className={`font-mono text-xs font-semibold ${colors.text}`}>+{formatCurrency(carry)}</span>
            </div>
          )}

          {rolloverHistory.length > 1 && (
            <div className="mt-3 border-t border-[var(--border-ed)] pt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)]">Overgedragen saldo</p>
                <button
                  type="button"
                  onClick={() => {
                    setOverrideAmount(String(carry || 0))
                    setShowRolloverOverride(v => !v)
                  }}
                  className="text-[10px] font-medium text-[var(--ink-4)] hover:text-kern-600"
                >
                  {showRolloverOverride ? 'Annuleren' : 'Override →'}
                </button>
              </div>
              {showRolloverOverride && (
                <div className="mb-3 flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-3)]">€</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={overrideAmount}
                      onChange={e => setOverrideAmount(e.target.value)}
                      className="w-full rounded-[var(--r-sm)] border border-[var(--border-md)] py-1.5 pl-6 pr-2 text-right font-mono text-sm text-[var(--ink)] outline-none focus:border-kern-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRolloverOverride}
                    disabled={overrideSaving}
                    className="rounded-[var(--r-sm)] bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
                  >
                    {overrideSaving ? '...' : 'Instellen'}
                  </button>
                </div>
              )}
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {rolloverHistory.slice(0, 6).map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--ink-3)]">{r.period}</span>
                    <span className={`font-mono font-medium ${Number(r.carried_amount) > 0 ? colors.text : 'text-[var(--ink-4)]'}`}>
                      {Number(r.carried_amount) > 0 ? '+' : ''}{formatCurrency(Number(r.carried_amount))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Doeltype — 4a: Vaste Maandlast */}
          {budget.goal_type === 'vaste_maandlast' && (
            <div className={`mt-2 flex items-center gap-2 rounded border px-2 py-1.5 ${spent <= limit ? 'bg-emerald-50 border-emerald-200' : 'bg-kern-50 border-kern-200'}`}>
              {spent <= limit
                ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-xs font-medium text-emerald-700">Gedekt</span></>
                : <><AlertTriangle className="h-4 w-4 text-kern-600" /><span className="text-xs font-medium text-kern-700">Tekort: {formatCurrency(spent - limit)}</span></>
              }
            </div>
          )}

          {/* Doeltype — 4b: Bestedingslimiet */}
          {budget.goal_type === 'bestedingslimiet' && pct >= 80 && (
            <p className="mt-1 text-xs font-medium text-kern-700">
              {pct >= 100 ? '⚠️ Limiet overschreden' : `⚠️ ${100 - pct}% resterend`}
            </p>
          )}

          {/* Doeltype — 4d: Maandelijkse Reservering */}
          {budget.goal_type === 'maandelijkse_reservering' && (
            <div className="mt-2 rounded border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2">
              <p className="text-[10px] text-[var(--ink-3)] uppercase tracking-[.08em]">Opgebouwd saldo</p>
              <p className="font-mono text-base font-semibold text-[var(--ink)]">{formatCurrency(cumulativeCarry)}</p>
              <p className="text-[10px] text-[var(--ink-3)] mt-0.5">Rollover staat automatisch aan</p>
            </div>
          )}
        </div>

        {/* Doeltype — 4c: Spaardoel (budget-native) — hidden when a De Wil goal is linked */}
        {budget.goal_type === 'spaardoel' && budget.goal_amount && goals.length === 0 && (() => {
          const maandenResterend = budget.goal_date
            ? Math.max(1, (new Date(budget.goal_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
            : null
          const benodigdPerMaand = maandenResterend
            ? Math.max(0, (budget.goal_amount - cumulativeCarry) / maandenResterend)
            : null
          const spaarProgress = Math.min(100, (cumulativeCarry / budget.goal_amount) * 100)
          const opSchema = benodigdPerMaand !== null && spent >= benodigdPerMaand
          return (
            <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-native-spaardoel">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)]">Spaardoel</p>
                {budget.goal_date && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase ${opSchema ? `${colors.bg} ${colors.text} ${colors.border}` : 'bg-kern-50 text-kern-700 border-kern-200'}`}>
                    {opSchema ? 'Op schema' : 'Achter op schema'}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="font-mono text-base font-semibold">{formatCurrency(cumulativeCarry)}</span>
                <span className="font-mono text-xs text-[var(--ink-3)]">van {formatCurrency(budget.goal_amount)}</span>
              </div>
              {benodigdPerMaand !== null && (
                <p className="text-xs text-[var(--ink-3)] mb-2">Benodigd: <span className="font-mono font-medium">{formatCurrency(benodigdPerMaand)}/mnd</span></p>
              )}
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                <div className="h-full rounded-full" style={{ width: `${spaarProgress}%`, backgroundColor: colors.barHex }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-[var(--ink-3)]">
                <span>{Math.round(spaarProgress)}% bereikt</span>
                {budget.goal_date && <span>{new Date(budget.goal_date).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}</span>}
              </div>
            </div>
          )
        })()}

        {/* Doeltype — 4e: Periodieke Last (Sinking Fund) */}
        {budget.goal_type === 'periodieke_last' && budget.goal_amount && (() => {
          const maandenMap: Record<string, number> = { jaarlijks: 12, halfjaarlijks: 6, kwartaal: 3 }
          const maanden = maandenMap[budget.goal_frequency ?? ''] ?? 12
          const maandelijksBedrag = budget.goal_amount / maanden
          const sinkProgress = Math.min(100, (cumulativeCarry / budget.goal_amount) * 100)
          return (
            <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-periodieke-last">
              <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)] mb-2">Periodieke Last</p>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-[var(--ink-3)]">Maandelijks reserveren</span>
                <span className="font-mono font-semibold">{formatCurrency(maandelijksBedrag)}</span>
              </div>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-[var(--ink-3)]">Opgebouwd saldo</span>
                <span className="font-mono font-semibold">{formatCurrency(cumulativeCarry)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                <div className="h-full rounded-full" style={{ width: `${sinkProgress}%`, backgroundColor: colors.barHex }} />
              </div>
              <p className="text-[10px] text-[var(--ink-3)] mt-1">Reset na uitgave · Doel: {formatCurrency(budget.goal_amount)}</p>
            </div>
          )
        })()}

        {/* Spaardoel section — only for savings budgets or when a goal is linked */}
        {(budget.budget_type === 'savings' || goals.length > 0) && (() => {
          const linkedGoal = goals[0] ?? null

          if (!linkedGoal) {
            // Show option to create/link a goal for savings budgets
            if (budget.budget_type !== 'savings') return null
            return (
              <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-savings-goal-empty">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)]">Spaardoel</p>
                {!showCreateGoalForm ? (
                  <>
                    <p className="text-xs italic text-[var(--ink-3)] mb-3">
                      Koppel een spaardoel aan dit budget om voortgang bij te houden.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCreateGoalForm(true)}
                        className="inline-flex items-center gap-1.5 rounded border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                      >
                        <Plus className="h-3 w-3" />
                        Spaardoel aanmaken
                      </button>
                      <a
                        href="/will"
                        className="text-xs italic text-[var(--ink-3)] hover:text-[var(--ink-2)]"
                      >
                        Bekijk doelen →
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    {goalError && (
                      <p className="text-xs text-red-600">{goalError}</p>
                    )}
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-[.06em] text-[var(--ink-3)]">Naam</label>
                      <input
                        type="text"
                        value={goalForm.name}
                        onChange={e => setGoalForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="bijv. Noodfonds"
                        className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-[.06em] text-[var(--ink-3)]">Doelbedrag (€)</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={goalForm.target_value}
                          onChange={e => setGoalForm(p => ({ ...p, target_value: e.target.value }))}
                          placeholder="0"
                          className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-kern-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-[.06em] text-[var(--ink-3)]">Doeldatum (opt.)</label>
                        <input
                          type="date"
                          value={goalForm.target_date}
                          onChange={e => setGoalForm(p => ({ ...p, target_date: e.target.value }))}
                          className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCreateGoal}
                        disabled={goalSaving}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
                      >
                        <Save className="h-3 w-3" />
                        {goalSaving ? 'Opslaan...' : 'Aanmaken'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCreateGoalForm(false); setGoalError('') }}
                        className="rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)]"
                      >
                        Annuleren
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          }

          const progress = linkedGoal.target_value > 0
            ? Math.min(100, (cumulativeCarry / linkedGoal.target_value) * 100)
            : 0
          const goalRemaining = linkedGoal.target_value - cumulativeCarry
          const isOnTrack = linkedGoal.target_date
            ? (() => {
                const monthsLeft = Math.max(1, (new Date(linkedGoal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
                const neededPerMonth = goalRemaining / monthsLeft
                const avgMonthlySaving = rolloverHistory.length > 0
                  ? cumulativeCarry / rolloverHistory.length
                  : spent
                return avgMonthlySaving >= neededPerMonth
              })()
            : null

          return (
            <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-savings-goal">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)]">Spaardoel</p>
                {linkedGoal.target_date && (
                  <span className={`text-[10px] font-medium uppercase tracking-[.06em] px-2 py-0.5 rounded-full border ${
                    isOnTrack
                      ? `${colors.bg} ${colors.text} ${colors.border}`
                      : 'bg-[#fff0ef] text-[#b33a2e] border-[#f5c5c0]'
                  }`}>
                    {isOnTrack ? 'Op schema' : 'Achter op schema'}
                  </span>
                )}
              </div>
              <p className="font-medium text-sm text-[var(--ink)] mb-1">{linkedGoal.name}</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="font-mono text-base font-semibold text-[var(--ink)]">{formatCurrency(cumulativeCarry)}</span>
                <span className="font-mono text-xs text-[var(--ink-3)]">van {formatCurrency(linkedGoal.target_value)}</span>
              </div>
              {hasFreedomData && cumulativeCarry >= 100 && (
                <p className="text-xs italic text-[var(--ink-3)] mb-2">
                  {eurToFreedomTime(cumulativeCarry, dailyExpenseRate).formattedDagen} vrijheid opgebouwd
                </p>
              )}
              {/* Progress bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${progress}%`, backgroundColor: colors.barHex }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-[var(--ink-3)]">
                <span>{Math.round(progress)}% bereikt</span>
                <span>
                  {goalRemaining > 0 && <><span className="font-mono">{formatCurrency(goalRemaining)}</span> resterend</>}
                  {linkedGoal.target_date && (
                    <> · {new Date(linkedGoal.target_date).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}</>
                  )}
                </span>
              </div>
            </div>
          )
        })()}

        {/* Children list */}
        {isParent && children.length > 0 && (
          <div className="border-t border-[var(--border-ed)] px-6 py-4">
            <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Subbudgetten</p>
            <div className="space-y-1.5">
              {children.map((child) => {
                const childSpent = getSpent(child)
                const childLimit = getEffectiveLimit(child)
                const childPct = childLimit > 0 ? Math.min(Math.round((childSpent / childLimit) * 100), 100) : 0
                const childSparkData = childSparklines[child.id]
                return (
                  <div
                    key={child.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-ed)] p-2 transition-colors ${colors.hoverBg}`}
                    onClick={() => onSelectChild(child.id)}
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colors.bg}`}>
                      <BudgetIcon name={child.icon} className={`h-3.5 w-3.5 ${colors.textLight}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-xs font-medium text-[var(--ink-2)]">{child.name}</p>
                        <div className="ml-2 flex shrink-0 items-center gap-2">
                          {/* Per-child sparkline */}
                          {childSparkData && childSparkData.length >= 2 && (
                            <BudgetSparkline
                              data={childSparkData}
                              width={60}
                              height={20}
                              isIncome={budgetType === 'income'}
                              showFill={true}
                              testId={`child-sparkline-${child.id}`}
                            />
                          )}
                          <div className="text-right">
                            <span className="text-xs text-[var(--ink-3)]">
                              {formatCurrency(childSpent)} / {formatCurrency(childLimit)}
                            </span>
                            {hasFreedomData && childLimit - childSpent >= 100 && (
                              <p className="text-sm italic text-[var(--ink-3)]" data-testid="child-freedom-remaining">
                                nog {eurToFreedomTime(childLimit - childSpent, dailyExpenseRate).formattedDagen}
                              </p>
                            )}
                            {hasFreedomData && childSpent > childLimit && childSpent - childLimit >= 100 && (
                              <p className="text-sm italic text-[var(--ink-3)]" data-testid="child-freedom-over">
                                <span className="text-red-500">{eurToFreedomTime(childSpent - childLimit, dailyExpenseRate).formattedDagen} ingeleverd</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${childPct}%`,
                            backgroundColor: childSpent > childLimit ? '#ef4444' : colors.barHex,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Transactions this month */}
        {budgetTx.length > 0 && (
          <div className="border-t border-[var(--border-ed)] px-6 py-4">
            <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">
              Transacties deze maand ({budgetTx.length})
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {budgetTx.map((tx, i) => {
                const isSplitRow = tx.is_split_row === true
                const isExpense = budgetType !== 'income'
                const amountColor = isSplitRow
                  ? (isExpense ? 'text-red-600' : 'text-emerald-600')
                  : (Number(tx.amount) < 0 ? 'text-red-600' : 'text-emerald-600')
                const canOpen = !!(tx.id && tx.account_id)
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!canOpen}
                    onClick={() => canOpen && openTransaction(tx.id!)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--subtle)] disabled:cursor-default"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-medium text-[var(--ink-2)]">
                          {tx.counterparty_name || tx.description}
                        </p>
                        {isSplitRow && (
                          <GitFork className="h-3 w-3 shrink-0 text-[var(--ink-4)]" aria-label="Verdeeld" />
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--ink-3)]">
                        {new Date(tx.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                        {tx.counterparty_name && tx.description !== tx.counterparty_name && (
                          <span className="ml-1">{tx.description}</span>
                        )}
                      </p>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <span className={`text-xs font-medium ${amountColor}`}>
                        {formatCurrency(Math.abs(Number(tx.amount)))}
                      </span>
                      {hasFreedomData && Math.abs(Number(tx.amount)) >= 100 && (
                        <p className="text-sm italic text-[var(--ink-3)]" data-testid="tx-freedom-time">
                          {eurToFreedomTime(Math.abs(Number(tx.amount)), dailyExpenseRate).formattedDagen}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Bestedingshistorie — sparkline + 12-maanden barchart */}
        {history.length > 0 && (
          <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-sparkline-section">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-[var(--ink-3)] uppercase">Bestedingshistorie</p>
              {history.length >= 2 && (
                <SparklineWithLabel
                  data={history.map(h => ({ month: h.month, label: h.label, spent: h.spent }))}
                  width={100}
                  height={28}
                  isIncome={budgetType === 'income'}
                  testId="budget-detail-sparkline"
                />
              )}
            </div>
            <div className="flex items-end gap-1" style={{ height: 80 }}>
              {history.map((h, i) => {
                const spentH = (h.spent / maxHistoryValue) * 100
                const limitH = (h.limit / maxHistoryValue) * 100
                const over = h.spent > h.limit && h.limit > 0
                const isSelected = selectedHistMonth === h.month
                const isCurrentMonth = i === history.length - 1
                const barColor = over ? '#f87171' : colors.barHex
                return (
                  <button
                    key={h.month}
                    type="button"
                    onClick={() => selectHistMonth(h.month)}
                    className="group relative flex flex-1 flex-col items-center focus-visible:outline-none"
                    style={{ height: '100%' }}
                    title={`${h.label}: ${formatCurrency(h.spent)}${isCurrentMonth ? ' (lopende maand)' : ''}`}
                  >
                    {/* Limit indicator line */}
                    {h.limit > 0 && (
                      <div
                        className="absolute w-full border-t border-dashed border-[var(--border-md)]"
                        style={{ bottom: `${limitH}%` }}
                      />
                    )}
                    {/* Spent bar */}
                    <div className="mt-auto w-full">
                      <div
                        className="w-full rounded-t transition-opacity"
                        style={{
                          height: `${Math.max(spentH * 0.8, 2)}px`,
                          backgroundColor: barColor,
                          opacity: selectedHistMonth && !isSelected ? 0.35 : isCurrentMonth ? 0.5 : 1,
                          outline: isSelected ? `2px solid ${colors.barHex}` : undefined,
                          outlineOffset: isSelected ? '2px' : undefined,
                          ...(isCurrentMonth ? { borderTop: `2px dashed ${barColor}` } : {}),
                        }}
                      />
                    </div>
                    {/* Month label */}
                    <p className={`mt-1 text-[9px] transition-colors ${isSelected ? 'font-semibold text-[var(--ink-2)]' : isCurrentMonth ? 'italic text-[var(--ink-3)]' : 'text-[var(--ink-3)]'}`}>{h.label}{isCurrentMonth ? '*' : ''}</p>
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute -top-10 z-10 rounded bg-zinc-800 px-2 py-1 text-[10px] text-white opacity-0 shadow-[var(--s2)] transition-opacity group-hover:opacity-100">
                      {formatCurrency(h.spent)} / {formatCurrency(h.limit)}{isCurrentMonth ? ' ∗' : ''}
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-right text-[8px] italic text-[var(--ink-4)]">* lopende maand</p>

            {/* Uitklappanel voor geselecteerde maand */}
            {selectedHistMonth && (() => {
              const hEntry = history.find(h => h.month === selectedHistMonth)
              if (!hEntry) return null
              return (
                <div style={{ animation: 'fadeUp 0.2s ease-out both' }} className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--ink-2)]">
                      {new Date(selectedHistMonth).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-[var(--ink-3)]">
                      <span>{formatCurrency(hEntry.spent)} besteed</span>
                      {hEntry.limit > 0 && <span>/ {formatCurrency(hEntry.limit)} limiet</span>}
                      {hEntry.limit > 0 && (
                        <span className={hEntry.spent > hEntry.limit ? 'font-semibold text-red-600' : 'text-emerald-600'}>
                          {hEntry.spent > hEntry.limit ? '+' : '-'}{formatCurrency(Math.abs(hEntry.spent - hEntry.limit))}
                        </span>
                      )}
                    </div>
                  </div>
                  {histMonthTxLoading ? (
                    <p className="text-[11px] italic text-[var(--ink-4)]">Laden…</p>
                  ) : histMonthTx.length === 0 ? (
                    <p className="text-[11px] italic text-[var(--ink-4)]">Geen transacties gevonden.</p>
                  ) : (
                    <div className="max-h-48 space-y-0.5 overflow-y-auto">
                      {histMonthTx.map((tx) => (
                        <button
                          key={tx.id}
                          type="button"
                          onClick={() => openTransaction(tx.id)}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--subtle)]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-[var(--ink-2)]">
                              {tx.counterparty_name || tx.description}
                            </p>
                            <p className="text-[10px] text-[var(--ink-3)]">
                              {new Date(tx.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                              {tx.counterparty_name && tx.description !== tx.counterparty_name && (
                                <span className="ml-1">{tx.description}</span>
                              )}
                            </p>
                          </div>
                          <span className={`ml-3 shrink-0 text-xs font-medium tabular-nums ${Number(tx.amount) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {formatCurrency(Math.abs(Number(tx.amount)))}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Budget forecast next month prediction with spending variance confidence */}
        {(() => {
          // Exclude current (incomplete) month from forecast and variance calculations
          const monthlySpending = history.slice(0, -1).map(h => h.spent)
          if (monthlySpending.length < 3) return null
          const forecast = computeBudgetForecast(monthlySpending, limit, budget.name)
          const varianceData = calculateSpendingVariance(monthlySpending, budget.name)

          if (!forecast.hasSufficientData) {
            return (
              <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-forecast-section">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-[var(--ink-3)]" />
                  <p className="text-xs font-semibold text-[var(--ink-3)] uppercase">Voorspelling volgende maand</p>
                </div>
                <p className="text-xs text-[var(--ink-3)] italic" data-testid="budget-forecast-insufficient">
                  {forecast.message}
                </p>
                {/* Variance detail for insufficient data */}
                <SpendingVarianceDetailPanel data={varianceData} className="mt-2" />
              </div>
            )
          }

          const confColors = getConfidenceColors(forecast.confidence)
          const confLabel = getConfidenceLabel(forecast.confidence)

          return (
            <>
            <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-forecast-section">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-[var(--ink-3)]" />
                <p className="text-xs font-semibold text-[var(--ink-3)] uppercase">Voorspelling volgende maand</p>
              </div>

              {/* Compact forecast card — collapsed: bedrag + badge, expanded: alle details */}
              <div className="rounded-[var(--r-lg)] border border-[var(--border-md)] bg-[var(--subtle)]/50" data-testid="budget-forecast-card">
                {/* Collapsed row — altijd zichtbaar */}
                <button
                  type="button"
                  onClick={() => setShowForecastExpanded(v => !v)}
                  className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[var(--subtle)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kern-300 rounded-[var(--r-lg)]"
                  aria-expanded={showForecastExpanded}
                  aria-label="Voorspellingsdetails tonen"
                >
                  <div>
                    <p className="text-xs text-[var(--ink-3)] font-medium">Verwachte uitgaven</p>
                    <p className="text-lg font-bold text-[var(--ink)] mt-0.5" data-testid="budget-forecast-amount">
                      {formatCurrency(forecast.predicted)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <SpendingConfidenceBadge data={varianceData} />
                    {showForecastExpanded
                      ? <ChevronUp className="h-3.5 w-3.5 text-[var(--ink-3)]" />
                      : <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-3)]" />
                    }
                  </div>
                </button>

                {/* Expanded details — uitklapbaar */}
                {showForecastExpanded && (
                  <div className="border-t border-dashed border-[var(--border-ed)] px-4 pb-4" style={{ animation: 'fadeUp 0.25s ease-out both' }}>
                    {/* Freedom time equivalent */}
                    {hasFreedomData && forecast.predicted >= 100 && (
                      <p className="font-serif text-sm italic text-[var(--ink-3)] mt-3">
                        ≈ {eurToFreedomTime(forecast.predicted, dailyExpenseRate).formattedDagen}
                      </p>
                    )}

                    {/* Contextual message */}
                    <p className="text-xs text-[var(--ink-3)] mt-3" data-testid="budget-forecast-message">
                      {forecast.message}
                    </p>

                    {/* Confidence detail */}
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--ink-3)]">
                      <span>Gebaseerd op {forecast.monthsUsed} maanden</span>
                      <span>•</span>
                      <span>{forecast.confidencePercent}% betrouwbaarheid</span>
                    </div>

                    {/* Budget limit comparison bar */}
                    {limit > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[10px] text-[var(--ink-3)] mb-1">
                          <span>Voorspeld vs limiet</span>
                          <span>{Math.round((forecast.predicted / limit) * 100)}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className={`h-full rounded-full transition-all ${
                              forecast.exceedsLimit ? 'bg-red-500' : forecast.predicted / limit > 0.8 ? 'bg-kern-400' : 'bg-[var(--border-md)]'
                            }`}
                            style={{ width: `${Math.min((forecast.predicted / limit) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Spending variance detail panel */}
                    <SpendingVarianceDetailPanel data={varianceData} className="mt-3" />

                    {/* Hoe berekend link */}
                    <button
                      type="button"
                      onClick={() => setShowForecastModal(true)}
                      className="mt-3 text-[10px] text-kern-500 transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kern-300 rounded"
                    >
                      Hoe berekend? →
                    </button>
                  </div>
                )}
              </div>

              {/* Alert when predicted exceeds limit — altijd zichtbaar */}
              {forecast.exceedsLimit && forecast.alertMessage && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3" data-testid="budget-forecast-alert">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-red-700" data-testid="budget-forecast-alert-message">
                      {forecast.alertMessage}
                    </p>
                    <p className="text-[10px] text-red-500 mt-0.5">
                      Limiet: {formatCurrency(limit)} — Verwacht: {formatCurrency(forecast.predicted)}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <BottomSheet
              open={showForecastModal}
              onClose={() => setShowForecastModal(false)}
              title="Verwachte uitgaven"
            >
              <div className="p-4 sm:p-6">
              <KassabonShell>
                {/* Header */}
                <div className="mb-3 text-center">
                  <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">VOORSPELLING VOLGENDE MAAND</p>
                  <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">{budget.name} — gewogen voortschrijdend gemiddelde</p>
                </div>
                {/* Uitleg */}
                <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                  Berekend op basis van je laatste {forecast.monthsUsed} maanden. Recentere maanden tellen zwaarder mee in de voorspelling.
                </div>
                {/* Maandwaarden */}
                <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                  {forecast.monthlyValues.map((val, i) => {
                    const d = new Date(monthDate)
                    d.setMonth(d.getMonth() - (forecast.monthlyValues.length - 1 - i))
                    const label = d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })
                    const isZero = val === 0
                    return (
                      <div key={i} className={`flex justify-between py-0.5 ${isZero ? 'opacity-40' : ''}`}>
                        <span className="font-sans text-sm text-[var(--ink-2)]">{label}{isZero ? ' (geen data)' : ` × ${i + 1}`}</span>
                        <span className="tabular-nums text-[var(--ink)]">{isZero ? '—' : formatCurrency(val)}</span>
                      </div>
                    )
                  })}
                </div>
                {/* Statistieken */}
                <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                  <div className="flex justify-between py-0.5">
                    <span className="font-sans text-sm text-[var(--ink-3)]">Gemiddelde (enkelvoudig)</span>
                    <span className="tabular-nums text-[var(--ink-3)]">{formatCurrency(forecast.mean)}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="font-sans text-sm text-[var(--ink-3)]">Standaardafwijking</span>
                    <span className="tabular-nums text-[var(--ink-3)]">± {formatCurrency(forecast.stdDev)}</span>
                  </div>
                </div>
                {/* Totaalregel */}
                <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
                  <span className="text-[var(--ink)]">Verwacht volgende maand</span>
                  <span className="tabular-nums text-[var(--ink)]">{formatCurrency(forecast.predicted)}</span>
                </div>
                {/* Freedom badge */}
                {hasFreedomData && forecast.predicted >= 100 && (
                  <div className="mt-3 rounded-[var(--r)] border border-[var(--hor-m)] bg-[var(--hor-l)] px-3 py-2 text-center">
                    <p className="font-playfair text-xl font-bold text-[var(--hor-t)]">
                      {eurToFreedomTime(forecast.predicted, dailyExpenseRate).formattedDagen}
                    </p>
                    <p className="font-sans text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">VRIJHEIDSTIJD</p>
                  </div>
                )}
                {/* Limiet vergelijking */}
                {limit > 0 && (
                  <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2">
                    <div className="flex justify-between py-0.5 font-sans text-[11px]">
                      <span className="text-[var(--ink-3)]">Budgetlimiet</span>
                      <span className="tabular-nums text-[var(--ink-3)]">{formatCurrency(limit)}</span>
                    </div>
                    <div className={`flex justify-between py-0.5 font-sans text-[11px] font-medium ${forecast.exceedsLimit ? 'text-red-600' : 'text-emerald-600'}`}>
                      <span>{forecast.exceedsLimit ? 'Verwachte overschrijding' : 'Verwachte ruimte'}</span>
                      <span className="tabular-nums">{forecast.exceedsLimit ? '+' : ''}{formatCurrency(Math.abs(forecast.predicted - limit))}</span>
                    </div>
                  </div>
                )}
                {/* Formule */}
                <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                  <p><strong className="font-semibold text-[var(--ink-3)]">Formule:</strong> gewogen gemiddelde — maand 1 × 1, … maand {forecast.monthsUsed} × {forecast.monthsUsed}, gedeeld door de som der gewichten</p>
                </div>
                {/* Betrouwbaarheid */}
                <div className="mt-2 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] text-[var(--ink-3)]">
                  <p>Betrouwbaarheid: <strong className="text-[var(--ink-2)]">{getConfidenceLabel(forecast.confidence)}</strong> ({forecast.confidencePercent}%)</p>
                </div>
                {/* Footer */}
                <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">Gebaseerd op {forecast.monthsUsed} maanden transactiedata</p>
              </KassabonShell>
              </div>
            </BottomSheet>
            </>
          )
        })()}

        {/* Limit change history */}
        {limitHistory.length > 1 && (
          <div className="border-t border-[var(--border-ed)] px-6 py-4">
            <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Limiet wijzigingen</p>
            <div className="space-y-1.5">
              {limitHistory.map((change, i) => {
                const prev = i > 0 ? limitHistory[i - 1].amount : null
                const delta = prev != null ? change.amount - prev : null
                return (
                  <div key={i} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[var(--subtle)]">
                    <span className="text-xs text-[var(--ink-3)]">
                      {new Date(change.date).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[var(--ink-2)]">{formatCurrency(change.amount)}</span>
                      {delta != null && delta !== 0 && (
                        <span className={`text-[10px] font-medium ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {delta > 0 ? '+' : ''}{formatCurrency(delta)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="border-t border-orange-200 bg-orange-50 px-6 py-4" data-testid="budget-delete-confirm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-orange-800">Budget archiveren?</p>
                <p className="mt-1 text-xs text-orange-700">
                  {isParent
                    ? `Dit archiveert "${budget.name}" en alle ${children.length} subbudgetten. Budgetten met gekoppelde transacties kunnen niet worden gearchiveerd.`
                    : `Dit archiveert "${budget.name}". Budgetten met gekoppelde transacties kunnen niet worden gearchiveerd.`
                  }
                </p>
                {deleteError && (
                  <p className="mt-1 text-xs font-medium text-red-600">{deleteError}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true)
                      setDeleteError(null)
                      try {
                        const res = await fetch(`/api/budgets/${budget.id}`, { method: 'DELETE' })
                        if (!res.ok) {
                          const data = await res.json()
                          setDeleteError(data.error || 'Archiveren mislukt')
                          setDeleting(false)
                          return
                        }
                        onDelete()
                      } catch {
                        setDeleteError('Netwerk fout bij archiveren')
                        setDeleting(false)
                      }
                    }}
                    className="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                    data-testid="budget-delete-confirm-btn"
                  >
                    {deleting ? 'Archiveren...' : 'Archiveren'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDeleteConfirm(false); setDeleteError(null) }}
                    className="rounded-md border border-orange-300 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
                    data-testid="budget-delete-cancel-btn"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 border-t border-[var(--border-ed)] px-6 py-4">
          {/* Ordering buttons */}
          {siblings.length > 1 && (
            <div className="flex gap-1">
              <button
                type="button"
                disabled={!canMoveUp || reordering}
                onClick={() => moveBudget('up')}
                title="Omhoog"
                className="inline-flex items-center justify-center rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-2 text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={!canMoveDown || reordering}
                onClick={() => moveBudget('down')}
                title="Omlaag"
                className="inline-flex items-center justify-center rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-2 text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => openWithMessage(`Analyseer mijn ${budget.name} budget`)}
            className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-wil-200 bg-wil-50 px-3 py-2 text-xs font-medium text-wil-700 transition-colors hover:bg-wil-100 hover:border-wil-300"
            title="Vraag Will om advies over dit budget"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Vraag Will
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-kern-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-kern-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Bewerken
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-[var(--paper)] px-3 py-2 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-50 hover:border-orange-300"
            data-testid="budget-delete-btn"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Archiveren
          </button>
        </div>
      </div>
    </div>
    {txToEdit && (
      <TransactionForm
        transaction={txToEdit}
        accountId={txToEdit.account_id}
        budgetGroups={budgetGroups}
        onClose={() => setTxToEdit(null)}
        onSaved={() => {
          setTxToEdit(null)
          onGoalCreated?.()
        }}
      />
    )}
    </>
  )
}

// ── Budget edit modal ────────────────────────────────────────

function BudgetEditModal({
  budget,
  isParent = false,
  childrenLimitSum,
  onClose,
  onSaved,
}: {
  budget: Budget
  isParent?: boolean
  childrenLimitSum?: number
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(budget.name)
  const [icon, setIcon] = useState(budget.icon)
  const [description, setDescription] = useState(budget.description ?? '')
  const [defaultLimit, setDefaultLimit] = useState(String(budget.default_limit))
  const [budgetType, setBudgetType] = useState(budget.budget_type ?? 'expense')
  const [interval, setInterval] = useState(budget.interval ?? 'monthly')
  const [rolloverType, setRolloverType] = useState(budget.rollover_type ?? 'reset')
  const [limitType, setLimitType] = useState(budget.limit_type ?? 'soft')
  const [alertThreshold, setAlertThreshold] = useState(budget.alert_threshold ?? 80)
  const [maxSingleAmount, setMaxSingleAmount] = useState(String(budget.max_single_transaction_amount ?? 0))
  const [isEssential, setIsEssential] = useState(budget.is_essential ?? false)
  const [priorityScore, setPriorityScore] = useState(budget.priority_score ?? 3)
  const [isInflationIndexed, setIsInflationIndexed] = useState(budget.is_inflation_indexed ?? false)
  const [saving, setSaving] = useState(false)
  const [showIcons, setShowIcons] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [nibudAmount, setNibudAmount] = useState<number | null>(null)
  // Household ownership
  const [ownership, setOwnership] = useState<OwnershipType>(budget.ownership ?? 'personal')
  const { hasHousehold, householdId } = useHouseholdStatus()
  // Goal type fields
  const [goalType, setGoalType] = useState(budget.goal_type ?? '')
  const [goalAmount, setGoalAmount] = useState(budget.goal_amount ? String(budget.goal_amount) : '')
  const [goalDate, setGoalDate] = useState(budget.goal_date ?? '')
  const [goalFrequency, setGoalFrequency] = useState(budget.goal_frequency ?? '')
  // De Wil goal linking
  const [linkedGoalId, setLinkedGoalId] = useState<string>('')
  const [availableSavingsGoals, setAvailableSavingsGoals] = useState<
    { id: string; name: string; target_value: number; target_date: string | null }[]
  >([])
  const [showCreateGoal, setShowCreateGoal] = useState(false)
  const [isFavorite, setIsFavorite] = useState(budget.is_favorite ?? false)

  // Track dirty state
  const isDirty = useMemo(() => {
    return (
      name !== budget.name ||
      icon !== budget.icon ||
      description !== (budget.description ?? '') ||
      defaultLimit !== String(budget.default_limit) ||
      budgetType !== (budget.budget_type ?? 'expense') ||
      interval !== (budget.interval ?? 'monthly') ||
      rolloverType !== (budget.rollover_type ?? 'reset') ||
      limitType !== (budget.limit_type ?? 'soft') ||
      alertThreshold !== (budget.alert_threshold ?? 80) ||
      maxSingleAmount !== String(budget.max_single_transaction_amount ?? 0) ||
      isEssential !== (budget.is_essential ?? false) ||
      priorityScore !== (budget.priority_score ?? 3) ||
      isInflationIndexed !== (budget.is_inflation_indexed ?? false) ||
      ownership !== (budget.ownership ?? 'personal') ||
      goalType !== (budget.goal_type ?? '') ||
      goalAmount !== (budget.goal_amount ? String(budget.goal_amount) : '') ||
      goalDate !== (budget.goal_date ?? '') ||
      goalFrequency !== (budget.goal_frequency ?? '') ||
      isFavorite !== (budget.is_favorite ?? false)
    )
  }, [name, icon, description, defaultLimit, budgetType, interval, rolloverType, limitType, alertThreshold, maxSingleAmount, isEssential, priorityScore, isInflationIndexed, ownership, goalType, goalAmount, goalDate, goalFrequency, isFavorite, budget])

  // beforeunload warning for page refresh
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'Je hebt onopgeslagen wijzigingen. Weet je zeker dat je wilt vernieuwen?'
      return e.returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // Load De Wil savings goals + existing linked goal
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('goals')
      .select('id, name, target_value, target_date')
      .eq('goal_type', 'savings')
      .eq('is_completed', false)
      .order('sort_order', { ascending: true })
      .then(({ data }) => { if (data) setAvailableSavingsGoals(data) })
    supabase
      .from('goals')
      .select('id')
      .eq('budget_id', budget.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setLinkedGoalId(data.id) })
  }, [budget.id])

  // Fetch NIBUD reference amount for child budgets with a slug
  useEffect(() => {
    if (!budget.slug || budget.parent_id === null) return // Only for child budgets with slugs

    async function fetchNibud() {
      const supabase = createClient()
      const { data } = await supabase
        .from('nibud_reference_data')
        .select('basis_amount')
        .eq('mapped_budget_slug', budget.slug)
        .order('year', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        setNibudAmount(Number(data.basis_amount))
      } else {
        setNibudAmount(null)
      }
    }

    fetchNibud()
  }, [budget.slug, budget.parent_id])

  // Handle close with unsaved changes confirmation
  function handleClose() {
    if (isDirty) {
      setShowCloseConfirm(true)
    } else {
      onClose()
    }
  }

  function confirmClose() {
    setShowCloseConfirm(false)
    onClose()
  }

  function cancelClose() {
    setShowCloseConfirm(false)
  }

  // Effective month for limit changes
  const now = new Date()
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [effectiveFrom, setEffectiveFrom] = useState(currentPeriod)

  const limitChanged = !isParent && (parseFloat(defaultLimit) || 0) !== Number(budget.default_limit)

  // Generate month options: current month + up to 12 months back
  const monthOptions: { value: string; label: string }[] = []
  for (let i = 0; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
    monthOptions.push({ value, label })
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)

    const supabase = createClient()
    const newLimit = isParent ? Number(budget.default_limit) : (parseFloat(defaultLimit) || 0)

    const { error } = await supabase
      .from('budgets')
      .update({
        name: name.trim(),
        icon,
        description: description.trim() || null,
        default_limit: newLimit,
        budget_type: budgetType,
        interval,
        rollover_type: rolloverType,
        limit_type: limitType,
        alert_threshold: alertThreshold,
        max_single_transaction_amount: parseFloat(maxSingleAmount) || 0,
        is_essential: isEssential,
        priority_score: priorityScore,
        is_inflation_indexed: isInflationIndexed,
        ownership: ownership,
        household_id: ownership === 'shared' ? householdId : null,
        goal_type: goalType || null,
        goal_amount: parseFloat(goalAmount) || null,
        goal_date: goalDate || null,
        goal_frequency: goalFrequency || null,
        is_favorite: isFavorite,
        updated_at: new Date().toISOString(),
      })
      .eq('id', budget.id)

    // If limit changed, record in budget_amounts with effective_from
    if (!error && limitChanged) {
      const effectiveDate = `${effectiveFrom}-01`

      const { data: existing } = await supabase
        .from('budget_amounts')
        .select('id')
        .eq('budget_id', budget.id)
        .limit(1)

      if (!existing || existing.length === 0) {
        await supabase
          .from('budget_amounts')
          .insert({
            budget_id: budget.id,
            effective_from: '2020-01-01',
            amount: Number(budget.default_limit),
          })
      }

      await supabase
        .from('budget_amounts')
        .delete()
        .eq('budget_id', budget.id)
        .eq('effective_from', effectiveDate)

      await supabase
        .from('budget_amounts')
        .insert({
          budget_id: budget.id,
          effective_from: effectiveDate,
          amount: newLimit,
        })
    }

    // Goal linking for spaardoel
    if (!error && goalType === 'spaardoel') {
      const { data: oldLinked } = await supabase.from('goals').select('id').eq('budget_id', budget.id)
      for (const old of oldLinked ?? []) {
        if (old.id !== linkedGoalId) {
          await supabase.from('goals').update({ budget_id: null }).eq('id', old.id)
        }
      }
      if (linkedGoalId) {
        await supabase.from('goals').update({ budget_id: budget.id }).eq('id', linkedGoalId)
      }
    } else if (!error && budget.goal_type === 'spaardoel' && goalType !== 'spaardoel') {
      await supabase.from('goals').update({ budget_id: null }).eq('budget_id', budget.id)
    }

    setSaving(false)
    if (!error) onSaved()
  }

  const SelectedIcon = iconMap[icon] ?? iconMap['Circle']
  const inputCls = 'w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm text-[var(--ink)] focus:border-kern-500 focus:outline-none focus:ring-1 focus:ring-kern-500'

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleClose}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--paper)] shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Budget bewerken</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setIsFavorite(!isFavorite)}
              className={`rounded-lg p-1.5 transition-colors ${
                isFavorite ? 'text-red-500 hover:text-red-600' : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
              }`}
              title={isFavorite ? 'Verwijder uit favorieten' : 'Markeer als favoriet'}
            >
              <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
            </button>
            <button onClick={handleClose} className="rounded-lg p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-6 py-4">
          {/* Unsaved changes close confirmation */}
          {showCloseConfirm && (
            <div className="rounded-lg border border-orange-300 bg-orange-50 p-3" data-testid="modal-unsaved-changes-warning">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-orange-800">Onopgeslagen wijzigingen</p>
                  <p className="mt-1 text-xs text-orange-700">
                    Je hebt wijzigingen die nog niet zijn opgeslagen. Wil je deze verwijderen of verder bewerken?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={confirmClose}
                      className="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700"
                      data-testid="modal-confirm-close-btn"
                    >
                      Wijzigingen verwijderen
                    </button>
                    <button
                      type="button"
                      onClick={cancelClose}
                      className="rounded-md border border-orange-300 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
                      data-testid="modal-cancel-close-btn"
                    >
                      Verder bewerken
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dirty indicator */}
          {isDirty && !showCloseConfirm && (
            <div className="flex items-center gap-1.5 rounded-md bg-kern-50 px-3 py-1.5 border border-kern-200" data-testid="modal-dirty-indicator">
              <div className="h-2 w-2 rounded-full bg-kern-500 animate-pulse" />
              <span className="text-[11px] font-medium text-kern-700">Onopgeslagen wijzigingen</span>
            </div>
          )}
          {/* Name + Icon */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowIcons(!showIcons)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-ed)] text-[var(--ink-3)] hover:border-kern-300 hover:bg-kern-50"
            >
              <SelectedIcon className="h-5 w-5" />
            </button>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`flex-1 ${inputCls}`}
              placeholder="Naam"
            />
          </div>

          {showIcons && (
            <div className="flex flex-wrap gap-1">
              {iconOptions.map((iconName) => {
                const Icon = iconMap[iconName]
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => { setIcon(iconName); setShowIcons(false) }}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs transition-colors ${
                      icon === iconName
                        ? 'border-kern-500 bg-kern-50 text-kern-600'
                        : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                )
              })}
            </div>
          )}

          {/* Ownership toggle */}
          <OwnershipToggle
            value={ownership}
            onChange={setOwnership}
            hasHousehold={hasHousehold}
            compact
          />

          {/* Financial row: Type + Limit + Interval */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Type</label>
              <select value={budgetType} onChange={(e) => setBudgetType(e.target.value as 'income' | 'savings' | 'expense' | 'debt' | 'archive')} className={inputCls}>
                <option value="expense">Uitgave</option>
                <option value="income">Inkomen</option>
                <option value="savings">Sparen</option>
                <option value="debt">Schuld</option>
                <option value="archive">Verborgen</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Limiet</label>
              {isParent ? (
                <div className={`${inputCls} cursor-not-allowed bg-[var(--subtle)] text-[var(--ink-3)]`}>
                  {formatCurrency(childrenLimitSum ?? 0)}
                  <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">Som van sub-budgetten</p>
                </div>
              ) : (
                <input type="number" min="0" step="0.01" value={defaultLimit} onChange={(e) => setDefaultLimit(e.target.value)} className={inputCls} />
              )}
              {nibudAmount !== null && nibudAmount > 0 && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-[var(--ink-3)]">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--ink-4)]" />
                  NIBUD-richtlijn: <span className="font-mono font-medium text-[var(--ink-2)]">{formatCurrency(nibudAmount)}/mnd</span>
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Interval</label>
              <select value={interval} onChange={(e) => setInterval(e.target.value as 'monthly' | 'quarterly' | 'yearly')} className={inputCls}>
                <option value="monthly">Maandelijks</option>
                <option value="quarterly">Per kwartaal</option>
                <option value="yearly">Jaarlijks</option>
              </select>
            </div>
          </div>

          {/* Effective month — only shown when limit is changed */}
          {limitChanged && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Ingangsmaand</label>
              <select value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className={`${inputCls} capitalize`}>
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} className="capitalize">{opt.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--ink-3)]">
                Eerdere maanden behouden de oude limiet van {formatCurrency(Number(budget.default_limit))}
              </p>
            </div>
          )}

          {/* Doeltype — alleen voor subbudgetten */}
          {!isParent && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                Doeltype <span className="font-normal text-[var(--ink-3)]">(optioneel)</span>
              </label>
              <p className="mb-2 text-[11px] text-[var(--ink-3)]">
                Kies hoe dit budget werkt. Het doeltype bepaalt hoe overschotten en voortgang worden berekend.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { value: '', label: 'Geen' },
                  { value: 'vaste_maandlast', label: 'Vaste maandlast' },
                  { value: 'bestedingslimiet', label: 'Bestedingslimiet' },
                  { value: 'spaardoel', label: 'Spaardoel' },
                  { value: 'maandelijkse_reservering', label: 'Reservering' },
                  { value: 'periodieke_last', label: 'Periodieke last' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setGoalType(value)
                      if (value !== 'spaardoel') { setGoalDate(''); if (value !== 'periodieke_last') setGoalAmount('') }
                      if (value !== 'periodieke_last') setGoalFrequency('')
                      if (value === 'maandelijkse_reservering') setRolloverType('carry-over')
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      goalType === value
                        ? 'bg-kern-50 border-kern-200 text-kern-700'
                        : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {goalType !== '' && (
                <div className="mt-2 rounded-lg border border-kern-200 bg-kern-50 px-3 py-2.5">
                  <p className="text-[11px] leading-relaxed text-kern-700">
                    {goalType === 'vaste_maandlast' && 'Een vaste terugkerende uitgave. Je ziet direct of je inkomsten dit dekken of tekortschiet.'}
                    {goalType === 'bestedingslimiet' && 'Maximaal te besteden bedrag. Je ontvangt een melding zodra je de ingestelde drempel nadert.'}
                    {goalType === 'spaardoel' && 'Spaart toe naar een doel. Vul een doelbedrag en einddatum in om de voortgang te volgen.'}
                    {goalType === 'maandelijkse_reservering' && 'Bouwt maandelijks saldo op voor een toekomstige uitgave. Overschot wordt automatisch doorgeschoven naar de volgende maand.'}
                    {goalType === 'periodieke_last' && 'Voor grote uitgaven die je periodiek verwacht, zoals een verzekering of vakantie. Je reserveert maandelijks een deel van het totaalbedrag.'}
                  </p>
                </div>
              )}

              {goalType === 'spaardoel' && (
                <div className="mt-2">
                  {availableSavingsGoals.length > 0 && (
                    <select
                      value={linkedGoalId}
                      onChange={(e) => {
                        const gid = e.target.value
                        setLinkedGoalId(gid)
                        if (gid) {
                          const g = availableSavingsGoals.find(x => x.id === gid)
                          if (g) { setGoalAmount(String(g.target_value)); setGoalDate(g.target_date ?? '') }
                        } else {
                          setGoalAmount(''); setGoalDate('')
                        }
                      }}
                      className={inputCls}
                    >
                      <option value="">— Geen koppeling —</option>
                      {availableSavingsGoals.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  )}
                  {linkedGoalId && (
                    <p className="mt-1 text-[11px] text-wil-600">Doelbedrag en einddatum worden overgenomen uit het gekoppelde doel.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCreateGoal(true)}
                    className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-wil-600 hover:text-wil-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Maak nieuw doel aan in De Wil
                  </button>
                </div>
              )}

              {goalType === 'periodieke_last' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--ink-3)]">Totaalbedrag (€)</label>
                    <input type="number" min="0" step="0.01" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} className={inputCls} placeholder="bijv. 600" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--ink-3)]">Frequentie</label>
                    <select value={goalFrequency} onChange={(e) => setGoalFrequency(e.target.value)} className={inputCls}>
                      <option value="">Kies frequentie</option>
                      <option value="jaarlijks">Jaarlijks</option>
                      <option value="halfjaarlijks">Halfjaarlijks</option>
                      <option value="kwartaal">Kwartaal</option>
                    </select>
                  </div>
                </div>
              )}

              {goalType === 'maandelijkse_reservering' && (
                <p className="mt-1.5 text-[10px] text-[var(--ink-3)]">Rollover wordt automatisch ingesteld op &apos;Doorschuiven&apos;.</p>
              )}
            </div>
          )}

          {/* Control row: Rollover + Limit type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Overschot-beheer</label>
              <select value={rolloverType} onChange={(e) => setRolloverType(e.target.value as 'reset' | 'carry-over' | 'invest-sweep')} className={inputCls}>
                <option value="reset">Reset</option>
                <option value="carry-over">Doorschuiven</option>
                <option value="invest-sweep">Beleggen-sweep</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Limiet-type</label>
              <select value={limitType} onChange={(e) => setLimitType(e.target.value as 'soft' | 'hard')} className={inputCls}>
                <option value="soft">Zacht (waarschuwing)</option>
                <option value="hard">Hard (blokkering)</option>
              </select>
            </div>
          </div>

          {/* Alert threshold + Max single */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notificatie: {alertThreshold}%</label>
              <input
                type="range" min="0" max="100"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(parseInt(e.target.value))}
                className="w-full accent-kern-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Max transactie</label>
              <input type="number" min="0" step="0.01" value={maxSingleAmount} onChange={(e) => setMaxSingleAmount(e.target.value)} className={inputCls} placeholder="0 = geen limiet" />
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Prioriteit</label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => setPriorityScore(score)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-medium transition-colors ${
                    priorityScore === score
                      ? 'border-kern-500 bg-kern-50 text-kern-700'
                      : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)]'
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEssential(!isEssential)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isEssential ? 'bg-kern-500' : 'bg-zinc-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] transition-transform ${isEssential ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-xs text-[var(--ink-2)]">Essentieel</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <button
                type="button"
                onClick={() => setIsInflationIndexed(!isInflationIndexed)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isInflationIndexed ? 'bg-kern-500' : 'bg-zinc-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] transition-transform ${isInflationIndexed ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-xs text-[var(--ink-2)]">Inflatie-indexatie</span>
            </label>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Beschrijving (optioneel)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-ed)] px-6 py-4">
          <button onClick={handleClose} className="rounded-lg border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]">
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>

    {showCreateGoal && (
      <GoalForm
        assets={[]}
        debts={[]}
        lockedToSavings
        onClose={() => setShowCreateGoal(false)}
        onSaved={async (newGoalId) => {
          setShowCreateGoal(false)
          if (newGoalId) {
            const supabase = createClient()
            const { data } = await supabase
              .from('goals')
              .select('id, name, target_value, target_date')
              .eq('goal_type', 'savings')
              .eq('is_completed', false)
              .order('sort_order', { ascending: true })
            setAvailableSavingsGoals(data ?? [])
            setLinkedGoalId(newGoalId)
            const newGoal = data?.find(g => g.id === newGoalId)
            if (newGoal) { setGoalAmount(String(newGoal.target_value)); setGoalDate(newGoal.target_date ?? '') }
          }
        }}
        initialValues={{ target_value: goalAmount || undefined, target_date: goalDate || undefined }}
      />
    )}
    </>
  )
}

// ── Budget create modal ──────────────────────────────────────

function BudgetCreateModal({
  parentBudgets,
  onClose,
  onSaved,
}: {
  parentBudgets: BudgetWithChildren[]
  onClose: () => void
  onSaved: () => void
}) {
  const [parentId, setParentId] = useState('new')
  const [categoryName, setCategoryName] = useState('')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('Circle')
  const [budgetType, setBudgetType] = useState<'expense' | 'income' | 'savings' | 'debt'>('expense')
  const [defaultLimit, setDefaultLimit] = useState('')
  const [interval, setInterval] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly')
  const [ownership, setOwnership] = useState<OwnershipType>('personal')
  const [goalType, setGoalType] = useState('')
  const [goalAmount, setGoalAmount] = useState('')
  const [goalDate, setGoalDate] = useState('')
  const [goalFrequency, setGoalFrequency] = useState('')
  const [rolloverType, setRolloverType] = useState<'reset' | 'carry-over' | 'invest-sweep'>('reset')
  const [priorityScore, setPriorityScore] = useState(3)
  const [isEssential, setIsEssential] = useState(false)
  const [isInflationIndexed, setIsInflationIndexed] = useState(false)
  const [description, setDescription] = useState('')
  const [showIcons, setShowIcons] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const { hasHousehold, householdId } = useHouseholdStatus()
  // De Wil goal linking
  const [linkedGoalId, setLinkedGoalId] = useState<string>('')
  const [availableSavingsGoals, setAvailableSavingsGoals] = useState<
    { id: string; name: string; target_value: number; target_date: string | null }[]
  >([])
  const [showCreateGoal, setShowCreateGoal] = useState(false)

  const isDirty = name.trim() !== '' || categoryName.trim() !== '' || defaultLimit !== ''

  // Load De Wil savings goals on mount
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('goals')
      .select('id, name, target_value, target_date')
      .eq('goal_type', 'savings')
      .eq('is_completed', false)
      .order('sort_order', { ascending: true })
      .then(({ data }) => { if (data) setAvailableSavingsGoals(data) })
  }, [])

  function handleClose() {
    if (isDirty) {
      setShowCloseConfirm(true)
    } else {
      onClose()
    }
  }

  async function handleSave() {
    if (!name.trim()) { setError('Naam is verplicht'); return }
    if (parentId === 'new' && !categoryName.trim()) { setError('Categorienaam is verplicht'); return }
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Niet ingelogd'); setSaving(false); return }

    const ownershipFields = {
      ownership,
      household_id: ownership === 'shared' ? householdId : null,
    }

    let resolvedParentId: string | null = parentId === 'new' ? null : parentId

    if (parentId === 'new') {
      const { data: parentData, error: parentError } = await supabase
        .from('budgets')
        .insert({
          user_id: user.id,
          name: categoryName.trim(),
          icon,
          default_limit: 0,
          budget_type: budgetType,
          interval,
          rollover_type: rolloverType,
          is_essential: isEssential,
          priority_score: priorityScore,
          is_inflation_indexed: isInflationIndexed,
          parent_id: null,
          ...ownershipFields,
        })
        .select('id')
        .single()

      if (parentError || !parentData) {
        setError(parentError?.message ?? 'Fout bij aanmaken categorie')
        setSaving(false)
        return
      }
      resolvedParentId = parentData.id
    }

    const { data: insertedBudget, error: insertError } = await supabase
      .from('budgets')
      .insert({
        user_id: user.id,
        name: name.trim(),
        icon,
        description: description.trim() || null,
        default_limit: parseFloat(defaultLimit) || 0,
        budget_type: budgetType,
        interval,
        rollover_type: goalType === 'maandelijkse_reservering' ? 'carry-over' : rolloverType,
        limit_type: 'soft',
        alert_threshold: 80,
        max_single_transaction_amount: 0,
        is_essential: isEssential,
        priority_score: priorityScore,
        is_inflation_indexed: isInflationIndexed,
        parent_id: resolvedParentId,
        goal_type: goalType || null,
        goal_amount: parseFloat(goalAmount) || null,
        goal_date: goalDate || null,
        goal_frequency: goalFrequency || null,
        sort_order: 0,
        ...ownershipFields,
      })
      .select('id')
      .single()

    if (insertError) {
      setSaving(false)
      setError(insertError.message)
      return
    }

    // Goal linking for spaardoel
    if (goalType === 'spaardoel' && linkedGoalId && insertedBudget?.id) {
      await supabase.from('goals').update({ budget_id: insertedBudget.id }).eq('id', linkedGoalId)
    }

    setSaving(false)
    onSaved()
  }

  const SelectedIcon = iconMap[icon] ?? iconMap['Circle']
  const inputCls = 'w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm text-[var(--ink)] focus:border-kern-500 focus:outline-none focus:ring-1 focus:ring-kern-500'

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleClose}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--paper)] shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Nieuw budget</h2>
          <button onClick={handleClose} className="rounded-lg p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          {/* Unsaved changes close confirmation */}
          {showCloseConfirm && (
            <div className="rounded-lg border border-orange-300 bg-orange-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-orange-800">Onopgeslagen wijzigingen</p>
                  <p className="mt-1 text-xs text-orange-700">
                    Je hebt wijzigingen die nog niet zijn opgeslagen. Wil je deze verwijderen?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700"
                    >
                      Wijzigingen verwijderen
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCloseConfirm(false)}
                      className="rounded-md border border-orange-300 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
                    >
                      Verder bewerken
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {/* STRUCTUUR */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">Structuur</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Hoofdcategorie</label>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={inputCls}>
                <option value="new">+ Nieuwe categorie</option>
                {parentBudgets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {parentId === 'new' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Categorienaam</label>
                <input
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className={inputCls}
                  placeholder="bijv. Wonen"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Type</label>
              <div className="flex gap-1.5">
                {(['expense', 'income', 'savings', 'debt'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBudgetType(t)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      budgetType === t
                        ? 'border-kern-500 bg-kern-50 text-kern-700'
                        : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                    }`}
                  >
                    {t === 'expense' ? 'Uitgave' : t === 'income' ? 'Inkomen' : t === 'savings' ? 'Sparen' : 'Schuld'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* IDENTITEIT */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">Identiteit</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowIcons(!showIcons)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-ed)] text-[var(--ink-3)] hover:border-kern-300 hover:bg-kern-50"
              >
                <SelectedIcon className="h-5 w-5" />
              </button>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`flex-1 ${inputCls}`}
                placeholder="Naam van het budget"
              />
            </div>
            {showIcons && (
              <div className="flex flex-wrap gap-1">
                {iconOptions.map((iconName) => {
                  const Icon = iconMap[iconName]
                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => { setIcon(iconName); setShowIcons(false) }}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs transition-colors ${
                        icon === iconName
                          ? 'border-kern-500 bg-kern-50 text-kern-600'
                          : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* FINANCIEEL */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">Financieel</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Limiet (€)</label>
                <input type="number" min="0" step="0.01" value={defaultLimit} onChange={(e) => setDefaultLimit(e.target.value)} className={inputCls} placeholder="0" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Interval</label>
                <select value={interval} onChange={(e) => setInterval(e.target.value as 'monthly' | 'quarterly' | 'yearly')} className={inputCls}>
                  <option value="monthly">Maandelijks</option>
                  <option value="quarterly">Per kwartaal</option>
                  <option value="yearly">Jaarlijks</option>
                </select>
              </div>
            </div>
          </div>

          {/* EIGENDOM */}
          <OwnershipToggle
            value={ownership}
            onChange={setOwnership}
            hasHousehold={hasHousehold}
            compact
          />

          {/* DOELTYPE — alleen voor subbudgetten (bestaande parent geselecteerd) */}
          {parentId !== 'new' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                Doeltype <span className="font-normal text-[var(--ink-3)]">(optioneel)</span>
              </label>
              <p className="mb-2 text-[11px] text-[var(--ink-3)]">
                Kies hoe dit budget werkt. Het doeltype bepaalt hoe overschotten en voortgang worden berekend.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { value: '', label: 'Geen' },
                  { value: 'vaste_maandlast', label: 'Vaste maandlast' },
                  { value: 'bestedingslimiet', label: 'Bestedingslimiet' },
                  { value: 'spaardoel', label: 'Spaardoel' },
                  { value: 'maandelijkse_reservering', label: 'Reservering' },
                  { value: 'periodieke_last', label: 'Periodieke last' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setGoalType(value)
                      if (value !== 'spaardoel') { setGoalDate(''); if (value !== 'periodieke_last') setGoalAmount('') }
                      if (value !== 'periodieke_last') setGoalFrequency('')
                      if (value === 'maandelijkse_reservering') setRolloverType('carry-over')
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      goalType === value
                        ? 'bg-kern-50 border-kern-200 text-kern-700'
                        : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {goalType !== '' && (
                <div className="mt-2 rounded-lg border border-kern-200 bg-kern-50 px-3 py-2.5">
                  <p className="text-[11px] leading-relaxed text-kern-700">
                    {goalType === 'vaste_maandlast' && 'Een vaste terugkerende uitgave. Je ziet direct of je inkomsten dit dekken of tekortschiet.'}
                    {goalType === 'bestedingslimiet' && 'Maximaal te besteden bedrag. Je ontvangt een melding zodra je de ingestelde drempel nadert.'}
                    {goalType === 'spaardoel' && 'Spaart toe naar een doel. Vul een doelbedrag en einddatum in om de voortgang te volgen.'}
                    {goalType === 'maandelijkse_reservering' && 'Bouwt maandelijks saldo op voor een toekomstige uitgave. Overschot wordt automatisch doorgeschoven naar de volgende maand.'}
                    {goalType === 'periodieke_last' && 'Voor grote uitgaven die je periodiek verwacht, zoals een verzekering of vakantie. Je reserveert maandelijks een deel van het totaalbedrag.'}
                  </p>
                </div>
              )}

              {goalType === 'spaardoel' && (
                <div className="mt-2">
                  {availableSavingsGoals.length > 0 && (
                    <select
                      value={linkedGoalId}
                      onChange={(e) => {
                        const gid = e.target.value
                        setLinkedGoalId(gid)
                        if (gid) {
                          const g = availableSavingsGoals.find(x => x.id === gid)
                          if (g) { setGoalAmount(String(g.target_value)); setGoalDate(g.target_date ?? '') }
                        } else {
                          setGoalAmount(''); setGoalDate('')
                        }
                      }}
                      className={inputCls}
                    >
                      <option value="">— Geen koppeling —</option>
                      {availableSavingsGoals.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  )}
                  {linkedGoalId && (
                    <p className="mt-1 text-[11px] text-wil-600">Doelbedrag en einddatum worden overgenomen uit het gekoppelde doel.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCreateGoal(true)}
                    className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-wil-600 hover:text-wil-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Maak nieuw doel aan in De Wil
                  </button>
                </div>
              )}

              {goalType === 'periodieke_last' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--ink-3)]">Totaalbedrag (€)</label>
                    <input type="number" min="0" step="0.01" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} className={inputCls} placeholder="bijv. 600" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--ink-3)]">Frequentie</label>
                    <select value={goalFrequency} onChange={(e) => setGoalFrequency(e.target.value)} className={inputCls}>
                      <option value="">Kies frequentie</option>
                      <option value="jaarlijks">Jaarlijks</option>
                      <option value="halfjaarlijks">Halfjaarlijks</option>
                      <option value="kwartaal">Kwartaal</option>
                    </select>
                  </div>
                </div>
              )}

              {goalType === 'maandelijkse_reservering' && (
                <p className="mt-1.5 text-[10px] text-[var(--ink-3)]">Rollover wordt automatisch ingesteld op &apos;Doorschuiven&apos;.</p>
              )}
            </div>
          )}

          {/* GEAVANCEERD */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)]"
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
              Geavanceerd
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Overschot-beheer</label>
                  <select value={rolloverType} onChange={(e) => setRolloverType(e.target.value as 'reset' | 'carry-over' | 'invest-sweep')} className={inputCls}>
                    <option value="reset">Reset</option>
                    <option value="carry-over">Doorschuiven</option>
                    <option value="invest-sweep">Beleggen-sweep</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Prioriteit</label>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setPriorityScore(score)}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-medium transition-colors ${
                          priorityScore === score
                            ? 'border-kern-500 bg-kern-50 text-kern-700'
                            : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)]'
                        }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEssential(!isEssential)}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isEssential ? 'bg-kern-500' : 'bg-zinc-300'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] transition-transform ${isEssential ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                    <span className="text-xs text-[var(--ink-2)]">Essentieel</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsInflationIndexed(!isInflationIndexed)}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isInflationIndexed ? 'bg-kern-500' : 'bg-zinc-300'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] transition-transform ${isInflationIndexed ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                    <span className="text-xs text-[var(--ink-2)]">Inflatie-indexatie</span>
                  </label>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Beschrijving (optioneel)</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-ed)] px-6 py-4">
          <button onClick={handleClose} className="rounded-lg border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]">
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>

    {showCreateGoal && (
      <GoalForm
        assets={[]}
        debts={[]}
        lockedToSavings
        onClose={() => setShowCreateGoal(false)}
        onSaved={async (newGoalId) => {
          setShowCreateGoal(false)
          if (newGoalId) {
            const supabase = createClient()
            const { data } = await supabase
              .from('goals')
              .select('id, name, target_value, target_date')
              .eq('goal_type', 'savings')
              .eq('is_completed', false)
              .order('sort_order', { ascending: true })
            setAvailableSavingsGoals(data ?? [])
            setLinkedGoalId(newGoalId)
            const newGoal = data?.find(g => g.id === newGoalId)
            if (newGoal) { setGoalAmount(String(newGoal.target_value)); setGoalDate(newGoal.target_date ?? '') }
          }
        }}
        initialValues={{ target_value: goalAmount || undefined, target_date: goalDate || undefined }}
      />
    )}
    </>
  )
}
