'use client'

// crypto-holding-card.tsx — kaart voor één crypto-coin op
// `/core/assets/crypto`. Vervangt het oude pad waarbij één enkele
// portfolio-asset werd getoond; nu staat elke BTC/ETH/ADA-positie als
// eigen kaart met bron-badge, plug-status en EUR-waarde.
//
// Layout-mantra: links coin-icoon, midden symbol+naam (+chain bij wallet)
// + bron-badge, rechts EUR-waarde + units. Krant-esthetiek (scherpe
// hoeken, mono tabular-nums voor cijfers, var(--ink-*) tokens).
//
// Bijzonderheden:
//   - Fiat-saldi (EUR/USD/GBP bij Bitvavo) krijgen een speciale "Cash bij
//     {bron}" weergave — geen koers, geen "units", alleen het bedrag.
//   - Hover/focus volgt het card-editorial patroon: subtiele lift +
//     border-md kleur. Identiek aan VermogenAssetCard zodat de twee
//     varianten naast elkaar (mochten ze dat ooit doen) niet uit toon
//     vallen.

import { Bitcoin, Coins, Euro, type LucideIcon } from 'lucide-react'
import { useFlashChange } from '@/lib/hooks/use-flash-change'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { CryptoHoldingRow } from '@/lib/crypto-holdings-data'
import { HoldingSourceBadge } from './holding-source-badge'

// ── Coin-icon mapping ───────────────────────────────────────────────────
//
// Lucide heeft geen breed crypto-iconen-arsenaal; we mappen alleen de
// meest voorkomende symbolen op een herkenbaar icoon en vallen voor de
// rest terug op de generieke `Coins`. Stabiele top-level Records houden
// de icon-referenties identiek per render (`react-hooks/static-components`
// vriendelijk) — een dynamische `pickCoinIcon()` functie zou de linter
// terecht waarschuwen omdat hij de return-stabiliteit niet kan bewijzen.
const FIAT_ICON: LucideIcon = Euro
const CRYPTO_ICON_BY_SYMBOL: Record<string, LucideIcon> = {
  BTC: Bitcoin,
}
const DEFAULT_CRYPTO_ICON: LucideIcon = Coins

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Render units met genoeg precisie om kleine fracties leesbaar te houden,
 * zonder de kaart vol te plempen met nullen. Strategie:
 *   - >= 1   → 4 decimalen (BTC 0.1234)
 *   - < 1    → 6 decimalen (kleinere altcoins)
 * Trailing-zeros worden weggesneden — krantconventie: geen ruis.
 */
function formatUnits(units: number): string {
  if (!isFinite(units)) return '0'
  const decimals = Math.abs(units) >= 1 ? 4 : 6
  const fixed = units.toFixed(decimals)
  return fixed.replace(/\.?0+$/, '')
}

// ── Component ───────────────────────────────────────────────────────────

interface CryptoHoldingCardProps {
  holding: CryptoHoldingRow
  /** Stagger (60ms per kaart) voor de fade-up entrance. */
  staggerIndex?: number
  onClick?: (holding: CryptoHoldingRow) => void
  /**
   * Visuele dichtheid. `default` toont de kaart zoals op de items-grid van
   * de categoriepagina (3px accent-bar, padding, bron-badge). `compact`
   * verbergt de accent-bar en bron-badge en verkleint de padding — bedoeld
   * voor lijstweergave binnen een asset-detail-sheet waar de bron al uit
   * de context blijkt en verticale ruimte schaars is.
   */
  size?: 'default' | 'compact'
}

export function CryptoHoldingCard({
  holding,
  staggerIndex = 0,
  onClick,
  size = 'default',
}: CryptoHoldingCardProps) {
  const { flashClass } = useFlashChange(holding.valueEur)
  const Icon = holding.isFiatBalance
    ? FIAT_ICON
    : (CRYPTO_ICON_BY_SYMBOL[holding.symbol.toUpperCase()] ?? DEFAULT_CRYPTO_ICON)

  const isCompact = size === 'compact'

  const displayName = holding.name?.trim() || holding.symbol
  const sourceLabel =
    holding.source.kind === 'exchange'
      ? holding.source.exchangeLabel
      : holding.source.kind === 'wallet'
        ? `${holding.source.walletChain} · ${holding.source.walletAddressMask}`
        : null

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
          <Icon
            className={isCompact ? 'h-3.5 w-3.5 text-kern-600' : 'h-4 w-4 text-kern-600'}
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <p className="font-mono text-sm font-bold tabular-nums text-[var(--ink)]">
              {holding.symbol}
            </p>
            <p className="truncate text-[11px] text-[var(--ink-3)]">
              {holding.isFiatBalance ? `Cash bij ${sourceLabel ?? 'exchange'}` : displayName}
            </p>
          </div>
          {!isCompact && (
            <div className="mt-1.5 flex items-center gap-2">
              <HoldingSourceBadge
                source={holding.source}
                lastSyncedAt={holding.lastSyncedAt}
                lastSyncError={holding.lastSyncError}
              />
            </div>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className={`text-[var(--ink)] ${flashClass}`}>
            <MaskedAmount value={holding.valueEur} tone="kern" className="text-sm font-bold" />
          </p>
          {!holding.isFiatBalance && (
            <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
              {formatUnits(holding.units)} {holding.symbol}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}
