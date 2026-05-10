'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Plus, X, ArrowLeft, ArrowUpRight, ArrowDownRight, Briefcase, Receipt, DollarSign, PieChart, RefreshCw, AlertTriangle, CheckCircle, Upload, LayoutGrid, List } from 'lucide-react'
import { formatTimestamp, formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

/**
 * Masked-aware EUR formatter hook used across this file's many sub-views
 * (modals, tables, inline previews). Each call site invokes `useFc()` so
 * masking propagates through the privacy-toggle context.
 */
function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}
import { calculatePortfolioBox3 } from '@/lib/box3-holdings'
import PortfolioAllocationVisualization, { type HoldingForAllocation } from '@/components/app/portfolio-allocation-chart'
import { BenchmarkComparisonChart } from '@/components/app/benchmark-comparison-chart'
import { TIME_PERIODS, type TimePeriod, type ComparisonResult } from '@/lib/benchmark-comparison'
import DividendTracker from '@/components/app/dividend-tracker'
import dynamic from 'next/dynamic'

const HoldingsHeatmap = dynamic(() => import('@/components/app/holdings-heatmap'), { ssr: false })
import { BottomSheet } from '@/components/app/bottom-sheet'
import { Kicker, EditorialHeadline } from '@/components/editorial'
import { IsinLookupField, type IsinResolved } from '@/components/holdings/isin-lookup-field'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { HoldingsPageData } from '@/lib/holdings-data-loader'
import { PortfolioSummary } from './holdings/portfolio-summary'
import {
  HoldingsToolbar,
  type SortKey,
  type AssetClassFilter,
} from './holdings/holdings-toolbar'
import { HoldingRow } from './holdings/holding-row'

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
  // Currency (ISO 4217 code, default EUR)
  currency?: string
  // Price feed data
  previous_close?: number | null
  daily_change_percent?: number | null
  // Classification fields for portfolio allocation
  asset_class?: string | null
  sector?: string | null
  geography?: string | null
  // TER (Total Expense Ratio) as decimal, e.g. 0.0022 for 0.22%
  ter?: number | null
  ter_source?: 'manual' | 'lookup' | null
  // Extra fields from assets fallback
  asset_type?: string
  institution?: string
  expected_return?: number
  monthly_contribution?: number
  // Parent asset name (from joined assets table) for grouping
  asset_name?: string | null
}

// Per-holding price data from refresh API
type HoldingPriceUpdate = {
  id: string
  dailyChangePercent: number | null
  previousClose: number | null
}

export default function HoldingsPage({ initialData }: { initialData?: HoldingsPageData } = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fc = useFc()
  // Optional URL filter: ?asset=<uuid> shows only holdings from that asset
  const assetFilter = searchParams.get('asset')
  const [holdings, setHoldings] = useState<Holding[]>(initialData ? initialData.holdings as Holding[] : [])
  const [totalValue, setTotalValue] = useState(initialData?.totalValue ?? 0)
  const [totalCost, setTotalCost] = useState(initialData?.totalCost ?? 0)
  const [source, setSource] = useState<string>(initialData?.source ?? '')
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editHolding, setEditHolding] = useState<Holding | null>(null)
  // Delete-confirmatie leeft nu binnen het ⋯-menu per rij (HoldingRow). De
  // page-level state is enkel een loading-flag op de actieve verwijdering.
  const [deleting, setDeleting] = useState<string | null>(null)
  const [txHolding, setTxHolding] = useState<Holding | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null)
  const [benchmarkComparison, setBenchmarkComparison] = useState<ComparisonResult | null>(null)
  const [benchmarkPeriod, setBenchmarkPeriod] = useState<TimePeriod>(TIME_PERIODS.find(p => p.id === '1y')!)
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)
  const [overrideHolding, setOverrideHolding] = useState<Holding | null>(null)
  // Holdings view mode: list or heatmap (persisted in localStorage)
  const [viewMode, setViewMode] = useState<'list' | 'heatmap'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('holdings-view-mode') as 'list' | 'heatmap') || 'list'
    }
    return 'list'
  })
  // Sort & filter (per-tab, niet gepersisteerd — verwart bij filter-reset)
  const [sortKey, setSortKey] = useState<SortKey>('weight')
  const [assetFilterChip, setAssetFilterChip] = useState<AssetClassFilter>('all')
  // Dividend yield data for heatmap color mode
  const [dividendData, setDividendData] = useState<Map<string, number>>(new Map())
  // Forward dividend (12 mnd projected) — totaal-bruto uit /api/dividends.
  // Wordt netto NL (na 15% bronbelasting) berekend in PortfolioSummary.
  const [forwardDividendBruto, setForwardDividendBruto] = useState<number | null>(null)
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

  // Persist view mode to localStorage
  function handleViewModeChange(mode: 'list' | 'heatmap') {
    setViewMode(mode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('holdings-view-mode', mode)
    }
  }

  // Load dividend data — voor heatmap-kleurmodus EN voor figures-strip
  // (forward dividend 12M netto NL). Eén fetch, twee consumers.
  useEffect(() => {
    if (holdings.length === 0) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/dividends')
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return
        const map = new Map<string, number>()
        let totalProjected = 0
        if (data.holdings && Array.isArray(data.holdings)) {
          for (const h of data.holdings) {
            if (h.holding_id && typeof h.dividend_yield === 'number') {
              map.set(h.holding_id, h.dividend_yield)
            }
            if (typeof h.projected_annual_income === 'number') {
              totalProjected += h.projected_annual_income
            }
          }
        }
        setDividendData(map)
        setForwardDividendBruto(totalProjected > 0 ? totalProjected : null)
      } catch {
        // Non-critical — dividend data is optional
      }
    })()
    return () => { cancelled = true }
  }, [holdings.length])

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

  // Format timestamp for stale indicator (newspaper style)
  const formatLastUpdate = useCallback((dateStr: string | null): string => {
    if (!dateStr) return 'Nooit bijgewerkt'
    return formatTimestamp(dateStr)
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

  // Box 3 tax summary for the entire portfolio
  const box3Summary = useMemo(() => {
    const holdingValues = holdings.map(h => ({
      id: h.id,
      value: (h.current_price ?? h.avg_purchase_price) * Math.max(0, h.units),
    }))
    return calculatePortfolioBox3(holdingValues)
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

  // Apply optional asset filter from URL (?asset=<uuid> deeplink van categoriepagina).
  const urlFiltered = useMemo(() => {
    if (!assetFilter) return holdings
    return holdings.filter((h) => h.asset_id === assetFilter)
  }, [holdings, assetFilter])

  // Welke chips zijn zinvol — alleen tonen wat de gebruiker daadwerkelijk
  // heeft. Tip uit ui-ux skill: chip-rij niet vol gooien met lege opties.
  const availableClasses = useMemo<AssetClassFilter[]>(() => {
    const result: AssetClassFilter[] = ['all']
    const hasInvestment = urlFiltered.some((h) => {
      const bucket = (h as Holding & { bucket?: string }).bucket
      return bucket === 'investment' || (!bucket && h.asset_class !== 'crypto')
    })
    const hasCrypto = urlFiltered.some((h) => {
      const bucket = (h as Holding & { bucket?: string }).bucket
      return bucket === 'crypto'
    })
    if (hasInvestment) result.push('investment')
    if (hasCrypto) result.push('crypto')
    return result
  }, [urlFiltered])

  // Pas de filter-chip toe op de URL-gefilterde set.
  const chipFiltered = useMemo(() => {
    if (assetFilterChip === 'all') return urlFiltered
    return urlFiltered.filter((h) => {
      const bucket = (h as Holding & { bucket?: string }).bucket
      if (assetFilterChip === 'crypto') return bucket === 'crypto'
      return bucket === 'investment' || !bucket
    })
  }, [urlFiltered, assetFilterChip])

  // Sortering — default 'weight' (gewicht aflopend, Sharesight/Empower-conventie).
  const sortedHoldings = useMemo(() => {
    const list = [...chipFiltered]
    const valueOf = (h: Holding) =>
      (h.current_price ?? h.avg_purchase_price) * Math.max(0, h.units)
    const returnOf = (h: Holding) => {
      const cost = h.avg_purchase_price * Math.max(0, h.units)
      if (cost <= 0) return Number.NEGATIVE_INFINITY
      return ((valueOf(h) - cost) / cost) * 100
    }
    if (sortKey === 'weight') list.sort((a, b) => valueOf(b) - valueOf(a))
    else if (sortKey === 'return')
      list.sort((a, b) => returnOf(b) - returnOf(a))
    else if (sortKey === 'today')
      list.sort(
        (a, b) =>
          (b.daily_change_percent ?? Number.NEGATIVE_INFINITY) -
          (a.daily_change_percent ?? Number.NEGATIVE_INFINITY),
      )
    else if (sortKey === 'alpha') list.sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [chipFiltered, sortKey])

  // Top-3 winnaars op return% — voor highlight-marker op marktwaarde-bedrag
  // in de mini-artikel-blueprint. Skill r94: max één marker per pagina-sectie,
  // hier breed geïnterpreteerd als "alleen de beste prestatie binnen de lijst"
  // → alleen #1 winnaar krijgt marker, om signal niet te verwateren.
  const winnerIds = useMemo(() => {
    const list = sortedHoldings
      .filter((h) => h.units > 0)
      .map((h) => {
        const cost = h.avg_purchase_price * Math.max(0, h.units)
        const value = (h.current_price ?? h.avg_purchase_price) * Math.max(0, h.units)
        const ret = cost > 0 ? ((value - cost) / cost) * 100 : Number.NEGATIVE_INFINITY
        return { id: h.id, ret }
      })
      .filter((x) => x.ret > 0)
      .sort((a, b) => b.ret - a.ret)
    return new Set(list.slice(0, 1).map((x) => x.id))
  }, [sortedHoldings])

  // Vandaag-aggregatie — gewogen gemiddelde van per-holding `daily_change_percent`,
  // gewogen op marktwaarde. Null als geen enkele holding een feed-update heeft.
  const todayChange = useMemo<{ pct: number | null; eur: number | null }>(() => {
    let weightedSum = 0
    let valueSumWithFeed = 0
    let feedCount = 0
    for (const h of holdings) {
      if (h.units <= 0) continue
      const dp = h.daily_change_percent ?? priceUpdates.get(h.id)?.dailyChangePercent ?? null
      if (dp === null) continue
      const value = (h.current_price ?? h.avg_purchase_price) * h.units
      weightedSum += value * dp
      valueSumWithFeed += value
      feedCount++
    }
    if (feedCount === 0 || valueSumWithFeed === 0) {
      return { pct: null, eur: null }
    }
    const pct = weightedSum / valueSumWithFeed
    const eur = (valueSumWithFeed * pct) / 100
    return { pct, eur }
  }, [holdings, priceUpdates])

  // Asset-class snapshot voor de hero-strip (compacte one-liner direct onder
  // de figures-strip). Groeperen op `bucket` (investment/crypto) → robuuster
  // dan asset_class, dat oudere holdings vaak missen.
  const assetClassBreakdown = useMemo(() => {
    const groups = new Map<string, number>()
    for (const h of holdings) {
      if (h.units <= 0) continue
      const value = (h.current_price ?? h.avg_purchase_price) * h.units
      const bucket = (h as Holding & { bucket?: string }).bucket
      const key =
        bucket === 'crypto'
          ? 'Crypto'
          : (h.asset_class === 'etf' || h.asset_class === 'fonds')
            ? 'ETF/fondsen'
            : 'Aandelen'
      groups.set(key, (groups.get(key) ?? 0) + value)
    }
    return Array.from(groups.entries())
      .map(([label, value]) => ({
        label,
        value,
        pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
  }, [holdings, totalValue])

  // Concentratie — top-3 posities als % van portfolio. Bekende risico-metric
  // (Snowball/Sharesight) en voor FIRE-publiek relevant: te veel concentratie
  // in 1-2 namen verhoogt sequence-risk. Tonen we enkel als ≥3 posities.
  const concentrationTop3Pct = useMemo(() => {
    if (holdings.length < 3 || totalValue <= 0) return null
    const values = holdings
      .filter((h) => h.units > 0)
      .map((h) => (h.current_price ?? h.avg_purchase_price) * h.units)
      .sort((a, b) => b - a)
    const top3 = values.slice(0, 3).reduce((s, v) => s + v, 0)
    return (top3 / totalValue) * 100
  }, [holdings, totalValue])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--module-active-500)] border-t-transparent" />
        </div>
      </div>
    )
  }

  // Forward dividend netto NL — 15% bronbelasting afgetrokken van projected.
  const forwardDividendNetNl = forwardDividendBruto !== null
    ? forwardDividendBruto * 0.85
    : null

  // Conditional rendering thresholds. Allocatie en benchmark blijven vrijwel
  // altijd zichtbaar — de chart-componenten hebben eigen empty-states. Alleen
  // de dividend-tracker verbergen we als er niets te tonen is.
  const showAllocation = holdingsForAllocation.length >= 1
  const showBenchmark = holdings.length >= 2
  const showDividendTracker = (forwardDividendBruto ?? 0) > 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Editorial header — blueprint Type 2 (List). Korte krant-koprij. */}
      <header className="mb-2 space-y-2">
        <Link
          href="/core/assets"
          className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          <ArrowLeft className="h-3 w-3" />
          Terug naar Vermogen
        </Link>
        <Kicker>Holdings · {holdings.length} actief</Kicker>
        <EditorialHeadline emphasis="portfolio">Jouw portfolio</EditorialHeadline>
      </header>

      {/* Refresh / stale banners — apart, geen kaart eromheen */}
      {staleCount > 0 && (
        <div
          className="flex items-center gap-2 border border-[var(--module-active-300)] bg-[var(--module-active-50)]/60 p-3"
          data-testid="stale-price-warning"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--module-active-700)]" />
          <p className="text-xs text-[var(--ink-2)]">
            <span className="font-semibold">{staleCount} holding{staleCount !== 1 ? 's' : ''}</span>{' '}
            met verouderde prijzen — vernieuw of werk handmatig bij via het ⋯-menu.
          </p>
        </div>
      )}
      {refreshResult && (
        <div
          className={`mt-2 flex items-center gap-2 border p-3 ${
            refreshResult.type === 'success'
              ? 'border-[var(--positive)] bg-[var(--positive)]/5'
              : refreshResult.type === 'warning'
                ? 'border-[var(--module-active-300)] bg-[var(--module-active-50)]/60'
                : 'border-[var(--negative)] bg-[var(--negative)]/5'
          }`}
          data-testid="refresh-result"
        >
          {refreshResult.type === 'success' && <CheckCircle className="h-4 w-4 shrink-0 text-[var(--positive)]" />}
          {refreshResult.type === 'warning' && <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--module-active-700)]" />}
          {refreshResult.type === 'error' && <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--negative)]" />}
          <p className="text-xs text-[var(--ink-2)]">{refreshResult.message}</p>
          <button
            onClick={() => setRefreshResult(null)}
            aria-label="Sluit melding"
            className="ml-auto shrink-0 p-0.5 hover:bg-[var(--ink)]/5"
          >
            <X className="h-3 w-3 text-[var(--ink-3)]" />
          </button>
        </div>
      )}

      {/* Hero summary — figures-strip + allocatie-strip + period selector + Box 3 + FIRE deck */}
      <PortfolioSummary
        totalValue={totalValue}
        totalCost={totalCost}
        todayChangeEur={todayChange.eur}
        todayChangePct={todayChange.pct}
        forwardDividendNetNl={forwardDividendNetNl}
        box3={box3Summary}
        yearlyEssentialExpenses={initialData?.yearlyEssentialExpenses ?? 0}
        activePeriod={benchmarkPeriod}
        onPeriodChange={handleBenchmarkPeriodChange}
        comparison={benchmarkComparison}
        assetClassBreakdown={assetClassBreakdown}
        concentrationTop3Pct={concentrationTop3Pct}
      />

      {/* Allocatie-donut — full breakdown met view-tabs (asset-class/sector/regio).
          Anchor `#portfolio-allocation` zodat de compacte strip in de hero
          hierheen kan deeplinken via in-page jump. */}
      {showAllocation && (
        <section
          id="portfolio-allocation"
          className="mt-6 scroll-mt-20 border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6"
          data-testid="portfolio-allocation"
        >
          <div className="mb-4">
            <Kicker>
              <PieChart className="h-3 w-3 -mt-0.5 inline mr-1" aria-hidden />
              Portfolio verdeling
            </Kicker>
          </div>
          <PortfolioAllocationVisualization
            holdings={holdingsForAllocation}
            totalValue={totalValue}
          />
        </section>
      )}

      {/* Benchmark — alleen vanaf 3 holdings */}
      {showBenchmark && (
        <section className="mt-6">
          <BenchmarkComparisonChart
            comparison={benchmarkComparison}
            onPeriodChange={handleBenchmarkPeriodChange}
            activePeriod={benchmarkPeriod}
            loading={benchmarkLoading}
          />
        </section>
      )}

      {/* Dividend-tracker — alleen wanneer er ook dividend is */}
      {showDividendTracker && (
        <section className="mt-6" data-testid="dividend-tracker-section">
          <DividendTracker />
        </section>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 border border-[var(--negative)] bg-[var(--negative)]/5 p-4">
          <p className="text-sm text-[var(--negative)]">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); loadHoldings() }}
            className="mt-2 inline-flex min-h-[32px] items-center px-3 py-1.5 text-[11px] font-mono font-semibold uppercase tracking-[0.12em] bg-[var(--negative)] text-[var(--paper)] border border-[var(--negative)] hover:opacity-90"
          >
            Opnieuw proberen
          </button>
        </div>
      )}

      {/* Holdings-toolbar — sort, filter, acties */}
      {holdings.length > 0 && (
        <div className="mt-6">
          <HoldingsToolbar
            totalCount={holdings.length}
            filteredCount={sortedHoldings.length}
            sort={sortKey}
            onSortChange={setSortKey}
            filter={assetFilterChip}
            onFilterChange={setAssetFilterChip}
            availableClasses={availableClasses}
            refreshing={refreshing}
            onRefresh={handleRefreshPrices}
            onAdd={() => setShowForm(true)}
          />
        </div>
      )}

      {/* View-toggle list/heatmap — secundair, klein, alleen vanaf 5+ holdings */}
      {holdings.length >= 5 && (
        <div
          className="mt-3 flex items-center justify-end gap-1"
          data-testid="holdings-view-toggle"
        >
          <button
            type="button"
            onClick={() => handleViewModeChange('list')}
            aria-pressed={viewMode === 'list'}
            className={`min-h-[28px] inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-[0.12em] border transition-colors ${
              viewMode === 'list'
                ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                : 'bg-transparent text-[var(--ink-3)] border-[var(--rule-soft)] hover:text-[var(--ink-2)] hover:border-[var(--ink-3)]'
            }`}
            data-testid="view-toggle-list"
          >
            <List className="h-3 w-3" />
            Lijst
          </button>
          <button
            type="button"
            onClick={() => handleViewModeChange('heatmap')}
            aria-pressed={viewMode === 'heatmap'}
            className={`min-h-[28px] inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-[0.12em] border transition-colors ${
              viewMode === 'heatmap'
                ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                : 'bg-transparent text-[var(--ink-3)] border-[var(--rule-soft)] hover:text-[var(--ink-2)] hover:border-[var(--ink-3)]'
            }`}
            data-testid="view-toggle-heatmap"
          >
            <LayoutGrid className="h-3 w-3" />
            Heatmap
          </button>
        </div>
      )}

      {/* Heatmap weergave */}
      {viewMode === 'heatmap' && holdings.length > 0 && (
        <section
          className="mt-3 border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6"
          data-testid="holdings-heatmap-section"
        >
          <HoldingsHeatmap
            holdings={holdings.map(h => ({
              id: h.id,
              name: h.name,
              ticker: h.ticker,
              isin: h.isin,
              units: h.units,
              avg_purchase_price: h.avg_purchase_price,
              current_price: h.current_price,
              last_price_update: h.last_price_update,
              currency: h.currency,
              daily_change_percent: h.daily_change_percent,
              asset_class: h.asset_class,
              sector: h.sector,
              geography: h.geography,
            }))}
            dividendData={dividendData}
            onHoldingClick={(id) => router.push(`/core/assets/holdings/${id}`)}
          />
        </section>
      )}

      {/* Holdings list — flat, sorted, mini-artikel-blueprint per rij */}
      <section
        className={`mt-4 space-y-2 ${viewMode === 'heatmap' && sortedHoldings.length > 0 ? 'hidden' : ''}`}
      >
        {sortedHoldings.length === 0 && !loading && (
          <EmptyState
            isFiltered={!!assetFilter || assetFilterChip !== 'all'}
            onAdd={() => setShowForm(true)}
            onClearFilter={() => {
              setAssetFilterChip('all')
              if (assetFilter) router.push('/core/assets/holdings')
            }}
          />
        )}

        {/* Asset-filter indicator (URL-niveau, deeplink van categoriepagina) */}
        {assetFilter && sortedHoldings.length > 0 && (
          <p
            className="italic text-[12px] text-[var(--ink-3)] mb-2"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Gefilterd op{' '}
            <span className="not-italic font-semibold text-[var(--module-active-700)]">
              {sortedHoldings[0]?.asset_name ?? 'asset'}
            </span>
            {' · '}
            <Link
              href="/core/assets/holdings"
              className="not-italic underline decoration-[var(--rule-soft)] underline-offset-4 hover:decoration-[var(--ink)]"
            >
              filter wissen
            </Link>
          </p>
        )}

        {sortedHoldings.map((holding) => {
          const price = holding.current_price ?? holding.avg_purchase_price
          const value = price * Math.max(0, holding.units)
          const stale = isPriceStale(holding)
          const priceUpdate = priceUpdates.get(holding.id)
          const dailyPct =
            holding.daily_change_percent ?? priceUpdate?.dailyChangePercent ?? null
          const weightPct = totalValue > 0 ? (value / totalValue) * 100 : 0
          const formattedValue =
            holding.currency && holding.currency !== 'EUR'
              ? new Intl.NumberFormat('nl-NL', {
                  style: 'currency',
                  currency: holding.currency,
                }).format(Math.max(0, value))
              : (fc(Math.max(0, value)) as string)

          return (
            <HoldingRow
              key={holding.id}
              holding={{
                id: holding.id,
                name: holding.name,
                ticker: holding.ticker,
                units: holding.units,
                currentPrice: price,
                avgPurchasePrice: holding.avg_purchase_price,
                currency: holding.currency ?? null,
                dailyChangePercent: dailyPct,
                lastPriceUpdate: holding.last_price_update,
                isStale: stale,
                isWinner: winnerIds.has(holding.id),
              }}
              weightPct={weightPct}
              formattedValue={formattedValue}
              formatLastUpdate={formatLastUpdate}
              onTransaction={() => setTxHolding(holding)}
              onEdit={() => setEditHolding(holding)}
              onDelete={() => handleDelete(holding.id)}
              onManualOverride={() => setOverrideHolding(holding)}
            />
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

// ── Empty state ──────────────────────────────────────────────────

function EmptyState({
  isFiltered,
  onAdd,
  onClearFilter,
}: {
  isFiltered: boolean
  onAdd: () => void
  onClearFilter: () => void
}) {
  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-8 text-center">
      <Briefcase className="mx-auto h-10 w-10 text-[var(--ink-4)]" />
      <p
        className="mt-3 italic text-base text-[var(--ink-2)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {isFiltered
          ? 'Geen holdings binnen dit filter.'
          : "Schakel 'Holdings bijhouden' in bij een belegging om je posities hier te zien."}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {isFiltered && (
          <button
            type="button"
            onClick={onClearFilter}
            className="inline-flex min-h-[32px] items-center px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-[0.12em] bg-transparent text-[var(--ink-2)] border border-[var(--rule-soft)] hover:border-[var(--ink-3)] hover:text-[var(--ink)]"
          >
            Filter wissen
          </button>
        )}
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-h-[32px] items-center gap-1.5 px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-[0.12em] bg-[var(--ink)] text-[var(--paper)] border border-[var(--ink)] hover:bg-[var(--ink-2)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Holding toevoegen
        </button>
        <Link
          href="/core/assets/holdings/import"
          className="inline-flex min-h-[32px] items-center gap-1.5 px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-[0.12em] bg-transparent text-[var(--ink-2)] border border-[var(--rule-soft)] hover:border-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          <Upload className="h-3.5 w-3.5" />
          CSV import
        </Link>
      </div>
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
  const fc = useFc()
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
              <span className="text-sm font-bold text-[var(--ink)]">{fc(currentValue)}</span>
            </div>
            {currentValue !== oldValue && (
              <p className={`mt-1 text-xs font-medium ${currentValue >= oldValue ? 'text-positive' : 'text-negative'}`}>
                {currentValue >= oldValue ? '+' : ''}{fc(currentValue - oldValue)} verschil
              </p>
            )}
          </div>

          <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-2.5">
            <p className="text-[10px] text-[var(--ink-3)]">
              Vorige prijs: {holding.current_price != null ? fc(holding.current_price) : 'Niet ingesteld'}
              {' · '}Aankoopprijs: {fc(holding.avg_purchase_price)}
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

// ── Holding form modal ─────────────────────────────────────────

function HoldingForm({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [isin, setIsin] = useState('')
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
  const [currency, setCurrency] = useState('EUR')
  const [isActive] = useState(true)
  const [purchaseDate, setPurchaseDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [notes, setNotes] = useState('')
  const [ter, setTer] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{
    message: string
    existing: { id: string; name: string; ticker: string }[]
  } | null>(null)
  // Idempotency key to prevent duplicate submissions on back-button / re-render
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())

  // TER annual cost calculation
  const terDecimal = ter ? Number(ter) / 100 : 0
  const createFormValue = (Number(currentPrice) || Number(avgPrice) || 0) * (Number(units) || 0)
  const terAnnualCost = terDecimal * createFormValue

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
          isin: isin || null,
          units: units ? Number(units) : 0,
          avg_purchase_price: Number(avgPrice) || 0,
          current_price: currentPrice ? Number(currentPrice) : null,
          purchase_date: purchaseDate || null,
          currency,
          is_active: isActive,
          notes: notes || null,
          force_duplicate: forceDuplicate,
          ...(ter ? { ter: Number(ter) / 100, ter_source: 'manual' } : {}),
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
          <IsinLookupField
            id="add-holding-isin"
            value={isin}
            onChange={setIsin}
            onResolved={(r: IsinResolved) => {
              if (!ticker) {
                setTicker(r.ticker)
                validateTicker(r.ticker)
              }
              if (!name) setName(r.name)
              if (r.currency && r.currency !== currency) setCurrency(r.currency)
            }}
          />
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

          {/* TER (Total Expense Ratio) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">TER — Total Expense Ratio (optioneel)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="10"
                inputMode="decimal"
                value={ter}
                onChange={(e) => setTer(e.target.value)}
                className="w-32 rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
                placeholder="0.22"
                data-testid="holding-ter-input"
              />
              <span className="text-sm text-[var(--ink-3)]">%</span>
              {ter && createFormValue > 0 && (
                <span className="text-xs text-[var(--ink-3)] font-mono tabular-nums" data-testid="ter-annual-cost">
                  = {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(terAnnualCost)}/jaar
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-[var(--ink-3)]">
              Vind de TER op de fonds factsheet of Morningstar
            </p>
            {Number(ter) > 10 && (
              <p className="mt-1 text-[11px] text-red-500">TER mag maximaal 10% zijn</p>
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

          {/* Progressive disclosure: hint when ticker/ISIN present but no TER */}
          {!ter && ticker && (
            <div className="rounded-lg border border-kern-100 bg-kern-50/50 px-3 py-2" data-testid="ter-hint">
              <p className="text-[11px] text-kern-600">
                💡 Tip: voeg de TER toe om jaarlijkse fondskosten inzichtelijk te maken
              </p>
            </div>
          )}
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
  const fc = useFc()
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
  const [isin, setIsin] = useState<string>(draft?.isin ?? (holding.isin || ''))
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
  const [ter, setTer] = useState(draft?.ter ?? (holding.ter != null ? String((holding.ter * 100).toFixed(2).replace(/\.?0+$/, '')) : ''))
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

  // TER annual cost calculation for edit form
  const editTerDecimal = ter ? Number(ter) / 100 : 0
  const editFormValue = (Number(currentPrice) || Number(avgPrice) || 0) * (Number(units) || 1)
  const editTerAnnualCost = editTerDecimal * editFormValue

  // Track dirty state (form values differ from original holding)
  const originalTerStr = holding.ter != null ? String((holding.ter * 100).toFixed(2).replace(/\.?0+$/, '')) : ''
  const isDirty = useMemo(() => {
    return (
      name !== holding.name ||
      ticker !== (holding.ticker || '') ||
      isin !== (holding.isin || '') ||
      units !== String(holding.units) ||
      avgPrice !== String(holding.avg_purchase_price) ||
      currentPrice !== String(holding.current_price ?? '') ||
      notes !== (holding.notes || '') ||
      ter !== originalTerStr
    )
  }, [name, ticker, isin, units, avgPrice, currentPrice, notes, ter, holding, originalTerStr])

  // Auto-save draft to localStorage when form is dirty
  useEffect(() => {
    if (isDirty) {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          holdingId: holding.id,
          name, ticker, isin, units, avgPrice, currentPrice, notes, ter,
          savedAt: new Date().toISOString(),
        }))
      } catch { /* ignore storage errors */ }
    } else {
      // Clean up draft when form matches original
      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
    }
  }, [isDirty, draftKey, holding.id, name, ticker, isin, units, avgPrice, currentPrice, notes, ter])

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
    setIsin(holding.isin || '')
    setUnits(String(holding.units))
    setAvgPrice(String(holding.avg_purchase_price))
    setCurrentPrice(String(holding.current_price ?? ''))
    setNotes(holding.notes || '')
    setTer(holding.ter != null ? String((holding.ter * 100).toFixed(2).replace(/\.?0+$/, '')) : '')
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
        isin: isin || null,
        units: Number(units) || 1,
        avg_purchase_price: Number(avgPrice) || 0,
        current_price: currentPrice ? Number(currentPrice) : null,
        notes: notes || null,
        ter: ter ? Number(ter) / 100 : null,
        ter_source: ter ? 'manual' : null,
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
    if (s.ter !== undefined) setTer(s.ter != null ? String((Number(s.ter) * 100).toFixed(2).replace(/\.?0+$/, '')) : '')
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
                      {' · '}Prijs: <span className="font-medium">{conflictData.server_state.current_price != null ? fc(Number(conflictData.server_state.current_price)) : '-'}</span>
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
          <IsinLookupField
            id="edit-holding-isin"
            value={isin}
            onChange={setIsin}
            onResolved={(r: IsinResolved) => {
              if (!ticker) {
                setTicker(r.ticker)
                validateTicker(r.ticker)
              }
              if (!name || name === holding.name) setName(r.name)
            }}
          />
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
              <span className="text-sm font-bold text-[var(--ink)]">{fc(newValue)}</span>
            </div>
            {newValue !== oldValue && (
              <p className={`mt-1 text-xs font-medium ${newValue >= oldValue ? 'text-positive' : 'text-negative'}`}>
                {newValue >= oldValue ? '+' : ''}{fc(newValue - oldValue)} t.o.v. huidige waarde
              </p>
            )}
          </div>

          {/* TER (Total Expense Ratio) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">TER — Total Expense Ratio (optioneel)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="10"
                inputMode="decimal"
                value={ter}
                onChange={(e) => setTer(e.target.value)}
                className="w-32 rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm"
                placeholder="0.22"
                data-testid="holding-ter-input"
              />
              <span className="text-sm text-[var(--ink-3)]">%</span>
              {ter && editFormValue > 0 && (
                <span className="text-xs text-[var(--ink-3)] font-mono tabular-nums" data-testid="ter-annual-cost">
                  = {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(editTerAnnualCost)}/jaar
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-[var(--ink-3)]">
              Vind de TER op de fonds factsheet of Morningstar
            </p>
            {Number(ter) > 10 && (
              <p className="mt-1 text-[11px] text-red-500">TER mag maximaal 10% zijn</p>
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

          {/* Progressive disclosure: hint when ticker/ISIN present but no TER */}
          {!ter && (holding.ticker || holding.isin) && (
            <div className="rounded-lg border border-kern-100 bg-kern-50/50 px-3 py-2" data-testid="ter-hint">
              <p className="text-[11px] text-kern-600">
                💡 Tip: voeg de TER toe om jaarlijkse fondskosten inzichtelijk te maken
              </p>
            </div>
          )}
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
            {saving ? 'Opslaan...' : 'Opslaan'}
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
  const fc = useFc()
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
        const res = await fetch(`/api/holdings/${holding.id}/transactions`)
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
      const res = await fetch(`/api/holdings/${holding.id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
                      {fc(totalAmount)}
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
                      Gem. prijs: {fc(previewAvg)}
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
                              {fc(totalDividendIncome)}
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
                              {cfg.label}: {tx.units} eenhe{tx.units === 1 ? 'id' : 'den'} @ {fc(tx.price_per_unit)}
                            </p>
                            <p className="text-xs text-[var(--ink-3)]">
                              {new Date(tx.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {tx.notes && ` — ${tx.notes}`}
                            </p>
                          </div>
                          <span className={`shrink-0 text-xs font-semibold ${cfg.color}`}>
                            {tx.type === 'sell' ? '-' : '+'}{fc(tx.total_amount)}
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
