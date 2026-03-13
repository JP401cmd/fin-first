'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, Wallet, ArrowUpRight, ArrowDownLeft,
  Upload, ArrowLeftRight, Link2, ArrowRight, X, ExternalLink,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { type Account } from '@/components/app/account-form-modal'
import { BudgetIcon, formatCurrency as formatCurrencyShort, formatCurrencyDecimals as formatCurrency } from '@/components/app/budget-shared'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { usePerspective } from '@/components/app/perspective-provider'

const DynCashAccountView = dynamic(
  () => import('@/components/app/cash-account-view').then(m => ({ default: m.CashAccountView })),
  { loading: () => <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" /></div> },
)

type BudgetRow = {
  id: string
  name: string
  icon: string | null
  parent_id: string | null
  budget_type: string
  monthly_amount: number | null
  is_income: boolean
}

type TxAgg = {
  amount: number
  account_id: string
  budget_id: string | null
  is_income: boolean
  transaction_type: string | null
}

type BudgetExpense = {
  id: string
  name: string
  icon: string | null
  amount: number
  limit: number
}

export function CashOverview({ embedded = false }: { embedded?: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [transactions, setTransactions] = useState<TxAgg[]>([])
  const [loading, setLoading] = useState(true)
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  // Kassabon state
  const [showIncomeReceipt, setShowIncomeReceipt] = useState(false)
  const [showExpenseReceipt, setShowExpenseReceipt] = useState(false)
  const [expenseReceiptBudgetId, setExpenseReceiptBudgetId] = useState<string | null>(null)

  // Nested account detail modal (only used in embedded mode)
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null)

  // Capture-phase Escape handler: closes the nested detail modal
  // without also closing the parent FullScreenModal (which uses bubble phase)
  useEffect(() => {
    if (!detailAccountId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        setDetailAccountId(null)
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [detailAccountId])

  const { perspective } = usePerspective()

  const monthStart = useMemo(() => monthDate.toISOString().split('T')[0], [monthDate])
  const monthEnd = useMemo(() => {
    const d = new Date(monthDate)
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().split('T')[0]
  }, [monthDate])

  const monthLabel = useMemo(
    () => monthDate.toLocaleDateString('nl-NL', { year: 'numeric', month: 'long' }),
    [monthDate],
  )

  const prevMonth = () => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const nextMonth = () => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))

  const loadAccounts = useCallback(async () => {
    const supabase = createClient()
    let q = supabase.from('bank_accounts').select('*').eq('is_active', true).order('sort_order', { ascending: true })
    if (perspective === 'personal') q = q.eq('ownership', 'personal')
    const { data } = await q
    if (data) setAccounts(data as Account[])
  }, [perspective])

  const loadTransactions = useCallback(async () => {
    const supabase = createClient()
    let q = supabase
      .from('transactions')
      .select('amount, account_id, budget_id, is_income, transaction_type')
      .gte('date', monthStart)
      .lt('date', monthEnd)
    if (perspective === 'personal') q = q.eq('ownership', 'personal')
    const { data } = await q
    if (data) setTransactions(data as TxAgg[])
  }, [monthStart, monthEnd, perspective])

  const loadBudgets = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('budgets')
      .select('id, name, icon, parent_id, budget_type, monthly_amount, is_income')
      .order('sort_order', { ascending: true })
    if (data) setBudgets(data as BudgetRow[])
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadAccounts(), loadBudgets()]).then(() => setLoading(false))
  }, [loadAccounts, loadBudgets])

  useEffect(() => {
    loadTransactions()
  }, [loadTransactions])

  // Aggregations
  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + Number(a.balance), 0), [accounts])

  const nonTransferTx = useMemo(
    () => transactions.filter((t) => t.transaction_type !== 'transfer'),
    [transactions],
  )

  const incomeByAccount = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of nonTransferTx) {
      if (tx.is_income) {
        map.set(tx.account_id, (map.get(tx.account_id) ?? 0) + tx.amount)
      }
    }
    return map
  }, [nonTransferTx])

  const totalIncome = useMemo(
    () => Array.from(incomeByAccount.values()).reduce((s, v) => s + v, 0),
    [incomeByAccount],
  )

  const expensesByBudget = useMemo(() => {
    // Build parent lookup
    const parentMap = new Map<string, string>()
    const budgetMap = new Map<string, BudgetRow>()
    for (const b of budgets) {
      budgetMap.set(b.id, b)
      if (b.parent_id) parentMap.set(b.id, b.parent_id)
    }

    // Aggregate by parent budget (or budget itself if no parent)
    const aggMap = new Map<string, number>()
    for (const tx of nonTransferTx) {
      if (!tx.is_income && tx.budget_id) {
        const parentId = parentMap.get(tx.budget_id) ?? tx.budget_id
        aggMap.set(parentId, (aggMap.get(parentId) ?? 0) + Math.abs(tx.amount))
      }
    }

    // Build result sorted by amount desc
    const result: BudgetExpense[] = []
    for (const [budgetId, amount] of aggMap) {
      const b = budgetMap.get(budgetId)
      if (!b) continue
      // Sum child budget limits for the group
      let limit = b.monthly_amount ?? 0
      for (const child of budgets) {
        if (child.parent_id === budgetId) {
          limit += (child.monthly_amount ?? 0)
        }
      }
      result.push({ id: budgetId, name: b.name, icon: b.icon, amount, limit })
    }

    // Also add uncategorized (budget_id = null)
    const uncatAmount = nonTransferTx
      .filter((tx) => !tx.is_income && !tx.budget_id)
      .reduce((s, tx) => s + Math.abs(tx.amount), 0)
    if (uncatAmount > 0) {
      result.push({ id: '__uncat', name: 'Ongecategoriseerd', icon: null, amount: uncatAmount, limit: 0 })
    }

    result.sort((a, b) => b.amount - a.amount)
    return result
  }, [nonTransferTx, budgets])

  const totalExpenses = useMemo(
    () => expensesByBudget.reduce((s, b) => s + b.amount, 0),
    [expensesByBudget],
  )

  const netAmount = totalIncome - totalExpenses

  // Child budgets for expense receipt drill-down
  const expenseReceiptChildren = useMemo(() => {
    if (!expenseReceiptBudgetId) return []
    const children = budgets.filter((b) => b.parent_id === expenseReceiptBudgetId)
    if (children.length === 0) return []

    // Aggregate by child budget
    const childMap = new Map<string, number>()
    for (const tx of nonTransferTx) {
      if (!tx.is_income && tx.budget_id && children.some((c) => c.id === tx.budget_id)) {
        childMap.set(tx.budget_id, (childMap.get(tx.budget_id) ?? 0) + Math.abs(tx.amount))
      }
    }

    return children
      .map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        amount: childMap.get(c.id) ?? 0,
        limit: c.monthly_amount ?? 0,
      }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [expenseReceiptBudgetId, budgets, nonTransferTx])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-kern-300 border-t-kern-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">

      {/* === 1. Hero: Totaal liquiditeit === */}
      <section className="card-editorial overflow-hidden">
        <div className="h-1.5 bg-kern-500" />
        <div className="p-4 sm:p-6 md:p-8">
          <p className="label-editorial text-[var(--ink-3)]">Totaal liquiditeit</p>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-display text-[36px] sm:text-[44px] font-bold tracking-tight text-[var(--ink)]">
              {formatCurrency(totalBalance)}
            </span>
          </div>
          <p className="mt-1 font-serif italic text-lg text-[var(--ink-3)]">
            Jouw liquiditeit in één oogopslag
          </p>
          <FreedomTimeBadge amount={totalBalance} className="mt-2" />
        </div>
      </section>

      {/* === 2. Rekeningen === */}
      <section className="mt-5 sm:mt-8">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-kern-500" />
          <h2 className="label-editorial text-[var(--ink-2)]">Rekeningen</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {accounts.map((acc) => {
            const sharePct = totalBalance > 0 ? (Number(acc.balance) / totalBalance) * 100 : 0
            const Wrapper = embedded ? 'button' : Link
            const wrapperProps = embedded
              ? { type: 'button' as const, onClick: () => setDetailAccountId(acc.id) }
              : { href: `/core/assets/cash/${acc.id}` }
            return (
              <Wrapper
                key={acc.id}
                {...wrapperProps as any}
                className="group card-editorial overflow-hidden p-0 text-left transition-all hover:shadow-[var(--s1)] hover:-translate-y-px"
              >
                <div className="flex h-1 items-stretch">
                  <div className="w-1 bg-kern-500" />
                  <div className="flex-1" />
                </div>
                <div className="p-3 sm:p-5">
                  <div className="mb-2 flex items-center gap-2.5">
                    <div className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] group-hover:bg-kern-50">
                      <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-kern-600" />
                    </div>
                    <p className="text-sm font-semibold text-[var(--ink-2)]">{acc.name}</p>
                  </div>

                  {(acc.iban || acc.bank_name) && (
                    <p className="mb-2 text-xs text-[var(--ink-3)]">
                      {acc.iban}{acc.iban && acc.bank_name ? ' · ' : ''}{acc.bank_name}
                    </p>
                  )}

                  <p className="font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">
                    {formatCurrency(Number(acc.balance))}
                  </p>

                  <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                    <div
                      className="h-full rounded-full bg-kern-300"
                      style={{ width: `${Math.max(sharePct, 2)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
                    {sharePct.toFixed(0)}% van totaal
                  </p>

                  <FreedomTimeBadge amount={Number(acc.balance)} className="mt-2" />

                  <div className="mt-3 flex items-center justify-between">
                    <span className="label-editorial text-kern-600 opacity-0 transition-opacity group-hover:opacity-100">
                      Bekijk rekening
                    </span>
                    <ArrowRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-kern-500" />
                  </div>
                </div>
              </Wrapper>
            )
          })}
        </div>
      </section>

      {/* === 3. Geldstroom === */}
      <section className="mt-5 sm:mt-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-1 rounded-full bg-kern-500" />
            <h2 className="label-editorial text-[var(--ink-2)]">Geldstroom</h2>
          </div>

          {/* Month selector */}
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="rounded-[var(--r)] p-2 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[140px] text-center text-sm font-semibold capitalize text-[var(--ink)]">
              {monthLabel}
            </span>
            <button
              onClick={nextMonth}
              className="rounded-[var(--r)] p-2 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          {/* Inkomsten (per rekening) */}
          <div className="card-editorial p-4 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
              <span className="label-editorial text-emerald-600">Inkomsten</span>
            </div>

            <button
              type="button"
              onClick={() => setShowIncomeReceipt(true)}
              className="w-full text-left transition-all hover:shadow-[var(--s1)] hover:-translate-y-px rounded-[var(--r)] focus-visible:ring-2 focus-visible:ring-kern-300 focus-visible:outline-none"
            >
              <p className="font-mono text-2xl font-bold tabular-nums text-emerald-600">
                {formatCurrency(totalIncome)}
              </p>
              <FreedomTimeBadge amount={totalIncome} className="mt-1" />
            </button>

            {incomeByAccount.size > 0 && (
              <div className="mt-3 space-y-2 border-t border-[var(--border-ed)] pt-3">
                {accounts
                  .filter((a) => (incomeByAccount.get(a.id) ?? 0) > 0)
                  .map((acc) => {
                    const amt = incomeByAccount.get(acc.id) ?? 0
                    const pct = totalIncome > 0 ? (amt / totalIncome) * 100 : 0
                    return (
                      <div key={acc.id}>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <Wallet className="h-3 w-3 text-[var(--ink-4)]" />
                            <span className="text-[var(--ink-2)]">{acc.name}</span>
                          </div>
                          <span className="font-mono font-medium tabular-nums text-[var(--ink)]">
                            {formatCurrency(amt)}
                          </span>
                        </div>
                        <div className="mt-0.5 h-[3px] w-full rounded-full bg-[var(--subtle)]">
                          <div
                            className="h-full rounded-full bg-emerald-300"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}

            {incomeByAccount.size === 0 && (
              <p className="mt-3 text-xs text-[var(--ink-4)]">Geen inkomsten deze maand</p>
            )}
          </div>

          {/* Uitgaven (per budget) */}
          <div className="card-editorial p-4 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-red-500" />
              <span className="label-editorial text-red-600">Uitgaven</span>
            </div>

            <button
              type="button"
              onClick={() => setShowExpenseReceipt(true)}
              className="w-full text-left transition-all hover:shadow-[var(--s1)] hover:-translate-y-px rounded-[var(--r)] focus-visible:ring-2 focus-visible:ring-kern-300 focus-visible:outline-none"
            >
              <p className="font-mono text-2xl font-bold tabular-nums text-red-600">
                {formatCurrency(totalExpenses)}
              </p>
              <FreedomTimeBadge amount={totalExpenses} className="mt-1" />
            </button>

            {expensesByBudget.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-[var(--border-ed)] pt-3">
                {expensesByBudget.slice(0, 8).map((item) => {
                  const pct = item.limit > 0 ? (item.amount / item.limit) * 100 : 0
                  const overBudget = item.limit > 0 && item.amount > item.limit
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setExpenseReceiptBudgetId(item.id); setShowExpenseReceipt(true) }}
                      className="w-full text-left rounded-[var(--r)] -mx-1 px-1 py-0.5 transition-colors hover:bg-kern-50"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <BudgetIcon name={item.icon ?? item.name} className="h-3 w-3 text-[var(--ink-4)]" />
                          <span className="text-[var(--ink-2)]">{item.name}</span>
                        </div>
                        <span className="font-mono font-medium tabular-nums text-[var(--ink)]">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                      {item.limit > 0 && (
                        <>
                          <div className="mt-0.5 h-[3px] w-full rounded-full bg-[var(--subtle)]">
                            <div
                              className={`h-full rounded-full ${overBudget ? 'bg-red-400' : 'bg-kern-300'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <p className="mt-0.5 text-[10px] font-mono tabular-nums text-[var(--ink-4)]">
                            {formatCurrencyShort(item.amount)} / {formatCurrencyShort(item.limit)}
                          </p>
                        </>
                      )}
                    </button>
                  )
                })}
                {expensesByBudget.length > 8 && (
                  <p className="text-xs text-[var(--ink-4)]">
                    en {expensesByBudget.length - 8} meer
                  </p>
                )}
              </div>
            )}

            {expensesByBudget.length === 0 && (
              <p className="mt-3 text-xs text-[var(--ink-4)]">Geen uitgaven deze maand</p>
            )}
          </div>
        </div>

        {/* Netto resultaat */}
        <div className="mt-3 card-editorial p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--ink-2)]">Netto resultaat</span>
            <div className="flex items-center gap-3">
              <span className={`font-mono text-xl font-bold tabular-nums ${netAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {netAmount >= 0 ? '+' : ''}{formatCurrency(netAmount)}
              </span>
              <FreedomTimeBadge amount={Math.abs(netAmount)} />
            </div>
          </div>
        </div>
      </section>

      {/* === 4. Snelle acties === */}
      <section className="mt-5 sm:mt-8">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/core/cash/import"
            className="inline-flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            <Upload className="h-4 w-4" />
            Importeer transacties
          </Link>
          <Link
            href="/core/cash/connect"
            className="inline-flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            <Link2 className="h-4 w-4" />
            Bank koppelen
          </Link>
          {accounts.length >= 2 && (
            <Link
              href="/core/cash"
              className="inline-flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              <ArrowLeftRight className="h-4 w-4" />
              Overboeking
            </Link>
          )}
        </div>
      </section>

      {/* === Kassabon: Inkomsten === */}
      <BottomSheet
        open={showIncomeReceipt}
        onClose={() => setShowIncomeReceipt(false)}
        title="Inkomsten deze maand"
      >
        <KassabonShell>
          <div className="space-y-2">
            {accounts
              .filter((a) => (incomeByAccount.get(a.id) ?? 0) > 0)
              .map((acc) => {
                const amt = incomeByAccount.get(acc.id) ?? 0
                return (
                  <div key={acc.id} className="flex items-center justify-between">
                    <span className="text-[var(--ink-2)]">{acc.name}</span>
                    <span className="font-bold tabular-nums">{formatCurrency(amt)}</span>
                  </div>
                )
              })}
            <div className="border-t border-dashed border-[var(--border-md)] pt-2 mt-2">
              <div className="flex items-center justify-between font-bold">
                <span>Totaal</span>
                <span className="tabular-nums">{formatCurrency(totalIncome)}</span>
              </div>
              <FreedomTimeBadge amount={totalIncome} className="mt-1" />
            </div>
          </div>
        </KassabonShell>
      </BottomSheet>

      {/* === Kassabon: Uitgaven === */}
      <BottomSheet
        open={showExpenseReceipt && !expenseReceiptBudgetId}
        onClose={() => setShowExpenseReceipt(false)}
        title="Uitgaven deze maand"
      >
        <KassabonShell>
          <div className="space-y-2">
            {expensesByBudget.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <span className="text-[var(--ink-2)]">{item.name}</span>
                <div className="text-right">
                  <span className="font-bold tabular-nums">{formatCurrency(item.amount)}</span>
                  {item.limit > 0 && (
                    <span className="ml-1 text-[10px] text-[var(--ink-4)]">/ {formatCurrencyShort(item.limit)}</span>
                  )}
                </div>
              </div>
            ))}
            <div className="border-t border-dashed border-[var(--border-md)] pt-2 mt-2">
              <div className="flex items-center justify-between font-bold">
                <span>Totaal</span>
                <span className="tabular-nums">{formatCurrency(totalExpenses)}</span>
              </div>
              <FreedomTimeBadge amount={totalExpenses} className="mt-1" />
            </div>
          </div>
        </KassabonShell>
      </BottomSheet>

      {/* === Kassabon: Budget detail === */}
      <BottomSheet
        open={showExpenseReceipt && !!expenseReceiptBudgetId}
        onClose={() => { setShowExpenseReceipt(false); setExpenseReceiptBudgetId(null) }}
        title={expensesByBudget.find((b) => b.id === expenseReceiptBudgetId)?.name ?? 'Budget detail'}
      >
        <KassabonShell>
          <div className="space-y-2">
            {expenseReceiptChildren.length > 0 ? (
              <>
                {expenseReceiptChildren.map((child) => (
                  <div key={child.id} className="flex items-center justify-between">
                    <span className="text-[var(--ink-2)]">{child.name}</span>
                    <div className="text-right">
                      <span className="font-bold tabular-nums">{formatCurrency(child.amount)}</span>
                      {child.limit > 0 && (
                        <span className="ml-1 text-[10px] text-[var(--ink-4)]">/ {formatCurrencyShort(child.limit)}</span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="border-t border-dashed border-[var(--border-md)] pt-2 mt-2">
                  <div className="flex items-center justify-between font-bold">
                    <span>Totaal</span>
                    <span className="tabular-nums">
                      {formatCurrency(expensesByBudget.find((b) => b.id === expenseReceiptBudgetId)?.amount ?? 0)}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between font-bold">
                <span>{expensesByBudget.find((b) => b.id === expenseReceiptBudgetId)?.name ?? ''}</span>
                <span className="tabular-nums">
                  {formatCurrency(expensesByBudget.find((b) => b.id === expenseReceiptBudgetId)?.amount ?? 0)}
                </span>
              </div>
            )}
          </div>
        </KassabonShell>
      </BottomSheet>

      {/* === Nested account detail modal (embedded mode) === */}
      {embedded && detailAccountId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDetailAccountId(null) }}
        >
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[var(--r-lg)] bg-[var(--paper)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-5 py-4">
              <h3 className="font-semibold text-[var(--ink)]">
                {accounts.find((a) => a.id === detailAccountId)?.name ?? 'Rekening'}
              </h3>
              <div className="flex items-center gap-2">
                <Link
                  href={`/core/assets/cash/${detailAccountId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open volledig
                </Link>
                <button
                  onClick={() => setDetailAccountId(null)}
                  className="touch-target rounded-md text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <DynCashAccountView accountId={detailAccountId} embedded />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
