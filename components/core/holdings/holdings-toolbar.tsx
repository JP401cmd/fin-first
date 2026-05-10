'use client'

/**
 * Toolbar boven de holdings-lijst — vervangt de oude action-bar bovenaan
 * /core/assets/holdings. Drie groepen:
 *   - Sortering (default: gewicht aflopend; Sharesight/Empower-conventie).
 *   - Filter-chips per asset-class (alleen tonen wat de gebruiker écht heeft).
 *   - Acties (refresh prijzen, CSV import, holding toevoegen).
 *
 * Geen zoekveld in default — de skill stelt zoeken pas voor bij >25 items
 * (`ui-ux.md` "Search, filter, sort"). Onze gemiddelde gebruiker heeft <20
 * holdings; chips + sort dekken het.
 */

import Link from 'next/link'
import { Plus, RefreshCw, Upload } from 'lucide-react'
import { Kicker } from '@/components/editorial'

export type SortKey = 'weight' | 'return' | 'today' | 'alpha'
export type AssetClassFilter = 'all' | 'investment' | 'crypto'

export const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'weight', label: 'Gewicht' },
  { key: 'return', label: 'Rendement' },
  { key: 'today', label: 'Vandaag' },
  { key: 'alpha', label: 'A–Z' },
]

export type HoldingsToolbarProps = {
  totalCount: number
  filteredCount: number
  sort: SortKey
  onSortChange: (s: SortKey) => void
  filter: AssetClassFilter
  onFilterChange: (f: AssetClassFilter) => void
  /** Welke filter-chips zinvol zijn (loader-context). 'all' verschijnt altijd. */
  availableClasses: AssetClassFilter[]
  refreshing: boolean
  onRefresh: () => void
  onAdd: () => void
}

export function HoldingsToolbar({
  totalCount,
  filteredCount,
  sort,
  onSortChange,
  filter,
  onFilterChange,
  availableClasses,
  refreshing,
  onRefresh,
  onAdd,
}: HoldingsToolbarProps) {
  const showFiltered = filteredCount !== totalCount
  return (
    <div className="space-y-3">
      {/* Bovenste rij: kicker links, primaire acties rechts */}
      <div className="flex items-center justify-between gap-3">
        <Kicker>
          Holdings · {showFiltered ? `${filteredCount}/${totalCount}` : totalCount} actief
        </Kicker>
        <div className="flex items-center gap-1">
          <ToolbarButton
            onClick={onRefresh}
            disabled={refreshing}
            label={refreshing ? 'Vernieuwen…' : 'Prijzen'}
            icon={
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              />
            }
            testid="refresh-prices-btn"
          />
          <ToolbarLink
            href="/core/assets/holdings/import"
            label="CSV"
            icon={<Upload className="h-3.5 w-3.5" />}
          />
          <ToolbarButton
            onClick={onAdd}
            label="Toevoegen"
            icon={<Plus className="h-3.5 w-3.5" />}
            primary
          />
        </div>
      </div>

      {/* Onderste rij: filter-chips + sort */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Filter op type">
          {availableClasses.map((c) => {
            const active = c === filter
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onFilterChange(c)}
                className={`min-h-[32px] px-2.5 py-1 text-[11px] font-mono font-semibold uppercase tracking-[0.12em] border transition-colors ${
                  active
                    ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                    : 'bg-transparent text-[var(--ink-3)] border-[var(--rule-soft)] hover:text-[var(--ink-2)] hover:border-[var(--ink-3)]'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {labelFor(c)}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
            Sort
          </span>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            className="min-h-[32px] px-2 py-1 text-[11px] font-mono font-semibold uppercase tracking-[0.12em] border border-[var(--rule-soft)] bg-transparent text-[var(--ink-2)] focus:border-[var(--ink)] focus:outline-none"
            aria-label="Sortering"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

function labelFor(c: AssetClassFilter): string {
  if (c === 'all') return 'Alles'
  if (c === 'investment') return 'Aandelen/ETF'
  return 'Crypto'
}

function ToolbarButton({
  onClick,
  disabled,
  label,
  icon,
  primary = false,
  testid,
}: {
  onClick: () => void
  disabled?: boolean
  label: string
  icon: React.ReactNode
  primary?: boolean
  testid?: string
}) {
  const base =
    'inline-flex items-center gap-1.5 min-h-[32px] px-2.5 py-1 text-[11px] font-mono font-semibold uppercase tracking-[0.12em] border transition-colors disabled:opacity-50'
  const classes = primary
    ? `${base} bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)] hover:bg-[var(--ink-2)]`
    : `${base} bg-transparent text-[var(--ink-2)] border-[var(--rule-soft)] hover:text-[var(--ink)] hover:border-[var(--ink-3)]`
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={classes}
      data-testid={testid}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function ToolbarLink({
  href,
  label,
  icon,
}: {
  href: string
  label: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 py-1 text-[11px] font-mono font-semibold uppercase tracking-[0.12em] border bg-transparent text-[var(--ink-2)] border-[var(--rule-soft)] hover:text-[var(--ink)] hover:border-[var(--ink-3)] transition-colors"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  )
}
