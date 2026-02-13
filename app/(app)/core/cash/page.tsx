'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Upload, ArrowUpRight, ArrowDownLeft,
  Wallet, Tag, Settings2, Trash2, X, Building2, Repeat, Calendar,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getTestTransactions } from '@/lib/transaction-data'
import { getDefaultBudgets, type Budget, type BudgetWithChildren } from '@/lib/budget-data'
import { TransactionForm } from '@/components/app/transaction-form'
import { BudgetIcon, formatCurrency as formatCurrencyShort, formatCurrencyDecimals as formatCurrency, getTypeColors } from '@/components/app/budget-shared'
import { SankeyDiagram, type SankeyNode, type SankeyLink } from '@/components/app/sankey-diagram'
import { FeatureGate } from '@/components/app/feature-gate'
import { type RecurringTransaction, FREQUENCY_LABELS, getExpectedMonthlyTotal, getNextOccurrence, formatSchedule } from '@/lib/recurring-data'

type Transaction = {
  id: string
  account_id: string
  budget_id: string | null
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  is_income: boolean
  notes: string | null
  category_source: string
}

type Account = {
  id: string
  name: string
  iban: string | null
  bank_name: string | null
  account_type: string
  balance: number
  is_active: boolean
  sort_order: number
}

export default function CashPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [budgetGroups, setBudgetGroups] = useState<{ parent: Budget; children: Budget[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [showForm, setShowForm] = useState(false)
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null)
  const [showSankey, setShowSankey] = useState(true)
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [recurrings, setRecurrings] = useState<RecurringTransaction[]>([])
  const [showRecurring, setShowRecurring] = useState(true)

  const monthStart = monthDate.toISOString().split('T')[0]
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).toISOString().split('T')[0]
  const monthLabel = monthDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })

  const loadBudgets = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('budgets')
      .select('*')
      .order('sort_order', { ascending: true })

    if (data) {
      setBudgets(data as Budget[])
      const parents = (data as Budget[]).filter((b) => !b.parent_id)
      const children = (data as Budget[]).filter((b) => b.parent_id && Number(b.default_limit) > 0)
      const groups = parents.map((parent) => ({
        parent,
        children: children.filter((c) => c.parent_id === parent.id),
      }))
      setBudgetGroups(groups)
    }
  }, [])

  const loadRecurrings = useCallback(async () => {
    if (!selectedAccountId) return
    const supabase = createClient()
    const { data } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('account_id', selectedAccountId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (data) setRecurrings(data as RecurringTransaction[])
  }, [selectedAccountId])

  const loadTransactions = useCallback(async (accountId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('account_id', accountId)
      .gte('date', monthStart)
      .lt('date', monthEnd)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (data) {
      setTransactions(data as Transaction[])
    }
  }, [monthStart, monthEnd])

  const loadAccounts = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        // Guard: double-check to prevent race conditions
        const { count } = await supabase.from('bank_accounts').select('id', { count: 'exact', head: true })
        if (count && count > 0) { await loadAccounts(); return }
        await seedData(supabase)
        return
      }

      setAccounts(data as Account[])
      const firstId = data[0].id
      setSelectedAccountId(firstId)
      await loadTransactions(firstId)
    } catch (err) {
      console.error('Error loading accounts:', err)
      setError('Kon rekeningen niet laden. Probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }, [loadTransactions])

  async function seedData(supabase: ReturnType<typeof createClient>) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Create main account
    const { data: accountData, error: accountError } = await supabase
      .from('bank_accounts')
      .insert({
        user_id: user.id,
        name: 'Hoofdrekening',
        iban: 'NL91ABNA0417164300',
        bank_name: 'ABN AMRO',
        account_type: 'checking',
        balance: 4250.00,
      })
      .select('id')
      .single()

    if (accountError || !accountData) {
      console.error('Error creating account:', accountError)
      setLoading(false)
      return
    }

    // Load budgets to map slugs to IDs
    const { data: budgetData } = await supabase
      .from('budgets')
      .select('id, slug')

    const slugMap = new Map<string, string>()
    if (budgetData) {
      for (const b of budgetData) {
        if (b.slug) slugMap.set(b.slug, b.id)
      }
    }

    // Seed test transactions
    const testTxs = getTestTransactions()
    const rows = testTxs.map((tx) => ({
      user_id: user.id,
      account_id: accountData.id,
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      counterparty_name: tx.counterparty_name,
      counterparty_iban: tx.counterparty_iban,
      budget_id: slugMap.get(tx.budgetSlug) ?? null,
      is_income: tx.is_income,
      category_source: 'import' as const,
    }))

    // Insert in batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      await supabase.from('transactions').insert(rows.slice(i, i + 50))
    }

    // Reload
    await loadAccounts()
  }

  useEffect(() => {
    loadBudgets()
    loadAccounts()
  }, [loadBudgets, loadAccounts])

  useEffect(() => {
    if (selectedAccountId) {
      loadTransactions(selectedAccountId)
    }
  }, [selectedAccountId, loadTransactions])

  useEffect(() => {
    if (selectedAccountId) {
      loadRecurrings()
    }
  }, [selectedAccountId, loadRecurrings])

  function prevMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }

  function nextMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  function getBudgetForId(budgetId: string | null): Budget | undefined {
    if (!budgetId) return undefined
    return budgets.find((b) => b.id === budgetId)
  }

  // Calculate monthly totals — use amount sign as source of truth
  const totalIncome = transactions
    .filter((t) => Number(t.amount) > 0)
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const totalExpenses = transactions
    .filter((t) => Number(t.amount) < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

  const netAmount = totalIncome - totalExpenses

  // Group by date
  const transactionsByDate = transactions.reduce<Record<string, Transaction[]>>((groups, tx) => {
    const date = tx.date
    if (!groups[date]) groups[date] = []
    groups[date].push(tx)
    return groups
  }, {})

  const sortedDates = Object.keys(transactionsByDate).sort((a, b) => b.localeCompare(a))

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

  // Build Sankey data from transactions + budget structure
  const sankeyData = useMemo(() => {
    if (transactions.length === 0 || budgetGroups.length === 0) return null

    // Metallic greens for income
    const incomeColors = ['#4a8c6f', '#5a9e7a', '#6aae88', '#7dbd98']
    // Amber/gold (De Kern) for expenses
    const expenseColors = ['#D4A843', '#ddb85a', '#e6c872', '#efd88a']
    // Purple (De Horizon) for savings
    const savingsColors = ['#8B5CB8', '#9e74c6', '#b18cd4', '#c4a4e2']
    // Red for debt
    const debtColors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca']

    // Sum transactions per budget_id
    const spendingByBudget: Record<string, number> = {}
    let uncategorizedIncome = 0
    let uncategorizedExpense = 0

    for (const tx of transactions) {
      const amount = Math.abs(Number(tx.amount))
      if (tx.budget_id) {
        spendingByBudget[tx.budget_id] = (spendingByBudget[tx.budget_id] ?? 0) + amount
      } else if (Number(tx.amount) > 0) {
        uncategorizedIncome += amount
      } else {
        uncategorizedExpense += amount
      }
    }

    const nodes: SankeyNode[] = []
    const links: SankeyLink[] = []

    // Column 0: income sources (child budgets of income parents)
    const incomeGroups = budgetGroups.filter((g) => g.parent.budget_type === 'income')
    const expenseGroups = budgetGroups.filter((g) => g.parent.budget_type === 'expense')
    const savingsGroups = budgetGroups.filter((g) => g.parent.budget_type === 'savings')
    const debtGroups = budgetGroups.filter((g) => g.parent.budget_type === 'debt')

    // Income source nodes (col 0)
    let incomeIdx = 0
    for (const group of incomeGroups) {
      for (const child of group.children) {
        const value = spendingByBudget[child.id] ?? 0
        if (value > 0) {
          nodes.push({
            id: `inc-${child.id}`,
            label: child.name,
            value,
            color: incomeColors[incomeIdx % incomeColors.length],
            column: 0,
          })
          incomeIdx++
        }
      }
      // If parent has no children but has spending
      if (group.children.length === 0) {
        const value = spendingByBudget[group.parent.id] ?? 0
        if (value > 0) {
          nodes.push({
            id: `inc-${group.parent.id}`,
            label: group.parent.name,
            value,
            color: incomeColors[incomeIdx % incomeColors.length],
            column: 0,
          })
          incomeIdx++
        }
      }
    }

    if (uncategorizedIncome > 0) {
      nodes.push({
        id: 'inc-uncategorized',
        label: 'Overig inkomen',
        value: uncategorizedIncome,
        color: incomeColors[incomeIdx % incomeColors.length],
        column: 0,
      })
    }

    // Column 1: expense/savings/debt parent groups
    for (const group of [...expenseGroups, ...savingsGroups, ...debtGroups]) {
      const childValues = group.children.reduce(
        (sum, c) => sum + (spendingByBudget[c.id] ?? 0), 0
      )
      const parentDirect = group.children.length === 0 ? (spendingByBudget[group.parent.id] ?? 0) : 0
      const total = childValues + parentDirect
      if (total <= 0) continue

      const budgetType = group.parent.budget_type
      const colorSet = budgetType === 'savings' ? savingsColors : budgetType === 'debt' ? debtColors : expenseColors
      const colIdx = budgetType === 'savings' ? savingsGroups.indexOf(group) : budgetType === 'debt' ? debtGroups.indexOf(group) : expenseGroups.indexOf(group)

      nodes.push({
        id: `grp-${group.parent.id}`,
        label: group.parent.name,
        value: total,
        color: colorSet[colIdx % colorSet.length],
        column: 1,
      })
    }

    if (uncategorizedExpense > 0) {
      nodes.push({
        id: 'grp-uncategorized',
        label: 'Overig',
        value: uncategorizedExpense,
        color: '#a1a1aa',
        column: 1,
      })
    }

    // Column 2: subcategories
    let expIdx = 0
    for (const group of [...expenseGroups, ...savingsGroups, ...debtGroups]) {
      const budgetType = group.parent.budget_type
      const colorSet = budgetType === 'savings' ? savingsColors : budgetType === 'debt' ? debtColors : expenseColors

      for (const child of group.children) {
        const value = spendingByBudget[child.id] ?? 0
        if (value <= 0) continue

        nodes.push({
          id: `sub-${child.id}`,
          label: child.name,
          value,
          color: colorSet[expIdx % colorSet.length],
          column: 2,
        })
        expIdx++
      }
    }

    // Links: income sources → expense/savings groups (proportionally)
    const totalIncomeValue = nodes
      .filter((n) => n.column === 0)
      .reduce((s, n) => s + n.value, 0)

    const groupNodes = nodes.filter((n) => n.column === 1)
    const totalGroupValue = groupNodes.reduce((s, n) => s + n.value, 0)

    if (totalIncomeValue > 0 && totalGroupValue > 0) {
      const incomeNodes = nodes.filter((n) => n.column === 0)
      for (const incNode of incomeNodes) {
        for (const grpNode of groupNodes) {
          const linkValue = (incNode.value / totalIncomeValue) * grpNode.value
          if (linkValue > 0) {
            links.push({
              source: incNode.id,
              target: grpNode.id,
              value: linkValue,
              color: incNode.color,
            })
          }
        }
      }
    }

    // Links: groups → subcategories
    for (const group of [...expenseGroups, ...savingsGroups, ...debtGroups]) {
      const grpNodeId = `grp-${group.parent.id}`
      const grpNode = nodes.find((n) => n.id === grpNodeId)
      if (!grpNode) continue

      for (const child of group.children) {
        const subNodeId = `sub-${child.id}`
        const subNode = nodes.find((n) => n.id === subNodeId)
        if (!subNode) continue

        const budgetType = group.parent.budget_type
        const linkColor = budgetType === 'savings' ? savingsColors[0] : budgetType === 'debt' ? debtColors[0] : expenseColors[0]
        links.push({
          source: grpNodeId,
          target: subNodeId,
          value: subNode.value,
          color: linkColor,
        })
      }
    }

    return { nodes, links }
  }, [transactions, budgetGroups])

  // Budget spending summary (for table under Sankey)
  const budgetSummary = useMemo(() => {
    const spendMap: Record<string, number> = {}
    for (const tx of transactions) {
      if (tx.budget_id) {
        spendMap[tx.budget_id] = (spendMap[tx.budget_id] ?? 0) + Math.abs(Number(tx.amount))
      }
    }

    return budgetGroups
      .map((g) => {
        const children = g.children
        const limit = children.length > 0
          ? children.reduce((s, c) => s + Number(c.default_limit), 0)
          : Number(g.parent.default_limit)
        const spent = children.length > 0
          ? children.reduce((s, c) => s + (spendMap[c.id] ?? 0), 0)
          : (spendMap[g.parent.id] ?? 0)
        return {
          id: g.parent.id,
          name: g.parent.name,
          icon: g.parent.icon,
          budgetType: g.parent.budget_type as string,
          limit,
          spent,
          pct: limit > 0 ? Math.round((spent / limit) * 100) : 0,
          isOver: spent > limit && limit > 0,
        }
      })
      .filter((s) => s.limit > 0)
  }, [transactions, budgetGroups])

  // Map sankey node IDs back to budget IDs for navigation
  function handleSankeyNodeClick(nodeId: string) {
    const match = nodeId.match(/^(?:sub|grp|inc)-(.+)$/)
    if (match && match[1] !== 'uncategorized') {
      router.push(`/core/budgets?budget=${match[1]}`)
    }
  }

  async function saveAccount(formData: {
    name: string
    iban: string
    bank_name: string
    account_type: string
    balance: number
  }) {
    const supabase = createClient()

    if (editAccount) {
      await supabase
        .from('bank_accounts')
        .update({
          name: formData.name,
          iban: formData.iban || null,
          bank_name: formData.bank_name || null,
          account_type: formData.account_type,
          balance: formData.balance,
        })
        .eq('id', editAccount.id)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const maxSort = accounts.reduce((m, a) => Math.max(m, a.sort_order), 0)
      await supabase
        .from('bank_accounts')
        .insert({
          user_id: user.id,
          name: formData.name,
          iban: formData.iban || null,
          bank_name: formData.bank_name || null,
          account_type: formData.account_type,
          balance: formData.balance,
          sort_order: maxSort + 1,
        })
    }

    setShowAccountForm(false)
    setEditAccount(null)

    // Reload accounts
    const { data } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (data) {
      setAccounts(data as Account[])
      if (!editAccount && data.length > 0) {
        setSelectedAccountId(data[data.length - 1].id)
      }
    }
  }

  async function deleteAccount(accountId: string) {
    if (accounts.length <= 1) return
    const supabase = createClient()
    await supabase
      .from('bank_accounts')
      .update({ is_active: false })
      .eq('id', accountId)

    setShowAccountForm(false)
    setEditAccount(null)

    const { data } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (data && data.length > 0) {
      setAccounts(data as Account[])
      if (accountId === selectedAccountId) {
        setSelectedAccountId(data[0].id)
      }
    }
  }

  async function deleteRecurring(id: string) {
    const supabase = createClient()
    await supabase.from('recurring_transactions').update({ is_active: false }).eq('id', id)
    loadRecurrings()
  }

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
          <button onClick={() => { setError(null); setLoading(true); loadAccounts() }} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Account header */}
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
              <Wallet className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {accounts.length > 1 ? (
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="border-none bg-transparent text-lg font-bold text-zinc-900 outline-none"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                ) : (
                  <h1 className="text-lg font-bold text-zinc-900">{selectedAccount?.name}</h1>
                )}
                <button
                  onClick={() => { setEditAccount(selectedAccount ?? null); setShowAccountForm(true) }}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-amber-100 hover:text-amber-600"
                  title="Rekening bewerken"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {selectedAccount?.iban && (
                  <p className="text-xs text-zinc-500">{selectedAccount.iban}</p>
                )}
                {selectedAccount?.bank_name && (
                  <span className="text-xs text-zinc-400">
                    {selectedAccount.iban ? '·' : ''} {selectedAccount.bank_name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setEditAccount(null); setShowAccountForm(true) }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Rekening toevoegen
            </button>
            <div className="text-right">
              <p className="text-xs font-medium text-zinc-500 uppercase">Saldo</p>
              <p className="text-2xl font-bold text-zinc-900">
                {formatCurrency(Number(selectedAccount?.balance ?? 0))}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Action bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href="/core/cash/import"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Upload className="h-4 w-4" />
            Importeer transacties
          </Link>
          <button
            onClick={() => { setEditTransaction(null); setShowForm(true) }}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            <Plus className="h-4 w-4" />
            Nieuwe transactie
          </button>
        </div>

        {/* Month selector */}
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[140px] text-center text-sm font-semibold capitalize text-zinc-900">
            {monthLabel}
          </span>
          <button
            onClick={nextMonth}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Monthly overview */}
      <section className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
            <p className="text-xs font-medium text-emerald-600 uppercase">Inkomen</p>
          </div>
          <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrencyShort(totalIncome)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <ArrowUpRight className="h-4 w-4 text-red-500" />
            <p className="text-xs font-medium text-red-600 uppercase">Uitgaven</p>
          </div>
          <p className="mt-1 text-xl font-bold text-red-600">{formatCurrencyShort(totalExpenses)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center">
          <p className="text-xs font-medium text-zinc-500 uppercase">Netto</p>
          <p className={`mt-1 text-xl font-bold ${netAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrencyShort(netAmount)}
          </p>
        </div>
      </section>

      {/* Recurring transactions */}
      {recurrings.length > 0 && (
        <section className="mt-6">
          <button
            onClick={() => setShowRecurring((v) => !v)}
            className="flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition-colors hover:bg-zinc-50"
          >
            {showRecurring ? (
              <ChevronUp className="h-4 w-4 text-zinc-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            )}
            <Repeat className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold text-zinc-700">Terugkerende boekingen</span>
            <span className="ml-auto text-xs text-zinc-500">
              Verwacht: {formatCurrencyShort(getExpectedMonthlyTotal(recurrings))}/mnd
            </span>
          </button>

          {showRecurring && (
            <div className="mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-white">
              {recurrings.map((r, idx) => {
                const amount = Number(r.amount)
                const isPositive = amount > 0
                const nextDate = getNextOccurrence(r)
                const budget = r.budget_id ? budgets.find(b => b.id === r.budget_id) : undefined

                return (
                  <div
                    key={r.id}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      idx < recurrings.length - 1 ? 'border-b border-zinc-100' : ''
                    }`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isPositive ? 'bg-emerald-50' : 'bg-zinc-100'
                    }`}>
                      {budget ? (
                        <BudgetIcon name={budget.icon} className={`h-4 w-4 ${isPositive ? 'text-emerald-500' : 'text-zinc-500'}`} />
                      ) : (
                        <Repeat className={`h-4 w-4 ${isPositive ? 'text-emerald-500' : 'text-zinc-400'}`} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">{r.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">{formatSchedule(r)}</span>
                        {nextDate && (
                          <span className="text-xs text-zinc-400">
                            · volgende: {nextDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {budget && (
                      <span className="hidden shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 sm:inline-block">
                        {budget.name}
                      </span>
                    )}

                    <span className={`shrink-0 text-sm font-semibold ${
                      isPositive ? 'text-emerald-600' : 'text-zinc-900'
                    }`}>
                      {isPositive ? '+' : ''}{formatCurrency(amount)}
                    </span>

                    <button
                      onClick={() => deleteRecurring(r.id)}
                      className="shrink-0 rounded p-1 text-zinc-300 hover:bg-red-50 hover:text-red-500"
                      title="Deactiveren"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Sankey flow diagram */}
      <FeatureGate featureId="cashflow_sankey">
      {sankeyData && sankeyData.nodes.length > 0 && (
        <section className="mt-6">
          <button
            onClick={() => setShowSankey((v) => !v)}
            className="flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition-colors hover:bg-zinc-50"
          >
            {showSankey ? (
              <ChevronUp className="h-4 w-4 text-zinc-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            )}
            <span className="text-sm font-semibold text-zinc-700">Geldstroom</span>
          </button>

          {showSankey && (
            <div className="relative mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <SankeyDiagram
                nodes={sankeyData.nodes}
                links={sankeyData.links}
                onNodeClick={handleSankeyNodeClick}
              />
            </div>
          )}
        </section>
      )}
      </FeatureGate>

      {/* Budget overview table */}
      {budgetSummary.length > 0 && (
        <section className="mt-4">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {budgetSummary.map((s, idx) => {
              const barPct = Math.min(s.pct, 100)
              const typeColor = s.budgetType === 'savings' ? 'bg-purple-500' :
                s.budgetType === 'debt' ? 'bg-red-500' :
                s.budgetType === 'income' ? 'bg-emerald-500' : 'bg-amber-500'
              const trackColor = s.budgetType === 'savings' ? 'bg-purple-100' :
                s.budgetType === 'debt' ? 'bg-red-100' :
                s.budgetType === 'income' ? 'bg-emerald-100' : 'bg-amber-100'

              return (
                <button
                  key={s.id}
                  onClick={() => router.push(`/core/budgets?budget=${s.id}`)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 ${
                    idx < budgetSummary.length - 1 ? 'border-b border-zinc-100' : ''
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-50">
                    <BudgetIcon name={s.icon} className="h-4 w-4 text-zinc-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-sm font-medium text-zinc-900">{s.name}</span>
                      <span className={`ml-2 shrink-0 text-xs font-bold ${s.isOver ? 'text-red-600' : 'text-zinc-600'}`}>
                        {s.pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className={`h-1.5 flex-1 overflow-hidden rounded-full ${trackColor}`}>
                        <div
                          className={`h-full rounded-full transition-all ${s.isOver ? 'bg-red-500' : typeColor}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-xs text-zinc-500">
                        <span className={s.isOver ? 'font-semibold text-red-600' : ''}>
                          {formatCurrencyShort(s.spent)}
                        </span>
                        {' / '}
                        {formatCurrencyShort(s.limit)}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Transaction list */}
      <section className="mt-6">
        {sortedDates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
            <p className="text-sm text-zinc-500">Geen transacties in deze maand.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedDates.map((dateStr) => {
              const dateTxs = transactionsByDate[dateStr]
              const dateObj = new Date(dateStr + 'T00:00:00')
              const dateLabel = dateObj.toLocaleDateString('nl-NL', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })

              return (
                <div key={dateStr}>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-400">
                    {dateLabel}
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                    {dateTxs.map((tx, idx) => {
                      const budget = getBudgetForId(tx.budget_id)
                      const amount = Number(tx.amount)
                      const isPositive = amount > 0

                      return (
                        <div
                          key={tx.id}
                          onClick={() => { setEditTransaction(tx); setShowForm(true) }}
                          className={`flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-zinc-50 ${
                            idx < dateTxs.length - 1 ? 'border-b border-zinc-100' : ''
                          }`}
                        >
                          {/* Icon */}
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            isPositive ? 'bg-emerald-50' : 'bg-zinc-100'
                          }`}>
                            {budget ? (
                              <BudgetIcon
                                name={budget.icon}
                                className={`h-4 w-4 ${isPositive ? 'text-emerald-500' : 'text-zinc-500'}`}
                              />
                            ) : (
                              <Tag className={`h-4 w-4 ${isPositive ? 'text-emerald-500' : 'text-zinc-400'}`} />
                            )}
                          </div>

                          {/* Description + counterparty */}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-900">
                              {tx.description}
                            </p>
                            {tx.counterparty_name && (
                              <p className="truncate text-xs text-zinc-500">
                                {tx.counterparty_name}
                              </p>
                            )}
                          </div>

                          {/* Budget badge */}
                          {budget ? (
                            <span className="hidden shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 sm:inline-block">
                              {budget.name}
                            </span>
                          ) : (
                            <span className="hidden shrink-0 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-600 sm:inline-block">
                              Niet gecategoriseerd
                            </span>
                          )}

                          {/* Amount */}
                          <span className={`shrink-0 text-sm font-semibold ${
                            isPositive ? 'text-emerald-600' : 'text-zinc-900'
                          }`}>
                            {isPositive ? '+' : ''}{formatCurrency(amount)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Transaction form modal */}
      {showForm && (
        <TransactionForm
          transaction={editTransaction ?? undefined}
          accountId={selectedAccountId}
          budgetGroups={budgetGroups}
          onClose={() => { setShowForm(false); setEditTransaction(null) }}
          onSaved={() => {
            setShowForm(false)
            setEditTransaction(null)
            loadTransactions(selectedAccountId)
            loadRecurrings()
          }}
        />
      )}

      {/* Account form modal */}
      {showAccountForm && (
        <AccountFormModal
          account={editAccount}
          canDelete={accounts.length > 1}
          onSave={saveAccount}
          onDelete={deleteAccount}
          onClose={() => { setShowAccountForm(false); setEditAccount(null) }}
        />
      )}
    </div>
  )
}

/* ── Account form modal ───────────────────────────────────────────── */

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Betaalrekening' },
  { value: 'savings', label: 'Spaarrekening' },
  { value: 'joint', label: 'En/of-rekening' },
  { value: 'business', label: 'Zakelijke rekening' },
  { value: 'other', label: 'Overig' },
] as const

function AccountFormModal({
  account,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: {
  account: Account | null
  canDelete: boolean
  onSave: (data: { name: string; iban: string; bank_name: string; account_type: string; balance: number }) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(account?.name ?? '')
  const [iban, setIban] = useState(account?.iban ?? '')
  const [bankName, setBankName] = useState(account?.bank_name ?? '')
  const [accountType, setAccountType] = useState(account?.account_type ?? 'checking')
  const [balance, setBalance] = useState(account ? String(account.balance) : '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      iban: iban.trim(),
      bank_name: bankName.trim(),
      account_type: accountType,
      balance: Number(balance) || 0,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-bold text-zinc-900">
              {account ? 'Rekening bewerken' : 'Nieuwe rekening'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Naam *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bijv. Hoofdrekening"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">IBAN</label>
              <input
                type="text"
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
                placeholder="NL91ABNA..."
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Bank</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Bijv. ING"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Type</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Huidig saldo</label>
              <input
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {account && canDelete ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">Zeker weten?</span>
                  <button
                    type="button"
                    onClick={() => onDelete(account.id)}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                  >
                    Verwijderen
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
                  >
                    Annuleer
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Verwijderen
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
              >
                Annuleer
              </button>
              <button
                type="submit"
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                {account ? 'Opslaan' : 'Toevoegen'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
