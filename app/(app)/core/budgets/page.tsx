'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, Plus, X, Pencil, Save,
  List, GitFork, Fingerprint, PieChart,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDefaultBudgets, type Budget, type BudgetWithChildren } from '@/lib/budget-data'
import { BudgetIcon, formatCurrency, getTypeColors, iconMap, iconOptions, type BudgetType } from '@/components/app/budget-shared'
import { type BudgetRollover, formatPeriod, getCarriedAmount } from '@/lib/budget-rollover'
import { shouldAlert } from '@/components/app/budget-alert'
import { BudgetTree } from '@/components/app/budget-tree'
import { BudgetBlob } from '@/components/app/budget-blob'
import { BudgetDonut } from '@/components/app/budget-donut'

function ProgressBar({ spent, limit, budgetType = 'expense' }: { spent: number; limit: number; budgetType?: BudgetType }) {
  const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0
  const overBudget = spent > limit && limit > 0
  const colors = getTypeColors(budgetType)

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          overBudget ? 'bg-red-500' : pct > 80 ? colors.barWarning : colors.barDefault
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<BudgetWithChildren[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null)
  const [modalStep, setModalStep] = useState<'detail' | 'edit'>('detail')
  const [viewMode, setViewMode] = useState<'list' | 'tree' | 'blob' | 'donut'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('budgets-view-mode') as 'list' | 'tree' | 'blob' | 'donut') || 'tree'
    }
    return 'tree'
  })
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [spending, setSpending] = useState<Record<string, number>>({})
  const [transactions, setTransactions] = useState<{ budget_id: string; amount: number; date: string; description: string; counterparty_name: string | null }[]>([])
  const [rollovers, setRollovers] = useState<BudgetRollover[]>([])
  const [budgetAmounts, setBudgetAmounts] = useState<{ id: string; budget_id: string; effective_from: string; amount: number }[]>([])

  const monthStart = monthDate.toISOString().split('T')[0]
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).toISOString().split('T')[0]

  const loadSpending = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('transactions')
      .select('budget_id, amount, date, description, counterparty_name')
      .gte('date', monthStart)
      .lt('date', monthEnd)
      .order('date', { ascending: false })

    if (data && data.length > 0) {
      const map: Record<string, number> = {}
      for (const t of data) {
        if (t.budget_id) {
          map[t.budget_id] = (map[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
        }
      }
      setSpending(map)
      setTransactions(data.filter(t => t.budget_id) as typeof transactions)
    } else {
      setSpending({})
      setTransactions([])
    }

    // Fetch rollovers for the current month period
    const currentPeriod = formatPeriod(monthDate)
    const { data: rolloverData } = await supabase
      .from('budget_rollovers')
      .select('*')
      .eq('period', currentPeriod)
    if (rolloverData) setRollovers(rolloverData as BudgetRollover[])

    // Fetch budget amount overrides
    const { data: amountsData } = await supabase
      .from('budget_amounts')
      .select('*')
    if (amountsData) setBudgetAmounts(amountsData as { id: string; budget_id: string; effective_from: string; amount: number }[])
  }, [monthStart, monthEnd, monthDate])

  const loadBudgets = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('budgets')
        .select('*')
        .order('sort_order', { ascending: true })

      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        await seedBudgets(supabase)
        return
      }

      const parents = (data as Budget[]).filter((b) => !b.parent_id)
      const children = (data as Budget[]).filter((b) => b.parent_id)

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
  }, [loadBudgets])

  useEffect(() => {
    if (!loading) {
      loadSpending()
    }
  }, [loading, loadSpending])

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

  function prevMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }

  function nextMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  function toggleViewMode(mode: 'list' | 'tree' | 'blob' | 'donut') {
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

  function getEffectiveLimit(budget: Budget): number {
    const budgetRollovers = rollovers.filter((r) => r.budget_id === budget.id)
    const carry = getCarriedAmount(budgetRollovers, formatPeriod(monthDate))

    // Check budget_amounts for period-specific limit override
    const displayDate = monthDate.toISOString().split('T')[0]
    const applicable = budgetAmounts
      .filter(a => a.budget_id === budget.id && a.effective_from <= displayDate)
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
    const budgetRollovers = rollovers.filter((r) => r.budget_id === budget.id)
    return getCarriedAmount(budgetRollovers, formatPeriod(monthDate))
  }

  const incomeBudgets = budgets.filter((b) => b.budget_type === 'income')
  const expenseBudgets = budgets.filter((b) => b.budget_type === 'expense')
  const savingsBudgets = budgets.filter((b) => b.budget_type === 'savings')

  const totalIncome = incomeBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalIncomeActual = incomeBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)
  const totalExpenseBudget = expenseBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalExpenseSpent = expenseBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)
  const totalSavingsBudget = savingsBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalSavingsActual = savingsBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)

  const monthLabel = monthDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); loadBudgets() }} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  function renderBudgetGroup(title: string, groupBudgets: BudgetWithChildren[], budgetType: BudgetType, totalBudget: number, totalSpent: number) {
    const colors = getTypeColors(budgetType)
    if (groupBudgets.length === 0) return null

    return (
      <div className="mt-8">
        <div className={`mb-4 rounded-xl border ${colors.border} bg-gradient-to-br ${colors.headerGradient} p-4`}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-700">{title}</h3>
            <div className="text-right">
              <span className={`text-sm font-bold ${colors.text}`}>
                {formatCurrency(totalSpent)}
              </span>
              <span className="text-sm text-zinc-400">
                {' / '}{formatCurrency(totalBudget)}
              </span>
            </div>
          </div>
          <div className="mt-2">
            <ProgressBar spent={totalSpent} limit={totalBudget} budgetType={budgetType} />
          </div>
        </div>

        <div className="space-y-2">
          {groupBudgets.map((parent) => {
            const parentSpent = getParentSpent(parent)
            const parentLimit = getParentEffectiveLimit(parent)
            const parentCarry = parent.children.length === 0
              ? getBudgetCarry(parent)
              : parent.children.reduce((sum, c) => sum + getBudgetCarry(c), 0)

            return (
              <div
                key={parent.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition-colors ${colors.hoverBorder} ${colors.hoverBg}`}
                onClick={() => openBudgetModal(parent.id)}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}>
                  <BudgetIcon name={parent.icon} className={`h-4 w-4 ${colors.text}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {parent.name}
                      {parentCarry > 0 && (
                        <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">doorgeschoven</span>
                      )}
                      {parent.children.length > 0 && (
                        <span className="ml-1.5 text-xs text-zinc-400">({parent.children.length})</span>
                      )}
                    </p>
                    <div className="ml-4 shrink-0 text-right">
                      <span className="text-sm font-medium text-zinc-900">
                        {formatCurrency(parentSpent)}
                      </span>
                      <span className="text-sm text-zinc-400">
                        {' / '}{formatCurrency(parentLimit)}
                      </span>
                      {parentSpent >= parentLimit && parentLimit > 0 ? (
                        <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500" title="Budget overschreden" />
                      ) : shouldAlert(parentSpent, parentLimit, parent.alert_threshold) ? (
                        <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500" title="Nadert limiet" />
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar spent={parentSpent} limit={parentLimit} budgetType={budgetType} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Month selector */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={prevMonth}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold capitalize text-zinc-900">
            {monthLabel}
          </h2>
          <button
            onClick={nextMonth}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Totals split: Income / Expenses / Savings */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs font-medium text-emerald-600 uppercase">Inkomen</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(totalIncomeActual)}</p>
            <p className="text-xs text-zinc-400">van {formatCurrency(totalIncome)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-amber-600 uppercase">Uitgaven</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(totalExpenseSpent)}</p>
            <p className="text-xs text-zinc-400">van {formatCurrency(totalExpenseBudget)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-blue-600 uppercase">Sparen</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(totalSavingsActual)}</p>
            <p className="text-xs text-zinc-400">van {formatCurrency(totalSavingsBudget)}</p>
          </div>
        </div>
      </section>

      {/* View toggle + New budget button */}
      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5">
          <button
            onClick={() => toggleViewMode('tree')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'tree'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <GitFork className="h-3.5 w-3.5" />
            Boom
          </button>
          <button
            onClick={() => toggleViewMode('list')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Lijst
          </button>
          <button
            onClick={() => toggleViewMode('blob')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'blob'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <Fingerprint className="h-3.5 w-3.5" />
            Organisme
          </button>
          <button
            onClick={() => toggleViewMode('donut')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'donut'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <PieChart className="h-3.5 w-3.5" />
            Donut
          </button>
        </div>

        <Link
          href="/core/budgets/new"
          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          <Plus className="h-4 w-4" />
          Nieuw budget
        </Link>
      </div>

      {/* Budget groups */}
      {viewMode === 'list' ? (
        <>
          {renderBudgetGroup('Inkomen', incomeBudgets, 'income', totalIncome, totalIncomeActual)}
          {renderBudgetGroup('Uitgaven', expenseBudgets, 'expense', totalExpenseBudget, totalExpenseSpent)}
          {renderBudgetGroup('Sparen & Schulden', savingsBudgets, 'savings', totalSavingsBudget, totalSavingsActual)}
        </>
      ) : viewMode === 'tree' ? (
        <>
          {incomeBudgets.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">Inkomen</h3>
              <BudgetTree
                groups={incomeBudgets}
                spending={spending}
                budgetType="income"
                onNavigate={(id) => openBudgetModal(id)}
              />
            </div>
          )}
          {expenseBudgets.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">Uitgaven</h3>
              <BudgetTree
                groups={expenseBudgets}
                spending={spending}
                budgetType="expense"
                onNavigate={(id) => openBudgetModal(id)}
              />
            </div>
          )}
          {savingsBudgets.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">Sparen & Schulden</h3>
              <BudgetTree
                groups={savingsBudgets}
                spending={spending}
                budgetType="savings"
                onNavigate={(id) => openBudgetModal(id)}
              />
            </div>
          )}
        </>
      ) : viewMode === 'blob' ? (
        <BudgetBlob
          groups={[...incomeBudgets, ...expenseBudgets, ...savingsBudgets]}
          spending={spending}
          onNavigate={(id) => openBudgetModal(id)}
        />
      ) : (
        <BudgetDonut
          groups={[...incomeBudgets, ...expenseBudgets, ...savingsBudgets]}
          spending={spending}
          onNavigate={(id) => openBudgetModal(id)}
        />
      )}

      {/* Budget detail modal */}
      {selectedBudget && modalStep === 'detail' && (
        <BudgetDetailModal
          budget={selectedBudget}
          parent={selectedParent}
          spending={spending}
          transactions={transactions}
          rollovers={rollovers}
          monthDate={monthDate}
          getSpent={getSpent}
          getEffectiveLimit={getEffectiveLimit}
          getBudgetCarry={getBudgetCarry}
          onClose={closeBudgetModal}
          onEdit={() => setModalStep('edit')}
          onSelectChild={(id) => openBudgetModal(id)}
        />
      )}

      {/* Budget edit modal */}
      {selectedBudget && modalStep === 'edit' && (
        <BudgetEditModal
          budget={selectedBudget}
          onClose={() => setModalStep('detail')}
          onSaved={() => {
            setModalStep('detail')
            loadBudgets()
            loadSpending()
          }}
        />
      )}
    </div>
  )
}

// ── Budget detail modal ──────────────────────────────────────

function BudgetDetailModal({
  budget,
  parent,
  spending,
  transactions,
  rollovers,
  monthDate,
  getSpent,
  getEffectiveLimit,
  getBudgetCarry,
  onClose,
  onEdit,
  onSelectChild,
}: {
  budget: Budget
  parent: BudgetWithChildren | null
  spending: Record<string, number>
  transactions: { budget_id: string; amount: number; date: string; description: string; counterparty_name: string | null }[]
  rollovers: BudgetRollover[]
  monthDate: Date
  getSpent: (b: Budget) => number
  getEffectiveLimit: (b: Budget) => number
  getBudgetCarry: (b: Budget) => number
  onClose: () => void
  onEdit: () => void
  onSelectChild: (id: string) => void
}) {
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

  // Filter transactions for this budget (or children if parent)
  const budgetIds = isParent ? children.map(c => c.id) : [budget.id]
  const budgetTx = transactions.filter(t => budgetIds.includes(t.budget_id))

  // 12-month spending history (fetched on mount)
  const [history, setHistory] = useState<{ month: string; label: string; spent: number; limit: number }[]>([])
  useEffect(() => {
    async function loadHistory() {
      const supabase = createClient()
      const now = new Date()
      const months: { month: string; start: string; end: string; label: string }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const start = d.toISOString().split('T')[0]
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split('T')[0]
        const label = d.toLocaleDateString('nl-NL', { month: 'short' })
        months.push({ month: start, start, end, label })
      }

      const { data: txData } = await supabase
        .from('transactions')
        .select('budget_id, amount, date')
        .in('budget_id', budgetIds)
        .gte('date', months[0].start)
        .lt('date', months[months.length - 1].end)

      const { data: amountData } = await supabase
        .from('budget_amounts')
        .select('budget_id, effective_from, amount')
        .in('budget_id', budgetIds)

      const result = months.map(m => {
        const monthTx = (txData ?? []).filter(t => t.date >= m.start && t.date < m.end && budgetIds.includes(t.budget_id))
        const monthSpent = monthTx.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

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
    }

    loadHistory()
  }, [budget.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const maxHistoryValue = Math.max(...history.map(h => Math.max(h.spent, h.limit)), 1)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center gap-3 border-b border-zinc-200 bg-gradient-to-r ${colors.headerGradient} px-6 py-4`}>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors.bgDark}`}>
            <BudgetIcon name={budget.icon} className={`h-5 w-5 ${colors.text}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-zinc-900">{budget.name}</h2>
            {budget.description && <p className="truncate text-xs text-zinc-500">{budget.description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Spending summary */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Limiet</p>
              <p className="mt-0.5 text-lg font-bold text-zinc-900">{formatCurrency(limit)}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Besteed</p>
              <p className="mt-0.5 text-lg font-bold text-zinc-900">{formatCurrency(spent)}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Resterend</p>
              <p className={`mt-0.5 text-lg font-bold ${remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(remaining)}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full transition-all ${spent > limit ? 'bg-red-500' : pct > 80 ? colors.barWarning : colors.barDefault}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs text-zinc-400">{pct}% besteed</p>
          </div>

          {carry > 0 && (
            <p className="mt-2 text-xs text-blue-600">Doorgeschoven: +{formatCurrency(carry)}</p>
          )}
        </div>

        {/* Children list */}
        {isParent && children.length > 0 && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <p className="mb-2 text-xs font-semibold text-zinc-500 uppercase">Subbudgetten</p>
            <div className="space-y-1.5">
              {children.map((child) => {
                const childSpent = getSpent(child)
                const childLimit = getEffectiveLimit(child)
                const childPct = childLimit > 0 ? Math.min(Math.round((childSpent / childLimit) * 100), 100) : 0
                return (
                  <div
                    key={child.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-100 p-2 transition-colors ${colors.hoverBg}`}
                    onClick={() => onSelectChild(child.id)}
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colors.bg}`}>
                      <BudgetIcon name={child.icon} className={`h-3.5 w-3.5 ${colors.textLight}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-xs font-medium text-zinc-700">{child.name}</p>
                        <span className="ml-2 shrink-0 text-xs text-zinc-500">
                          {formatCurrency(childSpent)} / {formatCurrency(childLimit)}
                        </span>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={`h-full rounded-full ${childSpent > childLimit ? 'bg-red-500' : colors.barDefault}`}
                          style={{ width: `${childPct}%` }}
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
          <div className="border-t border-zinc-100 px-6 py-4">
            <p className="mb-2 text-xs font-semibold text-zinc-500 uppercase">
              Transacties deze maand ({budgetTx.length})
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {budgetTx.map((tx, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-zinc-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-zinc-700">
                      {tx.counterparty_name || tx.description}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      {new Date(tx.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      {tx.counterparty_name && tx.description !== tx.counterparty_name && (
                        <span className="ml-1">{tx.description}</span>
                      )}
                    </p>
                  </div>
                  <span className={`ml-3 shrink-0 text-xs font-medium ${Number(tx.amount) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatCurrency(Math.abs(Number(tx.amount)))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 12-month spending history */}
        {history.length > 0 && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <p className="mb-3 text-xs font-semibold text-zinc-500 uppercase">Laatste 12 maanden</p>
            <div className="flex items-end gap-1" style={{ height: 80 }}>
              {history.map((h) => {
                const spentH = (h.spent / maxHistoryValue) * 100
                const limitH = (h.limit / maxHistoryValue) * 100
                const over = h.spent > h.limit && h.limit > 0
                return (
                  <div key={h.month} className="group relative flex flex-1 flex-col items-center" style={{ height: '100%' }}>
                    {/* Limit indicator line */}
                    {h.limit > 0 && (
                      <div
                        className="absolute w-full border-t border-dashed border-zinc-300"
                        style={{ bottom: `${limitH}%` }}
                      />
                    )}
                    {/* Spent bar */}
                    <div className="mt-auto w-full">
                      <div
                        className={`w-full rounded-t ${over ? 'bg-red-400' : colors.barDefault}`}
                        style={{ height: `${Math.max(spentH * 0.8, 2)}px` }}
                      />
                    </div>
                    {/* Month label */}
                    <p className="mt-1 text-[9px] text-zinc-400">{h.label}</p>
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute -top-10 z-10 rounded bg-zinc-800 px-2 py-1 text-[10px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      {formatCurrency(h.spent)} / {formatCurrency(h.limit)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 border-t border-zinc-200 px-6 py-4">
          <button
            onClick={onEdit}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Bewerken
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Budget edit modal ────────────────────────────────────────

function BudgetEditModal({
  budget,
  onClose,
  onSaved,
}: {
  budget: Budget
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

  // Effective month for limit changes
  const now = new Date()
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [effectiveFrom, setEffectiveFrom] = useState(currentPeriod)

  const limitChanged = (parseFloat(defaultLimit) || 0) !== Number(budget.default_limit)

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
    const newLimit = parseFloat(defaultLimit) || 0

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

    setSaving(false)
    if (!error) onSaved()
  }

  const SelectedIcon = iconMap[icon] ?? iconMap['Circle']
  const inputCls = 'w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">Budget bewerken</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          {/* Name + Icon */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowIcons(!showIcons)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:border-amber-300 hover:bg-amber-50"
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
                        ? 'border-amber-500 bg-amber-50 text-amber-600'
                        : 'border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                )
              })}
            </div>
          )}

          {/* Financial row: Type + Limit + Interval */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Type</label>
              <select value={budgetType} onChange={(e) => setBudgetType(e.target.value as 'income' | 'savings' | 'expense')} className={inputCls}>
                <option value="expense">Uitgave</option>
                <option value="income">Inkomen</option>
                <option value="savings">Sparen</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Limiet</label>
              <input type="number" min="0" step="0.01" value={defaultLimit} onChange={(e) => setDefaultLimit(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Interval</label>
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
              <label className="mb-1 block text-xs font-medium text-zinc-600">Ingangsmaand</label>
              <select value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className={`${inputCls} capitalize`}>
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} className="capitalize">{opt.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-zinc-400">
                Eerdere maanden behouden de oude limiet van {formatCurrency(Number(budget.default_limit))}
              </p>
            </div>
          )}

          {/* Control row: Rollover + Limit type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Overschot-beheer</label>
              <select value={rolloverType} onChange={(e) => setRolloverType(e.target.value as 'reset' | 'carry-over' | 'invest-sweep')} className={inputCls}>
                <option value="reset">Reset</option>
                <option value="carry-over">Doorschuiven</option>
                <option value="invest-sweep">Beleggen-sweep</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Limiet-type</label>
              <select value={limitType} onChange={(e) => setLimitType(e.target.value as 'soft' | 'hard')} className={inputCls}>
                <option value="soft">Zacht (waarschuwing)</option>
                <option value="hard">Hard (blokkering)</option>
              </select>
            </div>
          </div>

          {/* Alert threshold + Max single */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Notificatie: {alertThreshold}%</label>
              <input
                type="range" min="0" max="100"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(parseInt(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Max transactie</label>
              <input type="number" min="0" step="0.01" value={maxSingleAmount} onChange={(e) => setMaxSingleAmount(e.target.value)} className={inputCls} placeholder="0 = geen limiet" />
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Prioriteit</label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => setPriorityScore(score)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-medium transition-colors ${
                    priorityScore === score
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-zinc-200 text-zinc-400 hover:border-zinc-300'
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
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isEssential ? 'bg-amber-500' : 'bg-zinc-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${isEssential ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-xs text-zinc-600">Essentieel</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <button
                type="button"
                onClick={() => setIsInflationIndexed(!isInflationIndexed)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isInflationIndexed ? 'bg-amber-500' : 'bg-zinc-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${isInflationIndexed ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-xs text-zinc-600">Inflatie-indexatie</span>
            </label>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Beschrijving (optioneel)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}
