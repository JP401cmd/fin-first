'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Plus, X, ArrowLeft, ArrowUpRight, ArrowDownRight, Briefcase, Receipt, DollarSign, PieChart, AlertTriangle, CheckCircle, Upload, LayoutGrid, List } from 'lucide-react'
import { formatTimestamp, formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useAbortableFetch, isAbortError } from '@/lib/hooks/use-abortable-fetch'

/**
 * Masked-aware EUR formatter hook used across this file's many sub-views
 * (modals, tables, inline previews). Each call site invokes `useFc()` so
 * masking propagates through the privacy-toggle context.
 */
function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}
import PortfolioAllocationVisualization, { type HoldingForAllocation } from '@/components/app/portfolio-allocation-chart'
import { BenchmarkComparisonChart } from '@/components/app/benchmark-comparison-chart'
import { TIME_PERIODS, monthsForPeriod, type TimePeriod, type ComparisonResult } from '@/lib/benchmark-comparison'
import DividendTracker from '@/components/app/dividend-tracker'
import { RebalancingSettingsSection } from './rebalancing-settings-section'
import dynamic from 'next/dynamic'

const HoldingsHeatmap = dynamic(() => import('@/components/app/holdings-heatmap'), { ssr: false })
import { BottomSheet } from '@/components/app/bottom-sheet'
import { Kicker, EditorialHeadline } from '@/components/editorial'
import { IsinLookupField, type IsinResolved } from '@/components/holdings/isin-lookup-field'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { HoldingsPageData } from '@/lib/holdings-data-loader'
import { OVERLAY_QUERY_KEYS } from '@/lib/navigation'
import { PortfolioSummary, PeriodRail } from './holdings/portfolio-summary'
import { PortfolioValueChart } from './holdings/portfolio-value-chart'
import {
  HoldingsToolbar,
  type SortKey,
  type AssetClassFilter,
} from './holdings/holdings-toolbar'
import { HoldingRow } from './holdings/holding-row'
import {
  InvestmentHoldingPane,
  type InvestmentHoldingPaneInput,
} from './holdings/investment-holding-pane'
import {
  isClosedHolding,
  filterHoldingsByChip,
  sortHoldings,
} from './holdings/holdings-list-view'
import { isPriceStale, countStalePrices } from '@/lib/holdings-staleness'

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
  /** 52-weeks koersbereik uit de feed; NULL tot de eerste koersvernieuwing. */
  fifty_two_week_high?: number | null
  fifty_two_week_low?: number | null
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
  // Opbrengst per rij — server-side afgeleid via de canonieke aggregatie-
  // engine (lib/holdings-pnl-enrichment.ts → computePositionFromTransactions
  // + valuePosition). Optioneel/nullable: holdings zonder transactiehistorie
  // krijgen `null`. Voor een gesloten positie geldt pnl_total === pnl_realized.
  pnl_total?: number | null
  pnl_realized?: number | null
  pnl_unrealized?: number | null
  pnl_invested?: number | null
  pnl_dividends?: number | null
  pnl_fees?: number | null
  pnl_total_pct?: number | null
  pnl_is_closed?: boolean | null
}

// Per-holding price data from refresh API
type HoldingPriceUpdate = {
  id: string
  dailyChangePercent: number | null
  previousClose: number | null
}

// isClosedHolding + de filter/sort-helpers leven in
// `./holdings/holdings-list-view` (pure, getest); de page consumeert ze.

/**
 * Faalde `/api/holdings` met een HTTP-status, dan draagt de fout die status mee.
 * Nodig omdat de melding anders elke uitkomst op één hoop gooit: een verlopen
 * sessie (401) vraagt om opnieuw inloggen, een 500 om opnieuw proberen, en een
 * netwerkfout (geen status) om je verbinding. Eén verzamelzin gaf de gebruiker
 * geen enkele handelingsrichting.
 */
class HoldingsLoadError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
    this.name = 'HoldingsLoadError'
  }
}

export default function HoldingsPage({ initialData }: { initialData?: HoldingsPageData } = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const fc = useFc()
  // Optional URL filter: ?asset=<uuid> shows only holdings from that asset
  const assetFilter = searchParams.get('asset')
  const [holdings, setHoldings] = useState<Holding[]>(initialData ? initialData.holdings as Holding[] : [])
  const [totalValue, setTotalValue] = useState(initialData?.totalValue ?? 0)
  // Opbrengst over de HELE historie uit de canonieke aggregatie-engine — telt
  // ook de inmiddels verkochte posities, die uit `totalCost` wegvallen. Voedt
  // de rendement-KPI bij periode 'Alles'.
  const [totalPnL, setTotalPnL] = useState(initialData?.totalPnL ?? 0)
  const [totalInvested, setTotalInvested] = useState(initialData?.totalInvested ?? 0)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  // Delete-confirmatie leeft nu binnen het ⋯-menu per rij (HoldingRow). De
  // page-level state is enkel een loading-flag op de actieve verwijdering.
  // Edit-flow leeft sinds mei 2026 niet meer in een eigen modal — die
  // functionaliteit zit in `<InvestmentHoldingPane>` (Bewerken-knop in de
  // pane-footer). De `?holding=<id>` URL-state stuurt de pane-open.
  const [deleting, setDeleting] = useState<string | null>(null)
  const [txHolding, setTxHolding] = useState<Holding | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null)
  const [benchmarkComparison, setBenchmarkComparison] = useState<ComparisonResult | null>(null)
  // Eén periode-keuze voor drie oppervlakken: de rendement-cel in de hero, de
  // waardegrafiek en de benchmark-vergelijking. Heette `benchmarkPeriod` toen
  // hij alleen de benchmark stuurde.
  const [chartPeriod, setChartPeriod] = useState<TimePeriod>(TIME_PERIODS.find(p => p.id === '1y')!)
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

  // Afbreekbaar fetchen: bij wegnavigeren van de holdings-pagina breken lopende
  // requests af (geen verspilde egress, geen setState-na-unmount).
  const { abortableFetch, isMounted } = useAbortableFetch()

  /**
   * Herlaadt de holdings vanaf `/api/holdings`. Alleen ná een sync of mutatie —
   * de eerste render komt van de server-loader (zie de mount-effect hieronder).
   *
   * De route levert sinds aug 2026 dezelfde set als die loader (investment én
   * crypto, zie het docblock van `app/api/holdings/route.ts`). Dáárvoor liet een
   * refresh de crypto-posities stil vallen.
   */
  const loadHoldings = useCallback(async () => {
    try {
      setError(null)
      const res = await abortableFetch('/api/holdings')
      if (!res.ok) {
        // De status meedragen: één verzamelmelding voor élke uitkomst maakte
        // een verlopen sessie (401) niet te onderscheiden van een storing
        // (500) of een netwerkhapering — en dus onoplosbaar voor de gebruiker.
        throw new HoldingsLoadError(res.status)
      }
      const data = await res.json()
      if (!isMounted()) return
      setHoldings(data.holdings || [])
      setTotalValue(data.total_value || 0)
      setTotalPnL(data.total_pnl || 0)
      setTotalInvested(data.total_invested || 0)
    } catch (e) {
      // Afgebroken fetch (unmount) → stil negeren, geen foutmelding.
      if (isAbortError(e) || !isMounted()) return
      // Matchen op de STATUSCODE, nooit op de 401-tekst: die is app-breed
      // 'Niet ingelogd' (lib/api/respond.ts) en mag niet in een frontend-match
      // vastgepind worden.
      const status = e instanceof HoldingsLoadError ? e.status : null
      setError(
        status === 401
          ? 'Je sessie is verlopen. Log opnieuw in om je holdings te laden.'
          : status !== null
            ? 'Kon holdings niet laden — de server gaf een fout. Probeer het opnieuw.'
            : 'Kon holdings niet laden — controleer je verbinding en probeer het opnieuw.',
      )
    } finally {
      if (isMounted()) setLoading(false)
    }
  }, [abortableFetch, isMounted])

  // Load benchmark comparison data
  const loadBenchmarkComparison = useCallback(async (periodId: string) => {
    setBenchmarkLoading(true)
    try {
      const res = await abortableFetch(`/api/benchmark-comparison?period=${periodId}`)
      if (res.ok) {
        const data = await res.json()
        if (!isMounted()) return
        setBenchmarkComparison(data.comparison || null)
      }
    } catch {
      // Non-critical (incl. afgebroken fetch bij unmount) — silently fail
    } finally {
      if (isMounted()) setBenchmarkLoading(false)
    }
  }, [abortableFetch, isMounted])

  // Start-fetch ALLEEN wanneer de server niets meegaf.
  //
  // Met `initialData` heeft de server de holdings al geleverd; deze fetch haalde
  // dezelfde rijen direct nóg een keer op. Dat was niet alleen dubbel werk — het
  // was ook de enige bron van de melding "Kon holdings niet laden": die
  // verscheen bóven een pagina die gewoon gevuld was, en na "opnieuw proberen"
  // verdween hij zonder zichtbaar verschil, omdat er niets te verversen viel.
  // `loadHoldings()` blijft wél de herlaad-route na een sync of mutatie.
  //
  // Bewust GEEN "heb ik al geladen?"-ref om dat af te dwingen: een ref overleeft
  // de gesimuleerde remount van React StrictMode, terwijl de fetch die tijdens
  // de eerste mount startte wél wordt afgebroken. De tweede mount zou dan
  // overslaan omdat de ref al gezet is, en de afgebroken fetch wordt stil
  // genegeerd — resultaat: een lege pagina zonder foutmelding en zonder
  // retry-knop. De `initialData`-check hieronder is genoeg: `loadHoldings` is
  // een stabiele useCallback, dus dit effect draait sowieso maar één keer per
  // echte mount, en tweemaal fetchen onder StrictMode is precies wat het
  // abort-mechanisme in `useAbortableFetch` afvangt.
  useEffect(() => {
    if (initialData) {
      setLoading(false)
      return
    }
    loadHoldings()
  }, [loadHoldings, initialData])

  // Load benchmark data after holdings are loaded
  useEffect(() => {
    if (!loading && holdings.length > 0) {
      loadBenchmarkComparison(chartPeriod.id)
    }
  }, [loading, holdings.length, chartPeriod.id, loadBenchmarkComparison])

  function handlePeriodChange(period: TimePeriod) {
    setChartPeriod(period)
    // Benchmark herlaadt via de useEffect hierboven; de waardegrafiek reageert
    // op de afgeleide `chartMonths`-prop.
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

  // NB: de "back-knop sluit de modal"-logica die hier stond (een eigen
  // `pushState` + `popstate` voor `showForm`/`txHolding`) is verwijderd. Dat
  // was de enige one-off in de app; sinds `BottomSheet` dit centraal doet
  // (`lib/overlay-history.ts`) zouden beide dezelfde entry claimen en samen
  // dubbel-poppen. De pane (`?holding=<id>`) blijft bewust buiten die centrale
  // integratie — die regelt z'n close via URL-state (zie `manageHistory` op
  // `<ShellOverlay kind="pane">`).

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
      // Rij optimistisch uit de lijst halen zodat de UI direct reageert; de
      // TOTALEN komen van de server. Ze hier zelf herrekenen zou een derde
      // rekenwijze introduceren naast de loader en de route — zonder toegang tot
      // de wisselkoersen die die twee wél toepassen, dus met een ander bedrag
      // voor niet-EUR posities.
      setHoldings((prev) => prev.filter((h) => h.id !== id))
      loadHoldings()
    } catch {
      setError('Kon holding niet verwijderen')
    } finally {
      setDeleting(null)
    }
  }

  // Format timestamp for stale indicator (newspaper style)
  const formatLastUpdate = useCallback((dateStr: string | null): string => {
    if (!dateStr) return 'Nooit bijgewerkt'
    return formatTimestamp(dateStr)
  }, [])

  // Refresh all prices from Yahoo Finance
  async function handleRefreshPrices() {
    setRefreshing(true)
    setRefreshResult(null)

    // Royale client-timeout, net onder de server-`maxDuration` (60s), zodat we
    // een vastlopende verversing netjes afbreken i.p.v. de browser eindeloos te
    // laten wachten. De trage lange-staart (ongekoppelde broker-holdings) kan
    // tientallen seconden duren; deze marge geeft de server de kans om af te
    // ronden vóór wij afbreken.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55_000)

    try {
      const res = await fetch('/api/holdings/refresh-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: controller.signal,
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

      const updated = data.summary?.updated ?? 0
      const stale = data.summary?.stale ?? 0
      const errors = data.summary?.errors ?? 0
      const unavailable = stale + errors

      if (updated > 0 && unavailable > 0) {
        // Gedeeltelijk succes — eerlijk benoemen i.p.v. groen wegpoetsen.
        setRefreshResult({
          message: `${updated} prij${updated === 1 ? 's' : 'zen'} bijgewerkt, ${unavailable} nog niet — laatste bekende prijzen worden getoond`,
          type: 'warning',
        })
        loadHoldings()
      } else if (updated > 0) {
        setRefreshResult({
          message: data.message || 'Prijzen bijgewerkt via Yahoo Finance',
          type: 'success',
        })
        // Reload holdings to get new prices
        loadHoldings()
      } else if (unavailable > 0) {
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
    } catch (err) {
      // Onderscheid een afgebroken (te trage) verversing van een echte
      // netwerkfout, zodat de melding klopt met wat er gebeurde.
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      setRefreshResult(
        aborted
          ? {
              message: 'Verversen duurde te lang — probeer het over een paar minuten opnieuw.',
              type: 'warning',
            }
          : {
              message: 'Kon prijzen niet vernieuwen — controleer je internetverbinding',
              type: 'error',
            },
      )
      setTimeout(() => setRefreshResult(null), 8000)
    } finally {
      clearTimeout(timeoutId)
      setRefreshing(false)
    }
  }

  // Verouderde prijzen — ALLEEN over de nog open posities; zie de toelichting
  // bij `countStalePrices` in @/lib/holdings-staleness (pure, getest).
  const staleCount = useMemo(() => countStalePrices(holdings), [holdings])

  /** Aantal posities dat je nu daadwerkelijk bezit — subregel bij marktwaarde. */
  const openPositionsCount = useMemo(
    () => holdings.filter(h => !isClosedHolding(h)).length,
    [holdings],
  )

  /** Het gekozen venster als maandenaantal voor de waardegrafiek; null = alles. */
  const chartMonths = useMemo(() => monthsForPeriod(chartPeriod), [chartPeriod])

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
  // 'closed' is een aparte positie-status-dimensie (geen asset-class) maar
  // deelt bewust de chip-rij; alleen tonen bij ≥1 gesloten positie.
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
    const hasClosed = urlFiltered.some((h) => isClosedHolding(h))
    if (hasInvestment) result.push('investment')
    if (hasCrypto) result.push('crypto')
    if (hasClosed) result.push('closed')
    return result
  }, [urlFiltered])

  // Pas de filter-chip toe op de URL-gefilterde set (pure helper, getest).
  const chipFiltered = useMemo(
    () => filterHoldingsByChip(urlFiltered, assetFilterChip),
    [urlFiltered, assetFilterChip],
  )

  // Sortering — default 'weight' (gewicht aflopend, Sharesight/Empower-conventie).
  // 'opbrengst' sorteert op de server-afgeleide totale P&L (pnl_total, hoog→laag);
  // zinvol binnen de 'Gesloten'-weergave waar pnl_total === gerealiseerde winst.
  const sortedHoldings = useMemo(
    () => sortHoldings(chipFiltered, sortKey),
    [chipFiltered, sortKey],
  )

  // De lijst rendert de gefilterde+gesorteerde set rechtstreeks. De vroegere
  // open/dicht-split (met inklapbare "Gesloten posities"-sectie) is vervallen:
  // gesloten posities verschijnen nu via de 'Gesloten'-chip, niet dubbel.
  const visibleHoldings = sortedHoldings

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

  // ── Pane URL-state ─────────────────────────────────────────────────
  // De detail-pane voor één investment-positie leeft op `?holding=<id>`.
  // We lezen de query-param en zoeken de bijbehorende holding op in de al-
  // geladen array — geen extra fetch nodig, alle context-data zit al in
  // `holdings`. Crypto-rijen (`bucket === 'crypto'`) negeren we expliciet:
  // die hebben een eigen pane-flow op `?crypto=<id>`.
  const requestedHoldingId = searchParams.get(OVERLAY_QUERY_KEYS.holding)
  const selectedHoldingForPane: InvestmentHoldingPaneInput | null = useMemo(() => {
    if (!requestedHoldingId) return null
    const found = holdings.find((h) => h.id === requestedHoldingId)
    if (!found) return null
    const bucket = (found as Holding & { bucket?: string }).bucket
    if (bucket === 'crypto') return null
    return {
      id: found.id,
      ticker: found.ticker,
      name: found.name,
      isin: found.isin,
      units: found.units,
      currency: found.currency ?? null,
      currentPrice: found.current_price,
      avgPurchasePrice: found.avg_purchase_price,
      notes: found.notes,
      // `external_source` is niet aanwezig in de lokale `Holding` type-
      // definitie (legacy holdings-tabel had het niet), maar de
      // server-loader in `holdings-data-loader.ts` voegt het via
      // `select('*')` automatisch toe. Cast-via-Record om de bridge te
      // maken zonder de centrale Holding-type aan te passen.
      externalSource:
        ((found as Holding & { external_source?: string | null }).external_source ??
          null) || null,
      lastPriceUpdate: found.last_price_update,
      dailyChangePercent: found.daily_change_percent ?? null,
      ter: found.ter ?? null,
    }
  }, [holdings, requestedHoldingId])

  // Open de pane door alleen `?holding=<id>` aan de URL toe te voegen —
  // overige query-state (bv. `?asset=…` deeplink-filter) blijft bestaan.
  // `router.replace` ipv `push` zodat schakelen tussen posities niet de
  // history vervuilt; het pane-open-moment zelf is één history-entry,
  // ongeacht hoeveel rijen de gebruiker bekijkt voordat ze sluiten.
  const openHoldingPane = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(OVERLAY_QUERY_KEYS.holding, id)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  // Sluit de pane door alleen `?holding=` uit de URL te halen — overige
  // query-state blijft behouden zodat de gebruiker terugkeert naar
  // dezelfde context.
  const closeHoldingPane = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(OVERLAY_QUERY_KEYS.holding)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, searchParams])

  // Pane-callback bij save/delete — laad de holdings opnieuw zodat de
  // KPI-strip en figures-strip de nieuwe waarden tonen.
  const handlePaneChanged = useCallback(() => {
    setLoading(true)
    loadHoldings()
  }, [loadHoldings])

  // Heatmap-projectie: map de zichtbare holdings naar de HeatmapHolding-vorm.
  //
  // BRON = `sortedHoldings`, NIET de ruwe `holdings`-state. De toolbar met de
  // chips (ALLES / AANDELEN·ETF / GESLOTEN) staat als één gedeelde balk BOVEN
  // de Lijst/Heatmap-toggle en telt "x/y actief" — die keuze stuurt dus beide
  // weergaven. Voorheen las de heatmap de ongefilterde state en toonde ze ook
  // alle gesloten posities (bij chip 'all' filtert `filterHoldingsByChip` die
  // er juist uit), waardoor de heatmap vol stond met €0-tegels terwijl de
  // lijst er een fractie toonde. Gevolg van deze koppeling: kiest de gebruiker
  // "AANDELEN/ETF", dan verdwijnen crypto-rijen ook uit de heatmap — bewust,
  // want de chip is één filter voor beide weergaven.
  //
  // Een verse array + objecten per render versloeg de memo() op
  // <HoldingsHeatmap> (elke ouder-render leverde een nieuwe prop-referentie).
  // Nu stabiel zolang de gefilterde+gesorteerde set niet wijzigt.
  const heatmapHoldings = useMemo(
    () =>
      sortedHoldings.map((h) => ({
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
      })),
    [sortedHoldings],
  )

  // Stabiele klik-handler voor de heatmap-cellen — in useCallback zodat de
  // prop-referentie stabiel blijft en de memo() op de heatmap effectief is.
  const handleHeatmapClick = useCallback(
    (id: string) => {
      // Heatmap-cel openen schakelt naar de detail-pane via URL-state —
      // symmetrisch met de lijst-rij. Crypto-rijen kunnen wél in de heatmap
      // staan (bij chip ALLES zitten ze in `sortedHoldings`); die hebben een
      // eigen pane-flow op `?crypto=<id>`, dus vallen ze hier — net als een
      // holding die niet in de lokale array zit — terug op de full-page route.
      const target = holdings.find((h) => h.id === id)
      const bucket = target && (target as Holding & { bucket?: string }).bucket
      if (target && bucket !== 'crypto') {
        openHoldingPane(id)
      } else {
        router.push(`/core/assets/holdings/${id}`)
      }
    },
    [holdings, openHoldingPane, router],
  )

  if (loading) {
    return (
      <div className="py-5 sm:py-12">
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
    <div className="py-5 sm:py-8">
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

      {/* Refresh / stale banners — apart, geen kaart eromheen.
          Editorial krant-stijl: kicker-rij in mono UPPERCASE + body in italic Source Serif,
          counters in DM Mono met tabular-nums voor consistente cijferritmiek. */}
      {staleCount > 0 && (
        <div
          className="flex items-start gap-3 border border-[var(--module-active-300)] bg-[var(--module-active-50)]/60 px-4 py-3"
          data-testid="stale-price-warning"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--module-active-700)]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] font-mono font-semibold text-[var(--module-active-700)]">
              Prijzen verouderd
            </p>
            <p className="mt-1 font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
              <span className="font-mono not-italic font-bold tabular-nums text-[var(--ink)]">{staleCount}</span>
              {' '}
              {staleCount === 1 ? 'holding heeft' : 'holdings hebben'} een prijs die niet meer up-to-date is.
              Vernieuw automatisch of werk handmatig bij via het <span className="font-mono not-italic">⋯</span>-menu.
            </p>
          </div>
        </div>
      )}
      {refreshResult && (() => {
        // Per-type stijl-mapping: kicker-kleur + icon volgen success/warning/error-semantiek.
        // Body-tekst blijft op --ink-2 (italic Source Serif) zodat de melding leesbaar blijft
        // en de kleurtoekenning gelaagd is — kleur op kicker en icon, niet op de hele paragraaf.
        const isSuccess = refreshResult.type === 'success'
        const isWarning = refreshResult.type === 'warning'
        const containerClass = isSuccess
          ? 'border-[var(--positive)] bg-[var(--positive)]/5'
          : isWarning
            ? 'border-[var(--module-active-300)] bg-[var(--module-active-50)]/60'
            : 'border-[var(--negative)] bg-[var(--negative)]/5'
        const kickerLabel = isSuccess
          ? 'Prijzen vernieuwd'
          : isWarning
            ? 'Let op'
            : 'Prijzen niet vernieuwd'
        const kickerColor = isSuccess
          ? 'text-[var(--positive)]'
          : isWarning
            ? 'text-[var(--module-active-700)]'
            : 'text-[var(--negative)]'
        // Highlight standalone digit-sequences (counters zoals "3 prijzen vernieuwd")
        // in DM Mono met tabular-nums — consistent met alle financiële cijfers in de app.
        // Splitst de server-string op `\d+(?:[.,]\d+)?` zodat elk getal een eigen span krijgt
        // zonder de italic Source Serif van de omringende body te onderbreken.
        const tokens = refreshResult.message.split(/(\d+(?:[.,]\d+)?)/)
        return (
          <div
            className={`mt-2 flex items-start gap-3 border px-4 py-3 ${containerClass}`}
            data-testid="refresh-result"
          >
            {isSuccess && <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--positive)]" aria-hidden="true" />}
            {isWarning && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--module-active-700)]" aria-hidden="true" />}
            {refreshResult.type === 'error' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--negative)]" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <p className={`text-[10px] uppercase tracking-[0.18em] font-mono font-semibold ${kickerColor}`}>
                {kickerLabel}
              </p>
              <p className="mt-1 font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
                {tokens.map((token, i) =>
                  /^\d+(?:[.,]\d+)?$/.test(token) ? (
                    <span key={i} className="font-mono not-italic font-bold tabular-nums text-[var(--ink)]">
                      {token}
                    </span>
                  ) : (
                    <span key={i}>{token}</span>
                  )
                )}
              </p>
            </div>
            <button
              onClick={() => setRefreshResult(null)}
              aria-label="Sluit melding"
              className="ml-auto shrink-0 p-0.5 hover:bg-[var(--ink)]/5"
            >
              <X className="h-3 w-3 text-[var(--ink-3)]" />
            </button>
          </div>
        )
      })()}

      {/* Hero summary — figures-strip + allocatie-strip + FIRE deck.
          De periode-rail staat bewust NIET meer hierin: die stuurt inmiddels
          drie oppervlakken aan en heeft daarom een eigen plek hieronder. */}
      <PortfolioSummary
        totalValue={totalValue}
        totalPnL={totalPnL}
        totalInvested={totalInvested}
        openPositionsCount={openPositionsCount}
        todayChangeEur={todayChange.eur}
        todayChangePct={todayChange.pct}
        forwardDividendNetNl={forwardDividendNetNl}
        yearlyEssentialExpenses={initialData?.yearlyEssentialExpenses ?? 0}
        // Grondslag uit de loader; géén lokale constante. Zonder server-load is
        // er ook geen `yearlyEssentialExpenses` en rendert de deck-regel niet,
        // dus `null` betekent hier "geen deck" en nooit "toon een generiek %".
        effectiveSwr={initialData?.effectiveSwr ?? null}
        activePeriod={chartPeriod}
        comparison={benchmarkComparison}
        assetClassBreakdown={assetClassBreakdown}
        concentrationTop3Pct={concentrationTop3Pct}
      />

      {/* Allocatie-donut — full breakdown met view-tabs (asset-class/sector/regio).
          Staat direct onder de KPI-regel: eerst "waaruit bestaat het", dan pas
          de tijdas. Anchor `#portfolio-allocation` zodat de compacte strip in de
          hero hierheen kan deeplinken via in-page jump. */}
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

      {/* Periode-rail — één keuze die drie oppervlakken tegelijk stuurt: de
          rendement-cel in de hero, de waardegrafiek en de benchmark hieronder.
          Staat dáárom hier, tussen de verdeling en de twee tijdgebonden
          grafieken, en niet meer verstopt in de hero. */}
      {holdings.length > 0 && (
        <section className="mt-6 border-t border-b border-[var(--rule-soft)] py-3">
          <PeriodRail
            periods={TIME_PERIODS}
            activePeriod={chartPeriod}
            onPeriodChange={handlePeriodChange}
          />
        </section>
      )}

      {/* Waardehistorie — wat de portefeuille door de tijd waard was, over
          hetzelfde venster als de rail hierboven. Het component haalt zijn eigen
          reeks op via /api/holdings/value-history en vangt de lege staat zelf af. */}
      <section className="mt-6">
        <PortfolioValueChart
          months={chartMonths}
          yearlyEssentialExpenses={initialData?.yearlyEssentialExpenses ?? 0}
        />
      </section>

      {/* Benchmark — alleen vanaf 2 holdings */}
      {showBenchmark && (
        <section className="mt-6">
          <BenchmarkComparisonChart
            comparison={benchmarkComparison}
            onPeriodChange={handlePeriodChange}
            activePeriod={chartPeriod}
            loading={benchmarkLoading}
            // De gedeelde PeriodRail hierboven stuurt deze grafiek al aan.
            hidePeriodRail
          />
        </section>
      )}

      {/* Rebalancing drempel-instellingen — horen bij de portfolio-verdeling.
          Alleen zichtbaar wanneer er target-allocaties zijn (de component gate
          zichzelf). */}
      {showAllocation && <RebalancingSettingsSection />}

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
          {/* Bewust GÉÉN setLoading(true) hier: dat wisselde de hele pagina om
              naar de laadskeleton terwijl er correcte, server-geleverde data
              stond — de gebruiker zag zijn portefeuille verdwijnen om vervolgens
              onveranderd terug te komen. `loadHoldings` zet de foutregel zelf. */}
          <button
            onClick={() => { setError(null); loadHoldings() }}
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

      {/* Heatmap weergave — alleen als de actieve chip iets overlaat; levert de
          chip niets op, dan toont de lijst-sectie hieronder de gefilterde
          EmptyState (anders zouden er twee lege toestanden onder elkaar staan). */}
      {viewMode === 'heatmap' && heatmapHoldings.length > 0 && (
        <section
          className="mt-3 border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6"
          data-testid="holdings-heatmap-section"
        >
          <HoldingsHeatmap
            holdings={heatmapHoldings}
            dividendData={dividendData}
            onHoldingClick={handleHeatmapClick}
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

        {visibleHoldings.map((holding) => {
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

          // Gesloten positie → toon de opbrengst (gerealiseerde winst/verlies)
          // uit de server-afgeleide engine-P&L.
          // - EUR: masking-aware via `fc()`, consistent met de rest van de lijst.
          // - non-EUR: native valuta-formatting (Intl.NumberFormat), masking
          //   bewust niet van toepassing — net als bij `formattedValue` hierboven.
          //   Zo is de hele rij currency-consistent (symbool klopt).
          // `null` als er geen transactiehistorie is (pnl_total ontbreekt).
          const closedPnl =
            isClosedHolding(holding) && typeof holding.pnl_total === 'number'
              ? {
                  amount: holding.pnl_total,
                  formatted:
                    holding.currency && holding.currency !== 'EUR'
                      ? new Intl.NumberFormat('nl-NL', {
                          style: 'currency',
                          currency: holding.currency,
                        }).format(holding.pnl_total)
                      : (fc(holding.pnl_total) as string),
                }
              : null

          // Crypto-rijen openen geen investment-pane — die hebben hun eigen
          // pane-flow (`?crypto=<id>`) op de crypto-Holdings-app. Voor nu
          // negeren we de pane-trigger op crypto-rijen en laten de Link
          // doorgaan naar de full-page route. Investment-rijen openen de
          // nieuwe pane via URL-state.
          const bucket = (holding as Holding & { bucket?: string }).bucket
          const isInvestmentRow = bucket !== 'crypto'

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
                closedPnl,
                // 52-weeks bereik uit de koersfeed. Blijft NULL tot de
                // eerstvolgende koersvernieuwing; de strook verbergt zich dan.
                fiftyTwoWeekHigh: holding.fifty_two_week_high ?? null,
                fiftyTwoWeekLow: holding.fifty_two_week_low ?? null,
              }}
              weightPct={weightPct}
              formattedValue={formattedValue}
              formatLastUpdate={formatLastUpdate}
              onTransaction={() => setTxHolding(holding)}
              // "Bewerken" in het ⋯-menu opent voortaan de pane (waarin de
              // gebruiker via de footer-knop "Bewerken" naar edit-mode kan
              // schakelen). Conform spec: geen aparte HoldingEditForm-modal
              // meer.
              onEdit={
                isInvestmentRow
                  ? () => openHoldingPane(holding.id)
                  : () => {
                      // Crypto-rijen op deze legacy-pagina hebben (nog) geen
                      // pane-flow; we blijven via de Link naar de full-page
                      // detail navigeren — geen actie hier.
                    }
              }
              onDelete={() => handleDelete(holding.id)}
              onManualOverride={() => setOverrideHolding(holding)}
              onOpen={isInvestmentRow ? () => openHoldingPane(holding.id) : undefined}
            />
          )
        })}
      </section>

      {/* New holding form modal */}
      {showForm && (
        <HoldingForm
          assetId={assetFilter}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            setLoading(true)
            loadHoldings()
          }}
        />
      )}

      {/* Investment-holding detail-pane — opent vanaf `?holding=<id>`.
          Op desktop een SlideInPane rechts; op mobile een full-height
          BottomSheet als fallback (regelt `<ShellOverlay kind="pane">`
          automatisch). Sibling van de andere modals zodat de
          driewegregel-overlay-strategie consistent blijft. */}
      <InvestmentHoldingPane
        holding={selectedHoldingForPane}
        onClose={closeHoldingPane}
        onChanged={handlePaneChanged}
      />

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
        <div className="mb-4 flex items-start gap-2 border border-kern-200 bg-kern-50 p-3">
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
          <div className="mb-4 border border-negative/30 bg-negative/10 p-3">
            <p className="text-xs text-negative">{error}</p>
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
              className="w-full border border-[var(--border-ed)] px-3 py-2 text-sm"
              placeholder="0.00"
              autoFocus
              data-testid="override-price-input"
            />
          </div>

          {/* Value preview */}
          <div className="border border-kern-200 bg-kern-50/50 p-3">
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

          <div className="border border-[var(--border-ed)] bg-[var(--subtle)] p-2.5">
            <p className="text-[10px] text-[var(--ink-3)]">
              Vorige prijs: {holding.current_price != null ? fc(holding.current_price) : 'Niet ingesteld'}
              {' · '}Aankoopprijs: {fc(holding.avg_purchase_price)}
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !price}
            className="bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
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
  assetId,
}: {
  onClose: () => void
  onSaved: () => void
  /** Asset-context (uit `?asset=<uuid>`) — expliciet meegestuurd zodat de nieuwe
   *  holding aan het juiste bezit hangt i.p.v. de server-fallback te vertrouwen
   *  (WF-BEZIT-14-bug2). Null bij de portfolio-brede weergave zonder filter. */
  assetId?: string | null
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
          // Koppel expliciet aan het asset uit de context; laat weg bij portfolio-
          // brede weergave (dan valt de server terug op de defensieve fallback).
          ...(assetId ? { asset_id: assetId } : {}),
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
          <div className="mb-4 border border-negative/30 bg-negative/10 p-3">
            <p className="text-xs text-negative">{error}</p>
          </div>
        )}

        {duplicateWarning && (
          <div className="mb-4 border border-kern-300 bg-kern-50 p-3" data-testid="duplicate-warning">
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
                    className="bg-kern-600 px-3 py-1 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
                    data-testid="force-duplicate-btn"
                  >
                    {saving ? 'Opslaan...' : 'Toch toevoegen'}
                  </button>
                  <button
                    onClick={() => setDuplicateWarning(null)}
                    className="border border-kern-300 px-3 py-1 text-xs font-medium text-kern-700 hover:bg-kern-100"
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
                className="w-full border border-[var(--border-ed)] px-3 py-2 text-sm"
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
                className="w-full border border-[var(--border-ed)] px-3 py-2 text-sm"
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
                className="w-full border border-[var(--border-ed)] px-3 py-2 text-sm"
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
                className="w-full border border-[var(--border-ed)] px-3 py-2 text-sm"
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
                className="w-full border border-[var(--border-ed)] px-3 py-2 text-sm"
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
                className="w-full border border-[var(--border-ed)] px-3 py-2 text-sm"
                data-testid="holding-purchase-date-input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Valuta</label>
              <div
                className="flex items-center border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink-2)]"
                data-testid="holding-currency-display"
              >
                {currency}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Status</label>
              <div
                className="flex items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink-2)]"
                data-testid="holding-is-active-display"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-positive" />
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
                className="w-32 border border-[var(--border-ed)] px-3 py-2 text-sm"
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
              <p className="mt-1 text-[11px] text-negative">TER mag maximaal 10% zijn</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notities (optioneel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
          </div>

          {/* Progressive disclosure: hint when ticker/ISIN present but no TER */}
          {!ter && ticker && (
            <div className="border border-kern-100 bg-kern-50/50 px-3 py-2" data-testid="ter-hint">
              <p className="text-[11px] text-kern-600">
                💡 Tip: voeg de TER toe om jaarlijkse fondskosten inzichtelijk te maken
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            onClick={() => handleSave()}
            disabled={saving || submitted || !name}
            className="bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
            data-testid="holding-submit-btn"
          >
            {submitted ? 'Opgeslagen ✓' : saving ? 'Opslaan...' : 'Toevoegen'}
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
    buy: { label: 'Koop', icon: ArrowDownRight, color: 'text-positive', bg: 'bg-positive/10', border: 'border-positive/30', ring: 'ring-positive' },
    sell: { label: 'Verkoop', icon: ArrowUpRight, color: 'text-negative', bg: 'bg-negative/10', border: 'border-negative/30', ring: 'ring-negative' },
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
                <div className="mb-4 border border-negative/30 bg-negative/10 p-3">
                  <p className="text-xs text-negative">{error}</p>
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
                        className={`flex items-center justify-center gap-1.5 border px-3 py-2 text-sm font-medium transition-all ${
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
                          className="text-[10px] font-medium text-negative hover:text-negative/80"
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
                      className={`w-full border px-3 py-2 text-sm ${
                        sellExceedsOwned || sellFromZero ? 'border-negative/40 bg-negative/5' : 'border-[var(--border-ed)]'
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
                      className="w-full border border-[var(--border-ed)] px-3 py-2 text-sm"
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
                      className="w-full border border-[var(--border-ed)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Totaal bedrag</label>
                    <div className="flex items-center border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-sm font-medium text-[var(--ink-2)]">
                      {fc(totalAmount)}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notities (optioneel)</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full border border-[var(--border-ed)] px-3 py-2 text-sm"
                    placeholder="Maandelijkse aankoop..."
                  />
                </div>
              </div>

              {/* Sell validation warning */}
              {sellFromZero && (
                <div className="mt-4 border border-negative/30 bg-negative/10 p-3" data-testid="sell-from-zero-warning">
                  <p className="text-xs font-medium text-negative">
                    <AlertTriangle className="inline h-3 w-3 mr-1" />
                    Deze holding heeft 0 eenheden. Je kunt niet verkopen.
                  </p>
                </div>
              )}
              {sellExceedsOwned && !sellFromZero && (
                <div className="mt-4 border border-negative/30 bg-negative/10 p-3" data-testid="sell-exceeds-warning">
                  <p className="text-xs font-medium text-negative">
                    <AlertTriangle className="inline h-3 w-3 mr-1" />
                    Je hebt maar {currentUnits} eenheden. Je kunt niet meer verkopen dan je bezit.
                  </p>
                </div>
              )}

              {/* Preview: holding after transaction */}
              {Number(units) > 0 && txType !== 'dividend' && !sellExceedsOwned && !sellFromZero && (
                <div className="mt-4 border border-kern-200 bg-kern-50/50 p-3">
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
                  className="border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                >
                  Annuleren
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !units || !pricePerUnit || !date || sellExceedsOwned || sellFromZero}
                  className={`px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                    txType === 'buy' ? 'bg-positive hover:bg-positive/90' :
                    txType === 'sell' ? 'bg-negative hover:bg-negative/90' :
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
                        <div className="mb-3 border border-kern-200 bg-kern-50/50 p-3" data-testid="dividend-summary">
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
                        <div key={tx.id} className="flex items-center gap-3 border border-[var(--border-ed)] p-2.5">
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center ${cfg.bg}`}>
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
