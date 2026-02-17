'use client'

import { useEffect, useState, useCallback } from 'react'
import { FhinAvatar } from '@/components/app/avatars'
import { computeCoreData, type CoreData } from '@/lib/mock-data'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BudgetAlert, shouldAlert } from '@/components/app/budget-alert'
import type { Budget } from '@/lib/budget-data'
import type { NetWorthSnapshot } from '@/lib/net-worth-data'
import {
  Calendar, TrendingUp, Sun, Star, Wallet, ShoppingCart,
  PiggyBank, Building2, ArrowRight, Info, Camera, Download, ChevronDown, Receipt, Flag, BarChart3,
  CheckCircle2, AlertTriangle, TrendingDown, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react'
import { FeatureGate } from '@/components/app/feature-gate'
import { CollapsibleSection } from '@/components/app/collapsible-section'
import { DiscoverCarousel } from '@/components/app/discover-carousel'
import { LockedFeaturesFooter } from '@/components/app/locked-features-footer'
import { NextStepSection, computeAllKernSteps } from '@/components/app/next-step-card'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'

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
  const [netWorthGrowth, setNetWorthGrowth] = useState<{ amount: number; percentage: number; period: string } | null>(null)
  const [debtProgress, setDebtProgress] = useState<{ totalOriginal: number; totalCurrent: number; progressPct: number } | null>(null)
  const [assetGrowthDirection, setAssetGrowthDirection] = useState<'up' | 'down' | 'flat'>('flat')
  const [overBudgetCount, setOverBudgetCount] = useState(0)

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
          .select('amount')
          .gt('amount', 0)
          .gte('date', twelveMonthsAgo)
          .lt('date', monthEnd),
        supabase
          .from('budgets')
          .select('id, default_limit, interval, budget_type, is_essential')
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
          .select('id, parent_id, default_limit')
          .not('parent_id', 'is', null),
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

      // Yearly must expenses from essential budgets (sum of children per parent)
      const allChildren = childBudgetsResult.data ?? []
      let yearlyMustExpenses = 0
      for (const b of essentialBudgetsResult.data) {
        const children = allChildren.filter(c => c.parent_id === b.id)
        const limit = children.length > 0
          ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
          : Number(b.default_limit)
        if (b.interval === 'monthly') yearlyMustExpenses += limit * 12
        else if (b.interval === 'quarterly') yearlyMustExpenses += limit * 4
        else yearlyMustExpenses += limit
      }

      // Total assets
      const totalAssets = assetsResult.data.reduce((s, a) => s + Number(a.current_value), 0)

      // Total debts
      const totalDebts = debtsResult.data.reduce((s, d) => s + Number(d.current_balance), 0)

      const coreData = computeCoreData(monthlyIncome, monthlyExpenses, totalAssets, totalDebts, extrapolatedIncome, yearlyMustExpenses)
      setData(coreData)

      // Set next step data
      setHasTransactions((txResult.data?.length ?? 0) > 0)

      // Fetch budget alert data + debt progress + asset valuations
      const [budgetResult, spendingResult, snapshotResult, debtFullResult, assetValuationResult] = await Promise.all([
        supabase.from('budgets').select('*'),
        supabase.from('transactions').select('budget_id, amount').gte('date', monthStart).lt('date', monthEnd),
        supabase.from('net_worth_snapshots').select('*').order('snapshot_date', { ascending: true }).limit(24),
        supabase.from('debts').select('current_balance, original_amount').eq('is_active', true),
        supabase.from('valuations').select('value, valuation_date').eq('entity_type', 'asset').order('valuation_date', { ascending: false }).limit(50),
      ])

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

        // Calculate net worth growth trend from snapshots
        if (snaps.length >= 2) {
          const latest = snaps[snaps.length - 1]
          const latestNW = Number(latest.net_worth)
          // Try to find snapshot ~3 months ago for quarterly trend, else use earliest
          const threeMonthsAgo = new Date()
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
          const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0]
          let compareSnap = snaps[0] // default: earliest
          let periodLabel = ''
          // Find closest snapshot to 3 months ago
          for (const s of snaps) {
            if (s.snapshot_date <= threeMonthsAgoStr) {
              compareSnap = s
            }
          }
          const compareNW = Number(compareSnap.net_worth)
          const growthAmount = latestNW - compareNW
          const growthPct = compareNW !== 0 ? ((latestNW - compareNW) / Math.abs(compareNW)) * 100 : 0
          // Determine period label
          const compareDate = new Date(compareSnap.snapshot_date)
          const latestDate = new Date(latest.snapshot_date)
          const diffMs = latestDate.getTime() - compareDate.getTime()
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
          if (diffDays <= 40) periodLabel = 'afgelopen maand'
          else if (diffDays <= 100) periodLabel = 'afgelopen kwartaal'
          else if (diffDays <= 200) periodLabel = `afgelopen ${Math.round(diffDays / 30)} maanden`
          else periodLabel = `afgelopen ${Math.round(diffDays / 30)} maanden`
          setNetWorthGrowth({ amount: growthAmount, percentage: growthPct, period: periodLabel })
        }
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
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error ?? 'Er ging iets mis.'}</p>
          <button onClick={() => { setError(null); setLoading(true); loadData() }} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
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
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* === 1. Hero (Gradient) === */}
      <section data-testid="kern-hero" className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-950 via-amber-900 to-amber-950 p-5 text-white sm:p-8 md:p-10">
        <div className="pointer-events-none absolute -top-24 right-1/4 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative">
          <div className="mb-6 flex items-center gap-3">
            <FhinAvatar size={40} />
            <p className="text-xs font-semibold tracking-[0.2em] text-amber-300/80 uppercase">
              Jouw tijdlijn naar vrijheid
            </p>
          </div>

          <div className="mb-6">
            <span className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              {data.freedomPercentage.toFixed(1)}%
            </span>
            <span className="ml-3 text-lg text-amber-200/70">vrijheid bereikt</span>
          </div>

          <div className="mb-8">
            <div className="h-3 w-full overflow-hidden rounded-full bg-amber-950/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 transition-all duration-1000"
                style={{ width: `${Math.max(Math.min(data.freedomPercentage, 100), 0)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-amber-300/50">
              <span>0%</span>
              <span>{formatCurrency(data.fireTarget)} — volledige vrijheid</span>
              <span>100%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-amber-300/60 uppercase">Netto vermogen</p>
              <p className="mt-1 text-2xl font-bold">{formatCurrency(data.netWorth)}</p>
              <p className="mt-1 text-sm text-amber-200/70" data-testid="net-worth-freedom-subtitle">
                dat is {data.freedomYears > 0 ? `${data.freedomYears} jaar en ` : ''}{data.freedomMonths} maanden vrijheid
              </p>
            </div>
            <div data-testid="vrijheidstijd-opgebouwd">
              <p className="text-xs font-medium text-amber-300/60 uppercase">Vrijheidstijd opgebouwd</p>
              <p className="mt-1 text-2xl font-bold">
                {data.freedomYears}j {data.freedomMonths}mnd
              </p>
              <p className="text-sm text-amber-200/50">vrijheid die je bezit</p>
            </div>
            <div>
              <p className="text-xs font-medium text-amber-300/60 uppercase">Autonomiescore</p>
              <p className="mt-1 text-2xl font-bold">{data.autonomyScore}</p>
              <p className="text-sm text-amber-200/50">
                {data.freeDaysPerYear > 0 ? `${data.freeDaysPerYear} vrije dagen/jaar` : 'bouw je vrijheid op'}
              </p>
            </div>
          </div>
        </div>
      </section>

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
            })}
            moduleColor="amber"
          />
        </section>
      )}

      {/* === 2. KPI Stat Cards (White cards, subtle borders) === */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5" data-testid="kern-kpi-grid">
        <div className="rounded-xl border border-zinc-200 bg-white p-5" data-testid="kpi-dagen-gewonnen">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <Calendar className="h-5 w-5 text-amber-600" />
            </div>
            <KpiTooltip text="Dagen gewonnen deze maand — exclusief De Kern. Berekend als maandelijkse besparing gedeeld door dagelijkse uitgaven. Dit verschilt van 'vrijheidsdagen gewonnen' in De Wil, dat gebaseerd is op voltooide acties." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Dagen Gewonnen</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">
            {data.daysWonPerMonth > 0 ? `+${data.daysWonPerMonth}` : data.daysWonPerMonth}
          </p>
          <p className="mt-1 text-xs text-emerald-600">deze maand</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5" data-testid="kpi-spaarquote">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
            <KpiTooltip text="Percentage van je netto inkomen dat je spaart/belegt over de afgelopen 12 maanden. Bij minder dan 12 maanden data wordt het gemiddelde geëxtrapoleerd naar een jaar." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Spaarquote</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">{savingsRate12.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-zinc-400">
            {savingsRateMonths < 12
              ? `geëxtrapoleerd vanuit ${savingsRateMonths} maand${savingsRateMonths > 1 ? 'en' : ''}`
              : 'laatste 12 maanden'}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5" data-testid="kpi-vrije-dagen">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <Sun className="h-5 w-5 text-amber-600" />
            </div>
            <KpiTooltip text="Vrije dagen per jaar — exclusief De Kern. Hoeveel dagen per jaar je passief inkomen je kosten dekt. Berekening: (netto vermogen × 4% / jaarlijkse uitgaven) × 365. Dit verschilt van 'Open potentieel' in De Wil, dat gebaseerd is op openstaande acties." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Vrije Dagen per Jaar</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">{data.freeDaysPerYear}</p>
          <p className="mt-1 text-xs text-zinc-400">gedekt door passief inkomen</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5" data-testid="kpi-autonomie-score">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <Star className="h-5 w-5 text-amber-600" />
            </div>
            <KpiTooltip text="Hoe dicht je bij financiële vrijheid bent. A+ = vrij, E = begin van de reis. Gebaseerd op je vrijheidspercentage." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Autonomie Score</p>
          <p className="mt-1 text-3xl font-bold text-amber-600">{data.autonomyScore}</p>
          <p className="mt-1 text-xs text-zinc-400">
            {data.autonomyScore === 'A+' ? 'financieel vrij!' :
             data.autonomyScore === 'A' ? 'bijna vrij' :
             data.autonomyScore === 'B' ? 'halverwege — goed bezig' :
             data.autonomyScore === 'C' ? 'kwart bereikt — momentum groeit' :
             data.autonomyScore === 'D' ? 'vroeg stadium — groei zit erin' :
             'begin je reis'}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5" data-testid="kpi-vermogensgroei">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <BarChart3 className="h-5 w-5 text-amber-600" />
            </div>
            <KpiTooltip text="De groei van je netto vermogen over tijd. Gebaseerd op je snapshots. Positieve groei = je bouwt vrijheid op." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Vermogensgroei</p>
          {netWorthGrowth ? (
            <>
              <p className={`mt-1 text-3xl font-bold ${netWorthGrowth.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {netWorthGrowth.amount >= 0 ? '+' : ''}{netWorthGrowth.percentage.toFixed(1)}%
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {netWorthGrowth.amount >= 0 ? '+' : ''}{formatCurrency(netWorthGrowth.amount)} {netWorthGrowth.period}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-3xl font-bold text-zinc-400">&mdash;</p>
              <p className="mt-1 text-xs text-zinc-400">maak minimaal 2 snapshots</p>
            </>
          )}
        </div>
      </section>

      {/* === 3. Alerts (Budget Alerts) === */}
      {alertBudgets.length > 0 && (
        <section className="mt-8" data-testid="kern-alerts">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Aandachtspunten
          </h2>
          <div className="space-y-2">
            {alertBudgets.map(({ budget, spent, limit }) => (
              <BudgetAlert
                key={budget.id}
                budgetName={budget.name}
                budgetId={budget.id}
                spent={spent}
                limit={limit}
                threshold={Number(budget.alert_threshold)}
                budgetType={(budget.budget_type ?? 'expense') as 'income' | 'expense' | 'savings' | 'debt'}
                onNavigate={(id) => router.push(`/core/budgets?budget=${id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* === 4. Mission Control Cards (Primary Content) === */}
      <section className="mt-8" data-testid="mission-control-section">
        <h2 className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Missie Controle
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Cash Card */}
          <MissionControlCard
            href="/core/cash"
            icon={<Wallet className="h-5 w-5 text-amber-600" />}
            title="Cash"
            metric={formatCurrency(data.monthlyIncome - data.monthlyExpenses)}
            metricColor={data.monthlyIncome >= data.monthlyExpenses ? 'text-emerald-600' : 'text-red-600'}
            status={data.monthlyIncome >= data.monthlyExpenses ? 'healthy' : 'attention'}
            statusLabel={data.monthlyIncome >= data.monthlyExpenses ? 'Gezond' : 'Aandacht nodig'}
            details={[
              { label: 'Inkomen', value: formatCurrency(data.monthlyIncome), color: 'text-emerald-600' },
              { label: 'Uitgaven', value: formatCurrency(data.monthlyExpenses), color: 'text-zinc-600' },
            ]}
            cta="Bekijk transacties"
            testId="mission-cash"
          />

          {/* Budgetten Card */}
          <MissionControlCard
            href="/core/budgets"
            icon={<ShoppingCart className="h-5 w-5 text-amber-600" />}
            title="Budgetten"
            metric={overBudgetCount > 0 ? `${overBudgetCount} over budget` : 'Op koers'}
            metricColor={overBudgetCount > 0 ? 'text-red-600' : 'text-emerald-600'}
            status={overBudgetCount === 0 ? 'healthy' : 'attention'}
            statusLabel={overBudgetCount === 0 ? 'Alles op schema' : `${overBudgetCount} overschreden`}
            details={[
              { label: 'Uitgaven', value: formatCurrency(data.monthlyExpenses), color: 'text-zinc-600' },
              { label: 'Budgetten', value: `${budgetCount} actief`, color: 'text-zinc-500' },
            ]}
            cta="Beheer budgetten"
            testId="mission-budgetten"
          />

          {/* Assets Card */}
          <MissionControlCard
            href="/core/assets"
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
              { label: 'Richting', value: assetGrowthDirection === 'up' ? '↑ Omhoog' : assetGrowthDirection === 'down' ? '↓ Omlaag' : '→ Stabiel', color: assetGrowthDirection === 'up' ? 'text-emerald-600' : assetGrowthDirection === 'down' ? 'text-red-500' : 'text-zinc-500' },
            ]}
            cta="Bekijk portfolio"
            testId="mission-assets"
          />

          {/* Schulden Card */}
          <MissionControlCard
            href="/core/debts"
            icon={<Building2 className="h-5 w-5 text-red-500" />}
            title="Schulden"
            metric={data.totalDebts > 0 ? formatCurrency(data.totalDebts) : 'Schuldvrij'}
            metricColor={data.totalDebts > 0 ? 'text-red-600' : 'text-emerald-600'}
            status={data.totalDebts === 0 ? 'healthy' : debtProgress && debtProgress.progressPct > 50 ? 'healthy' : 'attention'}
            statusLabel={data.totalDebts === 0 ? 'Schuldvrij!' : debtProgress ? `${debtProgress.progressPct.toFixed(0)}% afgelost` : 'Vrijheid terugkopen'}
            debtProgress={debtProgress ?? undefined}
            details={[
              { label: 'Openstaand', value: formatCurrency(data.totalDebts), color: 'text-red-600' },
              { label: 'Afgelost', value: debtProgress ? `${debtProgress.progressPct.toFixed(0)}%` : '—', color: debtProgress && debtProgress.progressPct > 0 ? 'text-emerald-600' : 'text-zinc-400' },
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
              className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-amber-200 hover:bg-amber-50/30"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-50 group-hover:bg-amber-50">
                <Receipt className="h-5 w-5 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-zinc-500">Box 3 Belasting</p>
                <p className="text-lg font-bold text-zinc-900">Berekenen</p>
                <p className="text-xs text-zinc-400">vermogensrendementsheffing</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 group-hover:text-amber-500" />
            </Link>
          </div>
        </FeatureGate>
      </section>

      {/* === 5. Net Worth Chart (Deep Dive) === */}
      <FeatureGate featureId="vermogensverloop" fallback="locked">
      <section className="mt-10">
        <CollapsibleSection
          storageKey="kern_vermogensverloop"
          title="Vermogensverloop"
          summary={snapshots.length > 0 ? `${snapshots.length} snapshots — netto vermogen over tijd` : 'Maak je eerste snapshot'}
          icon={<TrendingUp className="h-5 w-5 text-amber-600" />}
        >
          {snapshots.length > 0 ? (
            <>
              <div className="mb-4 flex items-center justify-end">
                <button
                  onClick={createSnapshot}
                  disabled={snapshotLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {snapshotLoading ? 'Bezig...' : 'Snapshot nu'}
                </button>
              </div>
              <NetWorthChart snapshots={snapshots} fireTarget={data.fireTarget} earnedBadges={earnedBadges} />
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-zinc-500">Nog geen snapshots. Maak je eerste snapshot om je vermogensverloop te zien.</p>
              <button
                onClick={createSnapshot}
                disabled={snapshotLoading}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
                {snapshotLoading ? 'Bezig...' : 'Eerste snapshot maken'}
              </button>
            </div>
          )}
        </CollapsibleSection>
      </section>
      </FeatureGate>

      {/* === 6. Snapshot Comparison (Deep Dive) === */}
      <FeatureGate featureId="snapshot_vergelijking" fallback="locked">
      {snapshots.length >= 2 && (
        <section className="mt-10">
          <CollapsibleSection
            storageKey="kern_snapshot_vergelijking"
            title="Vergelijking snapshots"
            summary={`${new Date(snapshots[snapshots.length - 2].snapshot_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} vs ${new Date(snapshots[snapshots.length - 1].snapshot_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`}
            icon={<Camera className="h-5 w-5 text-amber-600" />}
          >
            <SnapshotComparisonContent snapshots={snapshots} />
          </CollapsibleSection>
        </section>
      )}
      </FeatureGate>

      {/* === 7. Financiële Kerngetallen (Deep Dive) === */}
      <section className="mt-10">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
              Financiële Kerngetallen
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Gebaseerd op je werkelijke transacties en budgetinstellingen.
            </p>
          </div>
          <FeatureGate featureId="data_export" fallback="locked">
            <ExportDropdown />
          </FeatureGate>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                <TrendingUp className="h-6 w-6 text-emerald-600" />
              </div>
              <KpiTooltip text="Geschat jaarinkomen gebaseerd op werkelijke transacties. Bij minder dan 12 maanden data wordt het gemiddelde geextrapoleerd naar een jaar." />
            </div>
            <p className="text-sm font-medium text-zinc-500">Geschat Jaarinkomen</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{formatCurrency(data.estimatedYearlyIncome)}</p>
            <FreedomTimeBadge amount={data.estimatedYearlyIncome} className="mt-1" />
            <p className="mt-1 text-xs text-zinc-400">
              {incomeMonths < 12
                ? `geextrapoleerd vanuit ${incomeMonths} maand${incomeMonths > 1 ? 'en' : ''}`
                : 'laatste 12 maanden'}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
                <ShoppingCart className="h-6 w-6 text-zinc-500" />
              </div>
              <KpiTooltip text="Jaarlijkse som van je essentiële budgetten: vaste lasten, dagelijkse uitgaven en vervoer. Dit zijn de kosten die je sowieso maakt." />
            </div>
            <p className="text-sm font-medium text-zinc-500">Jaarlijkse Must Uitgaven</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{formatCurrency(data.yearlyMustExpenses)}</p>
            <FreedomTimeBadge amount={data.yearlyMustExpenses} className="mt-1" />
            <p className="mt-1 text-xs text-zinc-400">essentiële kosten per jaar</p>
          </div>
        </div>
      </section>

      {/* === 8. Locked Features Footer === */}
      <LockedFeaturesFooter module="kern" />

      {/* === 9. Discover Carousel === */}
      <DiscoverCarousel module="kern" />
    </div>
  )
}

function KpiTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label="Meer informatie"
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        className="touch-target"
      >
        <Info className={`h-4 w-4 cursor-help transition-colors ${open ? 'text-amber-500' : 'text-zinc-300'} group-hover:text-amber-500`} />
      </button>
      <div role="tooltip" className={`absolute right-0 z-10 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 shadow-lg transition-opacity ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}>
        {text}
      </div>
    </div>
  )
}

function MissionControlCard({
  href,
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
    <Link
      href={href}
      data-testid={testId}
      className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-5 transition-all hover:border-amber-200 hover:bg-amber-50/20 hover:shadow-sm"
    >
      {/* Header: icon + title + status */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-50 group-hover:bg-amber-50">
            {icon}
          </div>
          <p className="text-sm font-semibold text-zinc-700">{title}</p>
        </div>
        <div data-testid={`${testId}-status`} className="flex items-center gap-1">
          {status === 'healthy' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
        </div>
      </div>

      {/* Key Metric */}
      <div className="mb-2">
        <div className="flex items-baseline gap-2">
          <p className={`text-2xl font-bold ${metricColor}`}>{metric}</p>
          {growthDirection && (
            <span className="flex items-center">
              {growthDirection === 'up' && <ArrowUpRight className="h-4 w-4 text-emerald-500" />}
              {growthDirection === 'down' && <ArrowDownRight className="h-4 w-4 text-red-500" />}
              {growthDirection === 'flat' && <Minus className="h-4 w-4 text-zinc-400" />}
            </span>
          )}
        </div>
      </div>

      {/* Status label */}
      <div className={`mb-3 inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${
        status === 'healthy'
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-amber-50 text-amber-700'
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
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${debtProg.progressPct}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-zinc-400">
            {formatCurrency(debtProg.totalOriginal - debtProg.totalCurrent)} afgelost van {formatCurrency(debtProg.totalOriginal)}
          </p>
        </div>
      )}

      {/* Detail lines */}
      <div className="mt-auto space-y-1 border-t border-zinc-100 pt-3">
        {details.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">{d.label}</span>
            <span className={`font-medium ${d.color}`}>{d.value}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-medium text-amber-600 opacity-0 transition-opacity group-hover:opacity-100">{cta}</span>
        <ArrowRight className="h-4 w-4 text-zinc-300 transition-colors group-hover:text-amber-500" />
      </div>
    </Link>
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
      >
        <Download className="h-3.5 w-3.5" />
        Export
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
            {EXPORT_OPTIONS.map(({ type, label }) => (
              <a
                key={type}
                href={`/api/export?type=${type}`}
                download
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              >
                <Download className="h-3.5 w-3.5 text-zinc-400" />
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
    const color = value === 0 ? 'text-zinc-500' : isPositive ? 'text-emerald-600' : 'text-red-500'
    const prefix = value > 0 ? '+' : ''
    return (
      <span className={`text-lg font-bold ${color}`}>
        {prefix}{formatCurrency(value)}
      </span>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-5">
        <p className="text-sm font-medium text-zinc-500">Netto vermogen</p>
        <DeltaValue value={netDelta} />
        <div className="mt-1 flex gap-3 text-xs text-zinc-400">
          <span>{formatCurrency(Number(previous.net_worth))}</span>
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="font-medium text-zinc-600">{formatCurrency(Number(latest.net_worth))}</span>
        </div>
      </div>
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-5">
        <p className="text-sm font-medium text-zinc-500">Assets</p>
        <DeltaValue value={assetDelta} />
        <div className="mt-1 flex gap-3 text-xs text-zinc-400">
          <span>{formatCurrency(Number(previous.total_assets))}</span>
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="font-medium text-zinc-600">{formatCurrency(Number(latest.total_assets))}</span>
        </div>
      </div>
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-5">
        <p className="text-sm font-medium text-zinc-500">Schulden</p>
        <DeltaValue value={debtDelta} invert />
        <div className="mt-1 flex gap-3 text-xs text-zinc-400">
          <span>{formatCurrency(Number(previous.total_debts))}</span>
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="font-medium text-zinc-600">{formatCurrency(Number(latest.total_debts))}</span>
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
          <p className="text-xs font-medium text-zinc-500 mb-1.5">📍 Bereikte mijlpalen</p>
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
                <span className="text-zinc-400">
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
