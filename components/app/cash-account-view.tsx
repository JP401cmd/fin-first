'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Upload, ArrowUpRight, ArrowDownLeft,
  Wallet, Tag, Settings2, X, Repeat, Search, Filter, RotateCcw,
  Link2, ArrowLeftRight, HelpCircle, GitFork, Pencil, Sparkles, ArrowLeft,
  MoreVertical, Unlink, Save,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isOwnAccountTransfer } from '@/lib/parsers/categorize'
import { TransferConfirmSheet } from '@/components/app/transfer-confirm-sheet'
import { ManualTransferSheet } from '@/components/app/manual-transfer-sheet'
import { PendingTransferBanner } from '@/components/app/pending-transfer-banner'
import { CashFlowForecastChart, type ForecastPoint, type ForecastAlert } from '@/components/app/cashflow-forecast-chart'
import { FeatureGate } from '@/components/app/feature-gate'
import { LineChart } from 'lucide-react'
import { ConnectedAccountCard } from '@/components/app/bank-connect/connected-account-card'
import { type Budget } from '@/lib/budget-data'
import { TransactionForm } from '@/components/app/transaction-form'
import { BudgetIcon, formatCurrency as formatCurrencyShort, formatCurrencyDecimals as formatCurrency } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { SankeyDiagram, type SankeyNode, type SankeyLink } from '@/components/app/sankey-diagram'
import { type RecurringTransaction, getExpectedMonthlyTotal, getNextOccurrence, formatSchedule } from '@/lib/recurring-data'
import { BillCalendar, type CalendarTransaction } from '@/components/app/bill-calendar'
import { RecurringEditSheet } from '@/components/app/recurring-edit-sheet'
import { CategoryRulesSheet } from '@/components/app/category-rules-sheet'
import { usePerspective, usePerspectiveAbort } from '@/components/app/perspective-provider'
import { useHouseholdStatus } from '@/components/app/ownership-toggle'
import { computeSharePct, SPLIT_MODE_LABELS, type SplitMode } from '@/lib/household-data'
import { usePartnerPrivacy, PrivacyHiddenNotice } from '@/components/app/privacy-hidden-notice'
import { Users, TrendingUp, TrendingDown, Minus, Shield } from 'lucide-react'
import { SettlementOverview } from '@/components/app/settlement-overview'
import { UncategorizedTransactionsBanner } from '@/components/app/uncategorized-transactions-banner'
import { AICategorizeSheet } from '@/components/app/ai-categorize-sheet'
import { AccountFormModal, ACCOUNT_TYPES, type Account } from '@/components/app/account-form-modal'

type Transaction = {
  id: string
  account_id: string
  budget_id: string | null
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  import_hash: string | null
  is_income: boolean
  notes: string | null
  category_source: string
  transaction_type: string | null
  is_split?: boolean
  ownership?: 'personal' | 'shared'
  user_id?: string
}

type SplitRow = {
  id: string
  budget_id: string | null
  amount: number
  description: string | null
}

type DetectedPattern = {
  key: string
  counterpartyName: string
  frequency: 'monthly' | 'weekly' | 'quarterly' | 'yearly'
  averageAmount: number
  confidence: 'high' | 'medium' | 'low'
  isIncome: boolean
  dayOfMonth: number | null
  dayOfWeek: number | null
  matchedBudgetId: string | null
  description: string
  alreadyExists: boolean
}

/**
 * CashAccountView — Full cash account detail view.
 * Without accountId: combined view showing all accounts aggregated.
 * With accountId: single account detail view.
 */
export function CashAccountView({
  accountId,
  backHref = '/core/assets',
  backLabel = 'Assets',
  embedded = false,
}: {
  accountId?: string
  backHref?: string
  backLabel?: string
  embedded?: boolean
}) {
  const isCombined = !accountId
  const router = useRouter()
  const [account, setAccount] = useState<Account | null>(null)
  const [allAccounts, setAllAccounts] = useState<Account[]>([])
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
  const [showAICategorize, setShowAICategorize] = useState(false)
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [recurrings, setRecurrings] = useState<RecurringTransaction[]>([])
  const [showRecurring, setShowRecurring] = useState(true)
  const [editRecurring, setEditRecurring] = useState<RecurringTransaction | null>(null)
  const [showCategoryRules, setShowCategoryRules] = useState(false)
  const [detectingPatterns, setDetectingPatterns] = useState(false)
  const [detectedPatterns, setDetectedPatterns] = useState<DetectedPattern[]>([])
  const [showDetectModal, setShowDetectModal] = useState(false)

  // Bank Connect state
  const [gcEnabled, setGcEnabled] = useState(false)
  const [gcAccounts, setGcAccounts] = useState<Array<{
    id: string
    external_account_id: string
    iban: string | null
    account_name: string | null
    last_synced_at: string | null
    daily_requests: number
    rate_limit_reset_date: string | null
    is_active: boolean
    bank_account_id: string | null
    bank_connections: {
      provider_name: string
      provider_logo: string | null
      token_expires_at: string | null
      status: string
    }
  }>>([])
  const [showBankConnections, setShowBankConnections] = useState(true)

  // Cashflow forecast state
  const [cashFlowForecast, setCashFlowForecast] = useState<ForecastPoint[]>([])
  const [cashFlowAlerts, setCashFlowAlerts] = useState<ForecastAlert[]>([])
  const [cashFlowBalance, setCashFlowBalance] = useState(0)
  const [cashFlowHasData, setCashFlowHasData] = useState(false)

  // Tab state
  const [activeTab, setActiveTab] = useState<'transacties' | 'kalender'>('transacties')
  const [showManualTransfer, setShowManualTransfer] = useState(false)

  // Split transaction expansion state
  const [expandedSplitId, setExpandedSplitId] = useState<string | null>(null)
  const [splitsByTxId, setSplitsByTxId] = useState<Record<string, SplitRow[]>>({})

  // Filter state
  const [filterSearch, setFilterSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all')
  const [filterBudgetId, setFilterBudgetId] = useState<string>('all')

  // Transfer detection state
  const [ownIbans, setOwnIbans] = useState<Set<string>>(new Set())
  const [reviewTransferTxs, setReviewTransferTxs] = useState<Transaction[]>([])

  const { perspective } = usePerspective()
  const perspectiveSignal = usePerspectiveAbort(perspective)
  const { hasHousehold, householdId } = useHouseholdStatus()
  const { partnerPrivacy, hiddenCategories } = usePartnerPrivacy()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [householdMembers, setHouseholdMembers] = useState<{ userId: string; name: string }[]>([])
  const [householdSplit, setHouseholdSplit] = useState<{
    splitMode: SplitMode
    mySharePct: number
    myName: string
    partnerName: string
  } | null>(null)

  // Settings menu & asset edit state
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [showAssetEdit, setShowAssetEdit] = useState(false)
  const [linkedAsset, setLinkedAsset] = useState<{
    id: string; name: string; current_value: number; institution: string | null;
    account_number: string | null; subtype: string | null; net_worth_inclusion_pct: number
  } | null>(null)
  const [assetSaving, setAssetSaving] = useState(false)

  const hasActiveFilters = filterSearch !== '' || filterType !== 'all' || filterBudgetId !== 'all'

  function resetFilters() {
    setFilterSearch('')
    setFilterType('all')
    setFilterBudgetId('all')
  }

  const monthStart = monthDate.toISOString().split('T')[0]
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).toISOString().split('T')[0]
  const monthLabel = monthDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })

  const loadBudgets = useCallback(async (signal?: AbortSignal) => {
    const supabase = createClient()
    let budgetsQuery = supabase
      .from('budgets')
      .select('*')
      .order('sort_order', { ascending: true })

    if (perspective === 'personal') {
      budgetsQuery = budgetsQuery.eq('ownership', 'personal')
    }

    const { data } = await budgetsQuery
    if (signal?.aborted) return // Discard stale results

    if (data) {
      setBudgets(data as Budget[])
      const parents = (data as Budget[]).filter((b) => !b.parent_id && b.budget_type !== 'archive')
      const children = (data as Budget[]).filter((b) => b.parent_id && Number(b.default_limit) > 0 && b.budget_type !== 'archive')
      const groups = parents.map((parent) => ({
        parent,
        children: children.filter((c) => c.parent_id === parent.id),
      }))

      const archiveParents = (data as Budget[]).filter((b) => !b.parent_id && b.budget_type === 'archive')
      const archiveChildren = (data as Budget[]).filter((b) => b.parent_id && b.budget_type === 'archive')
      const archiveGroups = archiveParents
        .map((parent) => ({
          parent,
          children: archiveChildren.filter((c) => c.parent_id === parent.id),
        }))
        .filter((g) => g.children.length > 0)

      setBudgetGroups([...groups, ...archiveGroups])
    }
  }, [perspective])

  const loadRecurrings = useCallback(async () => {
    const supabase = createClient()
    let query = supabase
      .from('recurring_transactions')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (!isCombined) {
      query = query.eq('account_id', accountId!)
    }

    const { data } = await query
    if (data) setRecurrings(data as RecurringTransaction[])
  }, [accountId, isCombined])

  const loadTransactions = useCallback(async (signal?: AbortSignal) => {
    const supabase = createClient()
    let query = supabase
      .from('transactions')
      .select('*')
      .gte('date', monthStart)
      .lt('date', monthEnd)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (!isCombined) {
      query = query.eq('account_id', accountId!)
    }

    if (perspective === 'personal') {
      query = query.eq('ownership', 'personal')
    }

    const { data } = await query
    if (signal?.aborted) return // Discard stale results
    if (data) setTransactions(data as Transaction[])
  }, [accountId, isCombined, monthStart, monthEnd, perspective])

  const loadAccount = useCallback(async (signal?: AbortSignal) => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (signal?.aborted) return

      // Load all active accounts (needed for transfers)
      let accountsQuery = supabase.from('bank_accounts').select('*').eq('is_active', true).order('sort_order', { ascending: true })
      if (perspective === 'personal') {
        accountsQuery = accountsQuery.eq('ownership', 'personal')
      }

      const [{ data: allData, error: fetchError }, { data: ownIbanRows }] = await Promise.all([
        accountsQuery,
        user
          ? supabase.from('user_own_ibans').select('iban').eq('user_id', user.id)
          : Promise.resolve({ data: [] }),
      ])

      if (signal?.aborted) return // Discard stale results
      if (fetchError) throw fetchError
      if (!allData) throw new Error('Geen rekeningen gevonden')

      setAllAccounts(allData as Account[])

      if (isCombined) {
        const total = (allData as Account[]).reduce((s, a) => s + Number(a.balance), 0)
        setAccount({
          id: 'all',
          name: 'Alle rekeningen',
          iban: null,
          bank_name: null,
          account_type: 'combined',
          balance: total,
          is_active: true,
          sort_order: 0,
        })
      } else {
        const target = (allData as Account[]).find((a) => a.id === accountId)
        if (!target) {
          setError('Rekening niet gevonden')
          setLoading(false)
          return
        }
        setAccount(target)
      }

      // Build own IBAN set
      const ibansFromAccounts = (allData as Account[])
        .map((a) => a.iban)
        .filter(Boolean)
        .map((i) => i!.replace(/\s/g, '').toUpperCase())
      const ibansFromOwn = (ownIbanRows ?? []).map((r: { iban: string }) => r.iban.replace(/\s/g, '').toUpperCase())
      setOwnIbans(new Set([...ibansFromAccounts, ...ibansFromOwn]))
    } catch (err) {
      console.error('Error loading account:', err)
      if (!signal?.aborted) setError('Kon rekening niet laden. Probeer het opnieuw.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [accountId, perspective])

  const loadGcAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/bank-connect/status')
      if (!res.ok) return
      const { enabled } = await res.json()
      setGcEnabled(enabled)
      if (!enabled) return

      const supabase = createClient()
      let query = supabase
        .from('bank_connection_accounts')
        .select('*, bank_connections(provider_name, provider_logo, token_expires_at, status)')
        .eq('is_active', true)

      // Bij individuele rekening: toon alleen relevante connectie
      if (accountId) {
        query = query.eq('bank_account_id', accountId)
      }

      const { data } = await query.order('iban', { ascending: true })

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setGcAccounts(data as any)
      }
    } catch {
      // Silently fail — Bank Connect is optional
    }
  }, [accountId])

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
    const signal = perspectiveSignal
    loadBudgets(signal)
    loadAccount(signal)
    loadGcAccounts()
    loadCashFlowForecast()
  }, [loadBudgets, loadAccount, loadGcAccounts, loadCashFlowForecast, perspectiveSignal])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [])

  useEffect(() => {
    if (!householdId) return
    const supabase = createClient()
    supabase
      .from('household_members')
      .select('user_id, profiles!inner(full_name)')
      .eq('household_id', householdId)
      .then(({ data }) => {
        if (data) {
          setHouseholdMembers(
            (data as unknown as Array<{ user_id: string; profiles: { full_name: string | null } }>).map(m => ({
              userId: m.user_id,
              name: m.profiles?.full_name ?? m.user_id.slice(0, 8) + '\u2026',
            }))
          )
        }
      })
  }, [householdId])

  // Fetch household split settings for per-partner freedom time
  useEffect(() => {
    if (!hasHousehold || !householdId) {
      setHouseholdSplit(null)
      return
    }
    async function loadSplit() {
      try {
        const [statusRes, settingsRes] = await Promise.all([
          fetch('/api/household/status'),
          fetch('/api/household/settings'),
        ])
        if (!statusRes.ok || !settingsRes.ok) return
        const status = await statusRes.json()
        const settings = await settingsRes.json()
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const splitMode: SplitMode = settings.split_mode || 'equal'
        const mySharePct = computeSharePct(
          { splitMode, customSplitPct: settings.custom_split_pct ?? null, primaryPayerId: settings.primary_payer_id ?? null },
          user?.id ?? '',
        )
        const myMember = (status.members ?? []).find((m: { is_current_user: boolean }) => m.is_current_user)
        const partnerMember = (status.members ?? []).find((m: { is_current_user: boolean }) => !m.is_current_user)
        setHouseholdSplit({
          splitMode,
          mySharePct,
          myName: myMember?.full_name || 'Jij',
          partnerName: partnerMember?.full_name || 'Partner',
        })
      } catch {
        // Non-critical
      }
    }
    loadSplit()
  }, [hasHousehold, householdId])

  useEffect(() => {
    if (account) loadTransactions(perspectiveSignal)
  }, [account, loadTransactions, perspectiveSignal])

  useEffect(() => {
    if (account) loadRecurrings()
  }, [account, loadRecurrings])

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

  // Calculate monthly totals — exclude transfers
  const nonTransferTx = transactions.filter((t) => t.transaction_type !== 'transfer')
  const transferTx = transactions.filter((t) => t.transaction_type === 'transfer')
  const uncatTx = nonTransferTx.filter((t) => !t.budget_id)

  const totalIncome = nonTransferTx
    .filter((t) => Number(t.amount) > 0)
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const totalExpenses = nonTransferTx
    .filter((t) => Number(t.amount) < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

  const netAmount = totalIncome - totalExpenses
  const transferTotal = transferTx.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

  const dailyExpenses = totalExpenses > 0 ? totalExpenses / 30 : 0

  const incomeFreedomDays = dailyExpenses > 0
    ? calculateFreedomTime(totalIncome, dailyExpenses)
    : null
  const expensesFreedomDays = dailyExpenses > 0
    ? calculateFreedomTime(totalExpenses, dailyExpenses)
    : null
  const netFreedomDays = dailyExpenses > 0
    ? calculateFreedomTime(Math.abs(netAmount), dailyExpenses)
    : null

  // Per-partner expense breakdown for household perspective
  const partnerExpenseBreakdown = useMemo(() => {
    if (!householdSplit || perspective !== 'household' || dailyExpenses <= 0) return null
    const sharedExpenses = nonTransferTx
      .filter((t) => Number(t.amount) < 0 && t.ownership === 'shared')
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
    if (sharedExpenses <= 0) return null
    const myShare = sharedExpenses * (householdSplit.mySharePct / 100)
    const partnerShare = sharedExpenses * ((100 - householdSplit.mySharePct) / 100)
    const personalExpenses = nonTransferTx
      .filter((t) => Number(t.amount) < 0 && t.ownership !== 'shared')
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
    return {
      sharedExpenses,
      myShareAmount: myShare,
      partnerShareAmount: partnerShare,
      personalExpenses,
      myFreedomDays: calculateFreedomTime(myShare + personalExpenses, dailyExpenses),
      partnerFreedomDays: calculateFreedomTime(partnerShare, dailyExpenses),
      mySharePct: householdSplit.mySharePct,
      myName: householdSplit.myName,
      partnerName: householdSplit.partnerName,
      splitMode: householdSplit.splitMode,
    }
  }, [householdSplit, perspective, dailyExpenses, nonTransferTx])

  // Privacy-aware transaction filtering for household perspective
  const partnerTxPrivacy = perspective === 'household' ? (partnerPrivacy?.transactions ?? 'full') : 'full'
  const isPartnerTxTotals = partnerTxPrivacy === 'totals'
  const isPartnerTxHidden = partnerTxPrivacy === 'hidden'

  // Partner's transactions summary for 'totals' privacy mode
  const partnerCategorySummary = useMemo(() => {
    if (!isPartnerTxTotals || !currentUserId) return null

    const partnerTxs = transactions.filter(
      (tx) => tx.user_id !== currentUserId && tx.ownership !== 'shared' && tx.transaction_type !== 'transfer'
    )
    if (partnerTxs.length === 0) return null

    // Group by budget category
    const byCategory: Record<string, { name: string; total: number; count: number }> = {}
    for (const tx of partnerTxs) {
      const budget = getBudgetForId(tx.budget_id)
      const key = budget?.id ?? '_uncategorized'
      if (!byCategory[key]) {
        byCategory[key] = { name: budget?.name ?? 'Niet gecategoriseerd', total: 0, count: 0 }
      }
      byCategory[key].total += Number(tx.amount)
      byCategory[key].count++
    }

    const totalExpenses = partnerTxs.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
    const totalIncome = partnerTxs.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0)
    const categories = Object.values(byCategory).sort((a, b) => a.total - b.total) // most negative first

    return { totalExpenses, totalIncome, categories, transactionCount: partnerTxs.length }
  }, [isPartnerTxTotals, currentUserId, transactions])

  // Apply filters (with privacy filtering for partner transactions)
  const filteredTransactions = useMemo(() => {
    let result = transactions

    // Filter out partner's personal transactions when privacy = 'totals' or 'hidden'
    if ((isPartnerTxTotals || isPartnerTxHidden) && currentUserId) {
      result = result.filter(
        (tx) => tx.user_id === currentUserId || tx.ownership === 'shared'
      )
    }

    if (filterSearch.trim()) {
      const searchLower = filterSearch.trim().toLowerCase()
      result = result.filter((tx) =>
        (tx.description && tx.description.toLowerCase().includes(searchLower)) ||
        (tx.counterparty_name && tx.counterparty_name.toLowerCase().includes(searchLower)) ||
        (tx.notes && tx.notes.toLowerCase().includes(searchLower))
      )
    }

    if (filterType === 'income') {
      result = result.filter((tx) => Number(tx.amount) > 0 && tx.transaction_type !== 'transfer')
    } else if (filterType === 'expense') {
      result = result.filter((tx) => Number(tx.amount) < 0 && tx.transaction_type !== 'transfer')
    } else if (filterType === 'transfer') {
      result = result.filter((tx) => tx.transaction_type === 'transfer')
    }

    if (filterBudgetId !== 'all') {
      if (filterBudgetId === 'uncategorized') {
        result = result.filter((tx) => !tx.budget_id)
      } else {
        result = result.filter((tx) => tx.budget_id === filterBudgetId)
      }
    }

    return result
  }, [transactions, filterSearch, filterType, filterBudgetId, isPartnerTxTotals, isPartnerTxHidden, currentUserId])

  const transactionsByDate = filteredTransactions.reduce<Record<string, Transaction[]>>((groups, tx) => {
    const date = tx.date
    if (!groups[date]) groups[date] = []
    groups[date].push(tx)
    return groups
  }, {})

  const sortedDates = Object.keys(transactionsByDate).sort((a, b) => b.localeCompare(a))

  // Build Sankey data
  const sankeyData = useMemo(() => {
    if (transactions.length === 0 || budgetGroups.length === 0) return null

    const incomeColors = ['#4a8c6f', '#5a9e7a', '#6aae88', '#7dbd98']
    const expenseColors = ['#D4A843', '#ddb85a', '#e6c872', '#efd88a']
    const savingsColors = ['#8B5CB8', '#9e74c6', '#b18cd4', '#c4a4e2']
    const debtColors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca']

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

    const incomeGroups = budgetGroups.filter((g) => g.parent.budget_type === 'income')
    const expenseGroupsList = budgetGroups.filter((g) => g.parent.budget_type === 'expense')
    const savingsGroupsList = budgetGroups.filter((g) => g.parent.budget_type === 'savings')
    const debtGroupsList = budgetGroups.filter((g) => g.parent.budget_type === 'debt')

    let incomeIdx = 0
    for (const group of incomeGroups) {
      for (const child of group.children) {
        const value = spendingByBudget[child.id] ?? 0
        if (value > 0) {
          nodes.push({ id: `inc-${child.id}`, label: child.name, value, color: incomeColors[incomeIdx % incomeColors.length], column: 0 })
          incomeIdx++
        }
      }
      if (group.children.length === 0) {
        const value = spendingByBudget[group.parent.id] ?? 0
        if (value > 0) {
          nodes.push({ id: `inc-${group.parent.id}`, label: group.parent.name, value, color: incomeColors[incomeIdx % incomeColors.length], column: 0 })
          incomeIdx++
        }
      }
    }

    if (uncategorizedIncome > 0) {
      nodes.push({ id: 'inc-uncategorized', label: 'Overig inkomen', value: uncategorizedIncome, color: incomeColors[incomeIdx % incomeColors.length], column: 0 })
    }

    for (const group of [...expenseGroupsList, ...savingsGroupsList, ...debtGroupsList]) {
      const childValues = group.children.reduce((sum, c) => sum + (spendingByBudget[c.id] ?? 0), 0)
      const parentDirect = group.children.length === 0 ? (spendingByBudget[group.parent.id] ?? 0) : 0
      const total = childValues + parentDirect
      if (total <= 0) continue

      const budgetType = group.parent.budget_type
      const colorSet = budgetType === 'savings' ? savingsColors : budgetType === 'debt' ? debtColors : expenseColors
      const colIdx = budgetType === 'savings' ? savingsGroupsList.indexOf(group) : budgetType === 'debt' ? debtGroupsList.indexOf(group) : expenseGroupsList.indexOf(group)

      nodes.push({ id: `grp-${group.parent.id}`, label: group.parent.name, value: total, color: colorSet[colIdx % colorSet.length], column: 1 })
    }

    if (uncategorizedExpense > 0) {
      nodes.push({ id: 'grp-uncategorized', label: 'Overig', value: uncategorizedExpense, color: '#a1a1aa', column: 1 })
    }

    let expIdx = 0
    for (const group of [...expenseGroupsList, ...savingsGroupsList, ...debtGroupsList]) {
      const budgetType = group.parent.budget_type
      const colorSet = budgetType === 'savings' ? savingsColors : budgetType === 'debt' ? debtColors : expenseColors

      for (const child of group.children) {
        const value = spendingByBudget[child.id] ?? 0
        if (value <= 0) continue
        nodes.push({ id: `sub-${child.id}`, label: child.name, value, color: colorSet[expIdx % colorSet.length], column: 2 })
        expIdx++
      }
    }

    // Links: income → groups (proportionally)
    const totalIncomeValue = nodes.filter((n) => n.column === 0).reduce((s, n) => s + n.value, 0)
    const groupNodes = nodes.filter((n) => n.column === 1)
    const totalGroupValue = groupNodes.reduce((s, n) => s + n.value, 0)

    if (totalIncomeValue > 0 && totalGroupValue > 0) {
      const incomeNodes = nodes.filter((n) => n.column === 0)
      for (const incNode of incomeNodes) {
        for (const grpNode of groupNodes) {
          const linkValue = (incNode.value / totalIncomeValue) * grpNode.value
          if (linkValue > 0) {
            links.push({ source: incNode.id, target: grpNode.id, value: linkValue, color: incNode.color })
          }
        }
      }
    }

    // Links: groups → subcategories
    for (const group of [...expenseGroupsList, ...savingsGroupsList, ...debtGroupsList]) {
      const grpNodeId = `grp-${group.parent.id}`
      const grpNode = nodes.find((n) => n.id === grpNodeId)
      if (!grpNode) continue

      for (const child of group.children) {
        const subNodeId = `sub-${child.id}`
        const subNode = nodes.find((n) => n.id === subNodeId)
        if (!subNode) continue

        const budgetType = group.parent.budget_type
        const linkColor = budgetType === 'savings' ? savingsColors[0] : budgetType === 'debt' ? debtColors[0] : expenseColors[0]
        links.push({ source: grpNodeId, target: subNodeId, value: subNode.value, color: linkColor })
      }
    }

    return { nodes, links }
  }, [transactions, budgetGroups])

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
    if (!account) return
    const supabase = createClient()
    await supabase
      .from('bank_accounts')
      .update({
        name: formData.name,
        iban: formData.iban || null,
        bank_name: formData.bank_name || null,
        account_type: formData.account_type,
        balance: formData.balance,
      })
      .eq('id', account.id)

    setShowAccountForm(false)
    loadAccount()
  }

  // Load linked asset for this bank account
  const loadLinkedAsset = useCallback(async () => {
    if (!account?.linked_asset_id) { setLinkedAsset(null); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('assets')
      .select('id, name, current_value, institution, account_number, subtype, net_worth_inclusion_pct')
      .eq('id', account.linked_asset_id)
      .maybeSingle()
    setLinkedAsset(data)
  }, [account?.linked_asset_id])

  useEffect(() => { loadLinkedAsset() }, [loadLinkedAsset])

  async function handleSaveAsset(formData: {
    name: string; current_value: number; iban: string; bank_name: string;
    subtype: string; net_worth_inclusion_pct: number
  }) {
    if (!linkedAsset || !account) return
    setAssetSaving(true)
    const supabase = createClient()
    await supabase.from('assets').update({
      name: formData.name,
      current_value: formData.current_value,
      account_number: formData.iban || null,
      institution: formData.bank_name || null,
      subtype: formData.subtype || null,
      net_worth_inclusion_pct: formData.net_worth_inclusion_pct,
    }).eq('id', linkedAsset.id)
    // Sync bank_account too
    await supabase.from('bank_accounts').update({
      name: formData.name,
      iban: formData.iban || null,
      bank_name: formData.bank_name || null,
      account_type: formData.subtype || 'checking',
      balance: formData.current_value,
    }).eq('id', account.id)
    setAssetSaving(false)
    setShowAssetEdit(false)
    loadAccount()
    loadLinkedAsset()
  }

  async function handleDisconnectTracking() {
    if (!linkedAsset || !account) return
    if (!confirm('Weet je zeker dat je transacties wilt loskoppelen? De rekening wordt weer een gewone asset.')) return
    const supabase = createClient()
    // 1. Update asset: has_budget_tracking = false
    await supabase.from('assets').update({ has_budget_tracking: false }).eq('id', linkedAsset.id)
    // 2. Check transaction count
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.id)
    if (count === 0) {
      await supabase.from('bank_accounts').delete().eq('id', account.id)
    } else {
      await supabase.from('bank_accounts').update({ linked_asset_id: null }).eq('id', account.id)
    }
    // 3. Sync budgeting_active
    const { data: { user } } = await supabase.auth.getUser()
    let trackingAssets: { id: string }[] | null = null
    if (user) {
      const { data } = await supabase
        .from('assets')
        .select('id')
        .eq('asset_type', 'cash')
        .eq('has_budget_tracking', true)
        .eq('is_active', true)
      trackingAssets = data
      await supabase
        .from('profiles')
        .update({ budgeting_active: (trackingAssets?.length ?? 0) > 0 })
        .eq('id', user.id)
    }
    // 4. Navigate — if budgeting is now off and estimates are missing, prompt user
    if (user && (trackingAssets?.length ?? 0) === 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('net_monthly_income, estimated_monthly_expenses')
        .eq('id', user.id)
        .single()
      const needsEstimates = !profile?.net_monthly_income || !profile?.estimated_monthly_expenses
      router.push(needsEstimates ? '/core?showEstimates=true' : '/core/assets')
    } else {
      router.push('/core/assets')
    }
  }

  async function detectPatterns() {
    if (!accountId) return
    setDetectingPatterns(true)
    try {
      const res = await fetch(
        `/api/detect-recurring?account_id=${accountId}&min_confidence=medium`,
      )
      if (res.ok) {
        const json = await res.json()
        const detected: DetectedPattern[] = json.detected ?? []
        setDetectedPatterns(detected.filter((d) => !d.alreadyExists))
        setShowDetectModal(true)
      }
    } finally {
      setDetectingPatterns(false)
    }
  }

  async function acceptPattern(pattern: DetectedPattern) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('recurring_transactions').insert({
      user_id: user.id,
      account_id: accountId,
      name: pattern.counterpartyName,
      amount: pattern.averageAmount,
      frequency: pattern.frequency,
      day_of_month: pattern.dayOfMonth,
      day_of_week: pattern.dayOfWeek,
      start_date: new Date().toISOString().split('T')[0],
      budget_id: pattern.matchedBudgetId,
      is_active: true,
      sort_order: recurrings.length,
    })
    setDetectedPatterns((prev) => prev.filter((p) => p.key !== pattern.key))
    loadRecurrings()
  }

  if (loading) {
    return (
      <div className={embedded ? '' : 'mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12'}>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error || !account) {
    return (
      <div className={embedded ? '' : 'mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12'}>
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error ?? 'Rekening niet gevonden'}</p>
          {!embedded && (
            <Link href={backHref} className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700">
              <ArrowLeft className="h-4 w-4" />
              Terug naar {backLabel}
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={embedded ? '' : 'mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8'}>
      {/* Back button */}
      {!embedded && (
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-sm font-medium text-[var(--ink-2)] shadow-[var(--s0)] transition-all hover:shadow-[var(--s1)] hover:text-[var(--ink)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}

      {/* Account header */}
      <section className="rounded-[var(--r-lg)] border border-kern-200 card-editorial p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--r-lg)] bg-kern-100">
              <Wallet className="h-5 w-5 text-kern-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-[var(--ink)]">{account.name}</h1>
                {isCombined && (
                  <span className="rounded-full bg-kern-100 px-2 py-0.5 text-[10px] font-medium text-kern-700">
                    {allAccounts.length} rekeningen
                  </span>
                )}
                {!isCombined && (
                  <div className="relative">
                    <button
                      onClick={() => setShowSettingsMenu(v => !v)}
                      className="rounded-[var(--r)] p-1.5 text-[var(--ink-3)] hover:bg-kern-100 hover:text-kern-600"
                      title="Instellingen"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {showSettingsMenu && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowSettingsMenu(false)} />
                        <div className="absolute left-0 top-full z-40 mt-1 w-56 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] py-1 shadow-lg">
                          <button
                            onClick={() => { setShowSettingsMenu(false); setShowAssetEdit(true) }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                          >
                            <Settings2 className="h-4 w-4" />
                            Rekening bewerken
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              {!isCombined && (
                <div className="flex items-center gap-2">
                  {account.iban && (
                    <p className="text-xs text-[var(--ink-3)]">{account.iban}</p>
                  )}
                  {account.bank_name && (
                    <span className="text-xs text-[var(--ink-3)]">
                      {account.iban ? '\u00B7' : ''} {account.bank_name}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">{isCombined ? 'Totaal saldo' : 'Saldo'}</p>
            <p className="text-2xl font-bold text-[var(--ink)]">
              {formatCurrency(Number(account.balance))}
            </p>
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
          {!isCombined && (
            <button
              onClick={() => { setEditTransaction(null); setShowForm(true) }}
              className="inline-flex items-center gap-2 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
            >
              <Plus className="h-4 w-4" />
              Nieuwe transactie
            </button>
          )}
          {allAccounts.length >= 2 && (
            <button
              onClick={() => setShowManualTransfer(true)}
              className="inline-flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              <ArrowLeftRight className="h-4 w-4" />
              Overboeking
            </button>
          )}
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

      {/* Bank connections */}
      {gcEnabled && (
        <section className="mt-3 sm:mt-6">
          <button
            onClick={() => setShowBankConnections((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
          >
            {showBankConnections ? <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />}
            <Link2 className="h-4 w-4 text-kern-500" />
            <span className="text-sm font-semibold text-[var(--ink-2)]">Bankverbindingen</span>
            <span className="ml-auto text-xs text-[var(--ink-3)]">{gcAccounts.length} gekoppeld</span>
          </button>

          {showBankConnections && (
            <div className="mt-2 space-y-3">
              {gcAccounts.map((acc) => (
                <ConnectedAccountCard
                  key={acc.id}
                  account={acc}
                  onSync={() => { loadAccount(); loadGcAccounts() }}
                  onDisconnect={() => loadGcAccounts()}
                  onReauthorize={() => router.push('/core/cash/connect')}
                />
              ))}
              {!isCombined && gcAccounts.length === 0 ? (
                <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] px-4 py-6 text-center">
                  <Link2 className="mx-auto mb-2 h-6 w-6 text-[var(--ink-4)]" />
                  <p className="text-sm font-medium text-[var(--ink-2)]">Nog niet gekoppeld</p>
                  <p className="mt-1 text-xs text-[var(--ink-3)]">Koppel deze rekening via TrueLayer om automatisch transacties te importeren.</p>
                  <Link
                    href="/core/cash/connect"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-kern-700"
                  >
                    <Plus className="h-4 w-4" />
                    Bank koppelen
                  </Link>
                </div>
              ) : (isCombined || gcAccounts.length > 0) && (
                <Link
                  href="/core/cash/connect"
                  className="flex items-center justify-center gap-2 rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-kern-300 hover:bg-kern-50 hover:text-kern-700"
                >
                  <Plus className="h-4 w-4" />
                  Bank koppelen
                </Link>
              )}
            </div>
          )}
        </section>
      )}

      {/* Pending transfer banner */}
      {(() => {
        const pendingTransfers = transactions.filter(
          (t) =>
            t.transaction_type !== 'transfer' &&
            t.transaction_type !== 'joint_transfer' &&
            !t.budget_id &&
            !!t.counterparty_iban &&
            isOwnAccountTransfer(t.counterparty_iban, ownIbans)
        )
        if (pendingTransfers.length === 0) return null
        return (
          <div className="mt-3 sm:mt-6">
            <PendingTransferBanner
              count={pendingTransfers.length}
              onReview={() => setReviewTransferTxs(pendingTransfers)}
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

      {/* Per-partner freedom time breakdown — household perspective */}
      {partnerExpenseBreakdown && (
        <div className="mt-2 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3" data-testid="partner-freedom-breakdown">
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="h-3.5 w-3.5 text-kern-500" />
            <p className="text-xs font-semibold text-[var(--ink-2)]">Vrijheidstijd per partner</p>
            <span className="ml-auto text-[10px] text-[var(--ink-4)]">{SPLIT_MODE_LABELS[partnerExpenseBreakdown.splitMode]}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase truncate">{partnerExpenseBreakdown.myName}</p>
              <p className="mt-0.5 text-sm font-semibold font-mono tabular-nums text-[var(--ink)]">
                {formatCurrencyShort(partnerExpenseBreakdown.myShareAmount + partnerExpenseBreakdown.personalExpenses)}
              </p>
              <p className="text-[10px] text-red-400/70">
                {partnerExpenseBreakdown.myFreedomDays.totalDays.toFixed(1)} dagen
              </p>
              <p className="text-[9px] text-[var(--ink-4)]">{partnerExpenseBreakdown.mySharePct}% gedeeld</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase truncate">{partnerExpenseBreakdown.partnerName}</p>
              <p className="mt-0.5 text-sm font-semibold font-mono tabular-nums text-[var(--ink)]">
                {formatCurrencyShort(partnerExpenseBreakdown.partnerShareAmount)}
              </p>
              <p className="text-[10px] text-red-400/70">
                {partnerExpenseBreakdown.partnerFreedomDays.totalDays.toFixed(1)} dagen
              </p>
              <p className="text-[9px] text-[var(--ink-4)]">{100 - partnerExpenseBreakdown.mySharePct}% gedeeld</p>
            </div>
          </div>
        </div>
      )}

      {/* Uncategorized transactions banner */}
      {uncatTx.length > 0 && (
        <div className="mt-3 sm:mt-6">
          <UncategorizedTransactionsBanner
            count={uncatTx.length}
            totalAmount={uncatTx.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)}
            onClick={() => setShowAICategorize(true)}
            formatCurrency={(v) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)}
          />
        </div>
      )}

      {/* Sankey flow diagram */}
      <FeatureGate featureId="cashflow_sankey" fallback="hidden">
      {sankeyData && sankeyData.nodes.length > 0 && (
        <section className="mt-3 sm:mt-6">
          <button
            onClick={() => setShowSankey((v) => !v)}
            className="flex w-full items-center gap-2 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
          >
            {showSankey ? <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />}
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
      </FeatureGate>

      {/* Tab strip */}
      <div className="mt-3 sm:mt-6 flex border-b border-[var(--border-ed)]">
        {([
          { id: 'transacties' as const, label: 'Transacties' },
          { id: 'kalender' as const, label: 'Kalender' },
        ]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={[
              'px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] border-b-[3px] -mb-px transition-colors',
              activeTab === id
                ? 'border-kern-600 text-kern-700'
                : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'transacties' && (
      <>
      {/* Recurring transactions */}
      <section className="mt-3 sm:mt-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRecurring((v) => !v)}
            className="flex flex-1 items-center gap-2 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
          >
            {showRecurring ? <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />}
            <Repeat className="h-4 w-4 text-kern-500" />
            <span className="text-sm font-semibold text-[var(--ink-2)]">Terugkerende boekingen</span>
            {recurrings.length > 0 && (
              <span className="ml-auto text-xs text-[var(--ink-3)]">
                {formatCurrencyShort(getExpectedMonthlyTotal(recurrings))}/mnd
              </span>
            )}
          </button>
          {!isCombined && (
            <button
              onClick={detectPatterns}
              disabled={detectingPatterns}
              title="Detecteer terugkerende patronen"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] transition-colors hover:bg-kern-50 hover:text-kern-600 disabled:opacity-50"
            >
              {detectingPatterns ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-kern-400 border-t-transparent" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            onClick={() => setShowCategoryRules(true)}
            title="Categorisatieregels beheren"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
          >
            <Tag className="h-4 w-4" />
          </button>
        </div>

        {showRecurring && recurrings.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
            {recurrings.map((r, idx) => {
              const amount = Number(r.amount)
              const isPositive = amount > 0
              const nextDate = getNextOccurrence(r)
              const budget = r.budget_id ? budgets.find(b => b.id === r.budget_id) : undefined

              return (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 px-4 py-3 ${idx < recurrings.length - 1 ? 'border-b border-[var(--border-ed)]' : ''}`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] ${isPositive ? 'bg-kern-50' : 'bg-zinc-100'}`}>
                    {budget ? (
                      <BudgetIcon name={budget.icon} className={`h-4 w-4 ${isPositive ? 'text-kern-600' : 'text-[var(--ink-3)]'}`} />
                    ) : (
                      <Repeat className={`h-4 w-4 ${isPositive ? 'text-kern-600' : 'text-[var(--ink-3)]'}`} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--ink)]">{r.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--ink-3)]">{formatSchedule(r)}</span>
                      {nextDate && (
                        <span className="text-xs text-[var(--ink-3)]">
                          · {nextDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      {isCombined && (() => {
                        const acctName = allAccounts.find(a => a.id === r.account_id)?.name
                        return acctName ? (
                          <span className="rounded bg-kern-50 border border-kern-200 px-1.5 py-px text-[9px] font-medium text-kern-600">
                            {acctName}
                          </span>
                        ) : null
                      })()}
                    </div>
                  </div>
                  {budget && (
                    <span className="hidden shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-[var(--ink-2)] sm:inline-block">
                      {budget.name}
                    </span>
                  )}
                  <span className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${isPositive ? 'text-[var(--hor-t)]' : 'text-[var(--ink)]'}`}>
                    {isPositive ? '+' : ''}{formatCurrency(amount)}
                  </span>
                  <button
                    onClick={() => setEditRecurring(r)}
                    className="shrink-0 rounded p-1 text-[var(--ink-4)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
                    title="Bewerken"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {showRecurring && recurrings.length === 0 && (
          <div className="mt-2 rounded-[var(--r-lg)] border border-dashed border-[var(--border-ed)] py-5 text-center">
            <Repeat className="mx-auto mb-2 h-5 w-5 text-[var(--ink-4)]" />
            <p className="text-xs text-[var(--ink-4)]">Geen terugkerende boekingen</p>
            {!isCombined && (
              <button
                onClick={detectPatterns}
                disabled={detectingPatterns}
                className="mt-2 text-xs text-kern-600 hover:underline disabled:opacity-50"
              >
                Detecteer patronen automatisch
              </button>
            )}
          </div>
        )}
      </section>

      {/* Cashflow Prognose */}
      <FeatureGate featureId="cashflow_forecast" fallback="hidden">
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
          <select
            value={filterBudgetId}
            onChange={(e) => setFilterBudgetId(e.target.value)}
            className="rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm text-[var(--ink-2)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
            data-testid="filter-budget"
          >
            <option value="all">Alle categorie&#235;n</option>
            <option value="uncategorized">Niet gecategoriseerd</option>
            {budgets
              .filter((b) => !b.parent_id || Number(b.default_limit) > 0)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.parent_id ? `  ${b.name}` : b.name}
                </option>
              ))}
          </select>
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
        {hasActiveFilters && (
          <div className="mt-2 flex items-center gap-2 text-xs text-[var(--ink-3)]" data-testid="filter-summary">
            <Filter className="h-3.5 w-3.5" />
            <span>{filteredTransactions.length} van {transactions.length} transacties</span>
          </div>
        )}
      </section>

      {/* Transaction list */}
      {/* Partner privacy notice + category totals for 'totals' mode */}
      {perspective === 'household' && isPartnerTxTotals && partnerCategorySummary && (
        <section className="mt-3 sm:mt-6" data-testid="partner-tx-privacy-summary">
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-[var(--ink-3)]" />
              <h3 className="text-sm font-semibold text-[var(--ink-2)]">Partner transacties — Totalen</h3>
              <span className="ml-auto text-[10px] text-[var(--ink-4)]">{partnerCategorySummary.transactionCount} transacties</span>
            </div>
            <p className="mb-3 text-xs text-[var(--ink-3)]">
              Je partner deelt alleen totalen. Individuele transacties zijn niet zichtbaar.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-[var(--r)] border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-600">Inkomsten</p>
                <p className="text-sm font-semibold text-emerald-700 font-mono tabular-nums">
                  {partnerCategorySummary.totalIncome > 0 ? (
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5" />
                      +{formatCurrencyShort(partnerCategorySummary.totalIncome)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[var(--ink-3)]">
                      <Minus className="h-3.5 w-3.5" />
                      Geen
                    </span>
                  )}
                </p>
              </div>
              <div className="rounded-[var(--r)] border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-red-600">Uitgaven</p>
                <p className="text-sm font-semibold text-red-700 font-mono tabular-nums">
                  {partnerCategorySummary.totalExpenses > 0 ? (
                    <span className="flex items-center gap-1">
                      <TrendingDown className="h-3.5 w-3.5" />
                      −{formatCurrencyShort(partnerCategorySummary.totalExpenses)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[var(--ink-3)]">
                      <Minus className="h-3.5 w-3.5" />
                      Geen
                    </span>
                  )}
                </p>
              </div>
            </div>
            {/* Category totals */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-4)]">Per categorie</p>
              {partnerCategorySummary.categories.map((cat) => {
                const pct = partnerCategorySummary.totalExpenses > 0
                  ? Math.round((Math.abs(cat.total) / partnerCategorySummary.totalExpenses) * 100)
                  : 0
                const isNeg = cat.total < 0
                return (
                  <div key={cat.name} className="flex items-center justify-between rounded-lg bg-[var(--subtle)] px-3 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-[var(--ink-2)] truncate">{cat.name}</span>
                      <span className="text-[10px] text-[var(--ink-4)]">{cat.count}×</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isNeg && pct > 0 && (
                        <div className="h-1 rounded-full bg-red-200" style={{ width: `${Math.max(pct * 0.6, 4)}px` }} />
                      )}
                      <span className={`text-xs font-medium font-mono tabular-nums ${isNeg ? 'text-red-600' : 'text-emerald-600'}`}>
                        {isNeg ? '−' : '+'}{formatCurrencyShort(Math.abs(cat.total))}
                      </span>
                      {isNeg && pct > 0 && (
                        <span className="text-[10px] text-[var(--ink-4)]">{pct}%</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Partner privacy hidden notice */}
      {perspective === 'household' && isPartnerTxHidden && (
        <section className="mt-3 sm:mt-6">
          <PrivacyHiddenNotice hiddenCategories={hiddenCategories} forCategories={['transactions']} />
        </section>
      )}

      {/* Privacy notice for hidden transaction data (Feature #537) */}
      {isPartnerTxHidden && (
        <div className="mt-3 sm:mt-4">
          <PrivacyHiddenNotice hiddenCategories={hiddenCategories} forCategories={['transactions']} />
        </div>
      )}
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
              const dateLabel = dateObj.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })

              return (
                <div key={dateStr}>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--ink-3)]">{dateLabel}</h3>
                  <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
                    {dateTxs.map((tx, idx) => {
                      const budget = getBudgetForId(tx.budget_id)
                      const amount = Number(tx.amount)
                      const isPositive = amount > 0
                      const isTransfer = tx.transaction_type === 'transfer'
                      const isPendingTransfer = !isTransfer && tx.transaction_type !== 'joint_transfer' && !tx.budget_id && !!tx.counterparty_iban && isOwnAccountTransfer(tx.counterparty_iban, ownIbans)
                      const isSplitTx = !!tx.is_split
                      const isExpanded = expandedSplitId === tx.id
                      const loadedSplits = splitsByTxId[tx.id]

                      return (
                        <div key={tx.id} className={idx < dateTxs.length - 1 ? 'border-b border-[var(--border-ed)]' : ''}>
                        <div
                          onClick={() => {
                            if (isPendingTransfer) {
                              setReviewTransferTxs([tx])
                            } else if (!isTransfer) {
                              setEditTransaction(tx)
                              setShowForm(true)
                            }
                          }}
                          className={`flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-[var(--subtle)] ${isPendingTransfer ? 'border-l-2 border-[var(--hor)]' : ''} ${isSplitTx ? 'border-l-2 border-kern-300' : ''}`}
                        >
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] ${
                            isTransfer ? 'bg-[var(--subtle)] border border-[var(--border-ed)]'
                            : isPendingTransfer ? 'bg-[var(--hor-l)] border border-[var(--hor-m)]'
                            : isPositive ? 'bg-emerald-50' : 'bg-zinc-100'
                          }`}>
                            {isTransfer ? <ArrowLeftRight className="h-4 w-4 text-[var(--ink-3)]" />
                            : isPendingTransfer ? <HelpCircle className="h-4 w-4 text-[var(--hor-t)]" />
                            : budget ? <BudgetIcon name={budget.icon} className={`h-4 w-4 ${isPositive ? 'text-emerald-500' : 'text-[var(--ink-3)]'}`} />
                            : <Tag className={`h-4 w-4 ${isPositive ? 'text-emerald-500' : 'text-[var(--ink-3)]'}`} />}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className={`truncate text-sm font-medium ${isTransfer ? 'text-[var(--ink-2)]' : 'text-[var(--ink)]'}`}>
                                {isTransfer ? 'Eigen overboeking' : tx.description}
                              </p>
                              {isSplitTx && <GitFork className="h-3 w-3 shrink-0 text-kern-400" aria-label="Gesplitste transactie" />}
                            </div>
                            <p className="truncate text-xs text-[var(--ink-3)]">
                              {isTransfer && tx.counterparty_name
                                ? `${tx.counterparty_name}${tx.counterparty_iban ? ' \u00B7 ' + tx.counterparty_iban.slice(-4) : ''}`
                                : tx.counterparty_name ?? ''}
                              {isCombined && (() => {
                                const acctName = allAccounts.find(a => a.id === tx.account_id)?.name
                                return acctName ? (
                                  <span className="ml-1.5 inline-flex rounded bg-kern-50 border border-kern-200 px-1.5 py-px text-[9px] font-medium text-kern-600 align-middle">
                                    {acctName}
                                  </span>
                                ) : null
                              })()}
                            </p>
                          </div>

                          {isTransfer ? (
                            <span className="hidden shrink-0 rounded-full bg-[var(--subtle)] border border-[var(--border-ed)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[.06em] text-[var(--ink-3)] sm:inline-block">Overboeking</span>
                          ) : isPendingTransfer ? (
                            <span className="hidden shrink-0 rounded-full bg-[var(--hor-l)] border border-[var(--hor-m)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[.06em] text-[var(--hor-t)] sm:inline-block">Controleer</span>
                          ) : budget ? (
                            <span className="hidden shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-[var(--ink-2)] sm:inline-block">{budget.name}</span>
                          ) : isSplitTx ? (
                            <span className="hidden shrink-0 rounded-full bg-kern-50 border border-kern-200 px-2.5 py-0.5 text-xs font-medium text-kern-700 sm:inline-flex items-center gap-1"><GitFork className="h-3 w-3" />Verdeeld over budgetten</span>
                          ) : (
                            <span className="hidden shrink-0 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-600 sm:inline-block">Niet gecategoriseerd</span>
                          )}

                          <div className="shrink-0 text-right">
                            <span className={`font-mono text-sm font-semibold tabular-nums ${
                              isTransfer || isPendingTransfer ? 'text-[var(--ink-2)]' : isPositive ? 'text-emerald-600' : 'text-[var(--ink)]'
                            }`}>
                              {!isTransfer && !isPendingTransfer && (isPositive ? '+' : '')}{formatCurrency(amount)}
                            </span>
                            {!isTransfer && !isPendingTransfer && dailyExpenses > 0 && (
                              <>
                                <p className={`text-[10px] leading-tight ${isPositive ? 'text-emerald-500/60' : 'text-[var(--ink-3)]'}`} data-testid="tx-freedom-time">
                                  {(() => {
                                    const fd = calculateFreedomTime(Math.abs(amount), dailyExpenses)
                                    const fdStr = fd.totalDays < 1
                                      ? `${fd.totalDays.toFixed(1)} dagen`
                                      : formatFreedomTimeString(fd, 'short', true)
                                    return isPositive ? `${fdStr} verdiend` : fdStr
                                  })()}
                                </p>
                                {tx.ownership === 'shared' && householdSplit && !isPositive && (
                                  <p className="text-[9px] leading-tight text-kern-500/70" data-testid="tx-partner-split">
                                    {householdSplit.myName.split(' ')[0]} {(Math.abs(amount) * householdSplit.mySharePct / 100 / dailyExpenses).toFixed(1)}d · {householdSplit.partnerName.split(' ')[0]} {(Math.abs(amount) * (100 - householdSplit.mySharePct) / 100 / dailyExpenses).toFixed(1)}d
                                  </p>
                                )}
                              </>
                            )}
                          </div>

                          {isSplitTx && (
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation()
                                if (isExpanded) {
                                  setExpandedSplitId(null)
                                } else {
                                  setExpandedSplitId(tx.id)
                                  if (!splitsByTxId[tx.id]) {
                                    const supabase = createClient()
                                    const { data } = await supabase
                                      .from('transaction_splits')
                                      .select('id, budget_id, amount, description')
                                      .eq('transaction_id', tx.id)
                                      .order('created_at', { ascending: true })
                                    setSplitsByTxId(prev => ({ ...prev, [tx.id]: (data ?? []) as SplitRow[] }))
                                  }
                                }
                              }}
                              className="shrink-0 rounded p-1 text-[var(--ink-4)] hover:bg-kern-50 hover:text-kern-600"
                              title={isExpanded ? 'Verberg splits' : 'Toon splits'}
                            >
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>

                        {isSplitTx && isExpanded && (
                          <div className="border-t border-dashed border-kern-200 bg-kern-50/30 px-4 py-2 space-y-1">
                            {!loadedSplits ? (
                              <p className="text-xs text-[var(--ink-3)] py-1">Laden&#8230;</p>
                            ) : loadedSplits.length === 0 ? (
                              <p className="text-xs text-[var(--ink-3)] py-1">Geen splits gevonden</p>
                            ) : (
                              loadedSplits.map(split => {
                                const splitBudget = split.budget_id ? budgets.find(b => b.id === split.budget_id) : undefined
                                return (
                                  <div key={split.id} className="flex items-center gap-2 py-0.5">
                                    <GitFork className="h-3 w-3 shrink-0 text-kern-300" />
                                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--ink-2)]">
                                      {split.description || splitBudget?.name || 'Onbekend'}
                                    </span>
                                    {splitBudget && (
                                      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-[var(--ink-3)]">
                                        {splitBudget.name}
                                      </span>
                                    )}
                                    <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink-2)]">
                                      {formatCurrency(Number(split.amount))}
                                    </span>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
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
      </>
      )}

      {/* Settlement — household only */}
      {activeTab === 'transacties' && perspective === 'household' && hasHousehold && householdId && currentUserId && (
        <section className="mt-3 sm:mt-6" data-testid="settlement-section">
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <div className="mb-4 flex items-center gap-2 border-b border-[var(--border-ed)] pb-3">
              <div className="h-3 w-[3px] rounded-full bg-wil-500" />
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">Verrekening</h3>
            </div>
            <SettlementOverview
              householdId={householdId}
              currentUserId={currentUserId}
              members={householdMembers}
            />
          </div>
        </section>
      )}

      {activeTab === 'kalender' && (
        <section className="mt-3 sm:mt-6" data-testid="bill-calendar-section">
          <BillCalendar
            recurrings={recurrings}
            transactions={transactions.map((tx): CalendarTransaction => ({
              id: tx.id,
              date: tx.date,
              amount: tx.amount,
              description: tx.description,
              counterparty_name: tx.counterparty_name,
              transaction_type: tx.transaction_type,
              budget_id: tx.budget_id,
            }))}
            monthDate={monthDate}
            currentBalance={account.balance}
          />
        </section>
      )}

      {/* Transaction form modal */}
      {showForm && (
        <TransactionForm
          transaction={editTransaction ?? undefined}
          accountId={editTransaction?.account_id ?? accountId ?? allAccounts[0]?.id ?? ''}
          budgetGroups={budgetGroups}
          onClose={() => { setShowForm(false); setEditTransaction(null) }}
          onSaved={() => {
            setShowForm(false)
            setEditTransaction(null)
            loadTransactions()
            loadRecurrings()
          }}
        />
      )}

      {/* Asset edit modal */}
      {showAssetEdit && linkedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAssetEdit(false)}>
          <div
            className="w-full max-w-lg rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[var(--ink)]">Rekening bewerken</h3>
              <button onClick={() => setShowAssetEdit(false)} className="rounded-[var(--r)] p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <AssetEditForm
              asset={linkedAsset}
              saving={assetSaving}
              onSave={handleSaveAsset}
              onCancel={() => setShowAssetEdit(false)}
              onDisconnect={() => { setShowAssetEdit(false); handleDisconnectTracking() }}
            />
          </div>
        </div>
      )}

      {/* Transfer confirm sheet */}
      {reviewTransferTxs.length > 0 && (
        <TransferConfirmSheet
          transactions={reviewTransferTxs}
          matchedAccounts={new Map(
            reviewTransferTxs
              .filter(rtx => rtx.counterparty_iban)
              .map(rtx => {
                const iban = rtx.counterparty_iban!.replace(/\s/g, '').toUpperCase()
                const acc = allAccounts.find(a => a.iban?.replace(/\s/g, '').toUpperCase() === iban)
                return [rtx.id, acc ? { name: acc.name, iban: acc.iban } : null] as const
              })
              .filter((entry): entry is readonly [string, { name: string; iban: string | null }] => entry[1] !== null)
          )}
          budgetGroups={budgetGroups.filter(g => g.parent.budget_type !== 'archive')}
          onClose={() => setReviewTransferTxs([])}
          onConfirmed={() => {
            loadTransactions()
            setReviewTransferTxs([])
          }}
        />
      )}

      {/* Recurring edit sheet */}
      {editRecurring && (
        <RecurringEditSheet
          recurring={editRecurring}
          budgets={budgets}
          onClose={() => setEditRecurring(null)}
          onSaved={loadRecurrings}
        />
      )}

      {/* Category rules sheet */}
      {showCategoryRules && (
        <CategoryRulesSheet
          budgets={budgets}
          onClose={() => setShowCategoryRules(false)}
        />
      )}

      {/* Manual transfer sheet */}
      {showManualTransfer && (
        <ManualTransferSheet
          accounts={allAccounts}
          onClose={() => setShowManualTransfer(false)}
          onSaved={() => {
            setShowManualTransfer(false)
            void loadTransactions()
          }}
        />
      )}

      {/* AI categorize sheet */}
      {showAICategorize && (
        <AICategorizeSheet
          transactions={uncatTx}
          budgets={budgets}
          budgetGroups={budgetGroups}
          onClose={() => setShowAICategorize(false)}
          onSaved={() => { void loadTransactions(); setShowAICategorize(false) }}
        />
      )}

      {/* Detect patronen modal */}
      {showDetectModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={() => setShowDetectModal(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-lg overflow-y-auto rounded-t-[var(--r-lg)] bg-[var(--paper)] p-5 sm:rounded-[var(--r-lg)]"
            style={{ maxHeight: '90dvh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Automatisch detecteren</p>
                <h2 className="mt-0.5 text-base font-semibold text-[var(--ink)]">Gevonden patronen</h2>
              </div>
              <button
                onClick={() => setShowDetectModal(false)}
                className="rounded-[var(--r-sm)] p-1.5 text-[var(--ink-4)] hover:bg-[var(--subtle)] hover:text-[var(--ink-3)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detectedPatterns.length === 0 ? (
              <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] py-8 text-center">
                <p className="text-sm text-[var(--ink-3)]">Geen nieuwe patronen gevonden</p>
                <p className="mt-1 text-xs text-[var(--ink-4)]">Voeg meer transacties toe om patronen te ontdekken</p>
              </div>
            ) : (
              <div className="space-y-2">
                {detectedPatterns.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">{p.counterpartyName}</p>
                      <p className="mt-0.5 font-sans text-xs text-[var(--ink-3)]">{p.frequency} · dag {p.dayOfMonth ?? p.dayOfWeek}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-medium tabular-nums text-[var(--ink)]">{formatCurrency(Math.abs(p.averageAmount))}</p>
                      <p className="font-sans text-[10px] text-[var(--ink-4)]">{p.isIncome ? 'inkomsten' : 'uitgave'}</p>
                    </div>
                    <button
                      onClick={() => acceptPattern(p)}
                      className="shrink-0 rounded-[var(--r)] bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700"
                    >
                      Toevoegen
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 text-right">
              <button
                onClick={() => setShowDetectModal(false)}
                className="rounded-[var(--r)] border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Lightweight inline form for editing the linked asset */
function AssetEditForm({
  asset,
  saving,
  onSave,
  onCancel,
  onDisconnect,
}: {
  asset: { id: string; name: string; current_value: number; institution: string | null; account_number: string | null; subtype: string | null; net_worth_inclusion_pct: number }
  saving: boolean
  onSave: (data: { name: string; current_value: number; iban: string; bank_name: string; subtype: string; net_worth_inclusion_pct: number }) => void
  onCancel: () => void
  onDisconnect: () => void
}) {
  const [name, setName] = useState(asset.name)
  const [currentValue, setCurrentValue] = useState(String(asset.current_value))
  const [iban, setIban] = useState(asset.account_number ?? '')
  const [bankName, setBankName] = useState(asset.institution ?? '')
  const [subtype, setSubtype] = useState(asset.subtype ?? 'checking')
  const [nwPct, setNwPct] = useState(String(asset.net_worth_inclusion_pct ?? 100))
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Naam</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huidig saldo</label>
          <input
            type="number"
            value={currentValue}
            onChange={(e) => setCurrentValue(e.target.value)}
            className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm font-mono tabular-nums"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">IBAN</label>
          <input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
            placeholder="NL00 BANK 0000 0000 00"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Bank naam</label>
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Type</label>
          <select
            value={subtype}
            onChange={(e) => setSubtype(e.target.value)}
            className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Net worth inclusie %</label>
          <input
            type="number"
            min={0}
            max={100}
            value={nwPct}
            onChange={(e) => setNwPct(e.target.value)}
            className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm font-mono tabular-nums"
          />
        </div>
      </div>

      {/* Transacties loskoppelen */}
      <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
        {!confirmDisconnect ? (
          <button
            type="button"
            onClick={() => setConfirmDisconnect(true)}
            className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
          >
            <Unlink className="h-3.5 w-3.5" />
            Budgetteren uitschakelen
          </button>
        ) : (
          <div>
            <p className="text-xs text-[var(--ink-2)]">
              De rekening wordt weer een gewone asset zonder transacties en budgetten.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onDisconnect}
                className="rounded-[var(--r)] bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Bevestigen
              </button>
              <button
                type="button"
                onClick={() => setConfirmDisconnect(false)}
                className="rounded-[var(--r)] border border-[var(--border-md)] px-3 py-1.5 text-xs text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              >
                Annuleren
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="rounded-[var(--r)] border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
        >
          Annuleren
        </button>
        <button
          onClick={() => onSave({
            name,
            current_value: Number(currentValue) || 0,
            iban,
            bank_name: bankName,
            subtype,
            net_worth_inclusion_pct: Number(nwPct) ?? 100,
          })}
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-2 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
      </div>
    </div>
  )
}
