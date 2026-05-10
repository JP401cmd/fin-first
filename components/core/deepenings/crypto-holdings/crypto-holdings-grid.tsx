'use client'

// crypto-holdings-grid.tsx — sorteerbare/filterbare lijst van crypto-coin
// kaarten + compacte tabel-variant. Mirror van de view-toggle op de
// investment Holdings-app (`Lijst / Heatmap`); voor crypto kiezen we voor
// `Kaarten / Tabel` omdat een treemap-heatmap voor ≤50 coins weinig
// informatie geeft die de cards al niet bieden.
//
// Sortering: waarde / symbol / rendement / units. Standaard waarde-aflopend.
// Filter: optionele bron-filter via prop (host-controlled — zie
// `crypto-source-breakdown.tsx` voor de selectie-UI).

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDownAZ, ArrowDownWideNarrow, LayoutGrid, List, TrendingUp, Hash } from 'lucide-react'
import type { CryptoHoldingRow, CryptoSparklinePoint } from '@/lib/crypto-holdings-data'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { OVERLAY_QUERY_KEYS } from '@/lib/navigation'
import { CryptoHoldingCard } from '@/components/holdings/crypto-holding-card'
import { CryptoSparkline } from '@/components/holdings/crypto-sparkline'
import { labelForSource } from './crypto-source-breakdown'

export type CryptoSortKey = 'value' | 'symbol' | 'return' | 'units'
export type CryptoViewMode = 'cards' | 'table'

interface CryptoHoldingsGridProps {
  holdings: CryptoHoldingRow[]
  sortKey: CryptoSortKey
  onSortChange: (key: CryptoSortKey) => void
  viewMode: CryptoViewMode
  onViewModeChange: (mode: CryptoViewMode) => void
  /** Optionele bron-filter — alleen holdings waarvan `labelForSource()` matcht. */
  sourceFilter?: string | null
  /**
   * Per holding-ID een chronologisch gesorteerde 7-daagse close-prijs reeks.
   * Wordt server-side geladen via `loadCryptoSparklineData`. Holdings die
   * ontbreken in de map → tabel toont een neutrale streep (geen data). De
   * prop is optioneel zodat oudere call-sites zonder sparkline-data blijven
   * werken; alleen de tabel-view gebruikt hem.
   */
  sparklinesByHoldingId?: Record<string, CryptoSparklinePoint[]>
}

export function CryptoHoldingsGrid({
  holdings,
  sortKey,
  onSortChange,
  viewMode,
  onViewModeChange,
  sourceFilter,
  sparklinesByHoldingId,
}: CryptoHoldingsGridProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Open de coin-detail pane door alleen `?crypto=<id>` aan de URL toe te
  // voegen — overige query-state (bv. `?tab=crypto-holdings` of een actieve
  // `?source=…`-filter) blijft bestaan. `router.replace` ipv `push` zodat
  // schakelen tussen coins niet de history vervuilt; de pane-open zelf is
  // dan één history-entry, ongeacht hoeveel coins de gebruiker bekijkt
  // voordat ze sluiten. Bewust gedeeld tussen card-view en table-view zodat
  // het gedrag gegarandeerd identiek is.
  const openHolding = useCallback(
    (holding: CryptoHoldingRow) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(OVERLAY_QUERY_KEYS.cryptoHolding, holding.id)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const filtered = useMemo(() => {
    if (!sourceFilter) return holdings
    return holdings.filter((h) => labelForSource(h) === sourceFilter)
  }, [holdings, sourceFilter])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    switch (sortKey) {
      case 'value':
        arr.sort((a, b) => b.valueEur - a.valueEur)
        break
      case 'symbol':
        arr.sort((a, b) => a.symbol.localeCompare(b.symbol))
        break
      case 'return':
        // Holdings zonder rendement-data zakken naar onder.
        arr.sort((a, b) => (b.returnPct ?? -Infinity) - (a.returnPct ?? -Infinity))
        break
      case 'units':
        arr.sort((a, b) => b.units - a.units)
        break
    }
    return arr
  }, [filtered, sortKey])

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          {sorted.length} {sorted.length === 1 ? 'positie' : 'posities'}
          {sourceFilter && (
            <>
              <span className="mx-1.5 text-[var(--ink-3)]">·</span>
              <span className="text-kern-700">filter: {sourceFilter}</span>
            </>
          )}
        </p>
        <div className="flex items-center gap-3">
          <SortControl sortKey={sortKey} onSortChange={onSortChange} />
          <ViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
        </div>
      </div>

      {sorted.length === 0 ? (
        <FilteredEmptyState hasFilter={!!sourceFilter} />
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((h, idx) => (
            <CryptoHoldingCard
              key={h.id}
              holding={h}
              staggerIndex={idx}
              onClick={openHolding}
            />
          ))}
        </div>
      ) : (
        <CryptoHoldingsTable
          holdings={sorted}
          sparklinesByHoldingId={sparklinesByHoldingId}
          onOpenHolding={openHolding}
        />
      )}
    </section>
  )
}

// ── Sort control ─────────────────────────────────────────────────────────

interface SortControlProps {
  sortKey: CryptoSortKey
  onSortChange: (key: CryptoSortKey) => void
}

function SortControl({ sortKey, onSortChange }: SortControlProps) {
  return (
    <div
      className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]"
      role="group"
      aria-label="Sortering"
    >
      <span>Sorteer</span>
      <SortButton active={sortKey === 'value'} onClick={() => onSortChange('value')} icon={ArrowDownWideNarrow}>
        Waarde
      </SortButton>
      <SortButton active={sortKey === 'return'} onClick={() => onSortChange('return')} icon={TrendingUp}>
        Rendement
      </SortButton>
      <SortButton active={sortKey === 'symbol'} onClick={() => onSortChange('symbol')} icon={ArrowDownAZ}>
        Symbool
      </SortButton>
      <SortButton active={sortKey === 'units'} onClick={() => onSortChange('units')} icon={Hash}>
        Units
      </SortButton>
    </div>
  )
}

interface SortButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}

function SortButton({ active, onClick, icon: Icon, children }: SortButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1 px-2 transition-colors ${
        active
          ? 'bg-kern-100 text-kern-800'
          : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
      }`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {children}
    </button>
  )
}

// ── View toggle ──────────────────────────────────────────────────────────

interface ViewToggleProps {
  viewMode: CryptoViewMode
  onViewModeChange: (mode: CryptoViewMode) => void
}

function ViewToggle({ viewMode, onViewModeChange }: ViewToggleProps) {
  return (
    <div
      className="flex items-center gap-0.5 bg-[var(--subtle)] p-0.5"
      role="group"
      aria-label="Weergave"
    >
      <ToggleBtn active={viewMode === 'cards'} onClick={() => onViewModeChange('cards')} label="Kaarten">
        <LayoutGrid className="h-3 w-3" aria-hidden="true" />
        <span>Kaarten</span>
      </ToggleBtn>
      <ToggleBtn active={viewMode === 'table'} onClick={() => onViewModeChange('table')} label="Tabel">
        <List className="h-3 w-3" aria-hidden="true" />
        <span>Tabel</span>
      </ToggleBtn>
    </div>
  )
}

function ToggleBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1 px-2 text-[11px] font-medium transition-colors ${
        active ? 'bg-kern-600 text-white' : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
      }`}
    >
      {children}
    </button>
  )
}

// ── Table view ───────────────────────────────────────────────────────────

interface CryptoHoldingsTableProps {
  holdings: CryptoHoldingRow[]
  /** Per-holding sparkline-data; ontbrekende keys → neutrale streep. */
  sparklinesByHoldingId?: Record<string, CryptoSparklinePoint[]>
  /**
   * Click-handler die de coin-detail pane opent — gedeeld met de card-view
   * zodat beide weergaven exact hetzelfde gedrag hebben (URL-state
   * `?crypto=<id>` via `router.replace`).
   */
  onOpenHolding: (holding: CryptoHoldingRow) => void
}

function CryptoHoldingsTable({
  holdings,
  sparklinesByHoldingId,
  onOpenHolding,
}: CryptoHoldingsTableProps) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border-ed)]">
            <th className="py-2 pr-3 text-left text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Coin
            </th>
            <th className="py-2 px-3 text-left text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Bron
            </th>
            <th className="py-2 px-3 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Units
            </th>
            <th className="py-2 px-3 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Prijs
            </th>
            {/* "7 dagen" — visuele trend tussen Prijs (ruwe waarde) en
                Rendement (uitkomst-cijfer). Linksuitgelijnd binnen een vaste
                kolombreedte zodat alle sparklines visueel uitlijnen. */}
            <th className="py-2 px-3 text-left text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)] w-[80px]">
              7 dagen
            </th>
            <th className="py-2 px-3 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Rendement
            </th>
            <th className="py-2 pl-3 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Waarde
            </th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const display = h.name?.trim() || h.symbol
            const sourceLabel = labelForSource(h)
            // Fiat-balansen krijgen geen sparkline (geen koers, geen trend).
            // Coins zonder data in de map → lege array → component rendert
            // zelf de neutrale streep.
            const sparklineData = h.isFiatBalance
              ? []
              : (sparklinesByHoldingId?.[h.id] ?? [])
            return (
              <tr
                key={h.id}
                onClick={() => onOpenHolding(h)}
                className="cursor-pointer border-b border-[var(--border-ed)] transition-colors hover:bg-[var(--subtle)]"
              >
                <td className="py-2 pr-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[12px] font-bold tabular-nums text-[var(--ink)]">
                      {h.symbol.toUpperCase()}
                    </span>
                    <span className="truncate text-[11px] text-[var(--ink-3)]">
                      {h.isFiatBalance ? `Cash · ${sourceLabel}` : display}
                    </span>
                  </div>
                </td>
                <td className="py-2 px-3 text-[11px] text-[var(--ink-3)]">
                  <span className="truncate">{sourceLabel}</span>
                </td>
                <td className="py-2 px-3 text-right font-mono text-[12px] tabular-nums text-[var(--ink-2)]">
                  {h.isFiatBalance ? '—' : formatUnitsCompact(h.units)}
                </td>
                <td className="py-2 px-3 text-right font-mono text-[12px] tabular-nums text-[var(--ink-2)]">
                  {h.currentPrice != null ? fc(h.currentPrice) : '—'}
                </td>
                <td className="py-2 px-3 align-middle">
                  {h.isFiatBalance ? (
                    <span className="text-[11px] text-[var(--ink-4)]">—</span>
                  ) : (
                    <CryptoSparkline data={sparklineData} />
                  )}
                </td>
                <td
                  className={`py-2 px-3 text-right font-mono text-[12px] tabular-nums ${
                    h.returnPct == null
                      ? 'text-[var(--ink-4)]'
                      : h.returnPct >= 0
                        ? 'text-positive'
                        : 'text-negative'
                  }`}
                >
                  {h.returnPct != null
                    ? `${h.returnPct >= 0 ? '+' : ''}${h.returnPct.toFixed(1)}%`
                    : '—'}
                </td>
                <td className="py-2 pl-3 text-right font-mono text-[12px] font-bold tabular-nums text-[var(--ink)]">
                  {fc(h.valueEur)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function formatUnitsCompact(units: number): string {
  if (!isFinite(units)) return '0'
  const decimals = Math.abs(units) >= 1 ? 4 : 6
  return units.toFixed(decimals).replace(/\.?0+$/, '')
}

function FilteredEmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8 text-center">
      <p className="font-serif italic text-base text-[var(--ink-2)]">
        {hasFilter
          ? 'Geen posities die aan deze bron-filter voldoen.'
          : 'Geen posities om weer te geven.'}
      </p>
    </div>
  )
}
