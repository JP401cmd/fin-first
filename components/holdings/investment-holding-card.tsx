'use client'

// investment-holding-card.tsx — kaart voor één aandeel/ETF/obligatie-positie
// op `/core/assets/investment`. Volgt strikt het krant-card-patroon van de
// crypto-variant (CryptoHoldingCard) zodat een gebruiker tussen de twee
// categoriepagina's geen visueel breukvlak voelt.
//
// Layout: links instrument-icoon, midden ticker + naam (+ ISIN-mono), rechts
// EUR-waarde + units + optionele dag-rendement-indicator. Krant-esthetiek
// met scherpe hoeken en mono tabular-nums voor alle cijfers.

import { Activity, TrendingUp, TrendingDown } from 'lucide-react'
import { useFlashChange } from '@/lib/hooks/use-flash-change'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { InvestmentHoldingRow } from '@/lib/investment-holdings-data'
import { HoldingSourceBadge, type HoldingSourceForBadge } from './holding-source-badge'

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Mask een ISIN voor compacte weergave: "NL0011540547" → "NL00…0547".
 * Behoudt de landcode (eerste 2 chars) en de check-digit zodat de
 * herkenbaarheid blijft, maar bespaart breedte op smalle kaarten.
 */
function formatIsinShort(isin: string): string {
  if (isin.length <= 8) return isin
  return `${isin.slice(0, 4)}…${isin.slice(-4)}`
}

/**
 * Render units. Posities zijn meestal heel — voor fractionele beleggingen
 * (bv. T212) toont 4 decimalen. Trailing zeros eraf om visuele ruis te
 * voorkomen.
 */
function formatUnits(units: number): string {
  if (!isFinite(units)) return '0'
  const decimals = Math.abs(units) >= 1 ? 2 : 4
  const fixed = units.toFixed(decimals)
  return fixed.replace(/\.?0+$/, '')
}

// ── Component ───────────────────────────────────────────────────────────

interface InvestmentHoldingCardProps {
  holding: InvestmentHoldingRow
  staggerIndex?: number
  onClick?: (holding: InvestmentHoldingRow) => void
  /**
   * Visuele dichtheid (zie CryptoHoldingCard). `compact` verbergt accent-bar,
   * ISIN-snippet en bron-badge zodat de kaart in een dichte detail-lijst past.
   */
  size?: 'default' | 'compact'
}

export function InvestmentHoldingCard({
  holding,
  staggerIndex = 0,
  onClick,
  size = 'default',
}: InvestmentHoldingCardProps) {
  const { flashClass } = useFlashChange(holding.valueEur)

  const isCompact = size === 'compact'
  const displayName = holding.name?.trim() || holding.ticker
  const dayChange = holding.dailyChangePercent

  const source: HoldingSourceForBadge = holding.externalSource
    ? { kind: 'csv', broker: holding.externalSource }
    : { kind: 'manual' }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(holding)
      }}
      className="card-editorial animate-fade-up w-full text-left"
      style={{ '--stagger': `${staggerIndex * 60}ms` } as React.CSSProperties}
    >
      {!isCompact && <div className="h-[3px] w-full bg-kern-500" />}

      <div
        className={
          isCompact
            ? 'flex items-center gap-2.5 px-3 py-2'
            : 'flex items-center gap-3 p-3 sm:p-4'
        }
      >
        <div
          className={`flex shrink-0 items-center justify-center bg-[var(--subtle)] ${
            isCompact ? 'h-6 w-6' : 'h-7 w-7'
          }`}
        >
          <Activity
            className={isCompact ? 'h-3.5 w-3.5 text-kern-600' : 'h-4 w-4 text-kern-600'}
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <p className="font-mono text-sm font-bold tabular-nums text-[var(--ink)]">
              {holding.ticker}
            </p>
            <p className="truncate text-[11px] text-[var(--ink-3)]">{displayName}</p>
          </div>
          {!isCompact && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {holding.isin && (
                <span className="font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
                  {formatIsinShort(holding.isin)}
                </span>
              )}
              <HoldingSourceBadge source={source} />
            </div>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className={`text-[var(--ink)] ${flashClass}`}>
            <MaskedAmount value={holding.valueEur} tone="kern" className="text-sm font-bold" />
          </p>
          <div className="mt-0.5 flex items-center justify-end gap-1.5">
            <p className="font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
              {formatUnits(holding.units)} st.
            </p>
            {dayChange != null && Math.abs(dayChange) >= 0.01 && (
              <span
                className={`inline-flex items-center gap-0.5 font-mono text-[10px] tabular-nums ${
                  dayChange >= 0 ? 'text-positive' : 'text-negative'
                }`}
                title={`Dagverandering: ${dayChange >= 0 ? '+' : ''}${dayChange.toFixed(2)}%`}
              >
                {dayChange >= 0 ? (
                  <TrendingUp className="h-2.5 w-2.5" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-2.5 w-2.5" aria-hidden="true" />
                )}
                {dayChange >= 0 ? '+' : ''}
                {dayChange.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
