'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePerspective, usePerspectiveAbort } from '@/components/app/perspective-provider'
import { formatCurrency } from '@/lib/format'
import { BOX3_PARAMS, BOX3_TOOLTIPS, type Box3Result, type TaxYear, type PartnerAllocation } from '@/lib/box3-data'
import {
  Calculator, Users, User, ArrowLeftRight, Info,
  TrendingDown, Wallet, PiggyBank, BarChart3,
  Clock, ChevronDown, ChevronUp, Lightbulb, ArrowLeft,
  Sparkles, SlidersHorizontal, Shield,
} from 'lucide-react'
import { Box3PartnerModal } from '@/components/app/core/box3-partner-modal'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────

interface PartnerBox3 {
  userId: string
  fullName: string
  isCurrentUser: boolean
  result: Box3Result
}

interface Box3ApiResponse {
  hasHousehold: boolean
  year: TaxYear
  dailyExpenses: number
  currentUserName: string
  partnerName?: string
  personal?: Box3Result
  partners?: PartnerBox3[]
  combined?: Box3Result
  optimalAllocation?: PartnerAllocation
}

type ViewMode = 'personal' | 'partner1' | 'partner2' | 'combined'

// ── Helpers ──────────────────────────────────────────────────

function formatPct(value: number): string {
  return (value * 100).toFixed(2) + '%'
}

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--subtle)] text-[var(--ink-3)] hover:bg-kern-100 transition-colors"
        aria-label="Meer informatie"
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-xs text-[var(--ink-2)] shadow-md">
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[var(--paper)]" />
        </span>
      )}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function BelastingPage() {
  const { perspective, isHousehold } = usePerspective()
  const perspectiveSignal = usePerspectiveAbort(perspective)
  const [data, setData] = useState<Box3ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState<TaxYear>(2026)
  const [viewMode, setViewMode] = useState<ViewMode>('personal')
  const [showDetails, setShowDetails] = useState(false)
  const [showPartnerModal, setShowPartnerModal] = useState(false)

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/household/box3?year=${year}`, { signal })
      if (signal?.aborted) return
      if (!res.ok) throw new Error('Fout bij ophalen gegevens')
      const json = await res.json()
      setData(json)

      // Auto-select view mode based on perspective
      if (json.hasHousehold && perspective === 'household') {
        setViewMode('combined')
      } else {
        setViewMode('personal')
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Onbekende fout')
    }
    if (!signal?.aborted) setLoading(false)
  }, [year, perspective])

  useEffect(() => {
    const signal = perspectiveSignal
    loadData(signal)
  }, [loadData, perspectiveSignal])

  // Determine which result to show
  const getActiveResult = (): Box3Result | null => {
    if (!data) return null
    if (!data.hasHousehold || viewMode === 'personal') {
      return data.personal ?? data.partners?.[0]?.result ?? null
    }
    if (viewMode === 'partner1') return data.partners?.[0]?.result ?? null
    if (viewMode === 'partner2') return data.partners?.[1]?.result ?? null
    if (viewMode === 'combined') return data.combined ?? null
    return null
  }

  const activeResult = getActiveResult()
  const isHouseholdMode = data?.hasHousehold && perspective === 'household'

  // Loading state
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  // Error state
  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error ?? 'Geen gegevens beschikbaar.'}</p>
          <button
            onClick={() => loadData()}
            className="mt-3 rounded-[var(--r)] bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  const partner1Name = data.currentUserName || 'Jij'
  const partner2Name = data.partnerName || 'Partner'

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Back link */}
      <Link
        href="/core"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        De Kern
      </Link>

      {/* === Hero === */}
      <section className="card-editorial overflow-hidden mb-6">
        <div className="h-1.5 bg-kern-500" />
        <div className="p-4 sm:p-6 md:p-8">
          <div className="mb-3 sm:mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kern-100">
              <Calculator className="h-5 w-5 text-kern-600" />
            </div>
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[var(--ink)]">
                Box 3 Belasting
              </h1>
              <p className="text-xs text-[var(--ink-3)]">
                Vermogensrendementsheffing {year}
              </p>
            </div>
            {isHouseholdMode && (
              <span className="inline-flex items-center gap-1 rounded-full bg-kern-50 px-2 py-0.5 text-[10px] font-medium text-kern-700">
                <Users className="h-3 w-3" /> Huishouden
              </span>
            )}
          </div>

          {/* Year selector */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--ink-3)]">Belastingjaar:</span>
            <div className="flex rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)]">
              {([2025, 2026] as TaxYear[]).map(y => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className={`px-3 py-1 text-sm font-medium transition-colors ${
                    year === y
                      ? 'bg-kern-500 text-white rounded-[var(--r)]'
                      : 'text-[var(--ink-2)] hover:bg-[var(--subtle)]'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Main tax headline */}
          {activeResult && (
            <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-6">
              <div>
                <p className="text-xs font-medium text-[var(--ink-3)] mb-1">
                  {viewMode === 'combined' ? 'Gecombineerde belasting' :
                   viewMode === 'partner2' ? `Belasting ${partner2Name}` :
                   'Jouw belasting'}
                </p>
                <span className="font-display text-[36px] sm:text-[44px] font-bold tracking-tight text-[var(--ink)] font-mono tabular-nums">
                  {formatCurrency(activeResult.tax)}
                </span>
              </div>
              <div className="flex items-center gap-2 pb-1 sm:pb-2">
                <Clock className="h-4 w-4 text-kern-500" />
                <span className="text-sm text-[var(--ink-2)]">
                  {activeResult.freedomDays} vrijheidsdagen
                </span>
                <InfoTooltip text="Het aantal dagen vrijheid dat deze belasting kost, op basis van je dagelijkse uitgaven." />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* === View Mode Tabs (Household only) === */}
      {isHouseholdMode && data.partners && (
        <div className="mb-6 flex flex-wrap gap-2">
          <ViewTab
            active={viewMode === 'partner1'}
            onClick={() => setViewMode('partner1')}
            icon={<User className="h-4 w-4" />}
            label={partner1Name}
          />
          <ViewTab
            active={viewMode === 'partner2'}
            onClick={() => setViewMode('partner2')}
            icon={<User className="h-4 w-4" />}
            label={partner2Name}
          />
          <ViewTab
            active={viewMode === 'combined'}
            onClick={() => setViewMode('combined')}
            icon={<Users className="h-4 w-4" />}
            label="Gecombineerd"
          />
        </div>
      )}

      {activeResult && (
        <>
          {/* === KPI Cards === */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 mb-6">
            <KpiCard
              label="Box 3 vermogen"
              value={formatCurrency(activeResult.totaalSpaargeld + activeResult.totaalBeleggingen)}
              icon={<Wallet className="h-4 w-4 text-kern-500" />}
              tooltip={BOX3_TOOLTIPS.box3}
            />
            <KpiCard
              label="Spaargeld"
              value={formatCurrency(activeResult.totaalSpaargeld)}
              sub={`Forfait: ${formatPct(activeResult.params.forfaitSpaargeld)}`}
              icon={<PiggyBank className="h-4 w-4 text-kern-500" />}
            />
            <KpiCard
              label="Beleggingen"
              value={formatCurrency(activeResult.totaalBeleggingen)}
              sub={`Forfait: ${formatPct(activeResult.params.forfaitBeleggingen)}`}
              icon={<BarChart3 className="h-4 w-4 text-kern-500" />}
            />
            <KpiCard
              label="Effectief tarief"
              value={activeResult.rendementsgrondslag > 0
                ? formatPct(activeResult.tax / activeResult.rendementsgrondslag)
                : '0%'}
              sub={`Nominaal: ${formatPct(activeResult.params.tarief)}`}
              icon={<TrendingDown className="h-4 w-4 text-kern-500" />}
              tooltip={BOX3_TOOLTIPS.effectiefTarief}
            />
          </div>

          {/* === Calculation Breakdown === */}
          <section className="card-editorial overflow-hidden mb-6">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex w-full items-center justify-between p-4 sm:p-5 hover:bg-[var(--subtle)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-kern-500" />
                <span className="text-sm font-semibold text-[var(--ink)]">Berekeningsstappen</span>
              </div>
              {showDetails ? <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />}
            </button>

            {showDetails && (
              <div className="border-t border-[var(--border-ed)] px-4 py-4 sm:px-5">
                <div className="space-y-3">
                  <CalcRow label="Totaal spaargeld" value={activeResult.totaalSpaargeld} />
                  <CalcRow label="Totaal beleggingen" value={activeResult.totaalBeleggingen} />
                  {activeResult.totaalUitgesloten > 0 && (
                    <CalcRow label="Uitgesloten (Box 1)" value={activeResult.totaalUitgesloten} muted />
                  )}
                  <div className="h-px bg-[var(--border-ed)]" />
                  <CalcRow label="Box 3 schulden" value={activeResult.totaalBox3Schulden} />
                  <CalcRow
                    label={`Schuldendrempel (${activeResult.hasPartner ? 'partner' : 'single'})`}
                    value={activeResult.schuldendrempel}
                    muted
                    tooltip={BOX3_TOOLTIPS.schuldendrempel}
                  />
                  <CalcRow label="Aftrekbare schulden" value={activeResult.aftrekbareSchulden} />
                  <div className="h-px bg-[var(--border-ed)]" />
                  <CalcRow
                    label="Forfaitair rendement spaargeld"
                    value={activeResult.forfaitairSpaargeld}
                    tooltip={BOX3_TOOLTIPS.forfaitairRendement}
                  />
                  <CalcRow label="Forfaitair rendement beleggingen" value={activeResult.forfaitairBeleggingen} />
                  <CalcRow label="Forfaitair rendement schulden" value={activeResult.forfaitairSchulden} negative />
                  <CalcRow label="Voordeel uit sparen en beleggen" value={activeResult.voordeelUitSparen} bold />
                  <div className="h-px bg-[var(--border-ed)]" />
                  <CalcRow
                    label="Rendementsgrondslag"
                    value={activeResult.rendementsgrondslag}
                    tooltip={BOX3_TOOLTIPS.rendementsgrondslag}
                  />
                  <CalcRow
                    label={`Heffingsvrij vermogen (${activeResult.hasPartner ? 'partner' : 'single'})`}
                    value={activeResult.heffingsvrijVermogen}
                    negative
                    tooltip={BOX3_TOOLTIPS.heffingsvrijVermogen}
                  />
                  <CalcRow label="Grondslag sparen en beleggen" value={activeResult.grondslagSparen} />
                  <CalcRow label="Effectief rendement" pct={activeResult.effectiefRendement} />
                  <CalcRow label="Box 3 inkomen" value={activeResult.box3Income} />
                  <CalcRow label={`Tarief ${formatPct(activeResult.params.tarief)}`} />
                  <div className="h-px bg-[var(--border-ed)]" />
                  <CalcRow label="Box 3 belasting" value={activeResult.tax} bold highlight />
                  <div className="flex items-center gap-2 pt-1">
                    <Clock className="h-3.5 w-3.5 text-kern-500" />
                    <span className="text-xs text-[var(--ink-2)]">
                      = {activeResult.freedomDays} vrijheidsdagen (bij {formatCurrency(activeResult.dailyExpenses)}/dag)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* === Partner Comparison (Household only) === */}
          {isHouseholdMode && data.partners && data.combined && (
            <section className="card-editorial overflow-hidden mb-6">
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ArrowLeftRight className="h-4 w-4 text-kern-500" />
                  <h2 className="text-sm font-semibold text-[var(--ink)]">
                    Vergelijking per partner
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <ComparisonCard
                    name={partner1Name}
                    result={data.partners[0].result}
                    isActive={viewMode === 'partner1'}
                    onClick={() => setViewMode('partner1')}
                    icon={<User className="h-4 w-4" />}
                  />
                  <ComparisonCard
                    name={partner2Name}
                    result={data.partners[1].result}
                    isActive={viewMode === 'partner2'}
                    onClick={() => setViewMode('partner2')}
                    icon={<User className="h-4 w-4" />}
                  />
                  <ComparisonCard
                    name="Gecombineerd"
                    result={data.combined}
                    isActive={viewMode === 'combined'}
                    onClick={() => setViewMode('combined')}
                    icon={<Users className="h-4 w-4" />}
                    highlight
                  />
                </div>

                {/* Freedom days comparison bar */}
                <div className="mt-5 pt-4 border-t border-[var(--border-ed)]">
                  <h3 className="text-xs font-semibold text-[var(--ink-3)] mb-3">
                    Verschil in vrijheidsdagen (belastingdruk)
                  </h3>
                  <div className="space-y-2.5">
                    <FreedomBar
                      label={partner1Name}
                      days={data.partners[0].result.freedomDays}
                      maxDays={Math.max(
                        data.partners[0].result.freedomDays,
                        data.partners[1].result.freedomDays,
                        data.combined.freedomDays,
                        1,
                      )}
                    />
                    <FreedomBar
                      label={partner2Name}
                      days={data.partners[1].result.freedomDays}
                      maxDays={Math.max(
                        data.partners[0].result.freedomDays,
                        data.partners[1].result.freedomDays,
                        data.combined.freedomDays,
                        1,
                      )}
                    />
                    <FreedomBar
                      label="Gecombineerd"
                      days={data.combined.freedomDays}
                      maxDays={Math.max(
                        data.partners[0].result.freedomDays,
                        data.partners[1].result.freedomDays,
                        data.combined.freedomDays,
                        1,
                      )}
                      combined
                    />
                  </div>
                </div>

                {/* === Optimaliseer verdeling section === */}
                {data.optimalAllocation && (
                  <div className="mt-5 pt-4 border-t border-[var(--border-ed)]">
                    <div className="flex items-center gap-2 mb-3">
                      <SlidersHorizontal className="h-4 w-4 text-kern-500" />
                      <h3 className="text-sm font-semibold text-[var(--ink)]">
                        Optimaliseer verdeling
                      </h3>
                    </div>

                    {/* Fiscal partnership explanation */}
                    <div className="rounded-[var(--r)] bg-[var(--subtle)] border border-[var(--border-ed)] p-3 mb-4">
                      <div className="flex items-start gap-2">
                        <Shield className="h-4 w-4 text-kern-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-[var(--ink)] mb-1">Fiscaal partnerschap</p>
                          <p className="text-xs text-[var(--ink-2)] leading-relaxed">
                            Als fiscaal partners mogen jullie Box 3 vermogen onderling verdelen. Elke partner heeft een eigen heffingsvrij vermogen van{' '}
                            <span className="font-mono font-semibold tabular-nums">
                              {formatCurrency(activeResult?.params.heffingsvrijSingle ?? 0)}
                            </span>{' '}
                            (samen{' '}
                            <span className="font-mono font-semibold tabular-nums">
                              {formatCurrency(activeResult?.params.heffingsvrijPartner ?? 0)}
                            </span>
                            ). Door slim te verdelen betaal je minder belasting.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Current vs optimal comparison */}
                    {data.optimalAllocation.savingsVsEqual > 0 ? (
                      <div className="rounded-[var(--r)] bg-kern-50 border border-kern-200 p-3 sm:p-4 mb-3">
                        <div className="flex items-start gap-2 mb-3">
                          <Lightbulb className="h-4 w-4 text-kern-600 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-kern-700">Optimale verdeling gevonden</p>
                            <p className="text-xs text-kern-600 mt-1">
                              Door vermogen optimaal te verdelen bespaar je{' '}
                              <span className="font-mono font-semibold tabular-nums">
                                {formatCurrency(data.optimalAllocation.savingsVsEqual)}
                              </span>{' '}
                              aan Box 3 belasting
                              {data.dailyExpenses > 0 && (
                                <>
                                  {' '}({Math.round(data.optimalAllocation.savingsVsEqual / data.dailyExpenses)} vrijheidsdagen)
                                </>
                              )}
                              .
                            </p>
                          </div>
                        </div>

                        {/* Current vs optimal grid */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-[var(--r)] bg-white/60 p-2.5">
                            <p className="text-[10px] font-semibold text-[var(--ink-3)] uppercase mb-1">Huidige (50/50)</p>
                            <p className="font-mono tabular-nums font-bold text-[var(--ink)]">
                              {formatCurrency(data.optimalAllocation.totalTax + data.optimalAllocation.savingsVsEqual)}
                            </p>
                            <div className="mt-1.5 space-y-0.5 text-[var(--ink-3)]">
                              <p>{partner1Name}: {formatCurrency(data.combined?.totaalSpaargeld ? data.combined.totaalSpaargeld / 2 : 0)} spaar / {formatCurrency(data.combined?.totaalBeleggingen ? data.combined.totaalBeleggingen / 2 : 0)} beleg.</p>
                              <p>{partner2Name}: {formatCurrency(data.combined?.totaalSpaargeld ? data.combined.totaalSpaargeld / 2 : 0)} spaar / {formatCurrency(data.combined?.totaalBeleggingen ? data.combined.totaalBeleggingen / 2 : 0)} beleg.</p>
                            </div>
                          </div>
                          <div className="rounded-[var(--r)] bg-emerald-50 border border-emerald-200 p-2.5">
                            <p className="text-[10px] font-semibold text-emerald-700 uppercase mb-1">Optimaal</p>
                            <p className="font-mono tabular-nums font-bold text-emerald-700">
                              {formatCurrency(data.optimalAllocation.totalTax)}
                            </p>
                            <div className="mt-1.5 space-y-0.5 text-emerald-600">
                              <p>{partner1Name}: {formatCurrency(data.optimalAllocation.partner1Spaargeld)} spaar / {formatCurrency(data.optimalAllocation.partner1Beleggingen)} beleg.</p>
                              <p>{partner2Name}: {formatCurrency(data.optimalAllocation.partner2Spaargeld)} spaar / {formatCurrency(data.optimalAllocation.partner2Beleggingen)} beleg.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[var(--r)] bg-[var(--subtle)] border border-[var(--border-ed)] p-3 mb-3">
                        <p className="text-xs text-[var(--ink-2)]">
                          De huidige 50/50 verdeling is al optimaal. Er is geen belastingvoordeel door anders te verdelen.
                        </p>
                      </div>
                    )}

                    {/* Heffingsvrij per partner detail */}
                    {activeResult && (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
                          <p className="text-[10px] font-semibold text-[var(--ink-3)] uppercase mb-1">Heffingsvrij {partner1Name}</p>
                          <p className="font-mono tabular-nums text-sm font-bold text-[var(--ink)]">
                            {formatCurrency(activeResult.params.heffingsvrijSingle)}
                          </p>
                        </div>
                        <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
                          <p className="text-[10px] font-semibold text-[var(--ink-3)] uppercase mb-1">Heffingsvrij {partner2Name}</p>
                          <p className="font-mono tabular-nums text-sm font-bold text-[var(--ink)]">
                            {formatCurrency(activeResult.params.heffingsvrijSingle)}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Open partner modal button */}
                    <button
                      onClick={() => setShowPartnerModal(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-[var(--r)] bg-kern-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-kern-700 transition-colors"
                    >
                      <Sparkles className="h-4 w-4" />
                      Verdeling aanpassen
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* === Partner Modal === */}
          {showPartnerModal && isHouseholdMode && data.combined && activeResult && (
            <Box3PartnerModal
              input={{
                assets: [],  // Not needed for modal (uses result totals)
                debts: [],
                hasPartner: true,
                dailyExpenses: data.dailyExpenses,
                year: data.year,
              }}
              result={data.combined}
              onClose={() => setShowPartnerModal(false)}
            />
          )}

          {/* === Asset/Debt Classifications === */}
          <section className="card-editorial overflow-hidden mb-6">
            <div className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-[var(--ink)] mb-3">
                Classificatie vermogensbestanddelen
              </h2>

              {activeResult.assetClassifications.length > 0 ? (
                <div className="space-y-1.5">
                  {activeResult.assetClassifications.map((ac) => (
                    <div
                      key={ac.asset.id}
                      className="flex items-center justify-between py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                            ac.category === 'spaargeld'
                              ? 'bg-blue-400'
                              : ac.category === 'beleggingen'
                              ? 'bg-amber-400'
                              : 'bg-gray-300'
                          }`}
                        />
                        <span className="truncate text-[var(--ink-2)]">{ac.asset.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] font-medium text-[var(--ink-3)] uppercase">
                          {ac.category ?? 'Uitgesloten'}
                        </span>
                        <span className="font-mono tabular-nums text-[var(--ink)]">
                          {formatCurrency(Number(ac.asset.current_value))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--ink-3)] italic">Geen vermogensbestanddelen gevonden.</p>
              )}

              {activeResult.debtClassifications.length > 0 && (
                <>
                  <div className="h-px bg-[var(--border-ed)] my-3" />
                  <h3 className="text-xs font-semibold text-[var(--ink-3)] mb-2">Schulden</h3>
                  <div className="space-y-1.5">
                    {activeResult.debtClassifications.map((dc) => (
                      <div
                        key={dc.debt.id}
                        className="flex items-center justify-between py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                              dc.inBox3 ? 'bg-red-400' : 'bg-gray-300'
                            }`}
                          />
                          <span className="truncate text-[var(--ink-2)]">{dc.debt.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[10px] font-medium text-[var(--ink-3)] uppercase">
                            {dc.inBox3 ? 'Box 3' : 'Uitgesloten'}
                          </span>
                          <span className="font-mono tabular-nums text-[var(--ink)]">
                            {formatCurrency(Number(dc.debt.current_balance))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-[var(--r)] px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-kern-500 text-white shadow-sm'
          : 'bg-[var(--paper)] text-[var(--ink-2)] border border-[var(--border-ed)] hover:bg-[var(--subtle)]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tooltip,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  tooltip?: string
}) {
  return (
    <div className="card-editorial p-3 sm:p-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[11px] font-medium text-[var(--ink-3)]">
          {label}
          {tooltip && <InfoTooltip text={tooltip} />}
        </span>
      </div>
      <p className="font-mono text-lg sm:text-xl font-bold tabular-nums text-[var(--ink)]">{value}</p>
      {sub && <p className="text-[10px] text-[var(--ink-3)] mt-0.5">{sub}</p>}
    </div>
  )
}

function CalcRow({
  label,
  value,
  pct,
  bold,
  muted,
  negative,
  highlight,
  tooltip,
}: {
  label: string
  value?: number
  pct?: number
  bold?: boolean
  muted?: boolean
  negative?: boolean
  highlight?: boolean
  tooltip?: string
}) {
  return (
    <div className={`flex items-center justify-between text-xs ${muted ? 'opacity-60' : ''}`}>
      <span className={`text-[var(--ink-2)] ${bold ? 'font-semibold text-[var(--ink)]' : ''}`}>
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
      {value !== undefined && (
        <span
          className={`font-mono tabular-nums ${
            highlight ? 'text-kern-600 font-bold text-sm' :
            bold ? 'font-semibold text-[var(--ink)]' :
            negative ? 'text-red-500' :
            'text-[var(--ink)]'
          }`}
        >
          {negative ? '− ' : ''}{formatCurrency(Math.abs(value))}
        </span>
      )}
      {pct !== undefined && (
        <span className="font-mono tabular-nums text-[var(--ink)]">{formatPct(pct)}</span>
      )}
    </div>
  )
}

function ComparisonCard({
  name,
  result,
  isActive,
  onClick,
  icon,
  highlight,
}: {
  name: string
  result: Box3Result
  isActive: boolean
  onClick: () => void
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-[var(--r-lg)] border p-3 sm:p-4 transition-all ${
        isActive
          ? 'border-kern-400 bg-kern-50 ring-1 ring-kern-200'
          : highlight
          ? 'border-kern-200 bg-kern-50/50 hover:border-kern-300'
          : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className={isActive ? 'text-kern-600' : 'text-[var(--ink-3)]'}>{icon}</span>
        <span className="text-xs font-semibold text-[var(--ink)]">{name}</span>
      </div>
      <p className="font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
        {formatCurrency(result.tax)}
      </p>
      <div className="flex items-center gap-1.5 mt-1.5">
        <Clock className="h-3 w-3 text-kern-500" />
        <span className="text-[11px] text-[var(--ink-2)]">{result.freedomDays} dagen</span>
      </div>
      <div className="mt-2 text-[10px] text-[var(--ink-3)] space-y-0.5">
        <div className="flex justify-between">
          <span>Spaargeld</span>
          <span className="font-mono tabular-nums">{formatCurrency(result.totaalSpaargeld)}</span>
        </div>
        <div className="flex justify-between">
          <span>Beleggingen</span>
          <span className="font-mono tabular-nums">{formatCurrency(result.totaalBeleggingen)}</span>
        </div>
      </div>
    </button>
  )
}

function FreedomBar({
  label,
  days,
  maxDays,
  combined,
}: {
  label: string
  days: number
  maxDays: number
  combined?: boolean
}) {
  const pct = maxDays > 0 ? (days / maxDays) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-[var(--ink-2)] truncate">{label}</span>
      <div className="flex-1 h-4 rounded-full bg-[var(--subtle)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            combined ? 'bg-kern-500' : 'bg-kern-300'
          }`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-xs font-mono tabular-nums text-[var(--ink)]">
        {days} dgn
      </span>
    </div>
  )
}
