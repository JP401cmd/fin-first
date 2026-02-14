'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import { FhinAvatar } from '@/components/app/avatars'
import {
  calculateBox3,
  generateBox3Optimizations,
  BOX3_TOOLTIPS,
  type Box3Input,
  type Box3Result,
  type TaxYear,
} from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { Box3Classification } from '@/components/app/core/box3-classification'
import { Box3Calculation } from '@/components/app/core/box3-calculation'
import { Box3ScenarioModal } from '@/components/app/core/box3-scenario-modal'
import { Box3PartnerModal } from '@/components/app/core/box3-partner-modal'
import {
  Info, Receipt, ArrowRightLeft, Users, Lightbulb,
  Clock, Percent, CalendarDays, ShieldCheck,
} from 'lucide-react'
import { FeatureGate } from '@/components/app/feature-gate'

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

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

      const [assetsResult, debtsResult, txResult] = await Promise.all([
        supabase.from('assets').select('*').eq('is_active', true),
        supabase.from('debts').select('*').eq('is_active', true),
        supabase
          .from('transactions')
          .select('amount')
          .gte('date', monthStart)
          .lt('date', monthEnd),
      ])

      if (assetsResult.error) throw assetsResult.error
      if (debtsResult.error) throw debtsResult.error
      if (txResult.error) throw txResult.error

      setAssets(assetsResult.data as Asset[])
      setDebts(debtsResult.data as Debt[])

      // Calculate daily expenses from current month transactions
      const monthlyExpenses = (txResult.data ?? []).reduce((sum, t) => {
        const amt = Number(t.amount)
        return amt < 0 ? sum + Math.abs(amt) : sum
      }, 0)
      setDailyExpenses(monthlyExpenses > 0 ? (monthlyExpenses * 12) / 365 : 0)
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
          <button
            onClick={() => { setError(null); setLoading(true); loadData() }}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
          <p className="text-sm text-zinc-500">
            Geen assets of schulden gevonden. Voeg eerst je vermogen toe bij Assets en Schulden.
          </p>
        </div>
      </div>
    )
  }

  const effectiefTariefPct = (result.totaalSpaargeld + result.totaalBeleggingen) > 0
    ? (result.belasting / (result.totaalSpaargeld + result.totaalBeleggingen)) * 100
    : 0
  const heffingsvrijBenut = result.heffingsvrijVermogen > 0
    ? Math.min(100, (Math.min(result.rendementsgrondslag, result.heffingsvrijVermogen) / result.heffingsvrijVermogen) * 100)
    : 0

  return (
    <FeatureGate featureId="box3_belasting" fallback="locked">
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* === A. Hero Banner === */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-950 via-amber-900 to-amber-950 p-5 text-white sm:p-8 md:p-10">
        <div className="pointer-events-none absolute -top-24 right-1/4 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FhinAvatar size={40} />
              <p className="text-xs font-semibold tracking-[0.2em] text-amber-300/80 uppercase">
                Box 3 Vermogensrendementsheffing
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Year toggle */}
              <div className="flex overflow-hidden rounded-lg border border-amber-700/50">
                {([2025, 2026] as TaxYear[]).map(y => (
                  <button
                    key={y}
                    onClick={() => setYear(y)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      year === y
                        ? 'bg-amber-600 text-white'
                        : 'text-amber-300/70 hover:text-amber-200'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
              {/* Partner toggle */}
              <button
                onClick={() => setHasPartner(v => !v)}
                className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  hasPartner
                    ? 'border-amber-500 bg-amber-600 text-white'
                    : 'border-amber-700/50 text-amber-300/70 hover:text-amber-200'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Partner
              </button>
            </div>
          </div>

          <div className="mb-3">
            <span className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
              {formatCurrency(result.belasting)}
            </span>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <p className="text-lg text-amber-200/70">
              Box 3 kost je <span className="font-semibold text-amber-300">{result.vrijheidsdagen} vrijheidsdagen</span>
            </p>
            <KpiTooltip text={BOX3_TOOLTIPS.box3} />
          </div>

          <div className="flex items-center gap-2 text-xs text-amber-300/50">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>Peildatum: 1 januari {year}</span>
            <KpiTooltip text={BOX3_TOOLTIPS.peildatum} />
          </div>
        </div>
      </section>

      {/* === B. KPI Cards === */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <Receipt className="h-5 w-5 text-amber-600" />
            </div>
            <KpiTooltip text="De totale Box 3 belasting die je verschuldigd bent, berekend op basis van je vermogen op de peildatum." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Totale Belasting</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">{formatCurrency(result.belasting)}</p>
          <p className="mt-1 text-xs text-zinc-400">Box 3 {year}</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <Percent className="h-5 w-5 text-amber-600" />
            </div>
            <KpiTooltip text={BOX3_TOOLTIPS.effectiefTarief} />
          </div>
          <p className="text-sm font-medium text-zinc-500">Effectief Tarief</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">{effectiefTariefPct.toFixed(2)}%</p>
          <p className="mt-1 text-xs text-zinc-400">over totaal Box 3 vermogen</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <KpiTooltip text="Hoeveel vrijheidsdagen je verliest aan Box 3 belasting. Berekening: belasting / dagelijkse uitgaven." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Vrijheidsdagen</p>
          <p className="mt-1 text-3xl font-bold text-red-600">-{result.vrijheidsdagen}</p>
          <p className="mt-1 text-xs text-zinc-400">verloren aan belasting</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
            </div>
            <KpiTooltip text={BOX3_TOOLTIPS.heffingsvrijVermogen} />
          </div>
          <p className="text-sm font-medium text-zinc-500">Heffingsvrij Benut</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">{heffingsvrijBenut.toFixed(0)}%</p>
          <p className="mt-1 text-xs text-zinc-400">
            van {formatCurrency(result.heffingsvrijVermogen)}
          </p>
        </div>
      </section>

      {/* === C. Vermogensindeling === */}
      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Vermogensindeling Box 3
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Hoe je assets en schulden worden geclassificeerd voor de belastingaangifte.
          </p>
        </div>
        <Box3Classification
          assetClassifications={result.assetClassifications}
          debtClassifications={result.debtClassifications}
        />
      </section>

      {/* === D. Berekening Stap-voor-Stap === */}
      <section className="mt-8">
        <Box3Calculation result={result} />
      </section>

      {/* === E. Wat-Als Scenario's === */}
      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Wat-als scenario&apos;s
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Ontdek hoe je Box 3 belasting verandert bij andere keuzes.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <button
            onClick={() => setShowScenarioModal(true)}
            className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-left transition-colors hover:border-amber-200 hover:bg-amber-50/30"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-50 group-hover:bg-amber-50">
              <ArrowRightLeft className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900">Vermogen verschuiven</p>
              <p className="text-xs text-zinc-500">Beleggingen &harr; spaargeld</p>
            </div>
          </button>

          <button
            onClick={() => setShowScenarioModal(true)}
            className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-left transition-colors hover:border-amber-200 hover:bg-amber-50/30"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-50 group-hover:bg-amber-50">
              <CalendarDays className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900">Vergelijk jaren</p>
              <p className="text-xs text-zinc-500">2025 vs 2026 side-by-side</p>
            </div>
          </button>

          <button
            onClick={() => setShowPartnerModal(true)}
            className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-left transition-colors hover:border-amber-200 hover:bg-amber-50/30"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-50 group-hover:bg-amber-50">
              <Users className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900">Verdeling partner</p>
              <p className="text-xs text-zinc-500">Optimale partnerverdeling</p>
            </div>
          </button>
        </div>
      </section>

      {/* === F. Optimalisatietips === */}
      {optimizations.length > 0 && (
        <section className="mt-10">
          <div className="mb-5">
            <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
              Optimalisatietips
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Concrete acties om je Box 3 belasting te verlagen.
            </p>
          </div>
          <div className="space-y-3">
            {optimizations.map(tip => (
              <div
                key={tip.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-amber-200"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                    <Lightbulb className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-zinc-900">{tip.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">{tip.description}</p>
                    {tip.besparing > 0 && (
                      <div className="mt-2 flex items-center gap-3">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          Besparing: {formatCurrency(tip.besparing)}
                        </span>
                        {tip.vrijheidsdagen > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            +{tip.vrijheidsdagen} vrijheidsdagen
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

      {/* === Modals === */}
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
