'use client'

/**
 * Holding-rij volgens mini-artikel-blueprint (ui-ux skill r96–103):
 *   - 3px module-accent-streep boven (alleen bij stale of soldout vervangen
 *     door waarschuwings-streep; standaard module-active-500).
 *   - Kicker-rij: ticker + UPPERCASE label in mono · gewicht% portfolio.
 *   - Headline: holding-naam in Playfair 16-18px.
 *   - Hoofdbedrag: marktwaarde in DM Mono 18-22px tabular-nums, met
 *     highlight-marker bij positieve outlier-prestatie (top 3 winnaars).
 *   - KPI-strip: dag-Δ% + totaal-rendement%.
 *   - Meta-regel: italic Source Serif 4 met units · valuta-badge.
 *
 * Acties (transactie / edit / delete) zitten achter een ⋯-menu rechts;
 * default zichtbaar is alleen de rij + chevron-affordance via hover.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle,
  Edit3,
  MoreHorizontal,
  Receipt,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { HighlightMark } from '@/components/editorial'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

export type HoldingRowData = {
  id: string
  name: string
  ticker: string | null
  units: number
  currentPrice: number
  avgPurchasePrice: number
  currency: string | null
  dailyChangePercent: number | null
  lastPriceUpdate: string | null
  isStale: boolean
  /** Top-3 winnaar in portfolio → krijgt highlight-marker op marktwaarde. */
  isWinner: boolean
}

export type HoldingRowProps = {
  holding: HoldingRowData
  /** Gewicht in portfolio (0–100). */
  weightPct: number
  /** Geformatteerde marktwaarde-string (masking-aware uit parent). */
  formattedValue: string
  formatLastUpdate: (s: string | null) => string
  onTransaction: () => void
  onEdit: () => void
  onDelete: () => void
  onManualOverride: () => void
}

export function HoldingRow({
  holding,
  weightPct,
  formattedValue,
  formatLastUpdate,
  onTransaction,
  onEdit,
  onDelete,
  onManualOverride,
}: HoldingRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Sluit het menu bij click-outside / Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setConfirmDelete(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setConfirmDelete(false)
      }
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const soldOut = holding.units <= 0
  const cost = holding.avgPurchasePrice * Math.max(0, holding.units)
  const value = holding.currentPrice * Math.max(0, holding.units)
  const returnPct = cost > 0 ? ((value - cost) / cost) * 100 : 0

  // Accent-streep kleur — module-active default; stale = waarschuwing; soldout = neutraal.
  const accentStyle = soldOut
    ? { background: 'var(--ink-4)' }
    : holding.isStale
      ? { background: 'var(--module-active-300)' }
      : { background: 'var(--module-active-500)' }

  return (
    <article
      className={`relative bg-[var(--paper)] border border-[var(--border-ed)] transition-colors hover:bg-[var(--subtle)]/40 ${
        soldOut ? 'opacity-70' : ''
      }`}
      data-testid={`holding-item-${holding.id}`}
      data-sold-out={soldOut ? 'true' : 'false'}
      data-units={Math.max(0, holding.units)}
    >
      {/* 3px accent-streep boven — module-aware */}
      <div aria-hidden className="h-[3px] w-full" style={accentStyle} />

      <div className="flex items-stretch">
        <Link
          href={`/core/assets/holdings/${holding.id}`}
          className="flex-1 min-w-0 px-4 py-3 sm:py-3.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]"
          data-testid={`holding-link-${holding.id}`}
        >
          {/* Kicker-rij: ticker · gewicht% · status-badge */}
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
            {holding.ticker && (
              <span className="font-semibold">{holding.ticker}</span>
            )}
            {holding.ticker && weightPct > 0 && (
              <span aria-hidden className="text-[var(--ink-4)]">·</span>
            )}
            {weightPct > 0 && (
              <span className="text-[var(--ink-3)] tabular-nums">
                {weightPct.toFixed(1)}% portfolio
              </span>
            )}
            {soldOut && <StatusBadge kind="soldout" />}
            {!soldOut && holding.isStale && (
              <StatusBadge
                kind="stale"
                title={`Laatste update: ${formatLastUpdate(holding.lastPriceUpdate)}`}
              />
            )}
          </div>

          {/* Headline + bedrag-rij */}
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <h3
              className="truncate text-[16px] sm:text-[18px] font-bold leading-tight text-[var(--ink)]"
              style={{ fontFamily: PLAYFAIR }}
            >
              {holding.name}
            </h3>
            <p
              className={`shrink-0 font-mono tabular-nums text-[18px] sm:text-[20px] font-bold leading-tight ${
                soldOut ? 'text-[var(--ink-3)]' : 'text-[var(--ink)]'
              }`}
              data-testid={`holding-value-${holding.id}`}
            >
              {holding.isWinner && !soldOut ? (
                <HighlightMark>{formattedValue}</HighlightMark>
              ) : (
                formattedValue
              )}
            </p>
          </div>

          {/* KPI-strip: dag-Δ + totaal-rendement */}
          {!soldOut && (
            <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px] tabular-nums">
              <div className="flex items-center gap-3">
                {holding.dailyChangePercent !== null && (
                  <span
                    className={`font-mono font-semibold ${
                      holding.dailyChangePercent >= 0
                        ? 'text-positive'
                        : 'text-negative'
                    }`}
                    data-testid={`holding-daily-change-${holding.id}`}
                  >
                    {holding.dailyChangePercent >= 0 ? '▲' : '▼'}{' '}
                    {holding.dailyChangePercent >= 0 ? '+' : ''}
                    {holding.dailyChangePercent.toFixed(2)}% vandaag
                  </span>
                )}
                {cost > 0 && (
                  <span
                    className={`font-mono ${
                      returnPct >= 0 ? 'text-positive' : 'text-negative'
                    }`}
                  >
                    {returnPct >= 0 ? '+' : ''}
                    {returnPct.toFixed(1)}% sinds aankoop
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Meta-regel — italic Source Serif */}
          <p
            className="mt-1 truncate italic text-[12px] text-[var(--ink-3)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            {soldOut ? '0 eenheden' : `${holding.units} eenheden`}
            {holding.currency && holding.currency !== 'EUR' && (
              <> · noteert in {holding.currency}</>
            )}
            {holding.isStale && holding.lastPriceUpdate && (
              <> · prijs van {formatLastUpdate(holding.lastPriceUpdate)}</>
            )}
            {holding.isStale && !holding.lastPriceUpdate && (
              <> · prijs nooit bijgewerkt</>
            )}
          </p>
        </Link>

        {/* ⋯-menu rechts — verbergt de 3-4 acties achter één touch-target */}
        <div ref={menuRef} className="relative shrink-0 border-l border-[var(--border-ed)] flex items-stretch">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
              setConfirmDelete(false)
            }}
            aria-label="Holding-acties"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="px-3 sm:px-4 flex items-center justify-center text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--subtle)] transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 w-[200px] bg-[var(--paper)] border border-[var(--ink)] shadow-[2px_2px_0_var(--ink)]"
              data-testid={`holding-actions-${holding.id}`}
            >
              <MenuItem
                icon={<Receipt className="h-3.5 w-3.5" />}
                label="Transactie loggen"
                onClick={() => {
                  setMenuOpen(false)
                  onTransaction()
                }}
              />
              {holding.isStale && (
                <MenuItem
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  label="Prijs handmatig"
                  onClick={() => {
                    setMenuOpen(false)
                    onManualOverride()
                  }}
                  testid="manual-override-btn"
                />
              )}
              <MenuItem
                icon={<Edit3 className="h-3.5 w-3.5" />}
                label="Bewerken"
                onClick={() => {
                  setMenuOpen(false)
                  onEdit()
                }}
              />
              <div className="border-t border-[var(--rule-soft)]" />
              {confirmDelete ? (
                <div className="p-2 text-[11px]">
                  <p
                    className="italic text-[var(--ink-2)] mb-2 leading-snug"
                    style={{ fontFamily: SOURCE_SERIF }}
                  >
                    Weet je het zeker?
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        setConfirmDelete(false)
                        onDelete()
                      }}
                      className="flex-1 min-h-[28px] text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--paper)] bg-[var(--negative)] hover:opacity-90 transition-opacity border border-[var(--negative)]"
                      data-testid={`delete-confirm-${holding.id}`}
                    >
                      Verwijder
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 min-h-[28px] text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-[var(--ink-2)] bg-transparent border border-[var(--rule-soft)] hover:border-[var(--ink-3)]"
                    >
                      Nee
                    </button>
                  </div>
                </div>
              ) : (
                <MenuItem
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  label="Verwijderen"
                  onClick={() => setConfirmDelete(true)}
                  destructive
                  testid={`delete-trigger-${holding.id}`}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive = false,
  testid,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  destructive?: boolean
  testid?: string
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      data-testid={testid}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-[var(--subtle)] transition-colors ${
        destructive ? 'text-[var(--negative)]' : 'text-[var(--ink-2)]'
      }`}
    >
      <span aria-hidden className="shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function StatusBadge({
  kind,
  title,
}: {
  kind: 'soldout' | 'stale'
  title?: string
}) {
  if (kind === 'soldout') {
    return (
      <span
        className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold border border-[var(--ink-3)] text-[var(--ink-3)]"
        data-testid="sold-out-indicator"
      >
        <CheckCircle className="h-2.5 w-2.5" />
        Uitverkocht
      </span>
    )
  }
  return (
    <span
      className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold border border-[var(--module-active-300)] text-[var(--module-active-700)]"
      title={title}
      data-testid="stale-indicator"
    >
      <AlertTriangle className="h-2.5 w-2.5" />
      Verouderd
    </span>
  )
}
