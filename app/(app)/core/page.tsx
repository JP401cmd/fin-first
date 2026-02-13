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
  PiggyBank, Building2, ArrowRight, Info, Camera, Download,
} from 'lucide-react'
import { FeatureGate } from '@/components/app/feature-gate'

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

      // Fetch budget alert data
      const [budgetResult, spendingResult, snapshotResult] = await Promise.all([
        supabase.from('budgets').select('*'),
        supabase.from('transactions').select('budget_id, amount').gte('date', monthStart).lt('date', monthEnd),
        supabase.from('net_worth_snapshots').select('*').order('snapshot_date', { ascending: true }).limit(24),
      ])

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
      }

      if (snapshotResult.data) {
        setSnapshots(snapshotResult.data as NetWorthSnapshot[])
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
      {/* === Freedom Timeline Hero === */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-950 via-amber-900 to-amber-950 p-8 text-white sm:p-10">
        <div className="pointer-events-none absolute -top-24 right-1/4 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative">
          <div className="mb-6 flex items-center gap-3">
            <FhinAvatar size={40} />
            <p className="text-xs font-semibold tracking-[0.2em] text-amber-300/80 uppercase">
              Jouw tijdlijn naar vrijheid
            </p>
          </div>

          <div className="mb-6">
            <span className="text-6xl font-bold tracking-tight sm:text-7xl">
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
              <span>{formatCurrency(data.fireTarget)} doel</span>
              <span>100%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-amber-300/60 uppercase">Vrijheidstijd</p>
              <p className="mt-1 text-2xl font-bold">
                {data.freedomYears}j {data.freedomMonths}mnd
              </p>
              <p className="text-sm text-amber-200/50">opgebouwde vrijheid</p>
            </div>
            <div>
              <p className="text-xs font-medium text-amber-300/60 uppercase">Netto vermogen</p>
              <p className="mt-1 text-2xl font-bold">{formatCurrency(data.netWorth)}</p>
              <p className="text-sm text-amber-200/50">opgeslagen levensenergie</p>
            </div>
            <div>
              <p className="text-xs font-medium text-amber-300/60 uppercase">Verwachte FIRE</p>
              <p className="mt-1 text-2xl font-bold capitalize">{data.expectedFireDate || '-'}</p>
              {data.yearsToFire > 0 && (
                <p className="text-sm text-amber-200/50">
                  (nog {data.yearsToFire}j en {data.monthsToFire}mnd te gaan)
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* === KPI Stat Cards === */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <Calendar className="h-5 w-5 text-amber-600" />
            </div>
            <KpiTooltip text="Hoeveel extra vrije dagen je deze maand hebt verdiend. Berekening: maandelijkse besparing / dagelijkse uitgaven." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Dagen Gewonnen</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">
            {data.daysWonPerMonth > 0 ? `+${data.daysWonPerMonth}` : data.daysWonPerMonth}
          </p>
          <p className="mt-1 text-xs text-emerald-600">deze maand</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
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

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <Sun className="h-5 w-5 text-amber-600" />
            </div>
            <KpiTooltip text="Hoeveel dagen per jaar je passief inkomen je kosten dekt. Berekening: (netto vermogen × 4% / jaarlijkse uitgaven) × 365." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Vrije Dagen per Jaar</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">{data.freeDaysPerYear}</p>
          <p className="mt-1 text-xs text-zinc-400">gedekt door passief inkomen</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
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
      </section>

      {/* === Budget Alerts === */}
      {alertBudgets.length > 0 && (
        <section className="mt-8">
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

      {/* === Quick links to sub-pages === */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink
          href="/core/cash"
          icon={<Wallet className="h-5 w-5 text-amber-600" />}
          title="Cash"
          value={formatCurrency(data.monthlyIncome - data.monthlyExpenses)}
          subtitle="netto deze maand"
          accent={data.monthlyIncome > data.monthlyExpenses}
        />
        <QuickLink
          href="/core/budgets"
          icon={<ShoppingCart className="h-5 w-5 text-amber-600" />}
          title="Budgetten"
          value={formatCurrency(data.monthlyExpenses)}
          subtitle="uitgaven deze maand"
          accent={false}
        />
        <QuickLink
          href="/core/debts"
          icon={<Building2 className="h-5 w-5 text-red-500" />}
          title="Schulden"
          value={formatCurrency(data.totalDebts)}
          subtitle="totale schuld"
          accent={false}
          negative
        />
        <QuickLink
          href="/core/assets"
          icon={<PiggyBank className="h-5 w-5 text-emerald-600" />}
          title="Assets"
          value={formatCurrency(data.totalAssets)}
          subtitle="totale waarde"
          accent
        />
      </section>

      {/* === Net Worth Chart === */}
      <FeatureGate featureId="vermogensverloop">
      {snapshots.length > 0 && (
        <section className="mt-10">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
                Vermogensverloop
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Netto vermogen over tijd
              </p>
            </div>
            <button
              onClick={createSnapshot}
              disabled={snapshotLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" />
              {snapshotLoading ? 'Bezig...' : 'Snapshot nu'}
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
            <NetWorthChart snapshots={snapshots} />
          </div>
        </section>
      )}

      {snapshots.length === 0 && (
        <section className="mt-10">
          <div className="mb-5">
            <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
              Vermogensverloop
            </h2>
          </div>
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
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
        </section>
      )}
      </FeatureGate>

      {/* === Snapshot Comparison === */}
      <FeatureGate featureId="snapshot_vergelijking">
      {snapshots.length >= 2 && (
        <SnapshotComparison snapshots={snapshots} />
      )}
      </FeatureGate>

      {/* === Financiële Kerngetallen === */}
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
          <FeatureGate featureId="data_export">
          <div className="flex gap-2">
            <ExportButton type="transactions" label="Transacties" />
            <ExportButton type="budgets" label="Budgetten" />
            <ExportButton type="net_worth" label="Vermogen" />
            <ExportButton type="assets" label="Assets" />
            <ExportButton type="debts" label="Schulden" />
            <ExportButton type="goals" label="Doelen" />
          </div>
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
            <p className="mt-1 text-xs text-zinc-400">essentiële kosten per jaar</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function KpiTooltip({ text }: { text: string }) {
  return (
    <div className="group relative">
      <Info className="h-4 w-4 cursor-help text-zinc-300 transition-colors group-hover:text-amber-500" />
      <div className="pointer-events-none absolute right-0 z-10 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        {text}
      </div>
    </div>
  )
}

function QuickLink({
  href,
  icon,
  title,
  value,
  subtitle,
  accent,
  negative,
}: {
  href: string
  icon: React.ReactNode
  title: string
  value: string
  subtitle: string
  accent: boolean
  negative?: boolean
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-amber-200 hover:bg-amber-50/30"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-50 group-hover:bg-amber-50">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-500">{title}</p>
        <p className={`text-lg font-bold ${negative ? 'text-red-600' : accent ? 'text-emerald-600' : 'text-zinc-900'}`}>
          {value}
        </p>
        <p className="text-xs text-zinc-400">{subtitle}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 group-hover:text-amber-500" />
    </Link>
  )
}

function ExportButton({ type, label }: { type: string; label: string }) {
  return (
    <a
      href={`/api/export?type=${type}`}
      download
      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
    >
      <Download className="h-3 w-3" />
      {label}
    </a>
  )
}

function SnapshotComparison({ snapshots }: { snapshots: NetWorthSnapshot[] }) {
  if (snapshots.length < 2) return null

  const latest = snapshots[snapshots.length - 1]
  const previous = snapshots[snapshots.length - 2]

  const netDelta = Number(latest.net_worth) - Number(previous.net_worth)
  const assetDelta = Number(latest.total_assets) - Number(previous.total_assets)
  const debtDelta = Number(latest.total_debts) - Number(previous.total_debts)

  const latestDate = new Date(latest.snapshot_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
  const previousDate = new Date(previous.snapshot_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

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
    <section className="mt-8">
      <div className="mb-4">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Vergelijking snapshots
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          {previousDate} vs {latestDate}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Netto vermogen</p>
          <DeltaValue value={netDelta} />
          <div className="mt-1 flex gap-3 text-xs text-zinc-400">
            <span>{formatCurrency(Number(previous.net_worth))}</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="font-medium text-zinc-600">{formatCurrency(Number(latest.net_worth))}</span>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Assets</p>
          <DeltaValue value={assetDelta} />
          <div className="mt-1 flex gap-3 text-xs text-zinc-400">
            <span>{formatCurrency(Number(previous.total_assets))}</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="font-medium text-zinc-600">{formatCurrency(Number(latest.total_assets))}</span>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-500">Schulden</p>
          <DeltaValue value={debtDelta} invert />
          <div className="mt-1 flex gap-3 text-xs text-zinc-400">
            <span>{formatCurrency(Number(previous.total_debts))}</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="font-medium text-zinc-600">{formatCurrency(Number(latest.total_debts))}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function NetWorthChart({ snapshots }: { snapshots: NetWorthSnapshot[] }) {
  if (snapshots.length === 0) return null

  const W = 600
  const H = 200
  const PAD = 40

  const dates = snapshots.map(s => new Date(s.snapshot_date).getTime())
  const minDate = Math.min(...dates)
  const maxDate = Math.max(...dates)
  const dateRange = maxDate - minDate || 1

  const allValues = snapshots.flatMap(s => [Number(s.total_assets), Number(s.total_debts), Number(s.net_worth)])
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues, 0)
  const valRange = maxVal - minVal || 1

  function x(date: string) { return PAD + ((new Date(date).getTime() - minDate) / dateRange) * (W - PAD * 2) }
  function y(val: number) { return H - PAD - ((val - minVal) / valRange) * (H - PAD * 2) }

  function line(key: 'total_assets' | 'total_debts' | 'net_worth') {
    return snapshots.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.snapshot_date).toFixed(1)},${y(Number(s[key])).toFixed(1)}`).join(' ')
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(pct => {
        const yPos = H - PAD - pct * (H - PAD * 2)
        const val = minVal + pct * valRange
        return (
          <g key={pct}>
            <line x1={PAD} y1={yPos} x2={W - PAD} y2={yPos} stroke="#e4e4e7" strokeDasharray="4" />
            <text x={PAD - 4} y={yPos + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>
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
        <circle key={i} cx={x(s.snapshot_date)} cy={y(Number(s.net_worth))} r="3" fill="#f59e0b" />
      ))}

      {/* X-axis labels */}
      {snapshots.filter((_, i) => i % Math.max(1, Math.floor(snapshots.length / 6)) === 0 || i === snapshots.length - 1).map((s, i) => (
        <text key={i} x={x(s.snapshot_date)} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
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
    </svg>
  )
}
