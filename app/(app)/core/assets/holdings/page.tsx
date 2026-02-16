'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, Trash2, X, TrendingUp, ArrowLeft, Loader2, Briefcase, Edit3, Receipt, ArrowUpRight, ArrowDownRight, DollarSign, PieChart, RefreshCw, AlertTriangle, Clock, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'
import Link from 'next/link'

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
  // Extra fields from assets fallback
  asset_type?: string
  institution?: string
  expected_return?: number
  monthly_contribution?: number
}

export default function HoldingsPage() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [totalValue, setTotalValue] = useState(0)
  const [totalCost, setTotalCost] = useState(0)
  const [source, setSource] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editHolding, setEditHolding] = useState<Holding | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [txHolding, setTxHolding] = useState<Holding | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null)
  const [overrideHolding, setOverrideHolding] = useState<Holding | null>(null)

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

  useEffect(() => {
    loadHoldings()
  }, [loadHoldings])

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/holdings?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Verwijderen mislukt')
      setHoldings((prev) => prev.filter((h) => h.id !== id))
      setDeleteConfirm(null)
    } catch {
      setError('Kon holding niet verwijderen')
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

  // Refresh all prices
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

      if (data.summary?.updated > 0) {
        setRefreshResult({
          message: data.message || 'Prijzen bijgewerkt',
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

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6">
        <div className="flex items-center gap-3 mb-4">
          <Link
            href="/core/assets"
            className="inline-flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Assets
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Holdings</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {holdings.length} actieve holding{holdings.length !== 1 ? 's' : ''} in je portfolio
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              title="Prijzen vernieuwen"
              data-testid="refresh-prices-btn"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Vernieuwen...' : 'Prijzen vernieuwen'}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              <Plus className="h-4 w-4" />
              Holding toevoegen
            </button>
          </div>
        </div>

        {/* Stale price warning banner */}
        {staleCount > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="stale-price-warning">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs text-amber-700">
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
                ? 'border-amber-200 bg-amber-50'
                : 'border-red-200 bg-red-50'
          }`} data-testid="refresh-result">
            {refreshResult.type === 'success' && <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />}
            {refreshResult.type === 'warning' && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
            {refreshResult.type === 'error' && <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />}
            <p className={`text-xs ${
              refreshResult.type === 'success'
                ? 'text-emerald-700'
                : refreshResult.type === 'warning'
                  ? 'text-amber-700'
                  : 'text-red-700'
            }`}>
              {refreshResult.message}
            </p>
            <button
              onClick={() => setRefreshResult(null)}
              className="ml-auto shrink-0 rounded p-0.5 hover:bg-black/5"
            >
              <X className="h-3 w-3 text-zinc-400" />
            </button>
          </div>
        )}

        {/* KPI Stats */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Totale waarde</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(totalValue)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Totale kostprijs</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(totalCost)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Rendement</p>
            {totalCost > 0 ? (
              <p className={`mt-1 text-xl font-bold ${totalReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(1)}%
                <span className="ml-1 text-sm font-medium">
                  ({totalReturn >= 0 ? '+' : ''}{formatCurrency(totalValue - totalCost)})
                </span>
              </p>
            ) : (
              <p className="mt-1 text-xl font-bold text-zinc-400">-</p>
            )}
          </div>
        </div>
      </section>

      {/* Portfolio allocation chart */}
      {allocationData.length > 0 && (
        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6" data-testid="portfolio-allocation">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-zinc-700">Portfolio verdeling</h2>
          </div>
          <div className="flex items-center gap-6">
            <HoldingsAllocationPie holdings={allocationData} total={totalValue} />
            <div className="flex-1 space-y-1.5 max-h-48 overflow-y-auto">
              {allocationData.map((h, i) => {
                const pct = totalValue > 0 ? (h.value / totalValue) * 100 : 0
                return (
                  <div key={h.id} className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-sm shrink-0"
                      style={{ backgroundColor: HOLDING_COLORS[i % HOLDING_COLORS.length] }}
                    />
                    <span className="flex-1 text-xs text-zinc-600 truncate">
                      {h.name}
                      {h.ticker && <span className="ml-1 text-zinc-400">({h.ticker})</span>}
                    </span>
                    <span className="text-xs font-medium text-zinc-900 shrink-0">{pct.toFixed(1)}%</span>
                    <span className="text-xs text-zinc-400 shrink-0">{formatCurrency(h.value)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
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
      <section className="mt-6 space-y-2">
        {holdings.length === 0 && !loading && (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
            <Briefcase className="mx-auto h-10 w-10 text-zinc-300" />
            <p className="mt-3 text-sm font-medium text-zinc-600">Nog geen holdings</p>
            <p className="mt-1 text-xs text-zinc-400">
              Voeg je eerste holding toe om je portfolio te volgen.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              <Plus className="h-4 w-4" />
              Eerste holding toevoegen
            </button>
          </div>
        )}

        {holdings.map((holding) => {
          const price = holding.current_price ?? holding.avg_purchase_price
          const value = price * holding.units
          const cost = holding.avg_purchase_price * holding.units
          const returnPct = cost > 0 ? ((value - cost) / cost) * 100 : 0
          const stale = isPriceStale(holding)

          return (
            <div
              key={holding.id}
              className={`flex items-center gap-3 rounded-xl border bg-white p-3 transition-colors hover:border-amber-200 hover:bg-amber-50/30 ${
                stale ? 'border-amber-300 bg-amber-50/20' : 'border-zinc-200'
              }`}
              data-testid={`holding-item-${holding.id}`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stale ? 'bg-amber-100' : 'bg-amber-50'}`}>
                {stale ? (
                  <Clock className="h-4 w-4 text-amber-500" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-amber-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-zinc-900">{holding.name}</p>
                  {stale && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                      title={`Laatste update: ${formatLastUpdate(holding.last_price_update)}`}
                      data-testid="stale-indicator"
                    >
                      <AlertTriangle className="h-2.5 w-2.5" />
                      Verouderd
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-zinc-500">
                  {holding.ticker && <span className="font-medium text-amber-600">{holding.ticker}</span>}
                  {holding.ticker && holding.units > 0 && ' · '}
                  {holding.units > 0 && `${holding.units} eenheden`}
                  {holding.institution && ` · ${holding.institution}`}
                  {holding.purchase_date && ` · ${new Date(holding.purchase_date).toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })}`}
                  {stale && holding.last_price_update && (
                    <span className="ml-1 text-amber-500">
                      · Prijs van {formatLastUpdate(holding.last_price_update)}
                    </span>
                  )}
                  {stale && !holding.last_price_update && (
                    <span className="ml-1 text-amber-500">· Prijs nooit bijgewerkt</span>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-semibold ${stale ? 'text-amber-700' : 'text-zinc-900'}`}>
                  {formatCurrency(value)}
                  {stale && <span className="text-[10px] font-normal text-amber-500 block">laatste bekende prijs</span>}
                </p>
                {cost > 0 && (
                  <p className={`text-xs font-medium ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {stale && (
                  <button
                    onClick={() => setOverrideHolding(holding)}
                    className="rounded-lg p-1.5 text-amber-500 hover:bg-amber-50 hover:text-amber-700"
                    title="Prijs handmatig bijwerken"
                    data-testid="manual-override-btn"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setTxHolding(holding)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600"
                  title="Transactie registreren"
                >
                  <Receipt className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setEditHolding(holding)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-amber-50 hover:text-amber-600"
                  title="Bewerken"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                {deleteConfirm === holding.id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleDelete(holding.id)}
                      className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Ja
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                      Nee
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(holding.id)}
                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                    title="Verwijderen"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="manual-override-modal"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Prijs handmatig bijwerken</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {holding.name} {holding.ticker ? `(${holding.ticker})` : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stale price notice */}
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-700">Prijsfeed niet beschikbaar</p>
            <p className="text-xs text-amber-600 mt-0.5">
              De automatische prijsfeed is momenteel niet bereikbaar voor deze holding.
              Je kunt de huidige prijs handmatig invoeren.
            </p>
            {holding.last_price_update && (
              <p className="text-xs text-amber-500 mt-1">
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
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Huidige prijs per eenheid (€) *
            </label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="0.00"
              autoFocus
              data-testid="override-price-input"
            />
          </div>

          {/* Value preview */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-700">
                Nieuwe waarde ({holding.units} eenheden)
              </span>
              <span className="text-sm font-bold text-zinc-900">{formatCurrency(currentValue)}</span>
            </div>
            {currentValue !== oldValue && (
              <p className={`mt-1 text-xs font-medium ${currentValue >= oldValue ? 'text-emerald-600' : 'text-red-600'}`}>
                {currentValue >= oldValue ? '+' : ''}{formatCurrency(currentValue - oldValue)} verschil
              </p>
            )}
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-2.5">
            <p className="text-[10px] text-zinc-500">
              Vorige prijs: {holding.current_price != null ? formatCurrency(holding.current_price) : 'Niet ingesteld'}
              {' · '}Aankoopprijs: {formatCurrency(holding.avg_purchase_price)}
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !price}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            data-testid="override-save-btn"
          >
            {saving ? 'Bijwerken...' : 'Prijs bijwerken'}
          </button>
        </div>
      </div>
    </div>
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
  const [units, setUnits] = useState('1')
  const [avgPrice, setAvgPrice] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{
    message: string
    existing: { id: string; name: string; ticker: string }[]
  } | null>(null)

  async function handleSave(forceDuplicate = false) {
    if (!name) return
    setSaving(true)
    setError(null)
    if (!forceDuplicate) setDuplicateWarning(null)

    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          ticker: ticker || null,
          units: Number(units) || 1,
          avg_purchase_price: Number(avgPrice) || 0,
          current_price: currentPrice ? Number(currentPrice) : null,
          purchase_date: purchaseDate || null,
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

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900">Nieuwe holding</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {duplicateWarning && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="duplicate-warning">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-800">Dubbele ticker gedetecteerd</p>
                <p className="mt-1 text-xs text-amber-700">{duplicateWarning.message}</p>
                {duplicateWarning.existing.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {duplicateWarning.existing.map((h) => (
                      <li key={h.id} className="text-xs text-amber-700">
                        • {h.name} ({h.ticker})
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    data-testid="force-duplicate-btn"
                  >
                    {saving ? 'Opslaan...' : 'Toch toevoegen'}
                  </button>
                  <button
                    onClick={() => setDuplicateWarning(null)}
                    className="rounded-md border border-amber-300 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
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
              <label className="mb-1 block text-xs font-medium text-zinc-600">Naam *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="VWRL ETF"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Ticker / ISIN</label>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="VWRL"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Aantal eenheden</label>
              <input
                type="number"
                step="0.001"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Gem. aankoopprijs</label>
              <input
                type="number"
                step="0.01"
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Huidige prijs</label>
              <input
                type="number"
                step="0.01"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Aankoopdatum</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Notities (optioneel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : 'Toevoegen'}
          </button>
        </div>
      </div>
    </div>
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
  const [name, setName] = useState(holding.name)
  const [ticker, setTicker] = useState(holding.ticker || '')
  const [units, setUnits] = useState(String(holding.units))
  const [avgPrice, setAvgPrice] = useState(String(holding.avg_purchase_price))
  const [currentPrice, setCurrentPrice] = useState(String(holding.current_price ?? ''))
  const [notes, setNotes] = useState(holding.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflictData, setConflictData] = useState<{
    message: string
    server_state: Record<string, unknown>
  } | null>(null)

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="holding-edit-modal"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900">Holding bewerken</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Concurrent edit conflict warning */}
        {conflictData && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="conflict-warning">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-800">Bewerkingsconflict</p>
                <p className="mt-1 text-xs text-amber-700">{conflictData.message}</p>
                {conflictData.server_state && (
                  <div className="mt-2 rounded border border-amber-200 bg-white/60 p-2">
                    <p className="text-[10px] font-medium text-amber-600 mb-1">Huidige waarden op de server:</p>
                    <p className="text-xs text-zinc-600">
                      Naam: <span className="font-medium">{String(conflictData.server_state.name || '-')}</span>
                      {' · '}Eenheden: <span className="font-medium">{String(conflictData.server_state.units || '-')}</span>
                      {' · '}Prijs: <span className="font-medium">{conflictData.server_state.current_price != null ? formatCurrency(Number(conflictData.server_state.current_price)) : '-'}</span>
                    </p>
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleReloadFromServer}
                    className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
                    data-testid="conflict-reload-btn"
                  >
                    Serverwaarden laden
                  </button>
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="rounded-md border border-amber-300 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
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
              <label className="mb-1 block text-xs font-medium text-zinc-600">Naam *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Ticker / ISIN</label>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Aantal eenheden</label>
              <input
                type="number"
                step="0.001"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Gem. aankoopprijs</label>
              <input
                type="number"
                step="0.01"
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Huidige prijs</label>
              <input
                type="number"
                step="0.01"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Live value preview */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-700">Portfolio waarde (deze holding)</span>
              <span className="text-sm font-bold text-zinc-900">{formatCurrency(newValue)}</span>
            </div>
            {newValue !== oldValue && (
              <p className={`mt-1 text-xs font-medium ${newValue >= oldValue ? 'text-emerald-600' : 'text-red-600'}`}>
                {newValue >= oldValue ? '+' : ''}{formatCurrency(newValue - oldValue)} t.o.v. huidige waarde
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Notities (optioneel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Annuleren
          </button>
          <button
            onClick={() => handleSave()}
            disabled={saving || !name}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? 'Bijwerken...' : 'Bijwerken'}
          </button>
        </div>
      </div>
    </div>
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
  const currentUnits = holding.units
  const currentAvg = holding.avg_purchase_price
  let previewUnits = currentUnits
  let previewAvg = currentAvg

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
    dividend: { label: 'Dividend', icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', ring: 'ring-amber-500' },
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 pt-5 pb-3">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Transactie registreren</h3>
            <p className="text-xs text-zinc-500">{holding.name} {holding.ticker ? `(${holding.ticker})` : ''}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-100 px-6">
          <button
            onClick={() => setTab('new')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'new' ? 'border-amber-500 text-amber-700' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
          >
            Nieuwe transactie
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'history' ? 'border-amber-500 text-amber-700' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
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
                <label className="mb-1.5 block text-xs font-medium text-zinc-600">Type transactie</label>
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
                            : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
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
                    <label className="mb-1 block text-xs font-medium text-zinc-600">
                      {txType === 'dividend' ? 'Bedrag per eenheid' : 'Aantal eenheden'} *
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      placeholder={txType === 'dividend' ? '1' : '10'}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Prijs per eenheid *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={pricePerUnit}
                      onChange={(e) => setPricePerUnit(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="50.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Datum *</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Totaal bedrag</label>
                    <div className="flex items-center rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700">
                      {formatCurrency(totalAmount)}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Notities (optioneel)</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="Maandelijkse aankoop..."
                  />
                </div>
              </div>

              {/* Preview: holding after transaction */}
              {Number(units) > 0 && txType !== 'dividend' && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                  <p className="text-xs font-medium text-amber-700 mb-1">Na transactie:</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-600">
                      {currentUnits} <span className="text-zinc-400">→</span> {previewUnits.toFixed(3)} eenheden
                    </span>
                    <span className="font-medium text-zinc-900">
                      Gem. prijs: {formatCurrency(previewAvg)}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Annuleren
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !units || !pricePerUnit || !date}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                    txType === 'buy' ? 'bg-emerald-600 hover:bg-emerald-700' :
                    txType === 'sell' ? 'bg-red-600 hover:bg-red-700' :
                    'bg-amber-600 hover:bg-amber-700'
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
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                </div>
              )}

              {!loadingHistory && transactions.length === 0 && (
                <div className="py-8 text-center">
                  <Receipt className="mx-auto h-8 w-8 text-zinc-300" />
                  <p className="mt-2 text-sm text-zinc-500">Nog geen transacties geregistreerd</p>
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
                        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3" data-testid="dividend-summary">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-amber-600" />
                              <span className="text-xs font-medium text-amber-700">Totaal dividend inkomen</span>
                            </div>
                            <span className="text-sm font-bold text-amber-700" data-testid="total-dividend-income">
                              {formatCurrency(totalDividendIncome)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-amber-600/70">{dividendTxs.length} dividend uitkering{dividendTxs.length !== 1 ? 'en' : ''}</p>
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
                        <div key={tx.id} className="flex items-center gap-3 rounded-lg border border-zinc-100 p-2.5">
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${cfg.bg}`}>
                            <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-zinc-900">
                              {cfg.label}: {tx.units} eenhe{tx.units === 1 ? 'id' : 'den'} @ {formatCurrency(tx.price_per_unit)}
                            </p>
                            <p className="text-xs text-zinc-400">
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
      </div>
    </div>
  )
}
