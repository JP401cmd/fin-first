'use client'

import { useEffect, useState, useCallback } from 'react'
import type { NibudBenchmark } from '@/lib/nibud/types'
import { BarChart3, ArrowRight, X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'

type BenchmarkResponse = {
  household_type: string
  household_label: string
  year: number
  source: string
  benchmarks: NibudBenchmark[]
  total_freedom_days_potential: number
}

// ── Compact dashboard card ──────────────────────────────────────────

export function NibudBenchmarkSection() {
  const [data, setData] = useState<BenchmarkResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const loadBenchmarks = useCallback(async () => {
    try {
      const res = await fetch('/api/nibud/benchmark')
      if (res.ok) setData(await res.json())
    } catch { /* section won't render */ }
    setLoading(false)
    setRefreshing(false)
  }, [])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    loadBenchmarks()
  }, [loadBenchmarks])

  useEffect(() => { loadBenchmarks() }, [loadBenchmarks])

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          <span className="text-sm text-zinc-400">NIBUD benchmark laden...</span>
        </div>
      </div>
    )
  }

  if (!data || data.benchmarks.length === 0) return null

  const aboveNorm = data.benchmarks.filter(b => b.delta > 0 && b.user_spending > 0)
  const withData = data.benchmarks.filter(b => b.user_spending > 0)
  const onTrackCount = withData.length - aboveNorm.length
  const topCategories = aboveNorm.slice(0, 3)

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="group w-full rounded-xl border border-zinc-200 bg-white p-5 text-left transition-colors hover:border-teal-200 hover:bg-teal-50/30"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
              <BarChart3 className="h-4 w-4 text-teal-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Budget Gezondheidscheck</h3>
              <p className="text-[11px] text-zinc-400">
                NIBUD {data.year} &middot; {data.household_label.toLowerCase()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.total_freedom_days_potential > 0 && (
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">
                +{data.total_freedom_days_potential} dagen/jaar
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); handleRefresh() }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); handleRefresh() } }}
              className="rounded-md p-1 text-zinc-300 transition-colors hover:bg-teal-50 hover:text-teal-500"
              title="Verversen"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </span>
            <ArrowRight className="h-4 w-4 text-zinc-300 transition-colors group-hover:text-teal-500" />
          </div>
        </div>

        {topCategories.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {topCategories.map(b => (
              <MiniBar key={b.nibud_category_key} benchmark={b} />
            ))}
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-zinc-400">
          {aboveNorm.length > 0 && (
            <span><span className="font-medium text-amber-600">{aboveNorm.length}</span> boven norm</span>
          )}
          {onTrackCount > 0 && (
            <span><span className="font-medium text-teal-600">{onTrackCount}</span> op koers</span>
          )}
          <span className="ml-auto text-zinc-300 group-hover:text-teal-400">Bekijk details</span>
        </div>
      </button>

      <NibudDetailModal
        data={data}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />
    </>
  )
}

// ── Mini bar for compact card ───────────────────────────────────────

function MiniBar({ benchmark: b }: { benchmark: NibudBenchmark }) {
  const referenceAmount = b.voorbeeld_amount ?? b.basis_amount
  const max = Math.max(b.user_spending, referenceAmount) || 1
  const userPct = (b.user_spending / max) * 100
  const refPct = (referenceAmount / max) * 100
  const ratio = referenceAmount > 0 ? b.user_spending / referenceAmount : 2
  const barColor = ratio > 1.3 ? 'bg-red-400' : 'bg-amber-400'

  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 truncate text-[11px] text-zinc-500">{b.nibud_category_name}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
        <div className={`absolute left-0 top-0 h-full rounded-full ${barColor}`} style={{ width: `${Math.min(userPct, 100)}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-zinc-400" style={{ left: `${Math.min(refPct, 100)}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right text-[10px] font-medium text-zinc-400">
        +&euro;{Math.abs(Math.round(b.delta))}
      </span>
    </div>
  )
}

// ── Detail modal ────────────────────────────────────────────────────

function NibudDetailModal({
  data,
  open,
  onClose,
  onRefresh,
  refreshing,
}: {
  data: BenchmarkResponse
  open: boolean
  onClose: () => void
  onRefresh: () => void
  refreshing: boolean
}) {
  const [showBelow, setShowBelow] = useState(false)

  if (!open) return null

  const aboveNorm = data.benchmarks.filter(b => b.delta > 0 && b.user_spending > 0)
  const atOrBelow = data.benchmarks.filter(b => b.delta <= 0 && b.user_spending > 0)
  const noData = data.benchmarks.filter(b => b.user_spending === 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Budget Gezondheidscheck</h2>
            <p className="text-sm text-zinc-500">
              NIBUD-referentie {data.year} voor {data.household_label.toLowerCase()}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-teal-50 hover:text-teal-600 disabled:opacity-50"
              title="Verversen"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Total potential banner */}
          {data.total_freedom_days_potential > 0 && (
            <div className="rounded-xl bg-teal-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-teal-800">
                  Totaal potentieel bij NIBUD-niveau:
                </p>
                <span className="text-xl font-bold text-teal-700">+{data.total_freedom_days_potential} dagen/jaar</span>
              </div>
            </div>
          )}

          {/* Above norm — with budget adjustment */}
          {aboveNorm.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold tracking-[0.12em] text-zinc-400 uppercase">
                Optimalisatiekansen ({aboveNorm.length})
              </h3>
              <div className="space-y-2">
                {aboveNorm.map(b => (
                  <DetailRow key={b.nibud_category_key} benchmark={b} />
                ))}
              </div>
            </div>
          )}

          {/* At or below norm */}
          {atOrBelow.length > 0 && (
            <div>
              <button
                onClick={() => setShowBelow(!showBelow)}
                className="flex w-full items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100"
              >
                {showBelow ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span>
                  <span className="font-medium text-teal-600">{atOrBelow.length}</span>{' '}
                  {atOrBelow.length === 1 ? 'categorie' : 'categorien'} op of onder NIBUD-niveau
                </span>
              </button>
              {showBelow && (
                <div className="mt-2 space-y-2">
                  {atOrBelow.map(b => (
                    <DetailRow key={b.nibud_category_key} benchmark={b} compact />
                  ))}
                </div>
              )}
            </div>
          )}

          {noData.length > 0 && (
            <p className="text-xs text-zinc-400">
              {noData.length} NIBUD-{noData.length === 1 ? 'categorie heeft' : 'categorien hebben'} nog geen transactiedata.
            </p>
          )}

          <p className="text-[10px] leading-relaxed text-zinc-300">
            Referentiebedragen zijn indicatief. Vergelijkbare huishoudens geven gemiddeld deze bedragen uit — jouw situatie kan bewust anders zijn.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Detail row with budget link ──────────────────────────────────────

function DetailRow({
  benchmark: b,
  compact,
}: {
  benchmark: NibudBenchmark
  compact?: boolean
}) {
  const referenceAmount = b.voorbeeld_amount ?? b.basis_amount
  const maxAmount = Math.max(b.user_spending, referenceAmount) || 1
  const userPct = (b.user_spending / maxAmount) * 100
  const refPct = (referenceAmount / maxAmount) * 100

  let barColor = 'bg-teal-500'
  let textColor = 'text-teal-600'
  if (b.delta > 0) {
    const ratio = referenceAmount > 0 ? b.user_spending / referenceAmount : 2
    if (ratio > 1.3) {
      barColor = 'bg-red-400'
      textColor = 'text-red-600'
    } else {
      barColor = 'bg-amber-400'
      textColor = 'text-amber-600'
    }
  }

  return (
    <div className={`rounded-xl border bg-white ${compact ? 'border-zinc-100 p-3' : 'border-zinc-200 p-4'}`}>
      <div className="flex items-center justify-between">
        <p className={`font-medium text-zinc-900 ${compact ? 'text-xs' : 'text-sm'}`}>
          {b.nibud_category_name}
        </p>
        <div className="flex items-center gap-3">
          {b.delta !== 0 && (
            <span className={`text-xs font-semibold ${textColor}`}>
              {b.delta > 0 ? '+' : ''}&euro;{Math.abs(Math.round(b.delta))}/mnd
            </span>
          )}
          {b.freedom_days_potential > 0 && (
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
              +{b.freedom_days_potential} dagen/jaar
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2 space-y-1">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(userPct, 100)}%` }}
          />
          <div
            className="absolute top-0 h-full w-0.5 bg-zinc-400"
            style={{ left: `${Math.min(refPct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-zinc-400">
          <span>Jij: &euro;{Math.round(b.user_spending)}/mnd</span>
          <span>NIBUD: &euro;{Math.round(referenceAmount)}/mnd</span>
        </div>
      </div>

      {/* Budget link — only for rows with a linked budget */}
      {!compact && b.mapped_budget_id && (
        <div className="mt-3">
          <a
            href={`/core/budgets?budget=${b.mapped_budget_id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
          >
            <ArrowRight className="h-3 w-3" />
            Bekijk budget
          </a>
        </div>
      )}
    </div>
  )
}
