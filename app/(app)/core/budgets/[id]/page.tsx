'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getMockHistory, type Budget } from '@/lib/budget-data'
import { BudgetIcon, formatCurrency, getTypeColors, type BudgetType } from '@/components/app/budget-shared'
import { type BudgetRollover, formatPeriod, getCarriedAmount } from '@/lib/budget-rollover'
import { BudgetAlert, shouldAlert } from '@/components/app/budget-alert'
import { formatRollover } from '@/components/app/budget-shared'

const intervalLabels: Record<string, string> = {
  monthly: 'Maandelijks',
  quarterly: 'Per kwartaal',
  yearly: 'Jaarlijks',
}

const rolloverLabels: Record<string, string> = {
  reset: 'Reset (start opnieuw)',
  'carry-over': 'Doorschuiven',
  'invest-sweep': 'Beleggen-sweep',
}

const limitTypeLabels: Record<string, string> = {
  soft: 'Zacht (waarschuwing)',
  hard: 'Hard (blokkering)',
}

const budgetTypeLabels: Record<string, string> = {
  income: 'Inkomen',
  expense: 'Uitgave',
  savings: 'Sparen',
}

export default function BudgetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [budget, setBudget] = useState<Budget | null>(null)
  const [children, setChildren] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [spending, setSpending] = useState<Record<string, number>>({})
  const [rollovers, setRollovers] = useState<BudgetRollover[]>([])
  const [transactions, setTransactions] = useState<{ id: string; date: string; amount: number; description: string; counterparty_name: string | null }[]>([])

  const loadSpending = useCallback(async (budgetIds: string[]) => {
    const supabase = createClient()
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

    const { data } = await supabase
      .from('transactions')
      .select('budget_id, amount')
      .in('budget_id', budgetIds)
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
    }
  }, [])

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const [budgetRes, childrenRes] = await Promise.all([
        supabase.from('budgets').select('*').eq('id', id).single(),
        supabase.from('budgets').select('*').eq('parent_id', id).order('sort_order'),
      ])

      if (budgetRes.error || !budgetRes.data) {
        router.push('/core/budgets')
        return
      }

      const b = budgetRes.data as Budget
      const c = (childrenRes.data as Budget[]) ?? []
      setBudget(b)
      setChildren(c)
      setLoading(false)

      const ids = [b.id, ...c.map((ch) => ch.id)]
      await loadSpending(ids)

      // Fetch rollovers for this budget (last 6 months)
      const now = new Date()
      const periods: string[] = []
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        periods.push(formatPeriod(d))
      }
      const { data: rolloverData } = await supabase
        .from('budget_rollovers')
        .select('*')
        .eq('budget_id', id)
        .in('period', periods)
      if (rolloverData) setRollovers(rolloverData as BudgetRollover[])

      // Fetch transactions for this budget (and children) this month
      const now2 = new Date()
      const txMonthStart = new Date(now2.getFullYear(), now2.getMonth(), 1).toISOString().split('T')[0]
      const txMonthEnd = new Date(now2.getFullYear(), now2.getMonth() + 1, 1).toISOString().split('T')[0]
      const { data: txData } = await supabase
        .from('transactions')
        .select('id, date, amount, description, counterparty_name, budget_id')
        .in('budget_id', ids)
        .gte('date', txMonthStart)
        .lt('date', txMonthEnd)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)
      if (txData) setTransactions(txData)
    }

    load()
  }, [id, router, loadSpending])

  if (loading || !budget) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  const budgetType = (budget.budget_type ?? 'expense') as BudgetType
  const colors = getTypeColors(budgetType)
  const isParent = children.length > 0
  const spent = isParent
    ? children.reduce((sum, c) => sum + (spending[c.id] ?? 0), 0)
    : (spending[budget.id] ?? 0)
  const limit = Number(budget.default_limit)
  const remaining = limit - spent
  const pct = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0
  const history = getMockHistory(budget.name)

  const historyMax = Math.max(...history.map((h) => Math.max(h.budget, h.spent)), 1)

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Back + Edit */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/core/budgets"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar budgetten
        </Link>
        <Link
          href={`/core/budgets/${id}/edit`}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <Pencil className="h-4 w-4" />
          Bewerken
        </Link>
      </div>

      {/* Budget header */}
      <section className={`rounded-2xl border ${colors.border} bg-gradient-to-br ${colors.gradient} p-6 sm:p-8`}>
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colors.bgDark}`}>
            <BudgetIcon name={budget.icon} className={`h-6 w-6 ${colors.text}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-zinc-900">{budget.name}</h1>
            {budget.description && (
              <p className="mt-1 text-sm text-zinc-500">{budget.description}</p>
            )}
            <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>
              {budgetTypeLabels[budgetType]}
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Limiet</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(limit)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Besteed</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(spent)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Resterend</p>
            <p className={`mt-1 text-xl font-bold ${remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(remaining)}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                spent > limit ? 'bg-red-500' : pct > 80 ? colors.barWarning : colors.barDefault
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-right text-xs text-zinc-500">{pct}% besteed</p>
        </div>
      </section>

      {/* Alert banner */}
      {shouldAlert(spent, limit, Number(budget.alert_threshold)) && (
        <div className="mt-4">
          <BudgetAlert
            budgetName={budget.name}
            budgetId={budget.id}
            spent={spent}
            limit={limit}
            threshold={Number(budget.alert_threshold)}
          />
        </div>
      )}

      {/* Sub-budgets */}
      {isParent && (
        <section className="mt-8">
          <h2 className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Subbudgetten
          </h2>
          <div className="space-y-2">
            {children.map((child) => {
              const childSpent = spending[child.id] ?? 0
              const childLimit = Number(child.default_limit)
              const childPct = childLimit > 0 ? Math.min(Math.round((childSpent / childLimit) * 100), 100) : 0

              return (
                <div
                  key={child.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 ${colors.hoverBorder} ${colors.hoverBg}`}
                  onClick={() => router.push(`/core/budgets/${child.id}`)}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}>
                    <BudgetIcon name={child.icon} className={`h-4 w-4 ${colors.textLight}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-medium text-zinc-800">{child.name}</p>
                      <p className="ml-4 shrink-0 text-xs text-zinc-500">
                        {formatCurrency(childSpent)} / {formatCurrency(childLimit)} ({childPct}%)
                      </p>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className={`h-full rounded-full ${
                          childSpent > childLimit ? 'bg-red-500' : childPct > 80 ? colors.barWarning : colors.barDefault
                        }`}
                        style={{ width: `${childPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Rollover info */}
      {budget.rollover_type !== 'reset' && rollovers.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Overschot-beheer ({rolloverLabels[budget.rollover_type] ?? budget.rollover_type})
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="grid grid-cols-2 gap-4 p-4">
              <div>
                <p className="text-xs font-medium text-zinc-500">Doorgeschoven deze maand</p>
                <p className="mt-1 text-lg font-bold text-zinc-900">
                  {formatCurrency(getCarriedAmount(rollovers, formatPeriod(new Date())))}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500">Effectief budget</p>
                <p className="mt-1 text-lg font-bold text-zinc-900">
                  {formatCurrency(limit + getCarriedAmount(rollovers, formatPeriod(new Date())))}
                </p>
              </div>
            </div>
            {rollovers.length > 1 && (
              <div className="border-t border-zinc-100 p-4">
                <p className="mb-2 text-xs font-medium text-zinc-500">Laatste maanden</p>
                <div className="flex items-end gap-2">
                  {rollovers
                    .sort((a, b) => a.period.localeCompare(b.period))
                    .map((r) => {
                      const amount = Number(r.carried_amount)
                      const maxAmount = Math.max(...rollovers.map(ro => Math.abs(Number(ro.carried_amount))), 1)
                      const height = Math.max(8, (Math.abs(amount) / maxAmount) * 60)
                      return (
                        <div key={r.id} className="flex flex-1 flex-col items-center gap-1">
                          <div
                            className={`w-full rounded-t ${amount > 0 ? 'bg-blue-400' : 'bg-zinc-200'}`}
                            style={{ height }}
                            title={`${r.period}: ${formatCurrency(amount)}`}
                          />
                          <span className="text-[10px] text-zinc-400">{r.period.slice(5)}</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 12-month history */}
      <section className="mt-8">
        <h2 className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          12-Maanden Historie
        </h2>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
          <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: 160 }}>
            {history.map((h, i) => {
              const budgetHeight = (h.budget / historyMax) * 100
              const spentHeight = (h.spent / historyMax) * 100

              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="relative flex w-full items-end justify-center gap-0.5" style={{ height: 140 }}>
                    <div
                      className={`w-2 rounded-t sm:w-3 ${colors.barLight}`}
                      style={{ height: `${budgetHeight}%` }}
                      title={`Budget: ${formatCurrency(h.budget)}`}
                    />
                    <div
                      className={`w-2 rounded-t sm:w-3 ${
                        h.spent > h.budget ? 'bg-red-400' : colors.barWarning
                      }`}
                      style={{ height: `${spentHeight}%` }}
                      title={`Besteed: ${formatCurrency(h.spent)}`}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-400">{h.month.slice(0, 3)}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500">
            <div className="flex items-center gap-1.5">
              <div className={`h-2.5 w-2.5 rounded-sm ${colors.barLight}`} />
              Budget
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`h-2.5 w-2.5 rounded-sm ${colors.barWarning}`} />
              Besteed
            </div>
          </div>
        </div>
      </section>

      {/* Transactions this month */}
      <section className="mt-8">
        <h2 className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Transacties deze maand ({transactions.length})
        </h2>
        {transactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
            <p className="text-sm text-zinc-500">
              Nog geen transacties voor dit budget deze maand.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {transactions.map((tx, idx) => {
              const amount = Number(tx.amount)
              const isPositive = amount > 0
              return (
                <div
                  key={tx.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    idx < transactions.length - 1 ? 'border-b border-zinc-100' : ''
                  }`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    isPositive ? 'bg-emerald-50' : colors.bg
                  }`}>
                    <BudgetIcon
                      name={budget.icon}
                      className={`h-4 w-4 ${isPositive ? 'text-emerald-500' : colors.textLight}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{tx.description}</p>
                    <div className="flex items-center gap-2">
                      {tx.counterparty_name && (
                        <p className="truncate text-xs text-zinc-500">{tx.counterparty_name}</p>
                      )}
                      <span className="text-xs text-zinc-400">
                        {new Date(tx.date + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold ${
                    isPositive ? 'text-emerald-600' : 'text-zinc-900'
                  }`}>
                    {isPositive ? '+' : ''}{formatCurrency(amount)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Budget properties */}
      <section className="mt-8">
        <h2 className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Instellingen
        </h2>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <dl className="divide-y divide-zinc-100">
            <div className="flex justify-between px-5 py-3">
              <dt className="text-sm text-zinc-500">Type</dt>
              <dd className="text-sm font-medium text-zinc-900">{budgetTypeLabels[budgetType]}</dd>
            </div>
            <div className="flex justify-between px-5 py-3">
              <dt className="text-sm text-zinc-500">Interval</dt>
              <dd className="text-sm font-medium text-zinc-900">{intervalLabels[budget.interval] ?? budget.interval}</dd>
            </div>
            <div className="flex justify-between px-5 py-3">
              <dt className="text-sm text-zinc-500">Overschot-beheer</dt>
              <dd className="text-sm font-medium text-zinc-900">{rolloverLabels[budget.rollover_type] ?? budget.rollover_type}</dd>
            </div>
            <div className="flex justify-between px-5 py-3">
              <dt className="text-sm text-zinc-500">Limiet-type</dt>
              <dd className="text-sm font-medium text-zinc-900">{limitTypeLabels[budget.limit_type] ?? budget.limit_type}</dd>
            </div>
            <div className="flex justify-between px-5 py-3">
              <dt className="text-sm text-zinc-500">Notificatiedrempel</dt>
              <dd className="text-sm font-medium text-zinc-900">{budget.alert_threshold}%</dd>
            </div>
            <div className="flex justify-between px-5 py-3">
              <dt className="text-sm text-zinc-500">Max transactiebedrag</dt>
              <dd className="text-sm font-medium text-zinc-900">
                {Number(budget.max_single_transaction_amount) > 0
                  ? formatCurrency(Number(budget.max_single_transaction_amount))
                  : 'Geen limiet'}
              </dd>
            </div>
            <div className="flex justify-between px-5 py-3">
              <dt className="text-sm text-zinc-500">Essentieel</dt>
              <dd className="text-sm font-medium text-zinc-900">{budget.is_essential ? 'Ja' : 'Nee'}</dd>
            </div>
            <div className="flex justify-between px-5 py-3">
              <dt className="text-sm text-zinc-500">Prioriteit</dt>
              <dd className="text-sm font-medium text-zinc-900">{budget.priority_score} / 5</dd>
            </div>
            <div className="flex justify-between px-5 py-3">
              <dt className="text-sm text-zinc-500">Inflatie-indexatie</dt>
              <dd className="text-sm font-medium text-zinc-900">{budget.is_inflation_indexed ? 'Ja' : 'Nee'}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  )
}
