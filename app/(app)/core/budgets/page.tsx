'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus,
  List, GitFork, Fingerprint, PieChart,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDefaultBudgets, type Budget, type BudgetWithChildren } from '@/lib/budget-data'
import { BudgetIcon, formatCurrency, getTypeColors, type BudgetType } from '@/components/app/budget-shared'
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
  const router = useRouter()
  const [budgets, setBudgets] = useState<BudgetWithChildren[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
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
  const [rollovers, setRollovers] = useState<BudgetRollover[]>([])

  const monthStart = monthDate.toISOString().split('T')[0]
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).toISOString().split('T')[0]

  const loadSpending = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('transactions')
      .select('budget_id, amount')
      .gte('date', monthStart)
      .lt('date', monthEnd)

    if (data && data.length > 0) {
      const map: Record<string, number> = {}
      for (const t of data) {
        if (t.budget_id) {
          map[t.budget_id] = (map[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
        }
      }
      setSpending(map)
    } else {
      setSpending({})
    }

    // Fetch rollovers for the current month period
    const currentPeriod = formatPeriod(monthDate)
    const { data: rolloverData } = await supabase
      .from('budget_rollovers')
      .select('*')
      .eq('period', currentPeriod)
    if (rolloverData) setRollovers(rolloverData as BudgetRollover[])
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

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

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
    return Number(budget.default_limit) + carry
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

        <div className="space-y-3">
          {groupBudgets.map((parent) => {
            const parentSpent = getParentSpent(parent)
            const parentLimit = getParentEffectiveLimit(parent)
            const parentCarry = parent.children.length === 0
              ? getBudgetCarry(parent)
              : parent.children.reduce((sum, c) => sum + getBudgetCarry(c), 0)
            const isOpen = expanded[parent.id] ?? false
            const hasChildren = parent.children.length > 0

            return (
              <div
                key={parent.id}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
              >
                <div className="flex items-center gap-3 p-4">
                  <button
                    onClick={() => hasChildren && toggleExpand(parent.id)}
                    className={`shrink-0 rounded p-1 ${
                      hasChildren ? 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600' : 'invisible'
                    }`}
                  >
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>

                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}>
                    <BudgetIcon name={parent.icon} className={`h-5 w-5 ${colors.text}`} />
                  </div>

                  <div
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => router.push(`/core/budgets/${parent.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="truncate font-medium text-zinc-900">
                        {parent.name}
                        {parentCarry > 0 && (
                          <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">doorgeschoven</span>
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
                    <div className="mt-2">
                      <ProgressBar spent={parentSpent} limit={parentLimit} budgetType={budgetType} />
                    </div>
                  </div>
                </div>

                {isOpen && hasChildren && (
                  <div className="border-t border-zinc-100 bg-zinc-50/50">
                    {parent.children.map((child) => {
                      const childSpent = getSpent(child)
                      const childLimit = getEffectiveLimit(child)
                      const childCarry = getBudgetCarry(child)

                      return (
                        <div
                          key={child.id}
                          className="flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-4 py-3 pl-14 last:border-b-0 hover:bg-zinc-100/50"
                          onClick={() => router.push(`/core/budgets/${child.id}`)}
                        >
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colors.bg}`}>
                            <BudgetIcon name={child.icon} className={`h-4 w-4 ${colors.textLight}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="truncate text-sm text-zinc-700">
                                {child.name}
                                {childCarry > 0 && (
                                  <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">doorgeschoven</span>
                                )}
                              </p>
                              <div className="ml-4 shrink-0 text-right">
                                <span className="text-xs font-medium text-zinc-700">
                                  {formatCurrency(childSpent)}
                                </span>
                                <span className="text-xs text-zinc-400">
                                  {' / '}{formatCurrency(childLimit)}
                                </span>
                                {childSpent >= childLimit && childLimit > 0 ? (
                                  <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500" title="Budget overschreden" />
                                ) : shouldAlert(childSpent, childLimit, child.alert_threshold) ? (
                                  <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500" title="Nadert limiet" />
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-1.5">
                              <ProgressBar spent={childSpent} limit={childLimit} budgetType={budgetType} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
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
                onNavigate={(id) => router.push(`/core/budgets/${id}`)}
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
                onNavigate={(id) => router.push(`/core/budgets/${id}`)}
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
                onNavigate={(id) => router.push(`/core/budgets/${id}`)}
              />
            </div>
          )}
        </>
      ) : viewMode === 'blob' ? (
        <BudgetBlob
          groups={[...incomeBudgets, ...expenseBudgets, ...savingsBudgets]}
          spending={spending}
          onNavigate={(id) => router.push(`/core/budgets/${id}`)}
        />
      ) : (
        <BudgetDonut
          groups={[...incomeBudgets, ...expenseBudgets, ...savingsBudgets]}
          spending={spending}
          onNavigate={(id) => router.push(`/core/budgets/${id}`)}
        />
      )}
    </div>
  )
}
