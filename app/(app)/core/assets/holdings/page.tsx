'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Plus, Trash2, X, TrendingUp, ArrowLeft, Loader2, Briefcase, Edit3, Receipt, ArrowUpRight, ArrowDownRight, DollarSign, PieChart, RefreshCw, AlertTriangle, Clock, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'
import PortfolioAllocationVisualization, { type HoldingForAllocation } from '@/components/app/portfolio-allocation-chart'
import { BenchmarkComparisonChart } from '@/components/app/benchmark-comparison-chart'
import { TIME_PERIODS, type TimePeriod, type ComparisonResult } from '@/lib/benchmark-comparison'
import DividendTracker from '@/components/app/dividend-tracker'
import { BottomSheet } from '@/components/app/bottom-sheet'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Holding = {
  id: string
  user_id: string
  asset_id: string | null
  ticker: string | null
  isin: string | null
  name: string
  units: number
  avg_purchase_price: number
  current_price: number | null
  last_price_update: string | null
  purchase_date: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  // Price feed data
  previous_close?: number | null
  daily_change_percent?: number | null
  // Classification fields for portfolio allocation
  asset_class?: string | null
  sector?: string | null
  geography?: string | null
  // Extra fields from assets fallback
  asset_type?: string
  institution?: string
  expected_return?: number
  monthly_contribution?: number
}

// Per-holding price data from refresh API
type HoldingPriceUpdate = {
  id: string
  dailyChangePercent: number | null
  previousClose: number | null
}

export default function HoldingsPage() {
  const router = useRouter()
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [totalValue, setTotalValue] = useState(0)
  const [totalCost, setTotalCost] = useState(0)
  const [source, setSource] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editHolding, setEditHolding] = useState<Holding | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [txHolding, setTxHolding] = useState<Holding | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null)
  const [benchmarkComparison, setBenchmarkComparison] = useState<ComparisonResult | null>(null)
  const [benchmarkPeriod, setBenchmarkPeriod] = useState<TimePeriod>(TIME_PERIODS.find(p => p.id === '1y')!)
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)
  const [overrideHolding, setOverrideHolding] = useState<Holding | null>(null)
  // Per-holding daily change data from last price refresh
  const [priceUpdates, setPriceUpdates] = useState<Map<string, HoldingPriceUpdate>>(new Map())
  // Track whether a form was recently submitted to prevent re-submission on back navigation
  const formSubmittedRef = useRef(false)

  const loadHoldings = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/holdings')
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      setHoldings(data.holdings || [])
      setTotalValue(data.total_value || 0)
      setTotalCost(data.total_cost || 0)
      setSource(data.source || '')
    } catch (err) {
      setError('Kon holdings niet laden. Probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load benchmark comparison data
  const loadBenchmarkComparison = useCallback(async (periodId: string) => {
    setBenchmarkLoading(true)
    try {
      const res = await fetch(`/api/benchmark-comparison?period=${periodId}`)
      if (res.ok) {
        const data = await res.json()
        setBenchmarkComparison(data.comparison || null)
      }
    } catch {
      // Non-critical — silently fail
    } finally {
      setBenchmarkLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHoldings()
  }, [loadHoldings])

  // Load benchmark data after holdings are loaded
  useEffect(() => {
    if (!loading && holdings.length > 0) {
      loadBenchmarkComparison(benchmarkPeriod.id)
    }
  }, [loading, holdings.length, benchmarkPeriod.id, loadBenchmarkComparison])

  function handleBenchmarkPeriodChange(period: TimePeriod) {
    setBenchmarkPeriod(period)
    // Data will reload via the useEffect above
  }

  // Push a history entry when a modal opens so the back button closes the modal
  // instead of navigating away. After form submission, replace the entry to
  // prevent the back button from re-opening the (now stale) form.
  useEffect(() => {
    const modalOpen = showForm || editHolding !== null || txHolding !== null
    if (modalOpen) {
      // Push a new history entry for the open modal
      window.history.pushState({ holdingsModal: true }, '')
    }

    function onPopState(e: PopStateEvent) {
      // When user presses back while a modal is open, close the modal
      // instead of navigating away. This prevents re-submission.
      if (showForm) {
        setShowForm(false)
        return
      }
      if (editHolding) {
        setEditHolding(null)
        return
      }
      if (txHolding) {
        setTxHolding(null)
        return
      }
    }

    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [showForm, editHolding, txHolding])

  // On mount, check if we arrived here via back-button after a form submission
  // and prevent re-opening the form
  useEffect(() => {
    if (typeof window !== 'undefined' && window.history.state?.formSubmitted) {
      // Clear the flag so subsequent visits work normally
      window.history.replaceState(
        { ...window.history.state, formSubmitted: false },
        ''
      )
      // Make sure no form is shown
      setShowForm(false)
      formSubmittedRef.current = true
    }
  }, [])

  async function handleDelete(id: string) {
    // Prevent rapid double-clicks from triggering multiple delete operations
    if (deleting) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/holdings?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Verwijderen mislukt')
      setHoldings((prev) => {
        const updated = prev.filter((h) => h.id !== id)
        // Recalculate totals so allocation chart percentages update correctly
        const newTotalValue = updated.reduce((sum, h) => {
          const price = h.current_price ?? h.avg_purchase_price
          return sum + price * h.units
        }, 0)
        const newTotalCost = updated.reduce((sum, h) => {
          return sum + h.avg_purchase_price * h.units
        }, 0)
        setTotalValue(newTotalValue)
        setTotalCost(newTotalCost)
        return updated
      })
      setDeleteConfirm(null)
    } catch {
      setError('Kon holding niet verwijderen')
    } finally {
      setDeleting(null)
    }
  }

  // Determine if a holding's price is stale (last update > 24 hours ago, or no ticker with no recent update)
  const isPriceStale = useCallback((holding: Holding): boolean => {
    if (!holding.ticker && !holding.isin) return false // No ticker = manual management, not stale
    if (!holding.last_price_update) return true // Never updated = stale
    const lastUpdate = new Date(holding.last_price_update)
    const now = new Date()
    const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60)
    return hoursSinceUpdate > 24
  }, [])

  // Format relative time for stale indicator
  const formatLastUpdate = useCallback((dateStr: string | null): string => {
    if (!dateStr) return 'Nooit bijgewerkt'
    const date = new Date(dateStr)
    const now = new Date()
    const hours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    if (hours < 1) return 'Minder dan een uur geleden'
    if (hours < 24) return `${hours} uur geleden`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'Gisteren'
    if (days < 7) return `${days} dagen geleden`
    if (days < 30) return `${Math.floor(days / 7)} weken geleden`
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
  }, [])

  // Refresh all prices from Yahoo Finance
  async function handleRefreshPrices() {
    setRefreshing(true)
    setRefreshResult(null)

    try {
      const res = await fetch('/api/holdings/refresh-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = await res.json()

      // Capture daily change data from refresh results
      if (data.results && Array.isArray(data.results)) {
        const updates = new Map<string, HoldingPriceUpdate>()
        for (const r of data.results) {
          if (r.status === 'updated' && r.dailyChangePercent !== undefined) {
            updates.set(r.id, {
              id: r.id,
              dailyChangePercent: r.dailyChangePercent ?? null,
              previousClose: r.previousClose ?? null,
            })
          }
        }
        setPriceUpdates(updates)
      }

      if (data.summary?.updated > 0) {
        setRefreshResult({
          message: data.message || 'Prijzen bijgewerkt via Yahoo Finance',
          type: 'success',
        })
        // Reload holdings to get new prices
        loadHoldings()
      } else if (data.summary?.stale > 0) {
        setRefreshResult({
          message: data.message || 'Prijsfeed niet beschikbaar — laatste bekende prijzen worden getoond',
          type: 'warning',
        })
      } else {
        setRefreshResult({
          message: data.message || 'Geen holdings met ticker gevonden',
          type: 'warning',
        })
      }

      // Auto-clear message after 8 seconds
      setTimeout(() => setRefreshResult(null), 8000)
    } catch {
      setRefreshResult({
        message: 'Kon prijzen niet vernieuwen — controleer je internetverbinding',
        type: 'error',
      })
      setTimeout(() => setRefreshResult(null), 8000)
    } finally {
      setRefreshing(false)
    }
  }

  // Count stale holdings
  const staleCount = useMemo(() => {
    return holdings.filter(h => isPriceStale(h)).length
  }, [holdings, isPriceStale])

  const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0

  // Compute allocation data for donut chart — each holding as a slice
  const allocationData = useMemo(() => {
    if (holdings.length === 0) return []
    return holdings
      .map((h) => {
        const price = h.current_price ?? h.avg_purchase_price
        const value = price * h.units
        return { id: h.id, name: h.name, ticker: h.ticker, value }
      })
      .filter((h) => h.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [holdings])

  // Compute holdings data for portfolio allocation visualization (with classification)
  const holdingsForAllocation: HoldingForAllocation[] = useMemo(() => {
    return holdings
      .map((h) => {
        const price = h.current_price ?? h.avg_purchase_price
        const value = price * Math.max(0, h.units)
        return {
          id: h.id,
          name: h.name,
          ticker: h.ticker,
          value,
          asset_class: h.asset_class || null,
          sector: h.sector || null,
          geography: h.geography || null,
        }
      })
      .filter((h) => h.value > 0)
  }, [holdings])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Header */}
      <section className="rounded-[var(--r-lg)] border border-kern-200 bg-gradient-to-br from-kern-50 to-white p-6">
        <div className="flex items-center gap-3 mb-4">
          <Link
            href="/core/assets"
            className="inline-flex items-center gap-1 text-sm text-kern-600 hover:text-kern-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Assets
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--ink)]">Holdings</h1>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              {holdings.length} actieve holding{holdings.length !== 1 ? 's' : ''} in je portfolio
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-kern-200 bg-kern-50 px-3 py-2 text-sm font-medium text-kern-700 hover:bg-kern-100 disabled:opacity-50"
              title="Prijzen vernieuwen"
              data-testid="refresh-prices-btn"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Vernieuwen...' : 'Prijzen vernieuwen'}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
            >
              <Plus className="h-4 w-4" />
              Holding toevoegen
            </button>
          </div>
        </div>

        {/* Stale price warning banner */}
        {staleCount > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-kern-200 bg-kern-50 p-3" data-testid="stale-price-warning">
            <AlertTriangle className="h-4 w-4 shrink-0 text-kern-500" />
            <p className="text-xs text-kern-700">
              <span className="font-semibold">{staleCount} holding{staleCount !== 1 ? 's' : ''}</span> met verouderde prijzen.
              Gebruik &quot;Prijzen vernieuwen&quot; of werk de prijs handmatig bij via het bewerk-icoon.
            </p>
          </div>
        )}

        {/* Refresh result banner */}
        {refreshResult && (
          <div className={`mt-4 flex items-center gap-2 rounded-lg border p-3 ${
            refreshResult.type === 'success'
              ? 'border-emerald-200 bg-emerald-50'
              : refreshResult.type === 'warning'
                ? 'border-kern-200 bg-kern-50'
                : 'border-red-200 bg-red-50'
          }`} data-testid="refresh-result">
            {refreshResult.type === 'success' && <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />}
            {refreshResult.type === 'warning' && <AlertTriangle className="h-4 w-4 shrink-0 text-kern-500" />}
            {refreshResult.type === 'error' && <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />}
            <p className={`text-xs ${
              refreshResult.type === 'success'
                ? 'text-emerald-700'
                : refreshResult.type === 'warning'
                  ? 'text-kern-700'
                  : 'text-red-700'
            }`}>
              {refreshResult.message}
            </p>
            <button
              onClick={() => setRefreshResult(null)}
              className="ml-auto shrink-0 rounded p-0.5 hover:bg-black/5"
            >
              <X className="h-3 w-3 text-[var(--ink-3)]" />
            </button>
          </div>
        )}

        {/* KPI Stats */}
        <div className="mt-3 sm:mt-6 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Totale waarde</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{formatCurrency(totalValue)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Totale kostprijs</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{formatCurrency(totalCost)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Rendement</p>
            {totalCost > 0 ? (
              <p className={`mt-1 text-xl font-bold ${totalReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(1)}%
                <span className="ml-1 text-sm font-medium">
                  ({totalReturn >= 0 ? '+' : ''}{formatCurrency(totalValue - totalCost)})
                </span>
              </p>
            ) : (
              <p className="mt-1 text-xl font-bold text-[var(--ink-3)]">-</p>
            )}
          </div>
        </div>
      </section>

      {/* Portfolio allocation visualization — donut chart with sector/geography/asset class views */}
      {holdingsForAllocation.length > 0 && (
        <section className="mt-3 sm:mt-6 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6" data-testid="portfolio-allocation">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="h-4 w-4 text-kern-600" />
            <h2 className="text-sm font-semibold text-[var(--ink-2)]">Portfolio verdeling</h2>
          </div>
          <PortfolioAllocationVisualization
            holdings={holdingsForAllocation}
            totalValue={totalValue}
          />
        </section>
      )}

      {/* Benchmark comparison */}
      {holdings.length > 0 && (
        <section className="mt-3 sm:mt-6">
          <BenchmarkComparisonChart
            comparison={benchmarkComparison}
            onPeriodChange={handleBenchmarkPeriodChange}
            activePeriod={benchmarkPeriod}
            loading={benchmarkLoading}
          />
        </section>
      )}

      {/* Dividend Tracker */}
      {holdings.length > 0 && (
        <section className="mt-3 sm:mt-6" data-testid="dividend-tracker-section">
          <DividendTracker />
        </section>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); loadHoldings() }}
            className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            Opnieuw proberen
          </button>
        </div>
      )}

      {/* Holdings list */}
      <section className="mt-3 sm:mt-6 space-y-2">
        {holdings.length === 0 && !loading && (
          <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-8 text-center">
            <Briefcase className="mx-auto h-10 w-10 text-[var(--ink-4)]" />
            <p className="mt-3 text-sm font-medium text-[var(--ink-2)]">Nog geen holdings</p>
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              Voeg je eerste holding toe om je portfolio te volgen.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
            >
              <Plus className="h-4 w-4" />
              Eerste holding toevoegen
            </button>
          </div>
        )}

        {holdings.map((holding) => {
          const price = holding.current_price ?? holding.avg_purchase_price
          const value = price * Math.max(0, holding.units)
          const cost = holding.avg_purchase_price * Math.max(0, holding.units)
          const returnPct = cost > 0 ? ((value - cost) / cost) * 100 : 0
          const stale = isPriceStale(holding)
          const soldOut = holding.units <= 0
          // Daily change: prefer DB column, fallback to refresh result
          const priceUpdate = priceUpdates.get(holding.id)
          const dailyPct = holding.daily_change_percent ?? priceUpdate?.dailyChangePercent ?? null

          return (
            <div
              key={holding.id}
              className={`flex items-center gap-3 rounded-xl border bg-[var(--paper)] p-3 transition-colors hover:border-kern-200 hover:bg-kern-50/30 ${
                soldOut ? 'border-[var(--border-md)] bg-[var(--subtle)]/50 opacity-75' :
                stale ? 'border-kern-300 bg-kern-50/20' : 'border-[var(--border-ed)]'
              }`}
              data-testid={`holding-item-${holding.id}`}
              data-sold-out={soldOut ? 'true' : 'false'}
              data-units={Math.max(0, holding.units)}
            >
              {/* Clickable area — navigates to holding detail page */}
              <Link
                href={`/core/assets/holdings/${holding.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
                data-testid={`holding-link-${holding.id}`}
              >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                soldOut ? 'bg-zinc-100' :
                stale ? 'bg-kern-100' : 'bg-kern-50'
              }`}>
                {soldOut ? (
                  <CheckCircle className="h-4 w-4 text-[var(--ink-3)]" />
                ) : stale ? (
                  <Clock className="h-4 w-4 text-kern-500" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-kern-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`truncate text-sm font-medium ${soldOut ? 'text-[var(--ink-3)]' : 'text-[var(--ink)]'}`}>{holding.name}</p>
                  {soldOut && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink-2)]"
                      data-testid="sold-out-indicator"
                    >
                      <CheckCircle className="h-2.5 w-2.5" />
                      Uitverkocht
                    </span>
                  )}
                  {stale && !soldOut && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-kern-100 px-1.5 py-0.5 text-[10px] font-semibold text-kern-700"
                      title={`Laatste update: ${formatLastUpdate(holding.last_price_update)}`}
                      data-testid="stale-indicator"
                    >
                      <AlertTriangle className="h-2.5 w-2.5" />
                      Verouderd
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-[var(--ink-3)]">
                  {holding.ticker && <span className={`font-medium ${soldOut ? 'text-[var(--ink-3)]' : 'text-kern-600'}`}>{holding.ticker}</span>}
                  {holding.ticker && ' · '}
                  {soldOut ? <span className="text-[var(--ink-3)]">0 eenheden</span> : `${holding.units} eenheden`}
                  {holding.institution && ` · ${holding.institution}`}
                  {holding.purchase_date && ` · ${new Date(holding.purchase_date).toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })}`}
                  {stale && holding.last_price_update && (
                    <span className="ml-1 text-kern-500">
                      · Prijs van {formatLastUpdate(holding.last_price_update)}
                    </span>
                  )}
                  {stale && !holding.last_price_update && (
                    <span className="ml-1 text-kern-500">· Prijs nooit bijgewerkt</span>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-semibold ${soldOut ? 'text-[var(--ink-3)]' : stale ? 'text-kern-700' : 'text-[var(--ink)]'}`} data-testid={`holding-value-${holding.id}`}>
                  {formatCurrency(Math.max(0, value))}
                  {stale && !soldOut && <span className="text-[10px] font-normal text-kern-500 block">laatste bekende prijs</span>}
                </p>
                {/* Daily change from price feed */}
                {dailyPct !== null && !soldOut && !stale && (
                  <p
                    className={`text-[11px] font-semibold ${dailyPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                    data-testid={`holding-daily-change-${holding.id}`}
                  >
                    {dailyPct >= 0 ? '▲' : '▼'} {dailyPct >= 0 ? '+' : ''}{dailyPct.toFixed(2)}% vandaag
                  </p>
                )}
                {/* Total return */}
                {cost > 0 && !soldOut && (
                  <p className={`text-xs font-medium ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}% totaal
                  </p>
                )}
              </div>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                {stale && (
                  <button
                    onClick={() => setOverrideHolding(holding)}
                    className="rounded-lg p-1.5 text-kern-500 hover:bg-kern-50 hover:text-kern-700"
                    title="Prijs handmatig bijwerken"
                    data-testid="manual-override-btn"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setTxHolding(holding)}
                  className="rounded-lg p-1.5 text-[var(--ink-3)] hover:bg-emerald-50 hover:text-emerald-600"
                  title="Transactie registreren"
                >
                  <Receipt className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setEditHolding(holding)}
                  className="rounded-lg p-1.5 text-[var(--ink-3)] hover:bg-kern-50 hover:text-kern-600"
                  title="Bewerken"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                {deleteConfirm === holding.id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleDelete(holding.id)}
                      disabled={deleting === holding.id}
                      className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid={`delete-confirm-${holding.id}`}
                    >
                      {deleting === holding.id ? '...' : 'Ja'}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      disabled={deleting === holding.id}
                      className="rounded-lg border border-[var(--border-ed)] px-2 py-1 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Nee
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(holding.id)}
                    className="rounded-lg p-1.5 text-[var(--ink-3)] hover:bg-red-50 hover:text-red-600"
                    title="Verwijderen"
                    data-testid={`delete-trigger-${holding.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </section>

      {/* New holding form modal */}
      {showForm && (
        <HoldingForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            setLoading(true)
            loadHoldings()
          }}
        />
      )}

      {/* Edit holding form modal */}
      {editHolding && (
        <HoldingEditForm
          holding={editHolding}
          onClose={() => setEditHolding(null)}
          onSaved={() => {
            setEditHolding(null)
            setLoading(true)
            loadHoldings()
          }}
        />
      )}

      {/* Transaction form modal */}
      {txHolding && (
        <HoldingTransactionForm
          holding={txHolding}
          onClose={() => setTxHolding(null)}
          onSaved={() => {
            setTxHolding(null)
            setLoading(true)
            loadHoldings()
          }}
        />
      )}

      {/* Manual price override modal */}
      {overrideHolding && (
        <ManualPriceOverrideModal
          holding={overrideHolding}
          onClose={() => setOverrideHolding(null)}
          onSaved={() => {
            setOverrideHolding(null)
            setLoading(true)
            loadHoldings()
          }}
        />
      )}
    </div>
  )
}

// ── Manual price override modal ──────────────────────────────────

function ManualPriceOverrideModal({
  holding,
  onClose,
  onSaved,
}: {
  holding: Holding
  onClose: () => void
  onSaved: () => void
}) {
  const [price, setPrice] = useState(String(holding.current_price ?? holding.avg_purchase_price ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentValue = (Number(price) || 0) * holding.units
  const oldValue = (holding.current_price ?? holding.avg_purchase_price) * holding.units

  async function handleSave() {
    if (!price || isNaN(Number(price)) || Number(price) < 0) {
      setError('Voer een geldige prijs in')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/holdings/refresh-prices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holding_id: holding.id,
          price: Number(price),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Kon prijs niet bijwerken')
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Prijs handmatig bijwerken" size="sm">
      <div className="p-5" data-testid="manual-override-modal">
        <p className="mb-4 text-xs text-[var(--ink-3)]">
          {holding.name} {holding.ticker ? `(${holding.ticker})` : ''}
        </p>

        {/* Stale price notice */}
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-kern-200 bg-kern-50 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-kern-500 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-kern-700">Prijsfeed niet beschikbaar</p>
            <p className="text-xs text-kern-600 mt-0.5">
              De automatische prijsfeed is momenteel niet bereikbaar voor deze holding.
              Je kunt de huidige prijs handmatig invoeren.
            </p>
            {holding.last_price_update && (
              <p className="text-xs text-kern-500 mt-1">
                Laatste automatische update: {new Date(holding.last_price_update).toLocaleDateString('nl-NL', {
                  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
              Huidige prijs per eenheid (€) *
            </label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
              placeholder="0.00"
              autoFocus
              data-testid="override-price-input"
            />
          </div>

          {/* Value preview */}
          <div className="rounded-lg border border-kern-200 bg-kern-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-kern-700">
                Nieuwe waarde ({holding.units} eenheden)
              </span>
              <span className="text-sm font-bold text-[var(--ink)]">{formatCurrency(currentValue)}</span>
            </div>
            {currentValue !== oldValue && (
              <p className={`mt-1 text-xs font-medium ${currentValue >= oldValue ? 'text-emerald-600' : 'text-red-600'}`}>
                {currentValue >= oldValue ? '+' : ''}{formatCurrency(currentValue - oldValue)} verschil
              </p>
            )}
          </div>

          <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-2.5">
            <p className="text-[10px] text-[var(--ink-3)]">
              Vorige prijs: {holding.current_price != null ? formatCurrency(holding.current_price) : 'Niet ingesteld'}
              {' · '}Aankoopprijs: {formatCurrency(holding.avg_purchase_price)}
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !price}
            className="rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
            data-testid="override-save-btn"
          >
            {saving ? 'Bijwerken...' : 'Prijs bijwerken'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

// ── Holding colors for allocation chart ─────────────────────────

const HOLDING_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#f97316', // orange
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#6366f1', // indigo
  '#84cc16', // lime
  '#d946ef', // fuchsia
  '#14b8a6', // teal
  '#e11d48', // rose
]

// ── Holdings allocation donut chart (SVG) ─────────────────────

function HoldingsAllocationPie({
  holdings,
  total,
}: {
  holdings: { id: string; name: string; ticker: string | null; value: number }[]
  total: number
}) {
  const size = 140
  const cx = size / 2
  const cy = size / 2
  const r = 50
  const strokeWidth = 24

  const segments = holdings.map((h, i) => ({
    id: h.id,
    name: h.name,
    pct: total > 0 ? h.value / total : 0,
    color: HOLDING_COLORS[i % HOLDING_COLORS.length],
  }))

  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      data-testid="allocation-donut"
    >
      {/* Background ring for empty state */}
      {segments.length === 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#e4e4e7"
          strokeWidth={strokeWidth}
        />
      )}
      {segments.map((seg) => {
        const dash = seg.pct * circumference
        const gap = circumference - dash
        const currentOffset = offset
        offset += dash

        return (
          <circle
            key={seg.id}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-currentOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#18181b">
        {formatCurrency(total)}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fill="#a1a1aa">
        totaal
      </text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="8" fill="#a1a1aa">
        {holdings.length} holding{holdings.length !== 1 ? 's' : ''}
      </text>
    </svg>
  )
}

// ── Holding form modal ─────────────────────────────────────────

function HoldingForm({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [tickerStatus, setTickerStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [tickerInfo, setTickerInfo] = useState<{
    displayName?: string
    price?: number
    currency?: string
    hint?: string
  } | null>(null)
  const tickerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [units, setUnits] = useState('')
  const [avgPrice, setAvgPrice] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [currency] = useState('EUR')
  const [isActive] = useState(true)
  const [purchaseDate, setPurchaseDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{
    message: string
    existing: { id: string; name: string; ticker: string }[]
  } | null>(null)
  // Idempotency key to prevent duplicate submissions on back-button / re-render
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())

  const validateTicker = useCallback((value: string) => {
    if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current)
    const trimmed = value.trim().toUpperCase()
    if (!trimmed) {
      setTickerStatus('idle')
      setTickerInfo(null)
      return
    }
    setTickerStatus('checking')
    tickerDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/prices/${encodeURIComponent(trimmed)}`)
        const data = await res.json()
        if (data.available) {
          setTickerStatus('valid')
          setTickerInfo({
            displayName: data.displayName,
            price: data.price,
            currency: data.currency,
          })
        } else {
          setTickerStatus('invalid')
          setTickerInfo({ hint: data.hint })
        }
      } catch {
        setTickerStatus('idle')
        setTickerInfo(null)
      }
    }, 600)
  }, [])

  async function handleSave(forceDuplicate = false) {
    if (!name || submitted) return
    setSaving(true)
    setError(null)
    if (!forceDuplicate) setDuplicateWarning(null)

    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          name,
          ticker: ticker || null,
          units: units ? Number(units) : 0,
          avg_purchase_price: Number(avgPrice) || 0,
          current_price: currentPrice ? Number(currentPrice) : null,
          purchase_date: purchaseDate || null,
          currency,
          is_active: isActive,
          notes: notes || null,
          force_duplicate: forceDuplicate,
        }),
      })

      if (res.status === 409) {
        // Duplicate warning — show to user and let them decide
        const data = await res.json()
        setDuplicateWarning({
          message: data.message || 'Er bestaat al een holding met dezelfde ticker.',
          existing: data.existing_holdings || [],
        })
        return
      }

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Kon holding niet opslaan')
      }

      // Mark as submitted to prevent re-submission
      setSubmitted(true)

      // Replace current history entry so back-button doesn't return to
      // a state that could re-trigger the form submission
      if (typeof window !== 'undefined') {
        window.history.replaceState(
          { ...window.history.state, formSubmitted: true },
          ''
        )
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Nieuwe holding" size="md">
      <div className="p-5">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {duplicateWarning && (
          <div className="mb-4 rounded-lg border border-kern-300 bg-kern-50 p-3" data-testid="duplicate-warning">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-kern-800">Dubbele ticker gedetecteerd</p>
                <p className="mt-1 text-xs text-kern-700">{duplicateWarning.message}</p>
                {duplicateWarning.existing.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {duplicateWarning.existing.map((h) => (
                      <li key={h.id} className="text-xs text-kern-700">
                        • {h.name} ({h.ticker})
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="rounded-md bg-kern-600 px-3 py-1 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
                    data-testid="force-duplicate-btn"
                  >
                    {saving ? 'Opslaan...' : 'Toch toevoegen'}
                  </button>
                  <button
                    onClick={() => setDuplicateWarning(null)}
                    className="rounded-md border border-kern-300 px-3 py-1 text-xs font-medium text-kern-700 hover:bg-kern-100"
                    data-testid="cancel-duplicate-btn"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Naam *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
                placeholder="VWRL ETF"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Ticker / ISIN</label>
              <input
                value={ticker}
                onChange={(e) => {
                  setTicker(e.target.value)
                  validateTicker(e.target.value)
                }}
                className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
                placeholder="VWRL"
              />
              {tickerStatus === 'checking' && (
                <p className="mt-1 flex items-center gap-1 font-sans text-[11px] text-[var(--ink-3)]">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-[var(--border-md)] border-t-transparent" />
                  Ticker controleren…
                </p>
              )}
              {tickerStatus === 'valid' && tickerInfo && (
                <p className="mt-1 font-sans text-[11px] text-kern-700">
                  ✓ {tickerInfo.displayName ?? ticker.toUpperCase()} —{' '}
                  {tickerInfo.currency} {tickerInfo.price?.toFixed(2)}
                </p>
              )}
              {tickerStatus === 'invalid' && (
                <p className="mt-1 font-sans text-[11px] text-[var(--ink-3)]">
                  Ticker niet gevonden.{' '}
                  {tickerInfo?.hint ?? 'Voeg een beurs-suffix toe, bijv. .AS (Amsterdam), .DE (Frankfurt), .L (Londen).'}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Aantal eenheden</label>
              <input
                type="number"
                step="0.001"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
                placeholder="0"
                data-testid="holding-units-input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Gem. aankoopprijs</label>
              <input
                type="number"
                step="0.01"
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huidige prijs</label>
              <input
                type="number"
                step="0.01"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Aankoopdatum</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
                data-testid="holding-purchase-date-input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Valuta</label>
              <div
                className="flex items-center rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink-2)]"
                data-testid="holding-currency-display"
              >
                {currency}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Status</label>
              <div
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink-2)]"
                data-testid="holding-is-active-display"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                Actief
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notities (optioneel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            onClick={() => handleSave()}
            disabled={saving || submitted || !name}
            className="rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
            data-testid="holding-submit-btn"
          >
            {submitted ? 'Opgeslagen ✓' : saving ? 'Opslaan...' : 'Toevoegen'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

// ── Holding edit form modal ────────────────────────────────────

function HoldingEditForm({
  holding,
  onClose,
  onSaved,
}: {
  holding: Holding
  onClose: () => void
  onSaved: () => void
}) {
  // LocalStorage key for draft state
  const draftKey = `holding-edit-draft-${holding.id}`

  // Load draft from localStorage if it exists (recover after accidental refresh)
  const loadDraft = useCallback(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(draftKey) : null
      if (raw) {
        const draft = JSON.parse(raw)
        // Only use draft if it's for the same holding version
        if (draft.holdingId === holding.id) {
          return draft
        }
      }
    } catch { /* ignore parse errors */ }
    return null
  }, [draftKey, holding.id])

  const draft = loadDraft()

  const [name, setName] = useState(draft?.name ?? holding.name)
  const [ticker, setTicker] = useState(draft?.ticker ?? (holding.ticker || ''))
  const [tickerStatus, setTickerStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [tickerInfo, setTickerInfo] = useState<{
    displayName?: string
    price?: number
    currency?: string
    hint?: string
  } | null>(null)
  const tickerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [units, setUnits] = useState(draft?.units ?? String(holding.units))
  const [avgPrice, setAvgPrice] = useState(draft?.avgPrice ?? String(holding.avg_purchase_price))
  const [currentPrice, setCurrentPrice] = useState(draft?.currentPrice ?? String(holding.current_price ?? ''))
  const [notes, setNotes] = useState(draft?.notes ?? (holding.notes || ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDraftNotice, setShowDraftNotice] = useState(!!draft)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [conflictData, setConflictData] = useState<{
    message: string
    server_state: Record<string, unknown>
  } | null>(null)

  const validateTicker = useCallback((value: string) => {
    if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current)
    const trimmed = value.trim().toUpperCase()
    if (!trimmed) {
      setTickerStatus('idle')
      setTickerInfo(null)
      return
    }
    setTickerStatus('checking')
    tickerDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/prices/${encodeURIComponent(trimmed)}`)
        const data = await res.json()
        if (data.available) {
          setTickerStatus('valid')
          setTickerInfo({
            displayName: data.displayName,
            price: data.price,
            currency: data.currency,
          })
        } else {
          setTickerStatus('invalid')
          setTickerInfo({ hint: data.hint })
        }
      } catch {
        setTickerStatus('idle')
        setTickerInfo(null)
      }
    }, 600)
  }, [])

  // Track dirty state (form values differ from original holding)
  const isDirty = useMemo(() => {
    return (
      name !== holding.name ||
      ticker !== (holding.ticker || '') ||
      units !== String(holding.units) ||
      avgPrice !== String(holding.avg_purchase_price) ||
      currentPrice !== String(holding.current_price ?? '') ||
      notes !== (holding.notes || '')
    )
  }, [name, ticker, units, avgPrice, currentPrice, notes, holding])

  // Auto-save draft to localStorage when form is dirty
  useEffect(() => {
    if (isDirty) {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          holdingId: holding.id,
          name, ticker, units, avgPrice, currentPrice, notes,
          savedAt: new Date().toISOString(),
        }))
      } catch { /* ignore storage errors */ }
    } else {
      // Clean up draft when form matches original
      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
    }
  }, [isDirty, draftKey, holding.id, name, ticker, units, avgPrice, currentPrice, notes])

  // Warn on page refresh/close when form has unsaved changes
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Modern browsers ignore custom messages, but returning a string is required for some
      e.returnValue = 'Je hebt onopgeslagen wijzigingen. Weet je zeker dat je wilt vernieuwen?'
      return e.returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // Handle close with unsaved changes confirmation
  function handleClose() {
    if (isDirty) {
      setShowCloseConfirm(true)
    } else {
      cleanupAndClose()
    }
  }

  // Discard draft and close
  function cleanupAndClose() {
    try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
    onClose()
  }

  // Discard recovered draft and reset to original holding values
  function discardDraft() {
    setName(holding.name)
    setTicker(holding.ticker || '')
    setUnits(String(holding.units))
    setAvgPrice(String(holding.avg_purchase_price))
    setCurrentPrice(String(holding.current_price ?? ''))
    setNotes(holding.notes || '')
    setShowDraftNotice(false)
    try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
  }

  const newValue = (Number(currentPrice) || Number(avgPrice) || 0) * (Number(units) || 1)
  const oldValue = (holding.current_price ?? holding.avg_purchase_price) * holding.units

  async function handleSave(forceOverwrite = false) {
    if (!name) return
    setSaving(true)
    setError(null)
    if (!forceOverwrite) setConflictData(null)

    try {
      const payload: Record<string, unknown> = {
        id: holding.id,
        name,
        ticker: ticker || null,
        units: Number(units) || 1,
        avg_purchase_price: Number(avgPrice) || 0,
        current_price: currentPrice ? Number(currentPrice) : null,
        notes: notes || null,
      }

      // Send expected_updated_at for optimistic concurrency control
      // (skip if force-overwriting after a conflict)
      if (!forceOverwrite && holding.updated_at) {
        payload.expected_updated_at = holding.updated_at
      }

      const res = await fetch('/api/holdings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.status === 409) {
        const data = await res.json()
        // Check if this is a concurrency conflict (not a duplicate ticker warning)
        if (data.conflict) {
          setConflictData({
            message: data.message || 'Deze holding is ondertussen gewijzigd door een andere sessie.',
            server_state: data.server_state || {},
          })
          return
        }
      }

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Kon holding niet bijwerken')
      }

      // Clear draft on successful save
      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout')
    } finally {
      setSaving(false)
    }
  }

  // Apply server values after a conflict (reload the form with latest data)
  function handleReloadFromServer() {
    if (!conflictData?.server_state) return
    const s = conflictData.server_state
    if (s.name !== undefined) setName(String(s.name))
    if (s.ticker !== undefined) setTicker(String(s.ticker || ''))
    if (s.units !== undefined) setUnits(String(s.units))
    if (s.avg_purchase_price !== undefined) setAvgPrice(String(s.avg_purchase_price))
    if (s.current_price !== undefined) setCurrentPrice(String(s.current_price ?? ''))
    if (s.notes !== undefined) setNotes(String(s.notes || ''))
    setConflictData(null)
    setError(null)
  }

  return (
    <BottomSheet open={true} onClose={handleClose} title="Holding bewerken" size="md">
      <div className="p-5" data-testid="holding-edit-modal">
        {/* Unsaved changes close confirmation */}
        {showCloseConfirm && (
          <div className="mb-4 rounded-lg border border-orange-300 bg-orange-50 p-3" data-testid="unsaved-changes-warning">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-orange-800">Onopgeslagen wijzigingen</p>
                <p className="mt-1 text-xs text-orange-700">
                  Je hebt wijzigingen die nog niet zijn opgeslagen. Wil je deze verwijderen of verder bewerken?
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={cleanupAndClose}
                    className="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700"
                    data-testid="discard-changes-btn"
                  >
                    Wijzigingen verwijderen
                  </button>
                  <button
                    onClick={() => setShowCloseConfirm(false)}
                    className="rounded-md border border-orange-300 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
                    data-testid="keep-editing-btn"
                  >
                    Verder bewerken
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Draft recovered notice (after page refresh) */}
        {showDraftNotice && (
          <div className="mb-4 rounded-lg border border-blue-300 bg-blue-50 p-3" data-testid="draft-recovered-notice">
            <div className="flex items-start gap-2">
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-blue-800">Concept hersteld</p>
                <p className="mt-1 text-xs text-blue-700">
                  Je onopgeslagen wijzigingen zijn hersteld na het vernieuwen van de pagina.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setShowDraftNotice(false)}
                    className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    data-testid="accept-draft-btn"
                  >
                    Doorgaan met concept
                  </button>
                  <button
                    onClick={discardDraft}
                    className="rounded-md border border-blue-300 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    data-testid="discard-draft-btn"
                  >
                    Origineel laden
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Unsaved changes indicator */}
        {isDirty && !showCloseConfirm && !showDraftNotice && (
          <div className="mb-3 flex items-center gap-1.5 rounded-md bg-kern-50 px-3 py-1.5 border border-kern-200" data-testid="dirty-indicator">
            <div className="h-2 w-2 rounded-full bg-kern-500 animate-pulse" />
            <span className="text-[11px] font-medium text-kern-700">Onopgeslagen wijzigingen</span>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Concurrent edit conflict warning */}
        {conflictData && (
          <div className="mb-4 rounded-lg border border-kern-300 bg-kern-50 p-3" data-testid="conflict-warning">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-kern-800">Bewerkingsconflict</p>
                <p className="mt-1 text-xs text-kern-700">{conflictData.message}</p>
                {conflictData.server_state && (
                  <div className="mt-2 rounded border border-kern-200 bg-[var(--paper)]/60 p-2">
                    <p className="text-[10px] font-medium text-kern-600 mb-1">Huidige waarden op de server:</p>
                    <p className="text-xs text-[var(--ink-2)]">
                      Naam: <span className="font-medium">{String(conflictData.server_state.name || '-')}</span>
                      {' · '}Eenheden: <span className="font-medium">{String(conflictData.server_state.units || '-')}</span>
                      {' · '}Prijs: <span className="font-medium">{conflictData.server_state.current_price != null ? formatCurrency(Number(conflictData.server_state.current_price)) : '-'}</span>
                    </p>
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleReloadFromServer}
                    className="rounded-md bg-kern-600 px-3 py-1 text-xs font-medium text-white hover:bg-kern-700"
                    data-testid="conflict-reload-btn"
                  >
                    Serverwaarden laden
                  </button>
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="rounded-md border border-kern-300 px-3 py-1 text-xs font-medium text-kern-700 hover:bg-kern-100 disabled:opacity-50"
                    data-testid="conflict-overwrite-btn"
                  >
                    {saving ? 'Overschrijven...' : 'Toch overschrijven'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Naam *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Ticker / ISIN</label>
              <input
                value={ticker}
                onChange={(e) => {
                  setTicker(e.target.value)
                  validateTicker(e.target.value)
                }}
                className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
              {tickerStatus === 'checking' && (
                <p className="mt-1 flex items-center gap-1 font-sans text-[11px] text-[var(--ink-3)]">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-[var(--border-md)] border-t-transparent" />
                  Ticker controleren…
                </p>
              )}
              {tickerStatus === 'valid' && tickerInfo && (
                <p className="mt-1 font-sans text-[11px] text-kern-700">
                  ✓ {tickerInfo.displayName ?? ticker.toUpperCase()} —{' '}
                  {tickerInfo.currency} {tickerInfo.price?.toFixed(2)}
                </p>
              )}
              {tickerStatus === 'invalid' && (
                <p className="mt-1 font-sans text-[11px] text-[var(--ink-3)]">
                  Ticker niet gevonden.{' '}
                  {tickerInfo?.hint ?? 'Voeg een beurs-suffix toe, bijv. .AS (Amsterdam), .DE (Frankfurt), .L (Londen).'}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Aantal eenheden</label>
              <input
                type="number"
                step="0.001"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Gem. aankoopprijs</label>
              <input
                type="number"
                step="0.01"
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huidige prijs</label>
              <input
                type="number"
                step="0.01"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Live value preview */}
          <div className="rounded-lg border border-kern-200 bg-kern-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-kern-700">Portfolio waarde (deze holding)</span>
              <span className="text-sm font-bold text-[var(--ink)]">{formatCurrency(newValue)}</span>
            </div>
            {newValue !== oldValue && (
              <p className={`mt-1 text-xs font-medium ${newValue >= oldValue ? 'text-emerald-600' : 'text-red-600'}`}>
                {newValue >= oldValue ? '+' : ''}{formatCurrency(newValue - oldValue)} t.o.v. huidige waarde
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notities (optioneel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="rounded-lg border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            onClick={() => handleSave()}
            disabled={saving || !name}
            className="rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
          >
            {saving ? 'Bijwerken...' : 'Bijwerken'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

// ── Holding transaction form modal ─────────────────────────────

type HoldingTransaction = {
  id: string
  holding_id: string
  type: 'buy' | 'sell' | 'dividend'
  units: number
  price_per_unit: number
  total_amount: number
  date: string
  notes: string | null
  created_at: string
}

function HoldingTransactionForm({
  holding,
  onClose,
  onSaved,
}: {
  holding: Holding
  onClose: () => void
  onSaved: () => void
}) {
  const [txType, setTxType] = useState<'buy' | 'sell' | 'dividend'>('buy')
  const [units, setUnits] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState(
    String(holding.current_price ?? holding.avg_purchase_price ?? '')
  )
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<HoldingTransaction[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [tab, setTab] = useState<'new' | 'history'>('new')

  // Load transaction history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`/api/holding-transactions?holding_id=${holding.id}`)
        if (res.ok) {
          const data = await res.json()
          setTransactions(data.transactions || [])
        }
      } catch {
        // Silently fail — history is informational
      } finally {
        setLoadingHistory(false)
      }
    }
    loadHistory()
  }, [holding.id])

  const totalAmount = (Number(units) || 0) * (Number(pricePerUnit) || 0)

  // Preview: what the holding will look like after the transaction
  const currentUnits = Math.max(0, holding.units)
  const currentAvg = holding.avg_purchase_price
  let previewUnits = currentUnits
  let previewAvg = currentAvg

  // Sell validation: cannot sell more than currently owned
  const sellExceedsOwned = txType === 'sell' && Number(units) > currentUnits
  const sellFromZero = txType === 'sell' && currentUnits <= 0

  if (txType === 'buy' && Number(units) > 0) {
    previewUnits = currentUnits + Number(units)
    previewAvg = previewUnits > 0
      ? (currentUnits * currentAvg + Number(units) * Number(pricePerUnit)) / previewUnits
      : Number(pricePerUnit)
  } else if (txType === 'sell' && Number(units) > 0) {
    previewUnits = Math.max(0, currentUnits - Number(units))
  }

  async function handleSave() {
    if (!units || !pricePerUnit || !date) return
    // Block selling more units than available
    if (txType === 'sell' && Number(units) > currentUnits) return
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/holding-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holding_id: holding.id,
          type: txType,
          units: Number(units),
          price_per_unit: Number(pricePerUnit),
          date,
          notes: notes || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Kon transactie niet opslaan')
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout')
    } finally {
      setSaving(false)
    }
  }

  const typeConfig = {
    buy: { label: 'Koop', icon: ArrowDownRight, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', ring: 'ring-emerald-500' },
    sell: { label: 'Verkoop', icon: ArrowUpRight, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', ring: 'ring-red-500' },
    dividend: { label: 'Dividend', icon: DollarSign, color: 'text-kern-600', bg: 'bg-kern-50', border: 'border-kern-200', ring: 'ring-kern-500' },
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Transactie registreren" size="md">
      <p className="px-5 -mt-2 pb-3 text-xs text-[var(--ink-3)]">{holding.name} {holding.ticker ? `(${holding.ticker})` : ''}</p>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border-ed)] px-6">
          <button
            onClick={() => setTab('new')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'new' ? 'border-kern-500 text-kern-700' : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]'}`}
          >
            Nieuwe transactie
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'history' ? 'border-kern-500 text-kern-700' : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]'}`}
          >
            Geschiedenis {transactions.length > 0 && `(${transactions.length})`}
          </button>
        </div>

        {/* Tab content */}
        <div className="px-6 py-4">
          {tab === 'new' && (
            <>
              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              {/* Transaction type selector */}
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">Type transactie</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['buy', 'sell', 'dividend'] as const).map((t) => {
                    const cfg = typeConfig[t]
                    const Icon = cfg.icon
                    return (
                      <button
                        key={t}
                        onClick={() => setTxType(t)}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                          txType === t
                            ? `${cfg.bg} ${cfg.border} ${cfg.color} ring-1 ${cfg.ring}`
                            : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Fields */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs font-medium text-[var(--ink-2)]">
                        {txType === 'dividend' ? 'Bedrag per eenheid' : 'Aantal eenheden'} *
                      </label>
                      {txType === 'sell' && currentUnits > 0 && (
                        <button
                          type="button"
                          onClick={() => setUnits(String(currentUnits))}
                          className="text-[10px] font-medium text-red-600 hover:text-red-700"
                          data-testid="sell-all-btn"
                        >
                          Alles verkopen ({currentUnits})
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.001"
                      max={txType === 'sell' ? currentUnits : undefined}
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                      className={`w-full rounded-lg border px-3 py-2 text-sm ${
                        sellExceedsOwned || sellFromZero ? 'border-red-300 bg-red-50/50' : 'border-[var(--border-ed)]'
                      }`}
                      placeholder={txType === 'dividend' ? '1' : '10'}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Prijs per eenheid *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={pricePerUnit}
                      onChange={(e) => setPricePerUnit(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
                      placeholder="50.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Datum *</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Totaal bedrag</label>
                    <div className="flex items-center rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-sm font-medium text-[var(--ink-2)]">
                      {formatCurrency(totalAmount)}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notities (optioneel)</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
                    placeholder="Maandelijkse aankoop..."
                  />
                </div>
              </div>

              {/* Sell validation warning */}
              {sellFromZero && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3" data-testid="sell-from-zero-warning">
                  <p className="text-xs font-medium text-red-700">
                    <AlertTriangle className="inline h-3 w-3 mr-1" />
                    Deze holding heeft 0 eenheden. Je kunt niet verkopen.
                  </p>
                </div>
              )}
              {sellExceedsOwned && !sellFromZero && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3" data-testid="sell-exceeds-warning">
                  <p className="text-xs font-medium text-red-700">
                    <AlertTriangle className="inline h-3 w-3 mr-1" />
                    Je hebt maar {currentUnits} eenheden. Je kunt niet meer verkopen dan je bezit.
                  </p>
                </div>
              )}

              {/* Preview: holding after transaction */}
              {Number(units) > 0 && txType !== 'dividend' && !sellExceedsOwned && !sellFromZero && (
                <div className="mt-4 rounded-lg border border-kern-200 bg-kern-50/50 p-3">
                  <p className="text-xs font-medium text-kern-700 mb-1">Na transactie:</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--ink-2)]">
                      {currentUnits} <span className="text-[var(--ink-3)]">→</span> {previewUnits.toFixed(3)} eenheden
                      {previewUnits === 0 && txType === 'sell' && (
                        <span className="ml-2 text-xs font-medium text-[var(--ink-3)]">(volledig uitverkocht)</span>
                      )}
                    </span>
                    <span className="font-medium text-[var(--ink)]">
                      Gem. prijs: {formatCurrency(previewAvg)}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                >
                  Annuleren
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !units || !pricePerUnit || !date || sellExceedsOwned || sellFromZero}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                    txType === 'buy' ? 'bg-emerald-600 hover:bg-emerald-700' :
                    txType === 'sell' ? 'bg-red-600 hover:bg-red-700' :
                    'bg-kern-600 hover:bg-kern-700'
                  }`}
                >
                  {saving ? 'Opslaan...' : `${typeConfig[txType].label} registreren`}
                </button>
              </div>
            </>
          )}

          {tab === 'history' && (
            <div className="max-h-80 overflow-y-auto">
              {loadingHistory && (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
                </div>
              )}

              {!loadingHistory && transactions.length === 0 && (
                <div className="py-8 text-center">
                  <Receipt className="mx-auto h-8 w-8 text-[var(--ink-4)]" />
                  <p className="mt-2 text-sm text-[var(--ink-3)]">Nog geen transacties geregistreerd</p>
                </div>
              )}

              {!loadingHistory && transactions.length > 0 && (
                <>
                  {/* Dividend income summary */}
                  {(() => {
                    const dividendTxs = transactions.filter(tx => tx.type === 'dividend')
                    const totalDividendIncome = dividendTxs.reduce((sum, tx) => sum + tx.total_amount, 0)
                    if (dividendTxs.length > 0) {
                      return (
                        <div className="mb-3 rounded-lg border border-kern-200 bg-kern-50/50 p-3" data-testid="dividend-summary">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-kern-600" />
                              <span className="text-xs font-medium text-kern-700">Totaal dividend inkomen</span>
                            </div>
                            <span className="text-sm font-bold text-kern-700" data-testid="total-dividend-income">
                              {formatCurrency(totalDividendIncome)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-kern-600/70">{dividendTxs.length} dividend uitkering{dividendTxs.length !== 1 ? 'en' : ''}</p>
                        </div>
                      )
                    }
                    return null
                  })()}

                  <div className="space-y-2">
                    {transactions.map((tx) => {
                      const cfg = typeConfig[tx.type] || typeConfig.buy
                      const Icon = cfg.icon
                      return (
                        <div key={tx.id} className="flex items-center gap-3 rounded-lg border border-[var(--border-ed)] p-2.5">
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${cfg.bg}`}>
                            <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-[var(--ink)]">
                              {cfg.label}: {tx.units} eenhe{tx.units === 1 ? 'id' : 'den'} @ {formatCurrency(tx.price_per_unit)}
                            </p>
                            <p className="text-xs text-[var(--ink-3)]">
                              {new Date(tx.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {tx.notes && ` — ${tx.notes}`}
                            </p>
                          </div>
                          <span className={`shrink-0 text-xs font-semibold ${cfg.color}`}>
                            {tx.type === 'sell' ? '-' : '+'}{formatCurrency(tx.total_amount)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
    </BottomSheet>
  )
}
