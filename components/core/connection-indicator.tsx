'use client'

// Uniform indicator-symbool dat op een bezittings- of schuld-kaart laat zien
// dat het item via een externe API automatisch wordt bijgewerkt. Klein, krant-
// stijl, status-bewust:
//   - default → ink-3 (subtiel maar zichtbaar)
//   - stale  → warning (>24u oud)
//   - error  → negative (sync-fout)
//   - never  → ink-4 (nog niet gesynchroniseerd)
//
// Vervangt de eerdere `AssetConnectionBadge` met source-pill (BVO/BTC/...).
// Source-info blijft beschikbaar in de tooltip én op de asset-edit-pagina via
// de volledige `ConnectionCard`. Op de kaart zelf is het symbool de enige
// signaal — schoner scanpatroon over een lange lijst.

import { Plug } from 'lucide-react'
import {
  computeFreshness,
  type AssetConnectionSummary,
  type FreshnessStatus,
  type ExchangeId,
  type WalletChain,
} from '@/lib/connections-data'
import { formatAmsterdamShortDate } from '@/lib/tz'

// ── Display-mappings ─────────────────────────────────────────

const EXCHANGE_LABEL: Record<ExchangeId, string> = {
  bitvavo: 'Bitvavo',
  kraken: 'Kraken',
  coinbase: 'Coinbase',
}

const CHAIN_LABEL: Record<WalletChain, string> = {
  bitcoin: 'Bitcoin',
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  arbitrum: 'Arbitrum',
  base: 'Base',
  solana: 'Solana',
}

// Status-overrides op de icoon-kleur. Default valt terug op `--ink-3` zodat
// het symbool subtiel maar zichtbaar is binnen de bestaande inkt-hiërarchie.
const STATUS_COLOR_CLASS: Record<FreshnessStatus, string> = {
  fresh: 'text-[var(--ink-3)]',
  stale: 'text-[var(--warning,#d97706)]',
  error: 'text-negative',
  never: 'text-[var(--ink-4)]',
}

// Statuslabels in krant-toon (geen relatieve tijden, geen jargon).
const STATUS_LABEL: Record<FreshnessStatus, string> = {
  fresh: 'actueel',
  stale: 'verouderd',
  error: 'foutmelding',
  never: 'nog niet gesynchroniseerd',
}

// Tooltip-prefix per status — zie CLAUDE.md error-state regels: bij error
// vertelt de tooltip wat er fout is + wat de gebruiker kan doen.
const STATUS_HINT: Record<FreshnessStatus, string> = {
  fresh: '',
  stale: '',
  error: ' — open dit item om de verbinding te herstellen',
  never: '',
}

// ── Helpers ─────────────────────────────────────────────────

// Krant-stijl (HH:mm vandaag, d MMM dit jaar, d MMM yyyy ouder) staat in
// `lib/tz.ts` — altijd Amsterdamse tijd, nooit de lokale getters (#418-klasse).

// ── Props ───────────────────────────────────────────────────

type IndicatorSize = 'sm' | 'md'

interface ConnectionIndicatorProps {
  connection: AssetConnectionSummary
  /** `'sm'` voor compacte rijen (12px), `'md'` voor standaard kaarten (14px). */
  size?: IndicatorSize
  className?: string
}

// ── Component ───────────────────────────────────────────────

/**
 * Render een `Plug`-symbool wanneer er een actieve externe koppeling is.
 * Geen koppeling, of alleen een `connection`-object zonder exchange/wallet —
 * resultaat is `null`. De caller kan het component dus altijd onvoorwaardelijk
 * met optionele `connection` aanroepen zonder zelf gating te bouwen.
 */
export function ConnectionIndicator({
  connection,
  size = 'md',
  className = '',
}: ConnectionIndicatorProps) {
  // Resolve source-fields uit exchange of wallet (1-op-1 contract — maximaal
  // één van beide actief per asset/debt). Bij geen van beide rendert het
  // component niets, conform de "geen lege placeholder" UX-regel.
  let sourceLabel: string
  let lastSyncedAt: string | null
  let lastSyncError: string | null

  if (connection.exchange) {
    sourceLabel = EXCHANGE_LABEL[connection.exchange.exchange]
    lastSyncedAt = connection.exchange.lastSyncedAt
    lastSyncError = connection.exchange.lastSyncError
  } else if (connection.wallet) {
    sourceLabel = CHAIN_LABEL[connection.wallet.chain]
    lastSyncedAt = connection.wallet.lastSyncedAt
    lastSyncError = connection.wallet.lastSyncError
  } else {
    return null
  }

  const status = computeFreshness(lastSyncedAt, lastSyncError)
  const date = lastSyncedAt ? new Date(lastSyncedAt) : null
  const dateValid = date !== null && !Number.isNaN(date.getTime())

  // Tooltip-copy in krant-stijl: bron + status + (datum) — vermijdt relatieve
  // tijden ("2 uur geleden"). Bij error voegen we een korte hersteltip toe
  // zodat de gebruiker meteen weet wat te doen.
  const tooltip = dateValid && status !== 'never'
    ? `Automatisch gesynchroniseerd via ${sourceLabel} — ${STATUS_LABEL[status]} · bijgewerkt ${formatAmsterdamShortDate(date)}${STATUS_HINT[status]}`
    : `Automatisch gesynchroniseerd via ${sourceLabel} — ${STATUS_LABEL[status]}${STATUS_HINT[status]}`

  // 12px voor compacte rijen, 14px voor standaard kaarten — beide passen op
  // 44×44 touch-target wanneer de kaart-knop zelf het hele oppervlak heeft.
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'

  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      role="img"
      className={`inline-flex shrink-0 items-center justify-center ${STATUS_COLOR_CLASS[status]} ${className}`}
    >
      <Plug className={iconSize} aria-hidden="true" />
    </span>
  )
}
