'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatWithFreedom } from '@/lib/format'
import { FhinAvatar } from '@/components/app/avatars'
import {
  calculateBox3,
  generateBox3Optimizations,
  BOX3_TOOLTIPS,
  type Box3Input,
  type Box3Result,
  type TaxYear,
} from '@/lib/box3-data'
import { computeYearlyMustExpenses, computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { Box3Classification } from '@/components/app/core/box3-classification'
import { Box3Calculation } from '@/components/app/core/box3-calculation'
import { Box3ScenarioModal } from '@/components/app/core/box3-scenario-modal'
import { Box3PartnerModal } from '@/components/app/core/box3-partner-modal'
import {
  Info, Receipt, ArrowRightLeft, Users, Lightbulb,
  Clock, Percent, CalendarDays, ShieldCheck, Target, TrendingDown, Calculator, AlertTriangle,
} from 'lucide-react'
import {
  NL_FICTIEF_BELEGGINGEN, BOX3_TARIEF, BOX3_DRAG, NL_INFLATIE, NL_SWR, NL_MULTIPLIER,
  CLASSIC_MULTIPLIER, DEFAULT_RETURN,
} from '@/lib/horizon-data'
import { FeatureGate } from '@/components/app/feature-gate'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'

function KpiTooltip({ text }: { text: string }) {
  return (
    <div className="group relative">
      <Info className="h-4 w-4 cursor-help text-[var(--ink-4)] transition-colors group-hover:text-kern-500" />
      <div className="pointer-events-none absolute right-0 z-10 mt-1 w-56 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-xs leading-relaxed text-[var(--ink-2)] opacity-0 shadow-[var(--s2)] transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        {text}
      </div>
    </div>
  )
}

export default function BelastingPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [dailyExpenses, setDailyExpenses] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState<TaxYear>(2025)
  const [hasPartner, setHasPartner] = useState(false)
  const [showScenarioModal, setShowScenarioModal] = useState(false)
  const [showPartnerModal, setShowPartnerModal] = useState(false)
  const [showFireKassabon, setShowFireKassabon] = useState(false)
  const [showBelastingKassabon, setShowBelastingKassabon] = useState(false)
  const [showTariefKassabon, setShowTariefKassabon] = useState(false)
  const [showVrijheidsdagenKassabon, setShowVrijheidsdagenKassabon] = useState(false)
  const [showHeffingsvrijKassabon, setShowHeffingsvrijKassabon] = useState(false)


  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

      const [assetsResult, debtsResult, txResult, essentialBudgetsResult, allChildrenResult, profileResult] = await Promise.all([
        supabase.from('assets').select('*').eq('is_active', true),
        supabase.from('debts').select('*').eq('is_active', true),
        supabase
          .from('transactions')
          .select('amount')
          .gte('date', monthStart)
          .lt('date', monthEnd),
        supabase.from('budgets').select('*').eq('is_essential', true),
        supabase.from('budgets').select('*').not('parent_id', 'is', null),
        supabase.from('profiles').select('retirement_expense_method, retirement_expense_custom_amount').single(),
      ])

      if (assetsResult.error) throw assetsResult.error
      if (debtsResult.error) throw debtsResult.error
      if (txResult.error) throw txResult.error

      setAssets(assetsResult.data as Asset[])
      setDebts(debtsResult.data as Debt[])

      // Prefer retirement expense method for daily cost basis; fall back to transaction data
      const { yearlyMustExpenses } = computeYearlyMustExpenses(
        essentialBudgetsResult.data ?? [],
        allChildrenResult.data ?? [],
      )
      // Note: monthlyIncome not available here; method 3 (current_income) falls back to must-expenses
      const yearlyRetirementExpenses = computeRetirementExpenses(
        profileResult.data?.retirement_expense_method as RetirementExpenseMethod,
        yearlyMustExpenses,
        0,
        profileResult.data?.retirement_expense_custom_amount,
      )
      if (yearlyRetirementExpenses > 0) {
        setDailyExpenses(yearlyRetirementExpenses / 365)
      } else {
        const monthlyExpenses = (txResult.data ?? []).reduce((sum, t) => {
          const amt = Number(t.amount)
          return amt < 0 ? sum + Math.abs(amt) : sum
        }, 0)
        setDailyExpenses(monthlyExpenses > 0 ? (monthlyExpenses * 12) / 365 : 0)
      }
    } catch (err) {
      console.error('Error loading belasting data:', err)
      setError('Kon gegevens niet laden. Probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const input: Box3Input = useMemo(() => ({
    assets,
    debts,
    hasPartner,
    dailyExpenses,
    year,
  }), [assets, debts, hasPartner, dailyExpenses, year])

  const result: Box3Result | null = useMemo(() => {
    if (assets.length === 0 && debts.length === 0) return null
    return calculateBox3(input)
  }, [input, assets.length, debts.length])

  const optimizations = useMemo(() => {
    if (!result) return []
    return generateBox3Optimizations(result, input)
  }, [result, input])

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
          <button
            onClick={() => { setError(null); setLoading(true); loadData() }}
            className="mt-3 rounded-[var(--r)] bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">
            Geen assets of schulden gevonden. Voeg eerst je vermogen toe bij Assets en Schulden.
          </p>
        </div>
      </div>
    )
  }

  const effectiefTariefPct = (result.totaalSpaargeld + result.totaalBeleggingen) > 0
    ? (result.tax / (result.totaalSpaargeld + result.totaalBeleggingen)) * 100
    : 0
  const heffingsvrijBenut = result.heffingsvrijVermogen > 0
    ? Math.min(100, (Math.min(result.rendementsgrondslag, result.heffingsvrijVermogen) / result.heffingsvrijVermogen) * 100)
    : 0

  // Echte jaaruitgaven afgeleid van bestaande dailyExpenses state
  const annualExpenses = Math.round(dailyExpenses * 365)
  const displayExpenses = annualExpenses > 0 ? annualExpenses : 40000
  const hasRealData = annualExpenses > 0

  return (
    <FeatureGate featureId="box3_belasting" fallback="locked">
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">

      {/* === A. Hero Banner === */}
      <section className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)]" data-testid="belasting-hero">
        <div className="h-1.5 bg-kern-500" />
        <div className="p-5 sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FhinAvatar size={40} />
              <p className="label-editorial text-kern-600">
                Box 3 Vermogensrendementsheffing
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Year toggle */}
              <div className="flex overflow-hidden rounded-[var(--r)] border border-[var(--border-md)]">
                {([2025, 2026] as TaxYear[]).map(y => (
                  <button
                    key={y}
                    onClick={() => setYear(y)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      year === y
                        ? 'bg-kern-600 text-white'
                        : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
              {/* Partner toggle */}
              <button
                onClick={() => setHasPartner(v => !v)}
                className={`flex items-center gap-1 rounded-[var(--r)] border px-3 py-1.5 text-xs font-medium transition-colors ${
                  hasPartner
                    ? 'border-kern-500 bg-kern-600 text-white'
                    : 'border-[var(--border-md)] text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Partner
              </button>
            </div>
          </div>

          <div className="mb-3">
            <span className="font-display text-[36px] font-bold tracking-tight text-[var(--ink)] sm:text-[44px] md:text-[52px]" data-testid="belasting-hero-amount">
              {formatCurrency(result.tax)}
            </span>
          </div>

          <div className="mb-1 flex items-center gap-2">
            <p className="font-serif italic text-lg text-[var(--ink-3)]" data-testid="belasting-hero-freedom-days">
              Box 3 kost je{' '}
              <span className="font-semibold not-italic text-[var(--ink-2)]">
                {result.freedomDays} vrijheidsdagen
              </span>
            </p>
            <KpiTooltip text={BOX3_TOOLTIPS.box3} />
          </div>
          {result.tax >= 100 && (
            <p className="mb-6 text-sm text-[var(--ink-3)]" data-testid="belasting-hero-freedom-time">
              {formatWithFreedom(result.tax, dailyExpenses, { includeCurrency: false })} verloren aan belasting
            </p>
          )}
          {result.tax < 100 && <div className="mb-6" />}

          <div className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>Peildatum: 1 januari {year}</span>
            <KpiTooltip text={BOX3_TOOLTIPS.peildatum} />
          </div>
        </div>
      </section>

      {/* === B. KPI Cards === */}
      <section className="mt-5 sm:mt-8 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setShowBelastingKassabon(true)}
          className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5 text-left transition-all hover:border-kern-300 hover:shadow-sm"
          data-testid="kpi-totale-belasting"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-[var(--r)] bg-kern-50">
              <Receipt className="h-5 w-5 text-kern-600" />
            </div>
            <KpiTooltip text="De totale Box 3 belasting die je verschuldigd bent, berekend op basis van je vermogen op de peildatum." />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">Totale Belasting</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[var(--ink)]">{formatCurrency(result.tax)}</p>
          <FreedomTimeBadge amount={result.tax} className="mt-2" />
        </button>

        <button
          type="button"
          onClick={() => setShowTariefKassabon(true)}
          className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5 text-left transition-all hover:border-kern-300 hover:shadow-sm"
          data-testid="kpi-effectief-tarief"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-[var(--r)] bg-kern-50">
              <Percent className="h-5 w-5 text-kern-600" />
            </div>
            <KpiTooltip text={BOX3_TOOLTIPS.effectiefTarief} />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">Effectief Tarief</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[var(--ink)]">{effectiefTariefPct.toFixed(2)}%</p>
          <p className="mt-1 text-xs text-[var(--ink-3)]" data-testid="kpi-tarief-freedom">
            {formatCurrency(result.tax)} belasting
          </p>
        </button>

        <button
          type="button"
          onClick={() => setShowVrijheidsdagenKassabon(true)}
          className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5 text-left transition-all hover:border-kern-300 hover:shadow-sm"
          data-testid="kpi-vrijheidsdagen"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-[var(--r)] bg-kern-50">
              <Clock className="h-5 w-5 text-kern-600" />
            </div>
            <KpiTooltip text="Hoeveel vrijheidsdagen je verliest aan Box 3 belasting. Berekening: belasting / dagelijkse uitgaven." />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">Vrijheidsdagen verloren</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[var(--ink)]">-{result.freedomDays}</p>
          {result.tax >= 100 && (
            <p className="mt-1 text-xs text-[var(--ink-3)]" data-testid="kpi-vrijheidsdagen-time">
              {formatWithFreedom(result.tax, dailyExpenses, { includeCurrency: false })}
            </p>
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowHeffingsvrijKassabon(true)}
          className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5 text-left transition-all hover:border-kern-300 hover:shadow-sm"
          data-testid="kpi-heffingsvrij"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-[var(--r)] bg-kern-50">
              <ShieldCheck className="h-5 w-5 text-kern-600" />
            </div>
            <KpiTooltip text={BOX3_TOOLTIPS.heffingsvrijVermogen} />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">Heffingsvrij Benut</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[var(--ink)]">{heffingsvrijBenut.toFixed(0)}%</p>
          <p className="mt-1 text-xs text-[var(--ink-3)]" data-testid="kpi-heffingsvrij-freedom">
            {formatWithFreedom(result.heffingsvrijVermogen, dailyExpenses, { format: 'short', includeCurrency: true })}
          </p>
        </button>
      </section>

      {/* === C. Vermogensindeling === */}
      <section className="mt-5 sm:mt-8">
        <div className="mb-5">
          <h2 className="label-editorial text-[var(--ink-2)]">
            Vermogensindeling Box 3
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Hoe je assets en schulden worden geclassificeerd voor de belastingaangifte.
          </p>
        </div>
        <Box3Classification
          assetClassifications={result.assetClassifications}
          debtClassifications={result.debtClassifications}
        />
      </section>

      {/* === D. Berekening Stap-voor-Stap === */}
      <section className="mt-5 sm:mt-8">
        <Box3Calculation result={result} />
      </section>

      {/* === E. Wat-Als Scenario's === */}
      <section className="mt-5 sm:mt-8">
        <div className="mb-5">
          <h2 className="label-editorial text-[var(--ink-2)]">
            Wat-als scenario&apos;s
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Ontdek hoe je Box 3 belasting verandert bij andere keuzes.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <button
            onClick={() => setShowScenarioModal(true)}
            className="group flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-left transition-all hover:border-kern-200 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] group-hover:bg-kern-50">
              <ArrowRightLeft className="h-5 w-5 text-kern-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--ink)]">Vermogen verschuiven</p>
              <p className="text-xs text-[var(--ink-3)]">Beleggingen &harr; spaargeld</p>
            </div>
          </button>

          <button
            onClick={() => setShowScenarioModal(true)}
            className="group flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-left transition-all hover:border-kern-200 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] group-hover:bg-kern-50">
              <CalendarDays className="h-5 w-5 text-kern-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--ink)]">Vergelijk jaren</p>
              <p className="text-xs text-[var(--ink-3)]">2025 vs 2026 side-by-side</p>
            </div>
          </button>

          <button
            onClick={() => setShowPartnerModal(true)}
            className="group flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-left transition-all hover:border-kern-200 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] group-hover:bg-kern-50">
              <Users className="h-5 w-5 text-kern-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--ink)]">Verdeling partner</p>
              <p className="text-xs text-[var(--ink-3)]">Optimale partnerverdeling</p>
            </div>
          </button>
        </div>
      </section>

      {/* === F. Optimalisatietips === */}
      {optimizations.length > 0 && (
        <section className="mt-5 sm:mt-8">
          <div className="mb-5">
            <h2 className="label-editorial text-[var(--ink-2)]">
              Optimalisatietips
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              Concrete acties om je Box 3 belasting te verlagen.
            </p>
          </div>
          <div className="space-y-3">
            {optimizations.map(tip => (
              <div
                key={tip.id}
                className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5 transition-all hover:border-kern-200 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-kern-50">
                    <Lightbulb className="h-5 w-5 text-kern-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[var(--ink)]">{tip.title}</p>
                    <p className="mt-1 text-xs text-[var(--ink-3)]">{tip.description}</p>
                    {tip.savings > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2" data-testid={`optimization-${tip.id}-savings`}>
                        <span className="rounded-full border border-kern-100 bg-kern-50 px-2 py-0.5 text-[10px] font-medium text-kern-700">
                          Besparing: {tip.savings >= 100 ? formatWithFreedom(tip.savings, dailyExpenses) : formatCurrency(tip.savings)}
                        </span>
                        {tip.freedomDays > 0 && (
                          <span className="rounded-full border border-kern-100 bg-kern-50 px-2 py-0.5 text-[10px] font-medium text-kern-700" data-testid={`optimization-${tip.id}-freedom`}>
                            +{tip.freedomDays} vrijheidsdagen teruggewonnen
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* === G. FIRE & Box 3 === */}
      <section className="mt-5 sm:mt-8">
        <div className="mb-5">
          <h2 className="label-editorial text-kern-600">FIRE &amp; BOX 3</h2>
          <p className="mt-1 font-playfair text-2xl font-semibold text-[var(--ink)]">
            Waarom de 4%-regel niet werkt in Nederland
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-3)]">
            De klassieke FIRE 4%-regel is berekend voor de Amerikaanse markt en houdt geen rekening
            met de Nederlandse vermogensrendementsheffing. Box 3 heft belasting over een fictief
            rendement — ook als je werkelijke rendement tegenvalt. Dit eet elk jaar een vast
            percentage van je vermogen op en verlaagt je effectieve opnamepercentage aanzienlijk.
          </p>
        </div>

        {/* Stap-voor-stap berekeningskaart */}
        <KassabonShell>
          <div className="mb-3 text-center">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              NL-FIRE BEREKENING
            </p>
            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
              wat er overblijft van je rendement na belasting
            </p>
          </div>

          {/* Stap 1 */}
          <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Stap 1: Bruto marktrendement</span>
              <span className="tabular-nums text-emerald-700">+{(DEFAULT_RETURN * 100).toFixed(2)}%</span>
            </div>
            <p className="mt-0.5 font-sans text-[11px] text-[var(--ink-4)]">
              Historisch gemiddeld — basis FIRE-aanname (S&amp;P 500 / wereldindex)
            </p>
          </div>

          {/* Stap 2 */}
          <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Stap 2: Box 3 afdracht</span>
              <span className="tabular-nums text-red-500">−{(BOX3_DRAG * 100).toFixed(2)}%</span>
            </div>
            <div className="mt-1 space-y-0.5 font-sans text-[11px] text-[var(--ink-4)]">
              <p>Fictief rendement beleggingen: {(NL_FICTIEF_BELEGGINGEN * 100).toFixed(2)}%</p>
              <p>× Belastingtarief: {(BOX3_TARIEF * 100).toFixed(0)}%</p>
              <p className="text-[var(--ink-3)]">= {(BOX3_DRAG * 100).toFixed(2)}% van je totale vermogen, elk jaar</p>
              <p className="font-sans text-[11px] italic text-[var(--ink-4)]">(ook als je werkelijke rendement tegenvalt)</p>
            </div>
          </div>

          {/* Stap 3 */}
          <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Stap 3: Netto na belasting</span>
              <span className="tabular-nums text-[var(--ink)]">{((DEFAULT_RETURN - BOX3_DRAG) * 100).toFixed(2)}%</span>
            </div>
            <p className="mt-0.5 font-sans text-[11px] text-[var(--ink-4)]">
              ({(DEFAULT_RETURN * 100).toFixed(2)}% − {(BOX3_DRAG * 100).toFixed(2)}%)
            </p>
          </div>

          {/* Stap 4 */}
          <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Stap 4: Inflatieverrekening</span>
              <span className="tabular-nums text-red-500">−{(NL_INFLATIE * 100).toFixed(2)}%</span>
            </div>
            <p className="mt-0.5 font-sans text-[11px] text-[var(--ink-4)]">
              Langjarig NL inflatiegemiddelde — je koopkracht moet gelijk blijven
            </p>
          </div>

          {/* Totaalregel */}
          <div className="mt-2 border-t-2 border-[var(--ink)] pt-2">
            <div className="flex justify-between font-bold">
              <span className="text-[var(--ink)]">Beschikbaar om op te nemen</span>
              <span className="tabular-nums text-[var(--ink)]">{(NL_SWR * 100).toFixed(2)}%</span>
            </div>
            <p className="mt-0.5 font-sans text-[11px] text-[var(--ink-3)]">NL Safe Withdrawal Rate</p>
          </div>
        </KassabonShell>

        {/* Impact vergelijking — twee kaartjes */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Classic FIRE */}
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)]">
                <Target className="h-4 w-4 text-[var(--ink-3)]" />
              </div>
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                Klassiek FIRE (VS)
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-sans text-xs text-[var(--ink-3)]">Safe Withdrawal Rate</span>
                <span className="font-mono text-sm font-semibold text-[var(--ink)]">4,00%</span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-xs text-[var(--ink-3)]">Multiplier</span>
                <span className="font-mono text-sm font-semibold text-[var(--ink)]">{CLASSIC_MULTIPLIER}×</span>
              </div>
              <div className="mt-2 border-t border-dashed border-[var(--border-ed)] pt-2">
                <p className="font-sans text-[10px] text-[var(--ink-4)]">
                  {hasRealData ? 'Jouw jaaruitgaven' : 'Bij €40.000/jr'} nodig:
                </p>
                <p className="font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(displayExpenses * CLASSIC_MULTIPLIER)}
                </p>
                {hasRealData && (
                  <p className="font-sans text-[10px] text-[var(--ink-4)]">
                    ({formatCurrency(displayExpenses)}/jr)
                  </p>
                )}
                <FreedomTimeBadge amount={displayExpenses * CLASSIC_MULTIPLIER} className="mt-1.5" />
              </div>
            </div>
          </div>

          {/* NL FIRE */}
          <div className="rounded-[var(--r-lg)] border border-kern-200 bg-kern-50/30 p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[var(--r)] bg-kern-100">
                <TrendingDown className="h-4 w-4 text-kern-600" />
              </div>
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-kern-700">
                Nederland (na Box 3)
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-sans text-xs text-[var(--ink-3)]">NL Safe Withdrawal Rate</span>
                <span className="font-mono text-sm font-semibold text-kern-700">{(NL_SWR * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-xs text-[var(--ink-3)]">Multiplier</span>
                <span className="font-mono text-sm font-semibold text-[var(--ink)]">{NL_MULTIPLIER.toFixed(1)}×</span>
              </div>
              <div className="mt-2 border-t border-dashed border-[var(--border-ed)] pt-2">
                <p className="font-sans text-[10px] text-[var(--ink-4)]">
                  {hasRealData ? 'Jouw jaaruitgaven' : 'Bij €40.000/jr'} nodig:
                </p>
                <p className="font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(Math.round(displayExpenses * NL_MULTIPLIER))}
                </p>
                <FreedomTimeBadge amount={Math.round(displayExpenses * NL_MULTIPLIER)} className="mt-1.5" />
                <span className="mt-2 inline-block rounded-full border border-kern-100 bg-kern-50 px-2 py-0.5 font-sans text-[10px] font-medium text-kern-700">
                  +{((NL_MULTIPLIER / CLASSIC_MULTIPLIER - 1) * 100).toFixed(0)}% meer dan klassiek
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Drie nuance-cards */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Card 1: Heffingsvrij */}
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-kern-500" />
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                Heffingsvrij vermogen
              </p>
            </div>
            <p className="font-sans text-xs leading-relaxed text-[var(--ink-3)]">
              De eerste <span className="font-semibold text-[var(--ink-2)]">€57.684</span> is belastingvrij
              (alleenstaand 2025). Dit verbetert de berekening voor kleinere vermogens — je betaalt
              pas Box 3 over het meerdere.
            </p>
          </div>

          {/* Card 2: Schuldenaftrek */}
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <div className="mb-2 flex items-center gap-2">
              <Calculator className="h-4 w-4 text-kern-500" />
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                Schuldenaftrek
              </p>
            </div>
            <p className="font-sans text-xs leading-relaxed text-[var(--ink-3)]">
              Schulden verlagen je Box 3 grondslag. Aftrek: fictief rendement{' '}
              <span className="font-semibold text-[var(--ink-2)]">2.70%</span> (minus €3.800 drempel).
              Dit maakt schulden relatief voordelig voor je belastinggrondslag.
            </p>
          </div>

          {/* Card 3: 2028 */}
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-kern-500" />
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                Toekomst — 2028
              </p>
            </div>
            <p className="font-sans text-xs leading-relaxed text-[var(--ink-3)]">
              Nieuwe wetgeving: belasting over <span className="font-semibold text-[var(--ink-2)]">werkelijk rendement</span>.
              Bij 7% rendement: 7% × 36% ={' '}
              <span className="font-semibold text-[var(--ink-2)]">2.52% drag</span> (iets hoger dan 2025&apos;s 2.12%).
            </p>
          </div>
        </div>

        {/* Officiële percentages tabel + BottomSheet knop */}
        <div className="mt-4 rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4">
          <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
            Belastingdienst — forfaitaire rendementen 2025
          </p>
          <div className="space-y-1 font-mono text-sm">
            {[
              { label: 'Banktegoeden (sparen)', pct: '1.37%' },
              { label: 'Overige bezittingen (beleggen)', pct: '5.88%' },
              { label: 'Schulden (aftrek)', pct: '2.70%' },
              { label: 'Belastingtarief Box 3', pct: '36%' },
              { label: 'Heffingsvrij vermogen (alleenstaand)', pct: '€57.684' },
            ].map(row => (
              <div key={row.label} className="flex justify-between border-b border-dashed border-[var(--border-ed)] py-1 last:border-0">
                <span className="font-sans text-xs text-[var(--ink-3)]">{row.label}</span>
                <span className="tabular-nums text-xs text-[var(--ink-2)]">{row.pct}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="font-sans text-[10px] text-[var(--ink-4)]">
              Bron: Belastingdienst.nl — peildatum 1 januari 2025
            </p>
            <button
              type="button"
              onClick={() => setShowFireKassabon(true)}
              className="rounded-[var(--r)] border border-kern-200 bg-[var(--paper)] px-3 py-1.5 font-sans text-xs font-medium text-kern-700 transition-all hover:border-kern-300 hover:shadow-sm"
            >
              Bekijk berekeningsbronnen
            </button>
          </div>
        </div>
      </section>

      {/* === Modals === */}

      {/* KPI: Totale Belasting */}
      <BottomSheet open={showBelastingKassabon} title="Totale Belasting" onClose={() => setShowBelastingKassabon(false)}>
        <KassabonShell>
          <div className="mb-3 text-center">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              BOX 3 BELASTINGBEREKENING
            </p>
            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
              peildatum 1 januari {year}
            </p>
          </div>
          <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
            Box 3 belasting wordt berekend over een fictief rendement op je vermogen, niet over je werkelijke rendement.
          </div>
          <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Rendementsgrondslag</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(result.rendementsgrondslag)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Heffingsvrij vermogen</span>
              <span className="tabular-nums text-emerald-700">−{formatCurrency(result.heffingsvrijVermogen)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Belastbare grondslag</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(Math.max(0, result.rendementsgrondslag - result.heffingsvrijVermogen))}</span>
            </div>
          </div>
          <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Fictief rendement (gemiddeld)</span>
              <span className="tabular-nums text-[var(--ink)]">× ca. {(NL_FICTIEF_BELEGGINGEN * 100).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Belastingtarief Box 3</span>
              <span className="tabular-nums text-[var(--ink)]">× {(BOX3_TARIEF * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
            <span className="text-[var(--ink)]">Totale belasting</span>
            <span className="tabular-nums text-[var(--ink)]">{formatCurrency(result.tax)}</span>
          </div>
          <FreedomTimeBadge amount={result.tax} className="mx-auto mt-3 block" />
          <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
            Bron: berekend op basis van je assets en schulden · Belastingdienst.nl tarieven {year}
          </p>
        </KassabonShell>
      </BottomSheet>

      {/* KPI: Effectief Tarief */}
      <BottomSheet open={showTariefKassabon} title="Effectief Tarief" onClose={() => setShowTariefKassabon(false)}>
        <KassabonShell>
          <div className="mb-3 text-center">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              EFFECTIEF BELASTINGTARIEF
            </p>
            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
              belasting als % van totaal vermogen in Box 3
            </p>
          </div>
          <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
            Het effectief tarief geeft aan welk percentage van je totale Box 3-vermogen je daadwerkelijk afdraagt. Lager is beter.
          </div>
          <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Totaal spaargeld</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(result.totaalSpaargeld)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Totaal beleggingen</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(result.totaalBeleggingen)}</span>
            </div>
          </div>
          <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Totaal belastbaar vermogen</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(result.totaalSpaargeld + result.totaalBeleggingen)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Belasting betaald</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(result.tax)}</span>
            </div>
          </div>
          <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
            <span className="text-[var(--ink)]">Effectief tarief</span>
            <span className="tabular-nums text-[var(--ink)]">{effectiefTariefPct.toFixed(2)}%</span>
          </div>
          <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
            <p><strong className="font-semibold text-[var(--ink-3)]">Formule:</strong> belasting ÷ (spaargeld + beleggingen) × 100</p>
          </div>
          <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
            Berekend op basis van je vermogensopbouw · peildatum {year}
          </p>
        </KassabonShell>
      </BottomSheet>

      {/* KPI: Vrijheidsdagen */}
      <BottomSheet open={showVrijheidsdagenKassabon} title="Vrijheidsdagen verloren" onClose={() => setShowVrijheidsdagenKassabon(false)}>
        <KassabonShell>
          <div className="mb-3 text-center">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              VRIJHEIDSDAGEN AAN BELASTING
            </p>
            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
              Box 3 uitgedrukt in opgeslagen tijd
            </p>
          </div>
          <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
            Geld is opgeslagen tijd. Elke euro belasting kost je een stukje financiële vrijheid. Dit getal vertaalt je belastingaanslag naar vrijheidsdagen.
          </div>
          <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Totale belasting</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(result.tax)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Dagelijkse uitgaven</span>
              <span className="tabular-nums text-[var(--ink)]">{dailyExpenses > 0 ? formatCurrency(dailyExpenses) + '/dag' : 'geen data'}</span>
            </div>
          </div>
          <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
            <span className="text-[var(--ink)]">Vrijheidsdagen verloren</span>
            <span className="tabular-nums text-[var(--ink)]">{result.freedomDays} dagen</span>
          </div>
          <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
            <p><strong className="font-semibold text-[var(--ink-3)]">Formule:</strong> belasting ÷ dagelijkse uitgaven = verloren vrijheidsdagen</p>
          </div>
          <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
            Gebaseerd op je uitgavenpatroon van deze maand · peildatum {year}
          </p>
        </KassabonShell>
      </BottomSheet>

      {/* KPI: Heffingsvrij Benut */}
      <BottomSheet open={showHeffingsvrijKassabon} title="Heffingsvrij Benut" onClose={() => setShowHeffingsvrijKassabon(false)}>
        <KassabonShell>
          <div className="mb-3 text-center">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              HEFFINGSVRIJ VERMOGEN
            </p>
            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
              hoeveel van je belastingvrije ruimte is benut
            </p>
          </div>
          <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
            De eerste {formatCurrency(result.heffingsvrijVermogen)} van je vermogen is vrijgesteld van Box 3 belasting. Dit percentage geeft aan hoeveel je hiervan benut.
          </div>
          <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Heffingsvrij vermogen</span>
              <span className="tabular-nums text-emerald-700">{formatCurrency(result.heffingsvrijVermogen)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Jouw rendementsgrondslag</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(result.rendementsgrondslag)}</span>
            </div>
          </div>
          <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
            <span className="text-[var(--ink)]">Heffingsvrij benut</span>
            <span className="tabular-nums text-[var(--ink)]">{heffingsvrijBenut.toFixed(0)}%</span>
          </div>
          {heffingsvrijBenut < 100 && (
            <div className="mt-3 rounded-[var(--r-sm)] border border-dashed border-kern-300 bg-kern-50/50 px-3 py-2 font-sans text-[11px] text-kern-700">
              ✓ Je benut je heffingsvrije ruimte nog niet volledig — {formatCurrency(Math.max(0, result.heffingsvrijVermogen - result.rendementsgrondslag))} ruimte beschikbaar.
            </div>
          )}
          <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
            Heffingsvrij vermogen 2025 (alleenstaand) · peildatum {year}
          </p>
        </KassabonShell>
      </BottomSheet>

      {/* FIRE berekening kassabon */}
      <BottomSheet open={showFireKassabon} title="NL-FIRE Berekening" onClose={() => setShowFireKassabon(false)}>
          <KassabonShell>
            {/* Header */}
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                FIRE &amp; BOX 3 BEREKENING
              </p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                Herleiding NL Safe Withdrawal Rate — officiële bronnen 2025
              </p>
            </div>

            {/* Uitleg */}
            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              De Trinity Study (1998) berekende een 4% opnamepercentage voor US-markt omstandigheden
              zonder vermogensbelasting. In Nederland betaal je Box 3 over een fictief rendement —
              ongeacht je werkelijke resultaat. Dit verlaagt je effectieve opnamepercentage structureel.
            </div>

            {/* Historische forfaitaire percentages */}
            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <p className="mb-2 font-sans text-[11px] font-semibold text-[var(--ink-2)]">Historische forfaitaire rendementen beleggingen</p>
              {[
                { jaar: '2021', pct: '5.69%' },
                { jaar: '2022', pct: '5.53%' },
                { jaar: '2023', pct: '6.17%' },
                { jaar: '2024', pct: '6.04%' },
                { jaar: '2025', pct: '5.88%' },
              ].map(r => (
                <div key={r.jaar} className="flex justify-between py-0.5">
                  <span className="font-sans text-xs text-[var(--ink-3)]">{r.jaar}</span>
                  <span className="tabular-nums text-xs text-[var(--ink-2)]">{r.pct}</span>
                </div>
              ))}
            </div>

            {/* Herleiding NL-SWR */}
            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <p className="mb-2 font-sans text-[11px] font-semibold text-[var(--ink-2)]">Herleiding NL-SWR</p>
              <div className="space-y-0.5">
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-xs text-[var(--ink-3)]">Bruto rendement</span>
                  <span className="tabular-nums text-xs text-emerald-700">+{(DEFAULT_RETURN * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-xs text-[var(--ink-3)]">Box 3 drag (5.88% × 36%)</span>
                  <span className="tabular-nums text-xs text-red-500">−{(BOX3_DRAG * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-xs text-[var(--ink-3)]">Inflatie</span>
                  <span className="tabular-nums text-xs text-red-500">−{(NL_INFLATIE * 100).toFixed(2)}%</span>
                </div>
              </div>
            </div>

            {/* Totaalregel */}
            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">NL Safe Withdrawal Rate</span>
              <span className="tabular-nums text-[var(--ink)]">{(NL_SWR * 100).toFixed(2)}%</span>
            </div>

            {/* Formule */}
            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              <p><strong className="font-semibold text-[var(--ink-3)]">Formule:</strong> NL-SWR = Rendement − (Fictief × Tarief) − Inflatie</p>
              <p className="mt-1"><strong className="font-semibold text-[var(--ink-3)]">Multiplier:</strong> 1 / NL-SWR = {NL_MULTIPLIER.toFixed(1)}× (vs klassiek {CLASSIC_MULTIPLIER}×)</p>
            </div>

            {/* Vergelijkingstabel */}
            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2">
              <p className="mb-2 font-sans text-[11px] font-semibold text-[var(--ink-2)]">Benodigde FIRE-vermogens</p>
              {hasRealData && (
                <div className="mb-1 flex justify-between rounded-[var(--r-sm)] border border-kern-100 bg-kern-50/50 px-2 py-1.5">
                  <span className="font-sans text-xs font-semibold text-kern-700">Jouw situatie ({formatCurrency(displayExpenses)}/jr)</span>
                  <div className="text-right">
                    <span className="font-sans text-[10px] text-[var(--ink-4)]">
                      VS: €{(displayExpenses * CLASSIC_MULTIPLIER).toLocaleString('nl-NL')}
                    </span>
                    <span className="mx-1 font-sans text-[10px] text-[var(--ink-4)]">→</span>
                    <span className="tabular-nums text-xs font-bold text-kern-700">
                      NL: €{Math.round(displayExpenses * NL_MULTIPLIER).toLocaleString('nl-NL')}
                    </span>
                  </div>
                </div>
              )}
              {[
                { uitgaven: 30000, label: '€30.000/jr' },
                { uitgaven: 40000, label: '€40.000/jr' },
                { uitgaven: 60000, label: '€60.000/jr' },
              ].map(row => (
                <div key={row.uitgaven} className="flex justify-between border-b border-dashed border-[var(--border-ed)] py-1 last:border-0">
                  <span className="font-sans text-xs text-[var(--ink-3)]">{row.label}</span>
                  <div className="text-right">
                    <span className="font-sans text-[10px] text-[var(--ink-4)]">
                      VS: €{(row.uitgaven * CLASSIC_MULTIPLIER).toLocaleString('nl-NL')}
                    </span>
                    <span className="mx-1 font-sans text-[10px] text-[var(--ink-4)]">→</span>
                    <span className="tabular-nums text-xs font-semibold text-kern-700">
                      NL: €{Math.round(row.uitgaven * NL_MULTIPLIER).toLocaleString('nl-NL')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Schuldeneffect */}
            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              <p><strong className="font-semibold text-[var(--ink-3)]">Schuldeneffect:</strong> Schulden verlagen je Box 3 grondslag met 2.70% fictief rendement (minus €3.800 drempel). Bij grote schulden kan dit de effectieve belastingdruk significant verlagen.</p>
            </div>

            {/* Footer */}
            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
              Bron: Belastingdienst.nl — forfaitaire rendementen 2025 · Trinity Study (1998) voor classic FIRE
            </p>
          </KassabonShell>
        </BottomSheet>

      {showScenarioModal && (
        <Box3ScenarioModal
          input={input}
          result={result}
          onClose={() => setShowScenarioModal(false)}
        />
      )}
      {showPartnerModal && (
        <Box3PartnerModal
          input={input}
          result={result}
          onClose={() => setShowPartnerModal(false)}
        />
      )}
    </div>
    </FeatureGate>
  )
}
