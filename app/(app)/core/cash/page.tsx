'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Upload, ArrowUpRight, ArrowDownLeft,
  Wallet, Tag, Settings2, Trash2, X, Building2, Repeat, Calendar, Search, Filter, RotateCcw,
  Link2, ArrowLeftRight, HelpCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isOwnAccountTransfer } from '@/lib/parsers/categorize'
import { TransferConfirmSheet } from '@/components/app/transfer-confirm-sheet'
import { PendingTransferBanner } from '@/components/app/pending-transfer-banner'
import { CashFlowForecastChart, type ForecastPoint, type ForecastAlert } from '@/components/app/cashflow-forecast-chart'
import { FeatureGate } from '@/components/app/feature-gate'
import { LineChart } from 'lucide-react'
import { ConnectedAccountCard } from '@/components/app/gocardless/connected-account-card'
import { getDefaultBudgets, type Budget, type BudgetWithChildren } from '@/lib/budget-data'
import { TransactionForm } from '@/components/app/transaction-form'
import { BudgetIcon, formatCurrency as formatCurrencyShort, formatCurrencyDecimals as formatCurrency, getTypeColors } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { SankeyDiagram, type SankeyNode, type SankeyLink } from '@/components/app/sankey-diagram'
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
  transaction_type: string | null
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

  // GoCardless state
  const [gcEnabled, setGcEnabled] = useState(false)
  const [gcAccounts, setGcAccounts] = useState<Array<{
    id: string
    gc_account_id: string
    iban: string | null
    last_synced_at: string | null
    daily_requests: number
    rate_limit_reset_date: string | null
    is_active: boolean
    bank_account_id: string | null
    gocardless_requisitions: {
      institution_name: string
      institution_logo: string | null
      expires_at: string | null
      status: string
    }
  }>>([])
  const [showBankConnections, setShowBankConnections] = useState(true)

  // Cashflow forecast state
  const [cashFlowForecast, setCashFlowForecast] = useState<ForecastPoint[]>([])
  const [cashFlowAlerts, setCashFlowAlerts] = useState<ForecastAlert[]>([])
  const [cashFlowBalance, setCashFlowBalance] = useState(0)
  const [cashFlowHasData, setCashFlowHasData] = useState(false)

  // Filter state
  const [filterSearch, setFilterSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all')
  const [filterBudgetId, setFilterBudgetId] = useState<string>('all')

  // Transfer detection state
  const [ownIbans, setOwnIbans] = useState<Set<string>>(new Set())
  const [confirmTransferTx, setConfirmTransferTx] = useState<Transaction | null>(null)

  const hasActiveFilters = filterSearch !== '' || filterType !== 'all' || filterBudgetId !== 'all'

  function resetFilters() {
    setFilterSearch('')
    setFilterType('all')
    setFilterBudgetId('all')
  }

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
      const { data: { user } } = await supabase.auth.getUser()

      const [{ data, error: fetchError }, { data: ownIbanRows }] = await Promise.all([
        supabase.from('bank_accounts').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        user
          ? supabase.from('user_own_ibans').select('iban').eq('user_id', user.id)
          : Promise.resolve({ data: [] }),
      ])

      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        // Guard: double-check to prevent race conditions
        const { count } = await supabase.from('bank_accounts').select('id', { count: 'exact', head: true })
        if (count && count > 0) { await loadAccounts(); return }
        // No accounts exist — show account creation form
        setLoading(false)
        setShowAccountForm(true)
        return
      }

      setAccounts(data as Account[])

      // Build own IBAN set
      const ibansFromAccounts = (data as Account[])
        .map((a) => a.iban)
        .filter(Boolean)
        .map((i) => i!.replace(/\s/g, '').toUpperCase())
      const ibansFromOwn = (ownIbanRows ?? []).map((r: { iban: string }) => r.iban.replace(/\s/g, '').toUpperCase())
      setOwnIbans(new Set([...ibansFromAccounts, ...ibansFromOwn]))

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


  const loadGcAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/gocardless/status')
      if (!res.ok) return
      const { enabled } = await res.json()
      setGcEnabled(enabled)
      if (!enabled) return

      const supabase = createClient()
      const { data } = await supabase
        .from('gocardless_accounts')
        .select('*, gocardless_requisitions(institution_name, institution_logo, expires_at, status)')
        .eq('is_active', true)
        .order('iban', { ascending: true })

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setGcAccounts(data as any)
      }
    } catch {
      // Silently fail — GoCardless is optional
    }
  }, [])

  const loadCashFlowForecast = useCallback(async () => {
    try {
      const res = await fetch('/api/cashflow-forecast')
      if (res.ok) {
        const data = await res.json()
        if (data.hasData) {
          setCashFlowForecast(data.forecast ?? [])
          setCashFlowAlerts(data.alerts ?? [])
          setCashFlowBalance(data.currentBalance ?? 0)
          setCashFlowHasData(true)
        }
      }
    } catch {
      // Cash flow forecast is non-critical
    }
  }, [])

  useEffect(() => {
    loadBudgets()
    loadAccounts()
    loadGcAccounts()
    loadCashFlowForecast()
  }, [loadBudgets, loadAccounts, loadGcAccounts, loadCashFlowForecast])

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

  // Calculate monthly totals — exclude transfers, use amount sign as source of truth
  const nonTransferTx = transactions.filter((t) => t.transaction_type !== 'transfer')
  const transferTx = transactions.filter((t) => t.transaction_type === 'transfer')

  const totalIncome = nonTransferTx
    .filter((t) => Number(t.amount) > 0)
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const totalExpenses = nonTransferTx
    .filter((t) => Number(t.amount) < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

  const netAmount = totalIncome - totalExpenses
  const transferTotal = transferTx.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

  // Daily expenses for freedom-time calculations
  // Use current month's total expenses / 30 as the daily cost of living
  const dailyExpenses = totalExpenses > 0 ? totalExpenses / 30 : 0

  // Freedom time for monthly summary cards
  const incomeFreedomDays = dailyExpenses > 0
    ? calculateFreedomTime(totalIncome, dailyExpenses)
    : null
  const expensesFreedomDays = dailyExpenses > 0
    ? calculateFreedomTime(totalExpenses, dailyExpenses)
    : null
  const netFreedomDays = dailyExpenses > 0
    ? calculateFreedomTime(Math.abs(netAmount), dailyExpenses)
    : null

  // Apply filters to transactions
  const filteredTransactions = useMemo(() => {
    let result = transactions

    // Search filter: match description, counterparty name, or notes
    if (filterSearch.trim()) {
      const searchLower = filterSearch.trim().toLowerCase()
      result = result.filter((tx) =>
        (tx.description && tx.description.toLowerCase().includes(searchLower)) ||
        (tx.counterparty_name && tx.counterparty_name.toLowerCase().includes(searchLower)) ||
        (tx.notes && tx.notes.toLowerCase().includes(searchLower))
      )
    }

    // Type filter: income, expense, or transfer
    if (filterType === 'income') {
      result = result.filter((tx) => Number(tx.amount) > 0 && tx.transaction_type !== 'transfer')
    } else if (filterType === 'expense') {
      result = result.filter((tx) => Number(tx.amount) < 0 && tx.transaction_type !== 'transfer')
    } else if (filterType === 'transfer') {
      result = result.filter((tx) => tx.transaction_type === 'transfer')
    }

    // Budget category filter
    if (filterBudgetId !== 'all') {
      if (filterBudgetId === 'uncategorized') {
        result = result.filter((tx) => !tx.budget_id)
      } else {
        result = result.filter((tx) => tx.budget_id === filterBudgetId)
      }
    }

    return result
  }, [transactions, filterSearch, filterType, filterBudgetId])

  // Group filtered transactions by date
  const transactionsByDate = filteredTransactions.reduce<Record<string, Transaction[]>>((groups, tx) => {
    const date = tx.date
    if (!groups[date]) groups[date] = []
    groups[date].push(tx)
    return groups
  }, {})

  const sortedDates = Object.keys(transactionsByDate).sort((a, b) => b.localeCompare(a))

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

  // Build Sankey data from transactions + budget structure (transfers excluded)
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

    // Sum transactions per budget_id — exclude transfers
    const sankeyTx = transactions.filter((t) => t.transaction_type !== 'transfer')
    const spendingByBudget: Record<string, number> = {}
    let uncategorizedIncome = 0
    let uncategorizedExpense = 0

    for (const tx of sankeyTx) {
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
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); loadAccounts() }} className="mt-3 rounded-[var(--r)] bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Account header */}
      <section className="rounded-[var(--r-lg)] border border-kern-200 card-editorial p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--r-lg)] bg-kern-100">
              <Wallet className="h-5 w-5 text-kern-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {accounts.length > 1 ? (
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="border-none bg-transparent text-lg font-bold text-[var(--ink)] outline-none"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                ) : (
                  <h1 className="text-lg font-bold text-[var(--ink)]">{selectedAccount?.name}</h1>
                )}
                <button
                  onClick={() => { setEditAccount(selectedAccount ?? null); setShowAccountForm(true) }}
                  className="rounded-[var(--r)] p-1.5 text-[var(--ink-3)] hover:bg-kern-100 hover:text-kern-600"
                  title="Rekening bewerken"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {selectedAccount?.iban && (
                  <p className="text-xs text-[var(--ink-3)]">{selectedAccount.iban}</p>
                )}
                {selectedAccount?.bank_name && (
                  <span className="text-xs text-[var(--ink-3)]">
                    {selectedAccount.iban ? '·' : ''} {selectedAccount.bank_name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setEditAccount(null); setShowAccountForm(true) }}
              className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-kern-200 px-3 py-1.5 text-xs font-medium text-kern-700 hover:bg-kern-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Rekening toevoegen
            </button>
            <div className="text-right">
              <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Saldo</p>
              <p className="text-2xl font-bold text-[var(--ink)]">
                {formatCurrency(Number(selectedAccount?.balance ?? 0))}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Action bar */}
      <div className="mt-3 sm:mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href="/core/cash/import"
            className="inline-flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            <Upload className="h-4 w-4" />
            Importeer transacties
          </Link>
          <button
            onClick={() => { setEditTransaction(null); setShowForm(true) }}
            className="inline-flex items-center gap-2 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
          >
            <Plus className="h-4 w-4" />
            Nieuwe transactie
          </button>
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

      {/* GoCardless bank connections */}
      {gcEnabled && (
        <section className="mt-3 sm:mt-6">
          <button
            onClick={() => setShowBankConnections((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
          >
            {showBankConnections ? (
              <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
            )}
            <Link2 className="h-4 w-4 text-kern-500" />
            <span className="text-sm font-semibold text-[var(--ink-2)]">Bankverbindingen</span>
            <span className="ml-auto text-xs text-[var(--ink-3)]">
              {gcAccounts.length} gekoppeld
            </span>
          </button>

          {showBankConnections && (
            <div className="mt-2 space-y-3">
              {gcAccounts.map((acc) => (
                <ConnectedAccountCard
                  key={acc.id}
                  account={acc}
                  onSync={() => {
                    loadAccounts()
                    loadGcAccounts()
                  }}
                  onDisconnect={() => loadGcAccounts()}
                  onReauthorize={() => router.push('/core/cash/connect')}
                />
              ))}

              <Link
                href="/core/cash/connect"
                className="flex items-center justify-center gap-2 rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-kern-300 hover:bg-kern-50 hover:text-kern-700"
              >
                <Plus className="h-4 w-4" />
                Bank koppelen
              </Link>
            </div>
          )}
        </section>
      )}

      {/* Pending transfer banner */}
      {(() => {
        const pendingTransfers = transactions.filter(
          (t) =>
            t.transaction_type !== 'transfer' &&
            t.counterparty_iban &&
            isOwnAccountTransfer(t.counterparty_iban, ownIbans)
        )
        if (pendingTransfers.length === 0) return null
        return (
          <div className="mt-3 sm:mt-6">
            <PendingTransferBanner
              count={pendingTransfers.length}
              onReview={() => {
                const first = pendingTransfers[0]
                if (first) setConfirmTransferTx(first)
              }}
            />
          </div>
        )
      })()}

      {/* Monthly overview */}
      <section className="mt-3 sm:mt-6 grid grid-cols-3 gap-3 sm:gap-4" data-testid="monthly-summary">
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
            <p className="text-xs font-medium text-emerald-600 uppercase">Inkomen</p>
          </div>
          <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrencyShort(totalIncome)}</p>
          {incomeFreedomDays && (
            <p className="mt-0.5 text-xs text-emerald-500/70" data-testid="income-freedom-days">
              {incomeFreedomDays.totalDays.toFixed(1)} dagen vrijheid verdiend
            </p>
          )}
        </div>
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <ArrowUpRight className="h-4 w-4 text-red-500" />
            <p className="text-xs font-medium text-red-600 uppercase">Uitgaven</p>
          </div>
          <p className="mt-1 text-xl font-bold text-red-600">{formatCurrencyShort(totalExpenses)}</p>
          {expensesFreedomDays && (
            <p className="mt-0.5 text-xs text-red-400/70" data-testid="expenses-freedom-days">
              {expensesFreedomDays.totalDays.toFixed(1)} dagen vrijheid
            </p>
          )}
        </div>
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-center">
          <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Netto</p>
          <p className={`mt-1 text-xl font-bold ${netAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrencyShort(netAmount)}
          </p>
          {netFreedomDays && (
            <p className={`mt-0.5 text-xs ${netAmount >= 0 ? 'text-emerald-500/70' : 'text-red-400/70'}`} data-testid="net-freedom-days">
              {netAmount >= 0 ? '+' : '-'}{netFreedomDays.totalDays.toFixed(1)} dagen
            </p>
          )}
        </div>
      </section>
      {transferTx.length > 0 && (
        <p className="mt-1 text-[10px] italic text-[var(--ink-4)] text-center" data-testid="transfer-footnote">
          {transferTx.length} eigen {transferTx.length === 1 ? 'overboeking' : 'overboekingen'} ({new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(transferTotal)}) zijn uitgesloten van bovenstaande totalen.
        </p>
      )}

      {/* Recurring transactions */}
      {recurrings.length > 0 && (
        <section className="mt-3 sm:mt-6">
          <button
            onClick={() => setShowRecurring((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
          >
            {showRecurring ? (
              <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
            )}
            <Repeat className="h-4 w-4 text-kern-500" />
            <span className="text-sm font-semibold text-[var(--ink-2)]">Terugkerende boekingen</span>
            <span className="ml-auto text-xs text-[var(--ink-3)]">
              Verwacht: {formatCurrencyShort(getExpectedMonthlyTotal(recurrings))}/mnd
            </span>
          </button>

          {showRecurring && (
            <div className="mt-2 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
              {recurrings.map((r, idx) => {
                const amount = Number(r.amount)
                const isPositive = amount > 0
                const nextDate = getNextOccurrence(r)
                const budget = r.budget_id ? budgets.find(b => b.id === r.budget_id) : undefined

                return (
                  <div
                    key={r.id}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      idx < recurrings.length - 1 ? 'border-b border-[var(--border-ed)]' : ''
                    }`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] ${
                      isPositive ? 'bg-emerald-50' : 'bg-zinc-100'
                    }`}>
                      {budget ? (
                        <BudgetIcon name={budget.icon} className={`h-4 w-4 ${isPositive ? 'text-emerald-500' : 'text-[var(--ink-3)]'}`} />
                      ) : (
                        <Repeat className={`h-4 w-4 ${isPositive ? 'text-emerald-500' : 'text-[var(--ink-3)]'}`} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">{r.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--ink-3)]">{formatSchedule(r)}</span>
                        {nextDate && (
                          <span className="text-xs text-[var(--ink-3)]">
                            · volgende: {nextDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {budget && (
                      <span className="hidden shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-[var(--ink-2)] sm:inline-block">
                        {budget.name}
                      </span>
                    )}

                    <span className={`shrink-0 text-sm font-semibold ${
                      isPositive ? 'text-emerald-600' : 'text-[var(--ink)]'
                    }`}>
                      {isPositive ? '+' : ''}{formatCurrency(amount)}
                    </span>

                    <button
                      onClick={() => deleteRecurring(r.id)}
                      className="shrink-0 rounded p-1 text-[var(--ink-4)] hover:bg-red-50 hover:text-red-500"
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
      {sankeyData && sankeyData.nodes.length > 0 && (
        <section className="mt-3 sm:mt-6">
          <button
            onClick={() => setShowSankey((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
          >
            {showSankey ? (
              <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
            )}
            <span className="text-sm font-semibold text-[var(--ink-2)]">Geldstroom</span>
          </button>

          {showSankey && (
            <div className="relative mt-2 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
              <SankeyDiagram
                nodes={sankeyData.nodes}
                links={sankeyData.links}
                onNodeClick={handleSankeyNodeClick}
              />
              {transferTx.length > 0 && (
                <p className="pb-2 text-[10px] italic text-[var(--ink-4)] text-center">
                  Eigen overboekingen zijn niet weergegeven in de geldstroom.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Cashflow Prognose */}
      <FeatureGate featureId="cashflow_forecast" fallback="locked">
        {cashFlowHasData && cashFlowForecast.length >= 2 && (
          <section className="mt-3 sm:mt-6" data-testid="cashflow-forecast-section">
            <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <LineChart className="h-4 w-4 text-kern-600" />
                <h3 className="text-sm font-semibold text-[var(--ink-2)]">Cashflow Prognose</h3>
                <span className="ml-auto text-xs text-[var(--ink-3)]">
                  {cashFlowForecast.length - 1} maanden vooruit
                </span>
              </div>
              <CashFlowForecastChart
                forecast={cashFlowForecast}
                alerts={cashFlowAlerts}
                currentBalance={cashFlowBalance}
              />
            </div>
          </section>
        )}
      </FeatureGate>

      {/* Transaction filters */}
      <section className="mt-3 sm:mt-6" data-testid="transaction-filters">
        <div className="flex flex-col gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:flex-row sm:items-center">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
            <input
              type="text"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Zoek op omschrijving of tegenpartij..."
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] py-2 pl-9 pr-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)] focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              data-testid="filter-search"
            />
          </div>

          {/* Type filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'all' | 'income' | 'expense' | 'transfer')}
            className="rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm text-[var(--ink-2)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
            data-testid="filter-type"
          >
            <option value="all">Alle types</option>
            <option value="income">Inkomen</option>
            <option value="expense">Uitgaven</option>
            <option value="transfer">Overboekingen</option>
          </select>

          {/* Budget category filter */}
          <select
            value={filterBudgetId}
            onChange={(e) => setFilterBudgetId(e.target.value)}
            className="rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm text-[var(--ink-2)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
            data-testid="filter-budget"
          >
            <option value="all">Alle categorieën</option>
            <option value="uncategorized">Niet gecategoriseerd</option>
            {budgets
              .filter((b) => !b.parent_id || Number(b.default_limit) > 0)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.parent_id ? `  ${b.name}` : b.name}
                </option>
              ))}
          </select>

          {/* Reset filters button */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-kern-200 bg-kern-50 px-3 py-2 text-sm font-medium text-kern-700 hover:bg-kern-100 transition-colors"
              data-testid="filter-reset"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset filters
            </button>
          )}
        </div>

        {/* Active filter summary */}
        {hasActiveFilters && (
          <div className="mt-2 flex items-center gap-2 text-xs text-[var(--ink-3)]" data-testid="filter-summary">
            <Filter className="h-3.5 w-3.5" />
            <span>
              {filteredTransactions.length} van {transactions.length} transacties
            </span>
          </div>
        )}
      </section>

      {/* Transaction list */}
      <section className="mt-3 sm:mt-6" data-testid="transaction-list">
        {sortedDates.length === 0 ? (
          <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-8 text-center" data-testid="no-transactions">
            <Wallet className="mx-auto h-8 w-8 text-[var(--ink-4)]" />
            <p className="mt-2 text-sm font-medium text-[var(--ink-2)]">Geen transacties gevonden</p>
            {hasActiveFilters ? (
              <>
                <p className="mt-1 text-xs text-[var(--ink-3)]">Geen transacties komen overeen met de huidige filters.</p>
                <button
                  onClick={resetFilters}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
                  data-testid="filter-reset-empty"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Filters wissen
                </button>
              </>
            ) : (
              <p className="mt-1 text-xs text-[var(--ink-3)]">Er zijn geen transacties in {monthLabel}. Voeg een transactie toe of importeer je bankafschriften.</p>
            )}
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
                  <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--ink-3)]">
                    {dateLabel}
                  </h3>
                  <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
                    {dateTxs.map((tx, idx) => {
                      const budget = getBudgetForId(tx.budget_id)
                      const amount = Number(tx.amount)
                      const isPositive = amount > 0
                      const isTransfer = tx.transaction_type === 'transfer'
                      const isPendingTransfer =
                        !isTransfer &&
                        !!tx.counterparty_iban &&
                        isOwnAccountTransfer(tx.counterparty_iban, ownIbans)

                      return (
                        <div
                          key={tx.id}
                          onClick={() => {
                            if (isPendingTransfer) {
                              setConfirmTransferTx(tx)
                            } else {
                              setEditTransaction(tx)
                              setShowForm(true)
                            }
                          }}
                          className={`flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-[var(--subtle)] ${
                            idx < dateTxs.length - 1 ? 'border-b border-[var(--border-ed)]' : ''
                          } ${isPendingTransfer ? 'border-l-2 border-[var(--hor)]' : ''}`}
                        >
                          {/* Icon */}
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] ${
                            isTransfer
                              ? 'bg-[var(--subtle)] border border-[var(--border-ed)]'
                              : isPendingTransfer
                                ? 'bg-[var(--hor-l)] border border-[var(--hor-m)]'
                                : isPositive ? 'bg-emerald-50' : 'bg-zinc-100'
                          }`}>
                            {isTransfer ? (
                              <ArrowLeftRight className="h-4 w-4 text-[var(--ink-3)]" />
                            ) : isPendingTransfer ? (
                              <HelpCircle className="h-4 w-4 text-[var(--hor-t)]" />
                            ) : budget ? (
                              <BudgetIcon
                                name={budget.icon}
                                className={`h-4 w-4 ${isPositive ? 'text-emerald-500' : 'text-[var(--ink-3)]'}`}
                              />
                            ) : (
                              <Tag className={`h-4 w-4 ${isPositive ? 'text-emerald-500' : 'text-[var(--ink-3)]'}`} />
                            )}
                          </div>

                          {/* Description + counterparty */}
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-sm font-medium ${
                              isTransfer ? 'text-[var(--ink-2)]' : 'text-[var(--ink)]'
                            }`}>
                              {isTransfer ? 'Eigen overboeking' : tx.description}
                            </p>
                            <p className="truncate text-xs text-[var(--ink-3)]">
                              {isTransfer && tx.counterparty_name
                                ? `${tx.counterparty_name}${tx.counterparty_iban ? ' · ' + tx.counterparty_iban.slice(-4) : ''}`
                                : tx.counterparty_name ?? ''}
                            </p>
                          </div>

                          {/* Badge */}
                          {isTransfer ? (
                            <span className="hidden shrink-0 rounded-full bg-[var(--subtle)] border border-[var(--border-ed)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[.06em] text-[var(--ink-3)] sm:inline-block">
                              Overboeking
                            </span>
                          ) : isPendingTransfer ? (
                            <span className="hidden shrink-0 rounded-full bg-[var(--hor-l)] border border-[var(--hor-m)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[.06em] text-[var(--hor-t)] sm:inline-block">
                              Controleer
                            </span>
                          ) : budget ? (
                            <span className="hidden shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-[var(--ink-2)] sm:inline-block">
                              {budget.name}
                            </span>
                          ) : (
                            <span className="hidden shrink-0 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-600 sm:inline-block">
                              Niet gecategoriseerd
                            </span>
                          )}

                          {/* Amount + freedom time */}
                          <div className="shrink-0 text-right">
                            <span className={`font-mono text-sm font-semibold tabular-nums ${
                              isTransfer || isPendingTransfer
                                ? 'text-[var(--ink-2)]'
                                : isPositive ? 'text-emerald-600' : 'text-[var(--ink)]'
                            }`}>
                              {!isTransfer && !isPendingTransfer && (isPositive ? '+' : '')}{formatCurrency(amount)}
                            </span>
                            {/* No freedom-time for transfers — philosophically correct */}
                            {!isTransfer && !isPendingTransfer && dailyExpenses > 0 && (
                              <p className={`text-[10px] leading-tight ${
                                isPositive ? 'text-emerald-500/60' : 'text-[var(--ink-3)]'
                              }`} data-testid="tx-freedom-time">
                                {(() => {
                                  const fd = calculateFreedomTime(Math.abs(amount), dailyExpenses)
                                  const fdStr = fd.totalDays < 1
                                    ? `${fd.totalDays.toFixed(1)} dagen`
                                    : formatFreedomTimeString(fd, 'short', true)
                                  return isPositive
                                    ? `${fdStr} verdiend`
                                    : fdStr
                                })()}
                              </p>
                            )}
                          </div>
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

      {/* Transfer confirm sheet */}
      {confirmTransferTx && (
        <TransferConfirmSheet
          transaction={confirmTransferTx}
          matchedAccount={(() => {
            const iban = confirmTransferTx.counterparty_iban?.replace(/\s/g, '').toUpperCase() ?? ''
            const acc = accounts.find((a) => a.iban?.replace(/\s/g, '').toUpperCase() === iban)
            return acc ? { name: acc.name, iban: acc.iban } : null
          })()}
          onClose={() => setConfirmTransferTx(null)}
          onConfirmed={() => {
            loadTransactions(selectedAccountId)
            setConfirmTransferTx(null)
          }}
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
  const [showOwnIbans, setShowOwnIbans] = useState(false)
  const [ownIbanRows, setOwnIbanRows] = useState<{ id: string; iban: string; label: string | null }[]>([])
  const [newOwnIban, setNewOwnIban] = useState('')
  const [newOwnIbanLabel, setNewOwnIbanLabel] = useState('')

  const loadOwnIbans = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('user_own_ibans')
      .select('id, iban, label')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (data) setOwnIbanRows(data)
  }, [])

  useEffect(() => {
    if (showOwnIbans) loadOwnIbans()
  }, [showOwnIbans, loadOwnIbans])

  async function addOwnIban() {
    const normalized = newOwnIban.replace(/\s/g, '').toUpperCase()
    if (!normalized) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('user_own_ibans').insert({
      user_id: user.id,
      iban: normalized,
      label: newOwnIbanLabel.trim() || null,
    })
    setNewOwnIban('')
    setNewOwnIbanLabel('')
    loadOwnIbans()
  }

  async function removeOwnIban(id: string) {
    const supabase = createClient()
    await supabase.from('user_own_ibans').delete().eq('id', id)
    loadOwnIbans()
  }

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
        className="w-full max-w-md rounded-[var(--r-lg)] bg-[var(--paper)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-kern-600" />
            <h2 className="text-lg font-bold text-[var(--ink)]">
              {account ? 'Rekening bewerken' : 'Nieuwe rekening'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-[var(--r)] p-1.5 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Naam *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bijv. Hoofdrekening"
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">IBAN</label>
              <input
                type="text"
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
                placeholder="NL91ABNA..."
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Bank</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Bijv. ING"
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Type</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Huidig saldo</label>
              <input
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              />
            </div>
          </div>

          {/* Own IBAN registry */}
          <div className="border-t border-[var(--border-ed)] pt-3">
            <button
              type="button"
              onClick={() => setShowOwnIbans((v) => !v)}
              className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-3)] hover:text-[var(--ink-2)]"
            >
              <span>{showOwnIbans ? '▾' : '▸'}</span>
              Mijn andere eigen IBANs
            </button>
            {showOwnIbans && (
              <div className="mt-2 space-y-2">
                {ownIbanRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <span className="flex-1 font-mono text-xs text-[var(--ink-2)]">{row.iban}</span>
                    {row.label && (
                      <span className="text-xs italic text-[var(--ink-3)]">{row.label}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeOwnIban(row.id)}
                      className="rounded p-0.5 text-[var(--ink-4)] hover:bg-red-50 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newOwnIban}
                    onChange={(e) => setNewOwnIban(e.target.value.toUpperCase())}
                    placeholder="NL91ABNA..."
                    className="flex-1 rounded-[var(--r)] border border-[var(--border-ed)] px-2 py-1 font-mono text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                  />
                  <input
                    type="text"
                    value={newOwnIbanLabel}
                    onChange={(e) => setNewOwnIbanLabel(e.target.value)}
                    placeholder="Label (optioneel)"
                    className="w-32 rounded-[var(--r)] border border-[var(--border-ed)] px-2 py-1 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                  />
                  <button
                    type="button"
                    onClick={addOwnIban}
                    className="rounded-[var(--r)] bg-kern-100 px-2 py-1 text-xs font-medium text-kern-700 hover:bg-kern-200"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            {account && canDelete ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">Zeker weten?</span>
                  <button
                    type="button"
                    onClick={() => onDelete(account.id)}
                    className="rounded-[var(--r)] bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                  >
                    Verwijderen
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-[var(--r)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-zinc-100"
                  >
                    Annuleer
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r)] px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
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
                className="rounded-[var(--r)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-zinc-100"
              >
                Annuleer
              </button>
              <button
                type="submit"
                className="rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
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
