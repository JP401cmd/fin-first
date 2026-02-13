'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Plus, X, Pencil, Save,
  GitFork, Fingerprint, Workflow,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDefaultBudgets, type Budget, type BudgetWithChildren } from '@/lib/budget-data'
import { BudgetIcon, formatCurrency, getTypeColors, iconMap, iconOptions, type BudgetType } from '@/components/app/budget-shared'
import { buildSegments, groupColor, childColor } from '@/components/app/budget-donut'
import { type BudgetRollover, formatPeriod, getCarriedAmount, getPreviousPeriod, computeRollover } from '@/lib/budget-rollover'
import { BudgetTree } from '@/components/app/budget-tree'
import { BudgetBlob } from '@/components/app/budget-blob'
import { BudgetSankey } from '@/components/app/budget-sankey'

export default function BudgetsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [budgets, setBudgets] = useState<BudgetWithChildren[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null)
  const [modalStep, setModalStep] = useState<'detail' | 'edit'>('detail')
  const [viewMode, setViewMode] = useState<'tree' | 'blob' | 'sankey'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('budgets-view-mode')
      if (stored === 'tree' || stored === 'blob' || stored === 'sankey') return stored
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
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)

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

    // Fetch budget amount overrides
    const { data: amountsData } = await supabase
      .from('budget_amounts')
      .select('*')
    if (amountsData) setBudgetAmounts(amountsData as { id: string; budget_id: string; effective_from: string; amount: number }[])

    // Auto-compute rollovers if none exist for the current period
    if (!rolloverData || rolloverData.length === 0) {
      const prevPeriod = getPreviousPeriod(currentPeriod)
      const prevMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1)
      const prevStart = prevMonthDate.toISOString().split('T')[0]
      const prevEnd = monthDate.toISOString().split('T')[0]

      // Fetch previous month rollovers and spending
      const [prevRolloversRes, prevTxRes, budgetsForRolloverRes] = await Promise.all([
        supabase.from('budget_rollovers').select('*').eq('period', prevPeriod),
        supabase.from('transactions').select('budget_id, amount').gte('date', prevStart).lt('date', prevEnd),
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

  function prevMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }

  function nextMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  function toggleViewMode(mode: 'tree' | 'blob' | 'sankey') {
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
  const debtBudgets = budgets.filter((b) => b.budget_type === 'debt')

  const totalIncome = incomeBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalIncomeActual = incomeBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)
  const totalExpenseBudget = expenseBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalExpenseSpent = expenseBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)
  const totalSavingsBudget = savingsBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalSavingsActual = savingsBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)
  const totalDebtBudget = debtBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalDebtActual = debtBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)

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

        {/* Totals split: Income / Expenses / Savings / Debt — budget limits as primary */}
        <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-emerald-600 uppercase">Inkomen</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(totalIncome)}</p>
            <p className="text-xs text-zinc-400">{formatCurrency(totalIncomeActual)} ontvangen</p>
          </div>
          <div>
            <p className="text-xs font-medium text-amber-600 uppercase">Uitgaven</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(totalExpenseBudget)}</p>
            <p className="text-xs text-zinc-400">{formatCurrency(totalExpenseSpent)} besteed</p>
          </div>
          <div>
            <p className="text-xs font-medium text-blue-600 uppercase">Sparen</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(totalSavingsBudget)}</p>
            <p className="text-xs text-zinc-400">{formatCurrency(totalSavingsActual)} gespaard</p>
          </div>
          <div>
            <p className="text-xs font-medium text-red-600 uppercase">Schulden</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(totalDebtBudget)}</p>
            <p className="text-xs text-zinc-400">{formatCurrency(totalDebtActual)} afgelost</p>
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
            onClick={() => toggleViewMode('sankey')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'sankey'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <Workflow className="h-3.5 w-3.5" />
            Stroom
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
      {viewMode === 'tree' ? (
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
              <h3 className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">Sparen</h3>
              <BudgetTree
                groups={savingsBudgets}
                spending={spending}
                budgetType="savings"
                onNavigate={(id) => openBudgetModal(id)}
              />
            </div>
          )}
          {debtBudgets.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">Schulden</h3>
              <BudgetTree
                groups={debtBudgets}
                spending={spending}
                budgetType="debt"
                onNavigate={(id) => openBudgetModal(id)}
              />
            </div>
          )}
        </>
      ) : viewMode === 'blob' ? (
        <BudgetBlob
          groups={[...incomeBudgets, ...expenseBudgets, ...savingsBudgets, ...debtBudgets]}
          spending={spending}
          onNavigate={(id) => openBudgetModal(id)}
        />
      ) : (
        <>
          <BudgetSankey
            groups={[...incomeBudgets, ...expenseBudgets, ...savingsBudgets, ...debtBudgets]}
            spending={spending}
            getEffectiveLimit={getEffectiveLimit}
            getParentEffectiveLimit={getParentEffectiveLimit}
            getSpent={getSpent}
            getParentSpent={getParentSpent}
            onNavigate={(id) => openBudgetModal(id)}
          />
          <BudgetLegend
            groups={[...incomeBudgets, ...expenseBudgets, ...savingsBudgets, ...debtBudgets]}
            spending={spending}
            expandedGroupId={expandedGroupId}
            onToggleGroup={(id) => setExpandedGroupId(expandedGroupId === id ? null : id)}
            onNavigate={(id) => openBudgetModal(id)}
          />
        </>
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
    </div>
  )
}

// ── Budget legend (donut-style, under Sankey) ────────────────

function BudgetLegend({
  groups,
  spending,
  expandedGroupId,
  onToggleGroup,
  onNavigate,
}: {
  groups: BudgetWithChildren[]
  spending: Record<string, number>
  expandedGroupId: string | null
  onToggleGroup: (id: string) => void
  onNavigate: (id: string) => void
}) {
  const segments = buildSegments(groups, spending)
  if (segments.length === 0) return null

  return (
    <div className="mt-4 space-y-2">
      {/* Header swatches */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded-sm bg-zinc-600" />
          Besteed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded-sm bg-zinc-300" />
          Budget
        </span>
      </div>

      {segments.map((seg) => {
        const c = groupColor(seg.colorIdx)
        const pct = seg.limit > 0 ? Math.round((seg.spent / seg.limit) * 100) : 0
        const isOver = seg.spent > seg.limit && seg.limit > 0
        const isExpanded = expandedGroupId === seg.id

        return (
          <div key={seg.id}>
            <button
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                isExpanded ? 'ring-2 ring-amber-400' : ''
              }`}
              style={{
                borderColor: isExpanded ? c.border : '#e4e4e7',
                backgroundColor: isExpanded ? c.bg : 'white',
              }}
              onClick={() => onToggleGroup(seg.id)}
            >
              {/* Color swatch: spent (dark) + budget (light) */}
              <div className="flex items-center gap-0.5">
                <span className="block h-5 w-2.5 rounded-l-sm" style={{ backgroundColor: c.spent }} />
                <span className="block h-5 w-2.5 rounded-r-sm" style={{ backgroundColor: c.budget }} />
              </div>

              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: c.bg }}>
                <BudgetIcon name={seg.icon} className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">{seg.name}</p>
                <p className="text-xs text-zinc-500">
                  <span className={isOver ? 'font-semibold text-red-600' : ''}>
                    {formatCurrency(seg.spent)}
                  </span>
                  {' / '}
                  {formatCurrency(seg.limit)}
                </p>
              </div>

              <span className={`shrink-0 text-xs font-bold ${isOver ? 'text-red-600' : 'text-zinc-600'}`}>
                {pct}%
              </span>
            </button>

            {/* Subcategories when expanded */}
            {isExpanded && seg.children.length > 0 && (
              <div className="ml-5 mt-1 mb-1 space-y-0.5">
                {seg.children.map((child, ci) => {
                  const childPct = child.limit > 0 ? Math.round((child.spent / child.limit) * 100) : 0
                  const childOver = child.spent > child.limit && child.limit > 0
                  const cc = childColor(c.h, ci, seg.children.length)

                  return (
                    <button
                      key={child.id}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-zinc-50"
                      onClick={() => onNavigate(child.id)}
                    >
                      <div className="flex items-center gap-0.5">
                        <span className="block h-3 w-1.5 rounded-l-sm" style={{ backgroundColor: cc.spent }} />
                        <span className="block h-3 w-1.5 rounded-r-sm" style={{ backgroundColor: cc.budget }} />
                      </div>
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ backgroundColor: c.bg }}>
                        <BudgetIcon name={child.icon} className="h-3 w-3" />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-700">{child.name}</span>
                      <span className="text-xs text-zinc-500">
                        <span className={childOver ? 'font-semibold text-red-600' : ''}>
                          {formatCurrency(child.spent)}
                        </span>
                        {' / '}
                        {formatCurrency(child.limit)}
                      </span>
                      <span className={`w-8 text-right text-xs font-medium ${childOver ? 'text-red-600' : 'text-zinc-400'}`}>
                        {childPct}%
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
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

  // 12-month spending history + limit changes (fetched on mount)
  const [history, setHistory] = useState<{ month: string; label: string; spent: number; limit: number }[]>([])
  const [limitHistory, setLimitHistory] = useState<{ date: string; amount: number }[]>([])
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

      // Build limit change timeline
      const changes = (amountData ?? [])
        .sort((a, b) => a.effective_from.localeCompare(b.effective_from))
        .map(a => ({ date: a.effective_from, amount: Number(a.amount) }))
      setLimitHistory(changes)

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

        {/* Limit change history */}
        {limitHistory.length > 1 && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <p className="mb-2 text-xs font-semibold text-zinc-500 uppercase">Limiet wijzigingen</p>
            <div className="space-y-1.5">
              {limitHistory.map((change, i) => {
                const prev = i > 0 ? limitHistory[i - 1].amount : null
                const delta = prev != null ? change.amount - prev : null
                return (
                  <div key={i} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-zinc-50">
                    <span className="text-xs text-zinc-500">
                      {new Date(change.date).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-700">{formatCurrency(change.amount)}</span>
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
              <select value={budgetType} onChange={(e) => setBudgetType(e.target.value as 'income' | 'savings' | 'expense' | 'debt')} className={inputCls}>
                <option value="expense">Uitgave</option>
                <option value="income">Inkomen</option>
                <option value="savings">Sparen</option>
                <option value="debt">Schuld</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Limiet</label>
              {isParent ? (
                <div className={`${inputCls} cursor-not-allowed bg-zinc-50 text-zinc-500`}>
                  {formatCurrency(childrenLimitSum ?? 0)}
                  <p className="mt-0.5 text-[10px] text-zinc-400">Som van sub-budgetten</p>
                </div>
              ) : (
                <input type="number" min="0" step="0.01" value={defaultLimit} onChange={(e) => setDefaultLimit(e.target.value)} className={inputCls} />
              )}
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
