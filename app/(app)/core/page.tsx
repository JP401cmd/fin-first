'use client'

import { useEffect, useState, useCallback } from 'react'
import { FhinAvatar } from '@/components/app/avatars'
import { computeCoreData, type CoreData } from '@/lib/mock-data'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, BudgetIcon } from '@/components/app/budget-shared'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { shouldAlert } from '@/lib/budget-alerts'
import type { Budget } from '@/lib/budget-data'
import type { NetWorthSnapshot } from '@/lib/net-worth-data'
import {
  TrendingUp, Wallet, ShoppingCart,
  PiggyBank, Building2, ArrowRight, Info, Camera, Download, ChevronDown, Receipt, Flag,
  CheckCircle2, AlertTriangle, TrendingDown, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react'
import { FeatureGate } from '@/components/app/feature-gate'
import { DiscoverCarousel } from '@/components/app/discover-carousel'
import { LockedFeaturesFooter } from '@/components/app/locked-features-footer'
import { NextStepSection, computeAllKernSteps } from '@/components/app/next-step-card'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'
import { SparklineWithLabel, type SparklineDataPoint } from '@/components/app/budget-sparkline'
import { NetWorthProjectionChart } from '@/components/app/net-worth-projection-chart'
import { computeNetWorthProjection, type NetWorthProjectionResult } from '@/lib/net-worth-projection'
import { SpendingInsightsSection, type SpendingInsight } from '@/components/app/spending-insight-card'
import { SnapshotComparisonView } from '@/components/app/snapshot-comparison-view'
import { buildSegments, groupColor, childColor } from '@/components/app/budget-donut'
import type { BudgetWithChildren } from '@/lib/budget-data'
import { FullScreenModal } from '@/components/app/full-screen-modal'
import { BottomSheet } from '@/components/app/bottom-sheet'
import dynamic from 'next/dynamic'

const DynCashPage = dynamic(() => import('@/app/(app)/core/cash/page'), {
  loading: () => <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" /></div>,
})
const DynBudgetsPage = dynamic(() => import('@/app/(app)/core/budgets/page'), {
  loading: () => <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" /></div>,
})
const DynAssetsPage = dynamic(() => import('@/app/(app)/core/assets/page'), {
  loading: () => <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" /></div>,
})
const DynDebtsPage = dynamic(() => import('@/app/(app)/core/debts/page'), {
  loading: () => <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" /></div>,
})

export default function CorePage() {
  const router = useRouter()
  const [data, setData] = useState<CoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alertBudgets, setAlertBudgets] = useState<{ budget: Budget; spent: number; limit: number }[]>([])
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([])
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [incomeMonths, setIncomeMonths] = useState(12)
  const [savingsRate12, setSavingsRate12] = useState(0)
  const [savingsRateMonths, setSavingsRateMonths] = useState(12)
  const [budgetCount, setBudgetCount] = useState(0)
  const [hasTransactions, setHasTransactions] = useState(false)
  const [earnedBadges, setEarnedBadges] = useState<{ slug: string; earned_at: string }[]>([])
  const [debtProgress, setDebtProgress] = useState<{ totalOriginal: number; totalCurrent: number; progressPct: number } | null>(null)
  const [assetGrowthDirection, setAssetGrowthDirection] = useState<'up' | 'down' | 'flat'>('flat')
  const [overBudgetCount, setOverBudgetCount] = useState(0)
  const [budgetSparklines, setBudgetSparklines] = useState<{ id: string; name: string; icon: string; budgetType: string; data: SparklineDataPoint[] }[]>([])
  const [nwProjection, setNwProjection] = useState<NetWorthProjectionResult | null>(null)
  const [spendingInsights, setSpendingInsights] = useState<SpendingInsight[]>([])
  const [spendingInsightsLoading, setSpendingInsightsLoading] = useState(false)
  const [spendingInsightsDataMonths, setSpendingInsightsDataMonths] = useState(0)
  const [spendingInsightsMessage, setSpendingInsightsMessage] = useState<string>('')
  const [spendingInsightsHasData, setSpendingInsightsHasData] = useState(false)
  // Smart prioritization state (Feature #255)
  const [hasGoals, setHasGoals] = useState(false)
  const [fireUnreachable, setFireUnreachable] = useState(false)
  // Budget progress for hero
  const [totalBudgetLimit, setTotalBudgetLimit] = useState(0)
  const [totalBudgetSpent, setTotalBudgetSpent] = useState(0)
  const [budgetSpendingHistory, setBudgetSpendingHistory] = useState<{ label: string; spent: number; isProjection: boolean }[]>([])
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  // Modal state
  const [activeModal, setActiveModal] = useState<'cash' | 'budgets' | 'assets' | 'debts' | null>(null)
  const [showProjectionModal, setShowProjectionModal] = useState(false)
  // Kassabon modal state
  const [incomeByMonth, setIncomeByMonth] = useState<{month: string; amount: number}[]>([])
  const [mustExpenseItems, setMustExpenseItems] = useState<{name: string; monthlyAmount: number; annualAmount: number; interval: string}[]>([])
  const [showIncomeReceipt, setShowIncomeReceipt] = useState(false)
  const [showExpenseReceipt, setShowExpenseReceipt] = useState(false)
  const [showSavingsReceipt, setShowSavingsReceipt] = useState(false)
  const [showFireReceipt, setShowFireReceipt] = useState(false)
  // Budget legend state (overview)
  const [overviewBudgetGroups, setOverviewBudgetGroups] = useState<BudgetWithChildren[]>([])
  const [overviewSpending, setOverviewSpending] = useState<Record<string, number>>({})
  const [expandedOverviewGroupId, setExpandedOverviewGroupId] = useState<string | null>(null)
  // Savings rate kassabon data
  const [savingsReceiptData, setSavingsReceiptData] = useState<{extYearlyIncome: number; extYearlyExpenses: number; yearlySavings: number; last12Income: number; last12Expenses: number}>({extYearlyIncome: 0, extYearlyExpenses: 0, yearlySavings: 0, last12Income: 0, last12Expenses: 0})

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()

      // Get current month boundaries
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0]

      // Fetch all in parallel
      const [txResult, assetsResult, debtsResult, income12Result, essentialBudgetsResult, earliestIncomeResult, childBudgetsResult, expense12Result, earliestTxResult] = await Promise.all([
        supabase
          .from('transactions')
          .select('amount')
          .gte('date', monthStart)
          .lt('date', monthEnd),
        supabase
          .from('assets')
          .select('current_value')
          .eq('is_active', true),
        supabase
          .from('debts')
          .select('current_balance')
          .eq('is_active', true),
        supabase
          .from('transactions')
          .select('amount, date')
          .gt('amount', 0)
          .gte('date', twelveMonthsAgo)
          .lt('date', monthEnd),
        supabase
          .from('budgets')
          .select('id, name, default_limit, interval, budget_type, is_essential')
          .eq('is_essential', true)
          .in('budget_type', ['expense'])
          .is('parent_id', null),
        supabase
          .from('transactions')
          .select('date')
          .gt('amount', 0)
          .gte('date', twelveMonthsAgo)
          .order('date', { ascending: true })
          .limit(1),
        supabase
          .from('budgets')
          .select('id, name, parent_id, default_limit, is_essential, interval, budget_type')
          .not('parent_id', 'is', null)
          .not('budget_type', 'in', '("archive","income","savings")'),
        supabase
          .from('transactions')
          .select('amount')
          .lt('amount', 0)
          .gte('date', twelveMonthsAgo)
          .lt('date', monthEnd),
        supabase
          .from('transactions')
          .select('date')
          .gte('date', twelveMonthsAgo)
          .order('date', { ascending: true })
          .limit(1),
      ])

      if (txResult.error) throw txResult.error
      if (assetsResult.error) throw assetsResult.error
      if (debtsResult.error) throw debtsResult.error
      if (income12Result.error) throw income12Result.error
      if (essentialBudgetsResult.error) throw essentialBudgetsResult.error
      if (earliestIncomeResult.error) throw earliestIncomeResult.error
      if (childBudgetsResult.error) throw childBudgetsResult.error
      if (expense12Result.error) throw expense12Result.error
      if (earliestTxResult.error) throw earliestTxResult.error

      // Calculate monthly income & expenses from transactions
      let monthlyIncome = 0
      let monthlyExpenses = 0
      for (const tx of txResult.data) {
        const amt = Number(tx.amount)
        if (amt > 0) monthlyIncome += amt
        else monthlyExpenses += Math.abs(amt)
      }

      // Last 12 months income — extrapolate if less than 12 months of data
      const last12MonthsIncome = income12Result.data.reduce((s, t) => s + Number(t.amount), 0)
      let extrapolatedIncome = last12MonthsIncome
      let actualIncomeMonths = 12
      const earliestIncomeDate = earliestIncomeResult.data?.[0]?.date
      if (earliestIncomeDate && last12MonthsIncome > 0) {
        const earliest = new Date(earliestIncomeDate)
        actualIncomeMonths = Math.max(1,
          (now.getFullYear() - earliest.getFullYear()) * 12 +
          (now.getMonth() - earliest.getMonth()) + 1
        )
        actualIncomeMonths = Math.min(actualIncomeMonths, 12)
        if (actualIncomeMonths < 12) {
          extrapolatedIncome = (last12MonthsIncome / actualIncomeMonths) * 12
        }
      }
      setIncomeMonths(actualIncomeMonths)

      // Group income by month for kassabon
      const incomeMonthMap: Record<string, number> = {}
      for (const tx of income12Result.data) {
        const d = new Date(tx.date)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        incomeMonthMap[key] = (incomeMonthMap[key] ?? 0) + Number(tx.amount)
      }
      const sortedIncomeMonths = Object.entries(incomeMonthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount }))
      setIncomeByMonth(sortedIncomeMonths)

      // Last 12 months expenses & savings rate
      const last12MonthsExpenses = Math.abs(expense12Result.data.reduce((s, t) => s + Number(t.amount), 0))
      const earliestTxDate = earliestTxResult.data?.[0]?.date
      let savingsRateDataMonths = 12
      if (earliestTxDate && (last12MonthsIncome > 0 || last12MonthsExpenses > 0)) {
        const earliest = new Date(earliestTxDate)
        savingsRateDataMonths = Math.max(1,
          (now.getFullYear() - earliest.getFullYear()) * 12 +
          (now.getMonth() - earliest.getMonth()) + 1
        )
        savingsRateDataMonths = Math.min(savingsRateDataMonths, 12)
      }
      const extYearlyIncome = savingsRateDataMonths < 12
        ? (last12MonthsIncome / savingsRateDataMonths) * 12
        : last12MonthsIncome
      const extYearlyExpenses = savingsRateDataMonths < 12
        ? (last12MonthsExpenses / savingsRateDataMonths) * 12
        : last12MonthsExpenses
      const yearlySavings = extYearlyIncome - extYearlyExpenses
      setSavingsRate12(extYearlyIncome > 0 ? (yearlySavings / extYearlyIncome) * 100 : 0)
      setSavingsRateMonths(savingsRateDataMonths)
      setSavingsReceiptData({ extYearlyIncome, extYearlyExpenses, yearlySavings, last12Income: last12MonthsIncome, last12Expenses: last12MonthsExpenses })

      // Yearly must expenses from essential budgets (sum of children per parent)
      const allChildren = childBudgetsResult.data ?? []
      let yearlyMustExpenses = 0
      const expenseItems: {name: string; monthlyAmount: number; annualAmount: number; interval: string}[] = []
      const essentialParentIds = new Set((essentialBudgetsResult.data ?? []).map(b => b.id))

      // A: Essential parent budgets — if they have essential children, only count those; otherwise count all children (backwards compat)
      for (const b of essentialBudgetsResult.data) {
        const children = allChildren.filter(c => c.parent_id === b.id)
        const essentialChildren = children.filter(c => c.is_essential)
        const relevantChildren = essentialChildren.length > 0 ? essentialChildren : children
        const limit = relevantChildren.length > 0
          ? relevantChildren.reduce((sum, c) => sum + Number(c.default_limit), 0)
          : Number(b.default_limit)
        let annual = 0
        if (b.interval === 'monthly') annual = limit * 12
        else if (b.interval === 'quarterly') annual = limit * 4
        else annual = limit
        yearlyMustExpenses += annual
        expenseItems.push({
          name: b.name ?? 'Onbekend budget',
          monthlyAmount: annual / 12,
          annualAmount: annual,
          interval: b.interval ?? 'monthly',
        })
      }

      // B: Essential children of non-essential parents — include them individually
      const EXCLUDED_BUDGET_TYPES = ['archive', 'income', 'savings']
      const orphanEssentialChildren = allChildren.filter(
        c => c.is_essential && !essentialParentIds.has(c.parent_id) && !EXCLUDED_BUDGET_TYPES.includes(c.budget_type ?? '')
      )
      for (const child of orphanEssentialChildren) {
        const childInterval = child.interval ?? 'monthly'
        const childLimit = Number(child.default_limit)
        let annual = 0
        if (childInterval === 'monthly') annual = childLimit * 12
        else if (childInterval === 'quarterly') annual = childLimit * 4
        else annual = childLimit
        yearlyMustExpenses += annual
        expenseItems.push({
          name: child.name ?? 'Onbekend budget',
          monthlyAmount: annual / 12,
          annualAmount: annual,
          interval: childInterval,
        })
      }

      setMustExpenseItems(expenseItems)

      // Total assets
      const totalAssets = assetsResult.data.reduce((s, a) => s + Number(a.current_value), 0)

      // Total debts
      const totalDebts = debtsResult.data.reduce((s, d) => s + Number(d.current_balance), 0)

      const coreData = computeCoreData(monthlyIncome, monthlyExpenses, totalAssets, totalDebts, extrapolatedIncome, yearlyMustExpenses)
      setData(coreData)

      // Compute net worth projection (1-5 year short-term view)
      const netWorth = totalAssets - totalDebts
      const monthlySavings = monthlyIncome - monthlyExpenses
      if (monthlyIncome > 0 || monthlyExpenses > 0 || netWorth !== 0) {
        const projResult = computeNetWorthProjection(netWorth, monthlySavings, coreData.fireTarget)
        setNwProjection(projResult)
      }

      // Set next step data
      setHasTransactions((txResult.data?.length ?? 0) > 0)

      // Compute FIRE reachability for smart prioritization (Feature #255)
      const SWR = 0.04
      const fireTarget = yearlyMustExpenses > 0 ? yearlyMustExpenses / SWR : ((monthlyExpenses * 12) > 0 ? (monthlyExpenses * 12) / SWR : 0)
      if (fireTarget > 0 && netWorth < fireTarget) {
        if (monthlySavings <= 0) {
          setFireUnreachable(true)
        } else {
          const annualReturn = 0.07
          const inflation = 0.02
          const realReturn = (1 + annualReturn) / (1 + inflation) - 1
          const monthlyReturnRate = realReturn / 12
          let projectedNW = netWorth
          let fireMonths = 0
          while (projectedNW < fireTarget && fireMonths < 600) {
            projectedNW = projectedNW * (1 + monthlyReturnRate) + monthlySavings
            fireMonths++
          }
          setFireUnreachable(fireMonths >= 600)
        }
      } else {
        setFireUnreachable(false)
      }

      // Fetch budget alert data + debt progress + asset valuations + goals
      const [budgetResult, spendingResult, snapshotResult, debtFullResult, assetValuationResult, goalsResult] = await Promise.all([
        supabase.from('budgets').select('*'),
        supabase.from('transactions').select('budget_id, amount').gte('date', monthStart).lt('date', monthEnd),
        supabase.from('net_worth_snapshots').select('*').order('snapshot_date', { ascending: true }).limit(24),
        supabase.from('debts').select('current_balance, original_amount').eq('is_active', true),
        supabase.from('valuations').select('value, valuation_date').eq('entity_type', 'asset').order('valuation_date', { ascending: false }).limit(50),
        supabase.from('goals').select('id').limit(1),
      ])

      // Set goals state for smart prioritization (Feature #255)
      setHasGoals((goalsResult.data?.length ?? 0) > 0)

      if (budgetResult.data) {
        setBudgetCount((budgetResult.data as Budget[]).filter(b => !b.parent_id).length)
      }

      if (budgetResult.data && spendingResult.data) {
        const spendMap: Record<string, number> = {}
        for (const t of spendingResult.data) {
          if (t.budget_id) {
            spendMap[t.budget_id] = (spendMap[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
          }
        }
        const triggered = (budgetResult.data as Budget[])
          .filter(b => !b.parent_id) // only parent budgets
          .map(b => {
            const children = (budgetResult.data as Budget[]).filter(c => c.parent_id === b.id)
            const spent = children.length > 0
              ? children.reduce((sum, c) => sum + (spendMap[c.id] ?? 0), 0)
              : (spendMap[b.id] ?? 0)
            const limit = children.length > 0
              ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
              : Number(b.default_limit)
            return { budget: b as Budget, spent, limit }
          })
          .filter(({ spent, limit, budget }) => {
            const bt = (budget.budget_type ?? 'expense') as 'income' | 'expense' | 'savings' | 'debt'
            return shouldAlert(spent, limit, Number(budget.alert_threshold), bt)
          })
          .slice(0, 5)
        setAlertBudgets(triggered)

        // Compute over-budget count for mission control card
        const expenseParents = (budgetResult.data as Budget[])
          .filter(b => !b.parent_id && (b.budget_type === 'expense'))
        let overCount = 0
        for (const b of expenseParents) {
          const children = (budgetResult.data as Budget[]).filter(c => c.parent_id === b.id)
          const spent = children.length > 0
            ? children.reduce((sum, c) => sum + (spendMap[c.id] ?? 0), 0)
            : (spendMap[b.id] ?? 0)
          const limit = children.length > 0
            ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
            : Number(b.default_limit)
          if (limit > 0 && spent > limit) overCount++
        }
        setOverBudgetCount(overCount)

        // Compute total budget progress for hero (expense budgets only)
        let heroLimit = 0
        let heroSpent = 0
        for (const b of expenseParents) {
          const children = (budgetResult.data as Budget[]).filter(c => c.parent_id === b.id)
          const spent = children.length > 0
            ? children.reduce((sum, c) => sum + (spendMap[c.id] ?? 0), 0)
            : (spendMap[b.id] ?? 0)
          const limit = children.length > 0
            ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
            : Number(b.default_limit)
          heroLimit += limit
          heroSpent += spent
        }
        setTotalBudgetLimit(heroLimit)
        setTotalBudgetSpent(heroSpent)

        // Store data for budget legend overview
        setOverviewSpending(spendMap)
        const allBudgets = budgetResult.data as Budget[]
        const parents = allBudgets.filter(b => !b.parent_id)
        const allChildren = allBudgets.filter(b => !!b.parent_id)
        setOverviewBudgetGroups(parents.map(p => ({ ...p, children: allChildren.filter(c => c.parent_id === p.id) })))
      }

      // Compute debt payoff progress
      if (debtFullResult.data && debtFullResult.data.length > 0) {
        const totalOriginal = debtFullResult.data.reduce((s, d) => s + Number(d.original_amount || d.current_balance), 0)
        const totalCurrent = debtFullResult.data.reduce((s, d) => s + Number(d.current_balance), 0)
        const progressPct = totalOriginal > 0 ? ((totalOriginal - totalCurrent) / totalOriginal) * 100 : 0
        setDebtProgress({ totalOriginal, totalCurrent, progressPct: Math.max(0, Math.min(100, progressPct)) })
      }

      // Compute asset growth direction from recent valuations
      if (assetValuationResult.data && assetValuationResult.data.length >= 2) {
        const sorted = [...assetValuationResult.data].sort((a, b) => b.valuation_date.localeCompare(a.valuation_date))
        const latestTotal = Number(sorted[0].value)
        const previousTotal = Number(sorted[1].value)
        if (latestTotal > previousTotal * 1.001) setAssetGrowthDirection('up')
        else if (latestTotal < previousTotal * 0.999) setAssetGrowthDirection('down')
        else setAssetGrowthDirection('flat')
      } else if (snapshotResult.data && snapshotResult.data.length >= 2) {
        // Fallback: use net worth snapshots to infer asset trend
        const snaps = snapshotResult.data as NetWorthSnapshot[]
        const latestAssets = Number(snaps[snaps.length - 1].total_assets)
        const prevAssets = Number(snaps[snaps.length - 2].total_assets)
        if (latestAssets > prevAssets * 1.001) setAssetGrowthDirection('up')
        else if (latestAssets < prevAssets * 0.999) setAssetGrowthDirection('down')
        else setAssetGrowthDirection('flat')
      }

      if (snapshotResult.data) {
        const snaps = snapshotResult.data as NetWorthSnapshot[]
        setSnapshots(snaps)

      }

      // Fetch earned badges for milestone markers on net worth chart
      try {
        const { data: badgesData } = await supabase.from('badges').select('id, slug')
        const { data: userBadgesData } = await supabase.from('user_badges').select('badge_id, earned_at')
        if (badgesData && userBadgesData) {
          const idToSlug = new Map(badgesData.map((b: { id: string; slug: string }) => [b.id, b.slug]))
          setEarnedBadges(
            userBadgesData.map((ub: { badge_id: string; earned_at: string }) => ({
              slug: idToSlug.get(ub.badge_id) ?? '',
              earned_at: ub.earned_at,
            })).filter((b: { slug: string }) => b.slug)
          )
        }
      } catch {
        // Badge fetch is non-critical; chart still works without badges
      }

      // Load 12-month budget spending sparklines per parent category
      try {
        if (budgetResult.data && budgetResult.data.length > 0) {
          const allBudgets = budgetResult.data as Budget[]
          const parentBudgets = allBudgets.filter(b => !b.parent_id)
          const childBudgets = allBudgets.filter(b => b.parent_id)

          // Build 12-month date ranges
          const sparkMonths: { month: string; start: string; end: string; label: string }[] = []
          for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const start = d.toISOString().split('T')[0]
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split('T')[0]
            const label = d.toLocaleDateString('nl-NL', { month: 'short' })
            sparkMonths.push({ month: start, start, end, label })
          }

          // Fetch all transactions for the 12-month range
          const { data: sparkTxData } = await supabase
            .from('transactions')
            .select('budget_id, amount, date')
            .gte('date', sparkMonths[0].start)
            .lt('date', sparkMonths[sparkMonths.length - 1].end)

          if (sparkTxData && sparkTxData.length > 0) {
            const sparklines: { id: string; name: string; icon: string; budgetType: string; data: SparklineDataPoint[] }[] = []

            for (const parent of parentBudgets) {
              const childIds = childBudgets.filter(c => c.parent_id === parent.id).map(c => c.id)
              const budgetIds = childIds.length > 0 ? childIds : [parent.id]

              const monthlyData: SparklineDataPoint[] = sparkMonths.map(m => {
                const monthTx = sparkTxData.filter(t =>
                  t.date >= m.start && t.date < m.end && budgetIds.includes(t.budget_id)
                )
                const monthSpent = monthTx.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
                return { month: m.month, label: m.label, spent: monthSpent }
              })

              // Only include categories that have at least some spending data
              const hasAnySpending = monthlyData.some(d => d.spent > 0)
              if (hasAnySpending) {
                sparklines.push({
                  id: parent.id,
                  name: parent.name,
                  icon: parent.icon,
                  budgetType: parent.budget_type ?? 'expense',
                  data: monthlyData,
                })
              }
            }

            setBudgetSparklines(sparklines)

            // Compute total budget spending per month for hero sparkline
            const monthlyTotals = sparkMonths.map(m => {
              const monthSpent = sparkTxData
                .filter(t => t.date >= m.start && t.date < m.end && Number(t.amount) < 0)
                .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
              return { label: m.label, spent: monthSpent, isProjection: false }
            })
            // Project next 6 months based on average of historical months with data
            const monthsWithData = monthlyTotals.filter(m => m.spent > 0)
            const avgSpent = monthsWithData.length > 0
              ? monthsWithData.reduce((s, m) => s + m.spent, 0) / monthsWithData.length
              : 0
            if (avgSpent > 0) {
              for (let i = 1; i <= 6; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
                monthlyTotals.push({
                  label: d.toLocaleDateString('nl-NL', { month: 'short' }),
                  spent: avgSpent,
                  isProjection: true,
                })
              }
            }
            setBudgetSpendingHistory(monthlyTotals)
          }
        }
      } catch {
        // Budget sparklines are non-critical
      }

      // Load spending pattern insights
      try {
        setSpendingInsightsLoading(true)
        const patternsRes = await fetch('/api/spending-patterns')
        if (patternsRes.ok) {
          const patternsData = await patternsRes.json()
          setSpendingInsights(patternsData.insights ?? [])
          setSpendingInsightsDataMonths(patternsData.dataMonths ?? 0)
          setSpendingInsightsMessage(patternsData.message ?? '')
          setSpendingInsightsHasData(patternsData.hasData ?? false)
        }
      } catch {
        // Spending patterns are non-critical
      } finally {
        setSpendingInsightsLoading(false)
      }

    } catch (err) {
      console.error('Error loading core data:', err)
      setError('Kon gegevens niet laden. Probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])


  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error ?? 'Er ging iets mis.'}</p>
          <button onClick={() => { setError(null); setLoading(true); loadData() }} className="mt-3 rounded-[var(--r)] bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  async function createSnapshot() {
    setSnapshotLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !data) { setSnapshotLoading(false); return }

    const today = new Date().toISOString().split('T')[0]
    await supabase.from('net_worth_snapshots').upsert({
      user_id: user.id,
      snapshot_date: today,
      total_assets: data.totalAssets,
      total_debts: data.totalDebts,
      net_worth: data.netWorth,
    }, { onConflict: 'user_id,snapshot_date' })

    // Reload snapshots
    const { data: newSnapshots } = await supabase
      .from('net_worth_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: true })
      .limit(24)
    if (newSnapshots) setSnapshots(newSnapshots as NetWorthSnapshot[])
    setSnapshotLoading(false)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* === 1. Hero (Gradient) === */}
      <section data-testid="kern-hero" className="card-editorial overflow-hidden">
        <div className="h-1.5 bg-kern-500" />

        <div className="p-4 sm:p-6 md:p-8">
          <div className="mb-3 sm:mb-6 flex items-center gap-3">
            <FhinAvatar size={40} />
            <p className="label-editorial text-kern-600">
              Jouw tijdlijn naar vrijheid
            </p>
          </div>

          <div className="mb-3 sm:mb-5">
            <span className="font-display text-[36px] sm:text-[44px] md:text-[52px] font-bold tracking-tight text-[var(--ink)]">
              {data.freedomPercentage.toFixed(1)}%
            </span>
            <span className="ml-3 font-serif italic text-lg text-[var(--ink-3)]">vrijheid bereikt</span>
          </div>

          <button type="button" onClick={() => setShowFireReceipt(true)} className="mb-4 sm:mb-6 w-full text-left transition-opacity hover:opacity-80">
            <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-kern-600 via-kern-400 to-kern-300 transition-all duration-1000"
                style={{ width: `${Math.max(Math.min(data.freedomPercentage, 100), 0)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-[var(--ink-4)]">
              <span>0%</span>
              <span className="font-mono">{formatCurrency(data.fireTarget)} — volledige vrijheid</span>
              <span>100%</span>
            </div>
          </button>

          <div className="grid grid-cols-1 gap-3 sm:gap-5 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setShowProjectionModal(true)}
              className="cursor-pointer text-left transition-opacity hover:opacity-80"
            >
              <p className="label-editorial text-[var(--ink-3)]">Netto vermogen</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[var(--ink)]">{formatCurrency(data.netWorth)}</p>
              <p className="mt-1 font-serif italic text-sm text-[var(--ink-3)]" data-testid="net-worth-freedom-subtitle">
                dat is {data.freedomYears > 0 ? `${data.freedomYears} jaar en ` : ''}{data.freedomMonths} maanden vrijheid
              </p>
              <NetWorthSparkline snapshots={snapshots} projection={nwProjection} />
            </button>
            <button
              type="button"
              onClick={() => setShowBudgetModal(true)}
              className="cursor-pointer text-left transition-opacity hover:opacity-80"
              data-testid="hero-deze-maand"
            >
              <p className="label-editorial text-[var(--ink-3)]">Deze maand</p>

              {/* Budget voortgang */}
              {totalBudgetLimit > 0 && (
                <div className="mt-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-[var(--ink-3)]">Budget</span>
                    <span className={`text-sm font-mono font-semibold ${totalBudgetSpent <= totalBudgetLimit ? 'text-kern-600' : 'text-red-400'}`}>
                      {Math.round((totalBudgetSpent / totalBudgetLimit) * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${totalBudgetSpent <= totalBudgetLimit ? 'bg-gradient-to-r from-kern-600 via-kern-400 to-kern-300' : 'bg-red-400'}`}
                      style={{ width: `${Math.min((totalBudgetSpent / totalBudgetLimit) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] font-mono text-[var(--ink-4)]">
                    {formatCurrency(totalBudgetSpent)} / {formatCurrency(totalBudgetLimit)}
                  </p>
                </div>
              )}

              {/* Budget spending sparkline (-12m + 6m prognose) */}
              <BudgetSpendingSparkline data={budgetSpendingHistory} budgetLimit={totalBudgetLimit} />
            </button>
            <div data-testid="hero-kerngetallen">
              <p className="label-editorial text-[var(--ink-3)]">Kerngetallen</p>

              {/* Spaarquote */}
              <div className="mt-2 flex items-center gap-1.5">
                <p className={`font-mono text-2xl font-bold ${savingsRate12 >= 0 ? 'text-[var(--ink)]' : 'text-red-400'}`}>
                  {savingsRate12.toFixed(1)}%
                </p>
                <span className="text-sm text-[var(--ink-3)]">spaarquote</span>
                <HeroTooltip text="Percentage van je inkomen dat je spaart over de afgelopen 12 maanden. Bij minder data wordt geëxtrapoleerd." />
              </div>
              <p className="text-[10px] text-[var(--ink-4)]">
                {savingsRateMonths < 12
                  ? `${savingsRateMonths} maand${savingsRateMonths > 1 ? 'en' : ''} data`
                  : 'laatste 12 maanden'}
              </p>

              {/* Vrije dagen per jaar */}
              <div className="mt-3 flex items-center gap-1.5">
                <p className="font-mono text-2xl font-bold text-[var(--ink)]">{data.freeDaysPerYear}</p>
                <span className="text-sm text-[var(--ink-3)]">vrije dagen/jaar</span>
                <HeroTooltip text="Hoeveel dagen per jaar je passief inkomen (4% SWR op vermogen) je dagelijkse uitgaven dekt." />
              </div>
              <p className="text-[10px] text-[var(--ink-4)]">gedekt door passief inkomen</p>
            </div>
          </div>
        </div>
      </section>

      {/* === Missie Controle (direct onder hero) === */}
      <section className="mt-4 sm:mt-8" data-testid="mission-control-section">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-kern-500" />
          <h2 className="label-editorial text-[var(--ink-2)]">Missie Controle</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Cash Card */}
          <MissionControlCard
            href="/core/cash"
            onClick={() => setActiveModal('cash')}
            icon={<Wallet className="h-5 w-5 text-kern-600" />}
            title="Cash"
            metric={formatCurrency(data.monthlyIncome - data.monthlyExpenses)}
            metricColor={data.monthlyIncome >= data.monthlyExpenses ? 'text-emerald-600' : 'text-red-600'}
            status={data.monthlyIncome >= data.monthlyExpenses ? 'healthy' : 'attention'}
            statusLabel={data.monthlyIncome >= data.monthlyExpenses ? 'Gezond' : 'Aandacht nodig'}
            details={[
              { label: 'Inkomen', value: formatCurrency(data.monthlyIncome), color: 'text-emerald-600' },
              { label: 'Uitgaven', value: formatCurrency(data.monthlyExpenses), color: 'text-[var(--ink-2)]' },
            ]}
            cta="Bekijk transacties"
            testId="mission-cash"
          />

          {/* Budgetten Card */}
          <MissionControlCard
            href="/core/budgets"
            onClick={() => setActiveModal('budgets')}
            icon={<ShoppingCart className="h-5 w-5 text-kern-600" />}
            title="Budgetten"
            metric={overBudgetCount > 0 ? `${overBudgetCount} over budget` : 'Op koers'}
            metricColor={overBudgetCount > 0 ? 'text-red-600' : 'text-emerald-600'}
            status={overBudgetCount === 0 ? 'healthy' : 'attention'}
            statusLabel={overBudgetCount === 0 ? 'Alles op schema' : `${overBudgetCount} overschreden`}
            details={[
              { label: 'Uitgaven', value: formatCurrency(data.monthlyExpenses), color: 'text-[var(--ink-2)]' },
              { label: 'Budgetten', value: `${budgetCount} actief`, color: 'text-[var(--ink-3)]' },
            ]}
            cta="Beheer budgetten"
            testId="mission-budgetten"
          />

          {/* Assets Card */}
          <MissionControlCard
            href="/core/assets"
            onClick={() => setActiveModal('assets')}
            icon={<PiggyBank className="h-5 w-5 text-emerald-600" />}
            title="Assets"
            metric={formatCurrency(data.totalAssets)}
            metricColor="text-emerald-600"
            status="healthy"
            statusLabel={
              assetGrowthDirection === 'up' ? 'Groeiend' :
              assetGrowthDirection === 'down' ? 'Dalend' : 'Stabiel'
            }
            growthDirection={assetGrowthDirection}
            details={[
              { label: 'Totaal', value: formatCurrency(data.totalAssets), color: 'text-emerald-600' },
              { label: 'Richting', value: assetGrowthDirection === 'up' ? '↑ Omhoog' : assetGrowthDirection === 'down' ? '↓ Omlaag' : '→ Stabiel', color: assetGrowthDirection === 'up' ? 'text-emerald-600' : assetGrowthDirection === 'down' ? 'text-red-500' : 'text-[var(--ink-3)]' },
            ]}
            cta="Bekijk portfolio"
            testId="mission-assets"
          />

          {/* Schulden Card */}
          <MissionControlCard
            href="/core/debts"
            onClick={() => setActiveModal('debts')}
            icon={<Building2 className="h-5 w-5 text-red-500" />}
            title="Schulden"
            metric={data.totalDebts > 0 ? formatCurrency(data.totalDebts) : 'Schuldvrij'}
            metricColor={data.totalDebts > 0 ? 'text-red-600' : 'text-emerald-600'}
            status={data.totalDebts === 0 ? 'healthy' : debtProgress && debtProgress.progressPct > 50 ? 'healthy' : 'attention'}
            statusLabel={data.totalDebts === 0 ? 'Schuldvrij!' : debtProgress ? `${debtProgress.progressPct.toFixed(0)}% afgelost` : 'Vrijheid terugkopen'}
            debtProgress={debtProgress ?? undefined}
            details={[
              { label: 'Openstaand', value: formatCurrency(data.totalDebts), color: 'text-red-600' },
              { label: 'Afgelost', value: debtProgress ? `${debtProgress.progressPct.toFixed(0)}%` : '—', color: debtProgress && debtProgress.progressPct > 0 ? 'text-emerald-600' : 'text-[var(--ink-3)]' },
            ]}
            cta="Beheer schulden"
            testId="mission-schulden"
          />
        </div>

        {/* Box 3 stays as a separate gated quick link */}
        <FeatureGate featureId="box3_belasting" fallback="locked">
          <div className="mt-4">
            <Link
              href="/core/belasting"
              className="group card-editorial flex items-center gap-3 p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] group-hover:bg-kern-50">
                <Receipt className="h-5 w-5 text-kern-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="label-editorial text-[var(--ink-3)]">Box 3 Belasting</p>
                <p className="text-lg font-bold text-[var(--ink)]">Berekenen</p>
                <p className="text-xs text-[var(--ink-3)]">vermogensrendementsheffing</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-4)] group-hover:text-kern-500" />
            </Link>
          </div>
        </FeatureGate>
      </section>

      {/* === Budget overzicht === */}
      {overviewBudgetGroups.length > 0 && (
        <section className="mt-6">
          <div className="card-editorial p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--ink-2)]">Budget overzicht</h3>
              <Link
                href="/core/budgets"
                className="text-xs font-medium text-kern-600 hover:text-kern-700"
              >
                Bekijk budgetten →
              </Link>
            </div>
            <BudgetLegendOverview
              groups={overviewBudgetGroups}
              spending={overviewSpending}
              expandedGroupId={expandedOverviewGroupId}
              onToggleGroup={(id) => setExpandedOverviewGroupId(prev => prev === id ? null : id)}
              onNavigate={(id) => router.push(`/core/budgets?budget=${id}`)}
            />
          </div>
        </section>
      )}

      {/* === 1b. Next Step Card === */}
      {data && (
        <section className="mt-6">
          <NextStepSection
            steps={computeAllKernSteps({
              totalAssets: data.totalAssets,
              totalDebts: data.totalDebts,
              monthlyIncome: data.monthlyIncome,
              monthlyExpenses: data.monthlyExpenses,
              budgetCount,
              snapshotCount: snapshots.length,
              hasTransactions,
              alertBudgetCount: alertBudgets.length,
              hasGoals,
              fireUnreachable,
            })}
            moduleColor="amber"
          />
        </section>
      )}

      {/* === 7. Financiële Kerngetallen (Deep Dive) === */}
      <section className="mt-5 sm:mt-8">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="label-editorial text-[var(--ink-2)]">
              Financiële Kerngetallen
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              Gebaseerd op je werkelijke transacties en budgetinstellingen.
            </p>
          </div>
          <FeatureGate featureId="data_export" fallback="locked">
            <ExportDropdown />
          </FeatureGate>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
          <button type="button" onClick={() => setShowIncomeReceipt(true)} className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6 text-left transition-all hover:border-emerald-300 hover:shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-[var(--r-lg)] bg-emerald-50">
                <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600" />
              </div>
              <KpiTooltip text="Geschat jaarinkomen gebaseerd op werkelijke transacties. Bij minder dan 12 maanden data wordt het gemiddelde geextrapoleerd naar een jaar." />
            </div>
            <p className="text-sm font-medium text-[var(--ink-3)]">Geschat Jaarinkomen</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{formatCurrency(data.estimatedYearlyIncome)}</p>
            <FreedomTimeBadge amount={data.estimatedYearlyIncome} className="mt-1" />
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              {incomeMonths < 12
                ? `geextrapoleerd vanuit ${incomeMonths} maand${incomeMonths > 1 ? 'en' : ''}`
                : 'laatste 12 maanden'}
            </p>
          </button>

          <button type="button" onClick={() => setShowExpenseReceipt(true)} className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6 text-left transition-all hover:border-[var(--border-md)] hover:shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-[var(--r-lg)] bg-[var(--subtle)]">
                <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 text-[var(--ink-3)]" />
              </div>
              <KpiTooltip text="Jaarlijkse som van je essentiële budgetten: vaste lasten, dagelijkse uitgaven en vervoer. Dit zijn de kosten die je sowieso maakt." />
            </div>
            <p className="text-sm font-medium text-[var(--ink-3)]">Jaarlijkse Must Uitgaven</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{formatCurrency(data.yearlyMustExpenses)}</p>
            <FreedomTimeBadge amount={data.yearlyMustExpenses} className="mt-1" />
            <p className="mt-1 text-xs text-[var(--ink-3)]">essentiële kosten per jaar</p>
          </button>
        </div>
      </section>

      {/* === 8. Locked Features Footer === */}
      <LockedFeaturesFooter module="kern" />

      {/* === 9. Discover Carousel === */}
      <DiscoverCarousel module="kern" />

      {/* === Mission Control Modals === */}
      <FullScreenModal
        open={activeModal === 'cash'}
        onClose={() => setActiveModal(null)}
        title="Cash"
        href="/core/cash"
      >
        <DynCashPage />
      </FullScreenModal>
      <FullScreenModal
        open={activeModal === 'budgets'}
        onClose={() => setActiveModal(null)}
        title="Budgetten"
        href="/core/budgets"
      >
        <DynBudgetsPage />
      </FullScreenModal>
      <FullScreenModal
        open={activeModal === 'assets'}
        onClose={() => setActiveModal(null)}
        title="Assets"
        href="/core/assets"
      >
        <DynAssetsPage />
      </FullScreenModal>
      <FullScreenModal
        open={activeModal === 'debts'}
        onClose={() => setActiveModal(null)}
        title="Schulden"
        href="/core/debts"
      >
        <DynDebtsPage />
      </FullScreenModal>

      {/* === Vermogen Modal (verloop + prognose) === */}
      <FullScreenModal
        open={showProjectionModal}
        onClose={() => setShowProjectionModal(false)}
        title="Netto Vermogen"
        href="/core"
      >
        <div className="space-y-8 p-6">
          {/* Vermogensverloop */}
          {snapshots.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--ink-2)]">Vermogensverloop</h3>
                <button
                  onClick={createSnapshot}
                  disabled={snapshotLoading}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {snapshotLoading ? 'Bezig...' : 'Snapshot nu'}
                </button>
              </div>
              <NetWorthChart snapshots={snapshots} fireTarget={data.fireTarget} earnedBadges={earnedBadges} />
            </section>
          )}

          {/* Vermogensprognose */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-[var(--ink-2)]">Vermogensprognose</h3>
            {nwProjection && nwProjection.points.length >= 2 ? (
              <NetWorthProjectionChart projection={nwProjection} />
            ) : (
              <p className="py-8 text-center text-sm text-[var(--ink-3)]">
                Nog niet genoeg data voor een vermogensprognose.
              </p>
            )}
          </section>

          {/* Vergelijking snapshots */}
          {snapshots.length >= 2 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-[var(--ink-2)]">Vergelijking snapshots</h3>
              <SnapshotComparisonView snapshots={snapshots} />
            </section>
          )}
        </div>
      </FullScreenModal>

      {/* === Budget Uitgaven Modal === */}
      <FullScreenModal
        open={showBudgetModal}
        onClose={() => setShowBudgetModal(false)}
        title="Uitgaven"
        href="/core/budgets"
      >
        <div className="space-y-8 p-6">
          {/* Uitgaventrend per categorie */}
          {budgetSparklines.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-[var(--ink-2)]">Uitgaventrend per categorie</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {budgetSparklines.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/core/budgets?budget=${cat.id}`}
                    onClick={() => setShowBudgetModal(false)}
                    className="group flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 transition-all hover:border-kern-200 hover:bg-kern-50/20 hover:shadow-sm"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] bg-kern-50">
                      <BudgetIcon name={cat.icon} className="h-4 w-4 text-kern-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-[var(--ink-2)]">{cat.name}</p>
                      <p className="text-[10px] text-[var(--ink-3)]">
                        {formatCurrency(cat.data[cat.data.length - 1]?.spent ?? 0)} deze maand
                      </p>
                    </div>
                    <SparklineWithLabel
                      data={cat.data}
                      width={80}
                      height={24}
                      isIncome={cat.budgetType === 'income'}
                    />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Uitgavenpatronen */}
          {(spendingInsightsLoading || spendingInsights.length > 0 || spendingInsightsHasData) && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-[var(--ink-2)]">Uitgavenpatronen</h3>
              <SpendingInsightsSection
                insights={spendingInsights}
                dataMonths={spendingInsightsDataMonths}
                message={spendingInsightsMessage}
                isLoading={spendingInsightsLoading}
              />
            </section>
          )}

          {budgetSparklines.length === 0 && !spendingInsightsLoading && spendingInsights.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--ink-3)]">
              Nog niet genoeg data voor uitgaventrends.
            </p>
          )}
        </div>
      </FullScreenModal>

      {/* === Kassabon Modal: Inkomen === */}
      <BottomSheet open={showIncomeReceipt} onClose={() => setShowIncomeReceipt(false)} title="Kassabon: Geschat Jaarinkomen">
        <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 font-mono text-sm">
          <div className="mb-3 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--ink-3)]">Inkomen overzicht</p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">
              {incomeMonths < 12
                ? `${incomeMonths} maand${incomeMonths > 1 ? 'en' : ''} data beschikbaar`
                : 'Laatste 12 maanden'}
            </p>
          </div>

          <div className="mb-1 border-b border-dashed border-[var(--border-ed)] pb-2 text-[11px] text-[var(--ink-3)] leading-relaxed">
            Je geschat jaarinkomen is de basis voor veel berekeningen, zoals je spaarquote en vrijheidspercentage. We tellen alle positieve transacties op over de afgelopen 12 maanden.
          </div>

          <div className="border-b border-dashed border-[var(--border-ed)] mb-2 pb-2 mt-2">
            {incomeByMonth.map(({ month, amount }) => {
              const [y, m] = month.split('-')
              const label = new Date(Number(y), Number(m) - 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
              return (
                <div key={month} className="flex justify-between py-0.5">
                  <span className="text-[var(--ink-2)] capitalize">{label}</span>
                  <span className="tabular-nums text-[var(--ink)]">{formatCurrency(amount)}</span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between py-1">
            <span className="text-[var(--ink-3)]">Subtotaal werkelijk</span>
            <span className="tabular-nums font-medium text-[var(--ink)]">
              {formatCurrency(incomeByMonth.reduce((s, i) => s + i.amount, 0))}
            </span>
          </div>
          {incomeMonths < 12 && data && (
            <div className="mt-2 border-t border-dashed border-[var(--border-ed)] pt-2">
              <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
                Gemiddeld per maand: {formatCurrency(incomeByMonth.reduce((s, i) => s + i.amount, 0) / incomeMonths)}
                {' '}({incomeMonths} mnd) &rarr; geëxtrapoleerd naar 12 maanden
              </p>
            </div>
          )}
          <div className="mt-2 border-t-2 border-[var(--ink)] pt-2 flex justify-between">
            <span className="font-bold text-[var(--ink)]">Geschat Jaarinkomen</span>
            <span className="tabular-nums font-bold text-[var(--ink)]">{data ? formatCurrency(data.estimatedYearlyIncome) : '—'}</span>
          </div>
          {data && (
            <div className="mt-2 flex justify-center">
              <FreedomTimeBadge amount={data.estimatedYearlyIncome} />
            </div>
          )}

          <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 text-[11px] text-[var(--ink-3)] leading-relaxed">
            <p><strong className="text-[var(--ink-3)]">Formule:</strong> som van alle positieve transacties over {incomeMonths < 12 ? `${incomeMonths} maanden, gedeeld door ${incomeMonths} en vermenigvuldigd met 12` : 'de laatste 12 maanden'}</p>
          </div>

          <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">Berekend op basis van werkelijke transacties</p>
        </div>
      </BottomSheet>

      {/* === Kassabon Modal: Spaarquote === */}
      <BottomSheet open={showSavingsReceipt} onClose={() => setShowSavingsReceipt(false)} title="Kassabon: Spaarquote">
        <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 font-mono text-sm">
          <div className="mb-3 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--ink-3)]">Spaarquote berekening</p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">
              {savingsRateMonths < 12
                ? `${savingsRateMonths} maand${savingsRateMonths > 1 ? 'en' : ''} data, geëxtrapoleerd naar 12`
                : 'Laatste 12 maanden'}
            </p>
          </div>

          <div className="mb-1 border-b border-dashed border-[var(--border-ed)] pb-2 text-[11px] text-[var(--ink-3)] leading-relaxed">
            Je spaarquote laat zien welk deel van je inkomen je overhoudt. Hoe hoger dit percentage, hoe sneller je financiële vrijheid groeit.
          </div>

          <div className="border-b border-dashed border-[var(--border-ed)] mb-2 pb-2 mt-2">
            <div className="flex justify-between py-0.5">
              <span className="text-[var(--ink-2)]">Jaarinkomen{savingsRateMonths < 12 ? ' (geëxtrapoleerd)' : ''}</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(savingsReceiptData.extYearlyIncome)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-[var(--ink-2)]">Jaaruitgaven{savingsRateMonths < 12 ? ' (geëxtrapoleerd)' : ''}</span>
              <span className="tabular-nums text-red-600">- {formatCurrency(savingsReceiptData.extYearlyExpenses)}</span>
            </div>
          </div>
          <div className="flex justify-between py-1">
            <span className="font-medium text-[var(--ink-2)]">Jaarlijkse besparing</span>
            <span className={`tabular-nums font-medium ${savingsReceiptData.yearlySavings >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {savingsReceiptData.yearlySavings >= 0 ? '+' : ''}{formatCurrency(savingsReceiptData.yearlySavings)}
            </span>
          </div>
          <div className="mt-2 border-t-2 border-[var(--ink)] pt-2 flex justify-between">
            <span className="font-bold text-[var(--ink)]">Spaarquote</span>
            <span className={`tabular-nums font-bold ${savingsRate12 >= 0 ? 'text-[var(--ink)]' : 'text-red-600'}`}>{savingsRate12.toFixed(1)}%</span>
          </div>

          {savingsRateMonths < 12 && (
            <div className="mt-2 border-t border-dashed border-[var(--border-ed)] pt-2">
              <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
                Werkelijk inkomen: {formatCurrency(savingsReceiptData.last12Income)} over {savingsRateMonths} mnd.
                Werkelijke uitgaven: {formatCurrency(savingsReceiptData.last12Expenses)} over {savingsRateMonths} mnd.
                Beide geëxtrapoleerd naar 12 maanden.
              </p>
            </div>
          )}

          <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 text-[11px] text-[var(--ink-3)] leading-relaxed">
            <p><strong className="text-[var(--ink-3)]">Formule:</strong> (inkomen − uitgaven) / inkomen × 100%</p>
            <p className="mt-1">Een spaarquote van 50% betekent dat je voor elke gewerkte dag ook één dag vrijheid opbouwt.</p>
          </div>

          <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">Berekend op basis van werkelijke transacties</p>
        </div>
      </BottomSheet>

      {/* === Kassabon Modal: FIRE Target === */}
      <BottomSheet open={showFireReceipt} onClose={() => setShowFireReceipt(false)} title="Kassabon: Volledige Vrijheid">
        <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 font-mono text-sm">
          <div className="mb-3 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--ink-3)]">Benodigd voor volledige vrijheid</p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">FIRE-berekening op basis van de 4%-regel</p>
          </div>

          <div className="mb-1 border-b border-dashed border-[var(--border-ed)] pb-2 text-[11px] text-[var(--ink-3)] leading-relaxed">
            Het FIRE-bedrag is het vermogen waarmee je voor altijd van de opbrengsten kunt leven, zonder je kapitaal aan te spreken. Dit is gebaseerd op de &ldquo;4%-regel&rdquo;: je onttrekt jaarlijks 4% van je vermogen.
          </div>

          {data && (
            <>
              <div className="border-b border-dashed border-[var(--border-ed)] mb-2 pb-2 mt-2">
                <div className="flex justify-between py-0.5">
                  <span className="text-[var(--ink-2)]">Jaarlijkse Must-uitgaven</span>
                  <span className="tabular-nums text-[var(--ink)]">{formatCurrency(data.yearlyMustExpenses > 0 ? data.yearlyMustExpenses : data.monthlyExpenses * 12)}</span>
                </div>
                {data.yearlyMustExpenses <= 0 && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-[var(--ink-2)]">× 12 maanden</span>
                    <span className="tabular-nums text-[var(--ink)]">{formatCurrency(data.monthlyExpenses * 12)}</span>
                  </div>
                )}
                <div className="flex justify-between py-0.5">
                  <span className="text-[var(--ink-2)]">÷ opnamepercentage (4%)</span>
                  <span className="tabular-nums text-[var(--ink-3)]">÷ 0,04</span>
                </div>
              </div>
              <div className="border-b-2 border-[var(--ink)] pb-2 flex justify-between">
                <span className="font-bold text-[var(--ink)]">FIRE-bedrag</span>
                <span className="tabular-nums font-bold text-[var(--ink)]">{formatCurrency(data.fireTarget)}</span>
              </div>

              <div className="mt-3 border-b border-dashed border-[var(--border-ed)] pb-2">
                <div className="flex justify-between py-0.5">
                  <span className="text-[var(--ink-2)]">Huidig netto vermogen</span>
                  <span className="tabular-nums text-[var(--ink)]">{formatCurrency(data.netWorth)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[var(--ink-2)]">Nog nodig</span>
                  <span className="tabular-nums text-[var(--ink)]">{formatCurrency(Math.max(0, data.fireTarget - data.netWorth))}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[var(--ink-2)]">Voortgang</span>
                  <span className="tabular-nums font-medium text-kern-600">{data.freedomPercentage.toFixed(1)}%</span>
                </div>
              </div>

              <div className="mt-2 flex justify-center">
                <FreedomTimeBadge amount={data.fireTarget} />
              </div>

              <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 text-[11px] text-[var(--ink-3)] leading-relaxed">
                <p><strong className="text-[var(--ink-3)]">De 4%-regel:</strong> Onderzoek (de &ldquo;Trinity Study&rdquo;) toont aan dat je 4% per jaar kunt onttrekken aan een gediversifieerde portefeuille zonder dat het kapitaal opraakt over 30+ jaar.</p>
                <p className="mt-1"><strong className="text-[var(--ink-3)]">Formule:</strong> {data.yearlyMustExpenses > 0 ? 'must-uitgaven' : 'jaarlijkse uitgaven'} ÷ 0,04 = benodigd vermogen</p>
              </div>

              <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">{data.yearlyMustExpenses > 0 ? 'Berekend op basis van essentiële (must) budgetten' : 'Berekend op basis van je huidige maandelijkse uitgaven'}</p>
            </>
          )}
        </div>
      </BottomSheet>

      {/* === Kassabon Modal: Must Uitgaven === */}
      <BottomSheet open={showExpenseReceipt} onClose={() => setShowExpenseReceipt(false)} title="Kassabon: Essentiële Uitgaven">
        <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 font-mono text-sm">
          <div className="mb-3 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--ink-3)]">Essentiële uitgaven</p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">Vaste lasten op jaarbasis</p>
          </div>

          <div className="mb-1 border-b border-dashed border-[var(--border-ed)] pb-2 text-[11px] text-[var(--ink-3)] leading-relaxed">
            Dit zijn de kosten die je sowieso maakt — vaste lasten, dagelijkse boodschappen en vervoer. Dit bedrag bepaalt hoeveel vermogen je nodig hebt voor volledige vrijheid.
          </div>

          <div className="border-b border-dashed border-[var(--border-ed)] mb-2 pb-2 mt-2">
            {mustExpenseItems.map((item) => {
              const intervalLabel = item.interval === 'monthly' ? '/mnd' : item.interval === 'quarterly' ? '/kwt' : '/jr'
              return (
                <div key={item.name} className="flex justify-between py-0.5">
                  <span className="text-[var(--ink-2)]">
                    {item.name} <span className="text-[10px] text-[var(--ink-3)]">{intervalLabel}</span>
                  </span>
                  <span className="tabular-nums text-[var(--ink)]">{formatCurrency(item.annualAmount)}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-1 border-t-2 border-[var(--ink)] pt-2 flex justify-between">
            <span className="font-bold text-[var(--ink)]">Totaal per jaar</span>
            <span className="tabular-nums font-bold text-[var(--ink)]">{data ? formatCurrency(data.yearlyMustExpenses) : '—'}</span>
          </div>
          <div className="mt-1 flex justify-between text-[var(--ink-3)]">
            <span>Gemiddeld per maand</span>
            <span className="tabular-nums">{data ? formatCurrency(data.yearlyMustExpenses / 12) : '—'}</span>
          </div>
          {data && (
            <div className="mt-2 flex justify-center">
              <FreedomTimeBadge amount={data.yearlyMustExpenses} />
            </div>
          )}

          <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 text-[11px] text-[var(--ink-3)] leading-relaxed">
            <p><strong className="text-[var(--ink-3)]">Formule:</strong> per budget het limietbedrag omgerekend naar jaarbasis (maandelijks × 12, per kwartaal × 4, of jaarlijks × 1), alles opgeteld</p>
          </div>

          <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">Berekend op basis van essentiële budgetinstellingen</p>
        </div>
      </BottomSheet>
    </div>
  )
}

function HeroTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Meer informatie"
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        onBlur={() => setOpen(false)}
      >
        <Info className={`h-3.5 w-3.5 cursor-help transition-colors ${open ? 'text-kern-300' : 'text-kern-300/40'} hover:text-kern-300`} />
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-10 mb-2 w-52 -translate-x-1/2 rounded-[var(--r)] border border-kern-700/50 bg-kern-950 p-2.5 text-xs leading-relaxed text-kern-200/80 shadow-[var(--s2)]">
          {text}
        </div>
      )}
    </div>
  )
}

function BudgetSpendingSparkline({
  data,
  budgetLimit,
}: {
  data: { label: string; spent: number; isProjection: boolean }[]
  budgetLimit: number
}) {
  if (data.length < 2) return null

  const W = 180
  const H = 32
  const PAD_X = 2
  const PAD_Y = 3

  const values = data.map(d => d.spent)
  const maxVal = Math.max(...values, budgetLimit, 1)
  const minVal = 0
  const valRange = maxVal - minVal || 1

  // Find split index: last historical point
  const lastHistIdx = data.reduce((last, d, i) => d.isProjection ? last : i, 0)

  function x(i: number) { return PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2) }
  function y(val: number) { return H - PAD_Y - ((val - minVal) / valRange) * (H - PAD_Y * 2) }

  // Historical path
  const histData = data.filter(d => !d.isProjection)
  const histPath = histData
    .map((_, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(data[i].spent).toFixed(1)}`)
    .join(' ')

  // Fill under historical
  const histFill = histData.length >= 2
    ? histPath + ` L${x(lastHistIdx).toFixed(1)},${(H - PAD_Y).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD_Y).toFixed(1)} Z`
    : ''

  // Projection path (from last hist point)
  const projData = data.filter(d => d.isProjection)
  let projPath = ''
  if (projData.length > 0) {
    const projWithStart = [data[lastHistIdx], ...projData]
    projPath = projWithStart
      .map((_, i) => {
        const idx = lastHistIdx + i
        return `${i === 0 ? 'M' : 'L'}${x(idx).toFixed(1)},${y(data[idx].spent).toFixed(1)}`
      })
      .join(' ')
  }

  // Budget limit line y
  const limitY = budgetLimit > 0 ? y(budgetLimit) : -1

  return (
    <div className="mt-2" data-testid="budget-spending-sparkline">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 200, height: 32 }}>
        <defs>
          <linearGradient id="budget-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Budget limit line */}
        {limitY >= 0 && limitY <= H && (
          <line x1={PAD_X} y1={limitY} x2={W - PAD_X} y2={limitY} stroke="#ef4444" strokeWidth="0.5" strokeDasharray="3,2" opacity="0.5" />
        )}
        {/* Fill under historical */}
        {histFill && <path d={histFill} fill="url(#budget-spark-fill)" />}
        {/* Historical line */}
        {histPath && <path d={histPath} fill="none" stroke="#fbbf24" strokeWidth="1.5" />}
        {/* Divider dot */}
        <circle cx={x(lastHistIdx)} cy={y(data[lastHistIdx].spent)} r="2" fill="#fbbf24" />
        {/* Projection line (dashed) */}
        {projPath && <path d={projPath} fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3,2" opacity="0.5" />}
      </svg>
      <div className="flex justify-between text-[10px] text-kern-300/40" style={{ maxWidth: 200 }}>
        <span>-12m</span>
        <span>nu</span>
        <span>+6m</span>
      </div>
    </div>
  )
}

function NetWorthSparkline({
  snapshots,
  projection,
}: {
  snapshots: NetWorthSnapshot[]
  projection: NetWorthProjectionResult | null
}) {
  // Build historical points: last 12 months from snapshots
  const now = new Date()
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)

  const histPoints = snapshots
    .filter(s => new Date(s.snapshot_date) >= twelveMonthsAgo)
    .map(s => ({ date: new Date(s.snapshot_date).getTime(), value: Number(s.net_worth) }))

  // Build projection points: next 6 months
  const projPoints = projection
    ? projection.points
        .filter(p => p.month >= 1 && p.month <= 6)
        .map(p => ({ date: new Date(p.date).getTime(), value: p.netWorth }))
    : []

  const allPoints = [...histPoints, ...projPoints]
  if (allPoints.length < 2) return null

  const values = allPoints.map(p => p.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const valRange = maxVal - minVal || 1
  const minDate = allPoints[0].date
  const maxDate = allPoints[allPoints.length - 1].date
  const dateRange = maxDate - minDate || 1

  const W = 160
  const H = 32
  const PAD_X = 2
  const PAD_Y = 3

  function x(date: number) { return PAD_X + ((date - minDate) / dateRange) * (W - PAD_X * 2) }
  function y(val: number) { return H - PAD_Y - ((val - minVal) / valRange) * (H - PAD_Y * 2) }

  // Historical line path
  const histPath = histPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ')

  // Projection line path (starts from last historical point)
  let projPath = ''
  if (projPoints.length > 0 && histPoints.length > 0) {
    const lastHist = histPoints[histPoints.length - 1]
    const projWithStart = [{ date: lastHist.date, value: lastHist.value }, ...projPoints]
    projPath = projWithStart
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(' ')
  }

  // Gradient fill under historical line
  const histFill = histPoints.length >= 2
    ? histPath + ` L${x(histPoints[histPoints.length - 1].date).toFixed(1)},${H} L${x(histPoints[0].date).toFixed(1)},${H} Z`
    : ''

  // Divider x position (where history ends and projection begins)
  const dividerX = histPoints.length > 0 ? x(histPoints[histPoints.length - 1].date) : 0

  return (
    <div className="mt-2" data-testid="net-worth-sparkline">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 200, height: 32 }}>
        <defs>
          <linearGradient id="nw-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Fill under historical line */}
        {histFill && <path d={histFill} fill="url(#nw-spark-fill)" />}
        {/* Historical line */}
        {histPath && <path d={histPath} fill="none" stroke="#fbbf24" strokeWidth="1.5" />}
        {/* Divider dot */}
        {histPoints.length > 0 && (
          <circle cx={dividerX} cy={y(histPoints[histPoints.length - 1].value)} r="2" fill="#fbbf24" />
        )}
        {/* Projection line (dashed) */}
        {projPath && <path d={projPath} fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3,2" opacity="0.6" />}
      </svg>
      <div className="flex justify-between text-[10px] text-kern-300/40" style={{ maxWidth: 200 }}>
        <span>-12m</span>
        <span>nu</span>
        <span>+6m</span>
      </div>
    </div>
  )
}

function KpiTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="group relative">
      <span
        role="button"
        tabIndex={0}
        aria-label="Meer informatie"
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOpen(!open) } }}
        onBlur={() => setOpen(false)}
        className="touch-target"
      >
        <Info className={`h-4 w-4 cursor-help transition-colors ${open ? 'text-kern-500' : 'text-[var(--ink-4)]'} group-hover:text-kern-500`} />
      </span>
      <div role="tooltip" className={`absolute right-0 z-10 mt-1 w-56 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-xs leading-relaxed text-[var(--ink-2)] shadow-[var(--s2)] transition-opacity ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}>
        {text}
      </div>
    </div>
  )
}

function MissionControlCard({
  href,
  onClick,
  icon,
  title,
  metric,
  metricColor,
  status,
  statusLabel,
  details,
  cta,
  testId,
  debtProgress: debtProg,
  growthDirection,
}: {
  href: string
  onClick?: () => void
  icon: React.ReactNode
  title: string
  metric: string
  metricColor: string
  status: 'healthy' | 'attention'
  statusLabel: string
  details: { label: string; value: string; color: string }[]
  cta: string
  testId: string
  debtProgress?: { totalOriginal: number; totalCurrent: number; progressPct: number }
  growthDirection?: 'up' | 'down' | 'flat'
}) {
  return (
    <button
      type="button"
      onClick={onClick ?? (() => { window.location.href = href })}
      data-testid={testId}
      className="group card-editorial flex flex-col overflow-hidden p-0 text-left"
    >
      <div className="flex h-1 items-stretch">
        <div className="w-1 bg-kern-500" />
        <div className="flex-1" />
      </div>
      <div className="p-3 sm:p-5">
      {/* Header: icon + title + status */}
      <div className="mb-2 sm:mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] group-hover:bg-kern-50">
            {icon}
          </div>
          <p className="text-sm font-semibold text-[var(--ink-2)]">{title}</p>
        </div>
        <div data-testid={`${testId}-status`} className="flex items-center gap-1">
          {status === 'healthy' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-kern-500" />
          )}
        </div>
      </div>

      {/* Key Metric */}
      <div className="mb-2">
        <div className="flex items-baseline gap-2">
          <p className={`font-mono text-2xl font-bold ${metricColor}`}>{metric}</p>
          {growthDirection && (
            <span className="flex items-center">
              {growthDirection === 'up' && <ArrowUpRight className="h-4 w-4 text-emerald-500" />}
              {growthDirection === 'down' && <ArrowDownRight className="h-4 w-4 text-red-500" />}
              {growthDirection === 'flat' && <Minus className="h-4 w-4 text-[var(--ink-4)]" />}
            </span>
          )}
        </div>
      </div>

      {/* Status label */}
      <div className={`mb-2 sm:mb-3 inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${
        status === 'healthy'
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-kern-50 text-kern-700'
      }`} data-testid={`${testId}-status-label`}>
        {status === 'healthy' ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          <AlertTriangle className="h-3 w-3" />
        )}
        {statusLabel}
      </div>

      {/* Debt payoff progress bar */}
      {debtProg && debtProg.totalOriginal > 0 && (
        <div className="mb-3" data-testid={`${testId}-progress-bar`}>
          <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${debtProg.progressPct}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] font-mono text-[var(--ink-4)]">
            {formatCurrency(debtProg.totalOriginal - debtProg.totalCurrent)} afgelost van {formatCurrency(debtProg.totalOriginal)}
          </p>
        </div>
      )}

      {/* Detail lines */}
      <div className="mt-auto space-y-0.5 sm:space-y-1 border-t border-[var(--border-ed)] pt-2 sm:pt-3">
        {details.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-[var(--ink-3)]">{d.label}</span>
            <span className={`font-mono font-medium ${d.color}`}>{d.value}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-2 sm:mt-3 flex items-center justify-between">
        <span className="label-editorial text-kern-600 opacity-0 transition-opacity group-hover:opacity-100">{cta}</span>
        <ArrowRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-kern-500" />
      </div>
      </div>
    </button>
  )
}

const EXPORT_OPTIONS = [
  { type: 'transactions', label: 'Transacties' },
  { type: 'budgets', label: 'Budgetten' },
  { type: 'net_worth', label: 'Vermogen' },
  { type: 'assets', label: 'Assets' },
  { type: 'debts', label: 'Schulden' },
  { type: 'goals', label: 'Doelen' },
]

function ExportDropdown() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
      >
        <Download className="h-3.5 w-3.5" />
        Export
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] py-1 shadow-lg">
            {EXPORT_OPTIONS.map(({ type, label }) => (
              <a
                key={type}
                href={`/api/export?type=${type}`}
                download
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)] hover:text-[var(--ink)]"
              >
                <Download className="h-3.5 w-3.5 text-[var(--ink-3)]" />
                {label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SnapshotComparisonContent({ snapshots }: { snapshots: NetWorthSnapshot[] }) {
  if (snapshots.length < 2) return null

  const latest = snapshots[snapshots.length - 1]
  const previous = snapshots[snapshots.length - 2]

  const netDelta = Number(latest.net_worth) - Number(previous.net_worth)
  const assetDelta = Number(latest.total_assets) - Number(previous.total_assets)
  const debtDelta = Number(latest.total_debts) - Number(previous.total_debts)

  function DeltaValue({ value, invert }: { value: number; invert?: boolean }) {
    const isPositive = invert ? value < 0 : value > 0
    const color = value === 0 ? 'text-[var(--ink-3)]' : isPositive ? 'text-emerald-600' : 'text-red-500'
    const prefix = value > 0 ? '+' : ''
    return (
      <span className={`text-lg font-bold ${color}`}>
        {prefix}{formatCurrency(value)}
      </span>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-5">
        <p className="text-sm font-medium text-[var(--ink-3)]">Netto vermogen</p>
        <DeltaValue value={netDelta} />
        <div className="mt-1 flex gap-3 text-xs text-[var(--ink-3)]">
          <span>{formatCurrency(Number(previous.net_worth))}</span>
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--ink-2)]">{formatCurrency(Number(latest.net_worth))}</span>
        </div>
      </div>
      <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-5">
        <p className="text-sm font-medium text-[var(--ink-3)]">Assets</p>
        <DeltaValue value={assetDelta} />
        <div className="mt-1 flex gap-3 text-xs text-[var(--ink-3)]">
          <span>{formatCurrency(Number(previous.total_assets))}</span>
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--ink-2)]">{formatCurrency(Number(latest.total_assets))}</span>
        </div>
      </div>
      <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-5">
        <p className="text-sm font-medium text-[var(--ink-3)]">Schulden</p>
        <DeltaValue value={debtDelta} invert />
        <div className="mt-1 flex gap-3 text-xs text-[var(--ink-3)]">
          <span>{formatCurrency(Number(previous.total_debts))}</span>
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--ink-2)]">{formatCurrency(Number(latest.total_debts))}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Milestone definition for net worth chart markers.
 * Each milestone has a threshold amount, label, and optional badge slug.
 */
type NetWorthMilestone = {
  amount: number
  label: string
  icon: string
  color: string
  badgeSlug?: string
}

/**
 * Detected milestone with the actual date it was achieved.
 */
type DetectedMilestone = NetWorthMilestone & {
  achievedDate: string
  snapshotNetWorth: number
  badgeEarnedAt?: string
}

/**
 * Get applicable milestones based on the data range.
 * Includes both absolute amount milestones and FIRE percentage milestones.
 */
function getNetWorthMilestones(fireTarget: number): NetWorthMilestone[] {
  const milestones: NetWorthMilestone[] = [
    // Crossing zero — positive net worth
    { amount: 0, label: 'In de plus', icon: '📈', color: '#10b981', badgeSlug: 'positief_vermogen' },
    // Round number milestones
    { amount: 10000, label: '€10k', icon: '🎯', color: '#f59e0b' },
    { amount: 25000, label: '€25k', icon: '⭐', color: '#f59e0b' },
    { amount: 50000, label: '€50k', icon: '🌟', color: '#f59e0b' },
    { amount: 100000, label: '€100k', icon: '💎', color: '#8b5cf6' },
    { amount: 250000, label: '€250k', icon: '🏆', color: '#8b5cf6' },
    { amount: 500000, label: '€500k', icon: '👑', color: '#8b5cf6' },
    { amount: 1000000, label: '€1M', icon: '∞', color: '#8b5cf6' },
  ]

  // Add FIRE percentage milestones if we have a FIRE target
  if (fireTarget > 0) {
    milestones.push(
      { amount: fireTarget * 0.10, label: '10% FIRE', icon: '🌱', color: '#a855f7', badgeSlug: 'fire_10_pct' },
      { amount: fireTarget * 0.50, label: '50% FIRE', icon: '🌳', color: '#a855f7', badgeSlug: 'fire_halftime' },
      { amount: fireTarget * 1.00, label: '100% FIRE', icon: '∞', color: '#a855f7', badgeSlug: 'fire_bereikt' },
    )
  }

  return milestones
}

/**
 * Detect which milestones were achieved in the snapshot history.
 * For each milestone, find the first snapshot where net worth crosses the threshold.
 */
function detectMilestones(
  snapshots: NetWorthSnapshot[],
  fireTarget: number,
  earnedBadges: { slug: string; earned_at: string }[]
): DetectedMilestone[] {
  const milestones = getNetWorthMilestones(fireTarget)
  const detected: DetectedMilestone[] = []
  const badgeMap = new Map(earnedBadges.map(b => [b.slug, b.earned_at]))

  for (const milestone of milestones) {
    // For crossing zero: find first snapshot where net_worth > 0 after being <= 0
    if (milestone.amount === 0) {
      const crossingSnapshot = snapshots.find((s, i) => {
        const nw = Number(s.net_worth)
        if (nw <= 0) return false
        // First snapshot or previous was negative/zero
        if (i === 0) return nw > 0
        return Number(snapshots[i - 1].net_worth) <= 0
      })
      if (crossingSnapshot) {
        detected.push({
          ...milestone,
          achievedDate: crossingSnapshot.snapshot_date,
          snapshotNetWorth: Number(crossingSnapshot.net_worth),
          badgeEarnedAt: milestone.badgeSlug ? badgeMap.get(milestone.badgeSlug) : undefined,
        })
      }
      continue
    }

    // For amount thresholds: find first snapshot where net_worth >= threshold
    const crossingSnapshot = snapshots.find((s, i) => {
      const nw = Number(s.net_worth)
      if (nw < milestone.amount) return false
      // First snapshot already above or previous was below
      if (i === 0) return true
      return Number(snapshots[i - 1].net_worth) < milestone.amount
    })

    if (crossingSnapshot) {
      detected.push({
        ...milestone,
        achievedDate: crossingSnapshot.snapshot_date,
        snapshotNetWorth: Number(crossingSnapshot.net_worth),
        badgeEarnedAt: milestone.badgeSlug ? badgeMap.get(milestone.badgeSlug) : undefined,
      })
    }
  }

  return detected
}

function NetWorthChart({ snapshots, fireTarget = 0, earnedBadges = [] }: {
  snapshots: NetWorthSnapshot[]
  fireTarget?: number
  earnedBadges?: { slug: string; earned_at: string }[]
}) {
  const [hoveredMilestone, setHoveredMilestone] = useState<number | null>(null)

  if (snapshots.length === 0) return null

  const W = 600
  const H = 240 // Slightly taller to accommodate milestone markers
  const PAD = 40
  const TOP_PAD = 28 // Extra space for legend

  const dates = snapshots.map(s => new Date(s.snapshot_date).getTime())
  const minDate = Math.min(...dates)
  const maxDate = Math.max(...dates)
  const dateRange = maxDate - minDate || 1

  const allValues = snapshots.flatMap(s => [Number(s.total_assets), Number(s.total_debts), Number(s.net_worth)])
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues, 0)
  const valRange = maxVal - minVal || 1

  function xPos(date: string) { return PAD + ((new Date(date).getTime() - minDate) / dateRange) * (W - PAD * 2) }
  function yPos(val: number) { return H - PAD - ((val - minVal) / valRange) * (H - PAD - TOP_PAD) }

  function line(key: 'total_assets' | 'total_debts' | 'net_worth') {
    return snapshots.map((s, i) => `${i === 0 ? 'M' : 'L'}${xPos(s.snapshot_date).toFixed(1)},${yPos(Number(s[key])).toFixed(1)}`).join(' ')
  }

  // Detect milestones
  const detectedMilestones = detectMilestones(snapshots, fireTarget, earnedBadges)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 260 }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(pct => {
          const yVal = H - PAD - pct * (H - PAD - TOP_PAD)
          const val = minVal + pct * valRange
          return (
            <g key={pct}>
              <line x1={PAD} y1={yVal} x2={W - PAD} y2={yVal} stroke="#e4e4e7" strokeDasharray="4" />
              <text x={PAD - 4} y={yVal + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>
                {val >= 1000 ? `${(val/1000).toFixed(0)}k` : val.toFixed(0)}
              </text>
            </g>
          )
        })}

        {/* Lines */}
        <path d={line('total_assets')} fill="none" stroke="#10b981" strokeWidth="2" />
        <path d={line('total_debts')} fill="none" stroke="#ef4444" strokeWidth="2" />
        <path d={line('net_worth')} fill="none" stroke="#f59e0b" strokeWidth="2.5" />

        {/* Dots for net worth */}
        {snapshots.map((s, i) => (
          <circle key={i} cx={xPos(s.snapshot_date)} cy={yPos(Number(s.net_worth))} r="3" fill="#f59e0b" />
        ))}

        {/* === Milestone Markers === */}
        {detectedMilestones.map((m, i) => {
          const mx = xPos(m.achievedDate)
          const my = yPos(m.snapshotNetWorth)
          const isHovered = hoveredMilestone === i

          return (
            <g
              key={`milestone-${i}`}
              data-testid={`milestone-marker-${m.label.replace(/[^a-zA-Z0-9]/g, '-')}`}
              onMouseEnter={() => setHoveredMilestone(i)}
              onMouseLeave={() => setHoveredMilestone(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Vertical dashed line from milestone to x-axis */}
              <line
                x1={mx} y1={my} x2={mx} y2={H - PAD}
                stroke={m.color}
                strokeWidth="1"
                strokeDasharray="3,3"
                opacity={isHovered ? 0.8 : 0.4}
              />

              {/* Diamond marker at the milestone point */}
              <g transform={`translate(${mx},${my})`}>
                <polygon
                  points="0,-7 5,0 0,7 -5,0"
                  fill={m.color}
                  stroke="white"
                  strokeWidth="1.5"
                  opacity={isHovered ? 1 : 0.85}
                />
              </g>

              {/* Flag icon above the diamond */}
              <text
                x={mx}
                y={my - 12}
                textAnchor="middle"
                style={{ fontSize: 11 }}
              >
                {m.icon}
              </text>

              {/* Tooltip on hover */}
              {isHovered && (
                <g>
                  {/* Tooltip background */}
                  <rect
                    x={Math.min(Math.max(mx - 60, 2), W - 122)}
                    y={my - 50}
                    width={120}
                    height={m.badgeEarnedAt ? 33 : 26}
                    rx={4}
                    fill="white"
                    stroke={m.color}
                    strokeWidth="1"
                    filter="drop-shadow(0 1px 3px rgba(0,0,0,0.15))"
                  />
                  {/* Milestone label + date */}
                  <text
                    x={Math.min(Math.max(mx, 62), W - 62)}
                    y={my - 37}
                    textAnchor="middle"
                    style={{ fontSize: 9, fontWeight: 600 }}
                    className="fill-zinc-700"
                  >
                    {m.label} — {new Date(m.achievedDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </text>
                  {/* Badge earned info */}
                  {m.badgeEarnedAt && (
                    <text
                      x={Math.min(Math.max(mx, 62), W - 62)}
                      y={my - 26}
                      textAnchor="middle"
                      style={{ fontSize: 8 }}
                      className="fill-purple-500"
                    >
                      🏅 Badge verdiend
                    </text>
                  )}
                </g>
              )}
            </g>
          )
        })}

        {/* X-axis labels */}
        {snapshots.filter((_, i) => i % Math.max(1, Math.floor(snapshots.length / 6)) === 0 || i === snapshots.length - 1).map((s, i) => (
          <text key={i} x={xPos(s.snapshot_date)} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {new Date(s.snapshot_date).toLocaleDateString('nl-NL', { month: 'short' })}
          </text>
        ))}

        {/* Legend */}
        <circle cx={PAD} cy={12} r="4" fill="#10b981" />
        <text x={PAD + 8} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>Assets</text>
        <circle cx={PAD + 60} cy={12} r="4" fill="#ef4444" />
        <text x={PAD + 68} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>Schulden</text>
        <circle cx={PAD + 140} cy={12} r="4" fill="#f59e0b" />
        <text x={PAD + 148} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>Netto</text>
        {detectedMilestones.length > 0 && (
          <>
            <polygon points={`${PAD + 220},8 ${PAD + 224},12 ${PAD + 220},16 ${PAD + 216},12`} fill="#a855f7" />
            <text x={PAD + 228} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>Mijlpalen</text>
          </>
        )}
      </svg>

      {/* Milestone summary below chart */}
      {detectedMilestones.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-[var(--ink-3)] mb-1.5">📍 Bereikte mijlpalen</p>
          <div className="flex flex-wrap gap-2">
            {detectedMilestones.map((m, i) => (
              <div
                key={`ms-${i}`}
                data-testid={`milestone-badge-${m.label.replace(/[^a-zA-Z0-9]/g, '-')}`}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                style={{ borderColor: m.color + '40', backgroundColor: m.color + '10' }}
              >
                <span>{m.icon}</span>
                <span className="font-medium" style={{ color: m.color }}>{m.label}</span>
                <span className="text-[var(--ink-3)]">
                  {new Date(m.achievedDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                {m.badgeEarnedAt && <span title="Badge verdiend">🏅</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Budget legend overview (compact category list) ────────────────

function BudgetLegendOverview({
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-[var(--ink-3)]">
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
              className={`flex w-full items-center gap-3 rounded-[var(--r-lg)] border px-3 py-2.5 text-left transition-all ${
                isExpanded ? 'ring-2 ring-kern-400' : ''
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
                <p className="truncate text-sm font-medium text-[var(--ink)]">{seg.name}</p>
                <p className="text-xs text-[var(--ink-3)]">
                  <span className={isOver ? 'font-semibold text-red-600' : ''}>
                    {formatCurrency(seg.spent)}
                  </span>
                  {' / '}
                  {formatCurrency(seg.limit)}
                </p>
              </div>

              <span className={`shrink-0 text-xs font-bold ${isOver ? 'text-red-600' : 'text-[var(--ink-2)]'}`}>
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
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-[var(--subtle)]"
                      onClick={() => onNavigate(child.id)}
                    >
                      <div className="flex items-center gap-0.5">
                        <span className="block h-3 w-1.5 rounded-l-sm" style={{ backgroundColor: cc.spent }} />
                        <span className="block h-3 w-1.5 rounded-r-sm" style={{ backgroundColor: cc.budget }} />
                      </div>
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ backgroundColor: c.bg }}>
                        <BudgetIcon name={child.icon} className="h-3 w-3" />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--ink-2)]">{child.name}</span>
                      <span className="text-xs text-[var(--ink-3)]">
                        <span className={childOver ? 'font-semibold text-red-600' : ''}>
                          {formatCurrency(child.spent)}
                        </span>
                        {' / '}
                        {formatCurrency(child.limit)}
                      </span>
                      <span className={`w-8 text-right text-xs font-medium ${childOver ? 'text-red-600' : 'text-[var(--ink-3)]'}`}>
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
