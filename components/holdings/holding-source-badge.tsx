'use client'

// holding-source-badge.tsx — uniforme bron-badge voor crypto- en
// investment-holding-kaarten.
//
// Doel: één compacte indicator per kaart die in één blik vertelt
//   (a) waar deze positie vandaan komt (Bitvavo / Kraken / Coinbase /
//       wallet-chain / CSV-broker / handmatig)
//   (b) wat de status van die bron is (actueel / verouderd / fout / nooit
//       gesynchroniseerd) — geleend van de bestaande `ConnectionIndicator`
//       freshness-logica zodat status-symbolen consistent zijn over het
//       hele bezittingen-overzicht.
//
// Klikbaar:
//   - Exchange/wallet → /identity/koppelingen (focus via #connection-<id> hash)
//   - CSV-broker     → /core/assets/holdings/import
//   - Manual         → niet-klikbaar (en het component rendert niets, omdat
//                      handmatig invoer per definitie geen badge nodig heeft;
//                      caller mag conditioneel weglaten)
//
// Krant-esthetiek: scherpe hoeken, monochroom met subtiele bron-accent,
// max ~110px breed zodat de kaart een rechts-uitgelijnd EUR-bedrag visueel
// blijft domineren.

import Link from 'next/link'
import {
  Plug,
  Wallet,
  FileSpreadsheet,
  type LucideIcon,
} from 'lucide-react'
import {
  computeFreshness,
  type FreshnessStatus,
  type ExchangeId,
  type WalletChain,
} from '@/lib/connections-data'
import type { CryptoHoldingSource } from '@/lib/crypto-holdings-data'

// ── Display-mapping per bron ────────────────────────────────────────────

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

// CSV-broker labels uit `lib/parsers/broker-csv.ts` — hier alleen voor
// display, dus tolerant voor een onbekende waarde (fallback op raw string).
const CSV_BROKER_LABEL: Record<string, string> = {
  degiro: 'DEGIRO',
  saxo: 'Saxo',
  ing: 'ING',
  trading212: 'Trading 212',
  etoro: 'eToro',
}

// Status → icoon-kleur. Volgt dezelfde inkt-hiërarchie als
// `ConnectionIndicator` zodat een gebruiker snel scant op afwijkende kleur.
const STATUS_COLOR_CLASS: Record<FreshnessStatus, string> = {
  fresh: 'text-[var(--ink-3)]',
  stale: 'text-[var(--warning,#d97706)]',
  error: 'text-negative',
  never: 'text-[var(--ink-4)]',
}

const STATUS_LABEL: Record<FreshnessStatus, string> = {
  fresh: 'actueel',
  stale: 'verouderd',
  error: 'foutmelding',
  never: 'nog niet gesynchroniseerd',
}

// ── Discriminator op `kind` voor de twee badge-bronnen ──────────────────
//
// We hergebruiken `CryptoHoldingSource` voor het exchange/wallet/manual pad,
// maar accepteren ook een `csv` variant voor investment-holdings die uit
// een DEGIRO/Saxo/T212/eToro-import komen. Dit splitst niet schoon op het
// loader-niveau (CSV-bron = `external_source` veld op de holding zelf, geen
// FK), dus we bouwen het verschil hier op de display-laag.

export type HoldingSourceForBadge =
  | CryptoHoldingSource
  | { kind: 'csv'; broker: string }

interface HoldingSourceBadgeProps {
  source: HoldingSourceForBadge
  /** Wanneer beschikbaar bepaalt dit de status-tint van het plug-symbool. */
  lastSyncedAt?: string | null
  lastSyncError?: string | null
  className?: string
}

// ── Component ───────────────────────────────────────────────────────────

/**
 * Render een compacte bron-badge. Bij `manual` source rendert het niets
 * (kaart valt terug op het basis-uiterlijk). Bij elke andere bron toont
 * de badge: bron-icoon + bron-naam + plug met status-kleur.
 *
 * Touch target: minimaal 32px hoogte; door de inline-flex op de wrapper en
 * het rechts uitgelijnde EUR-bedrag in de kaart blijft het naast-elkaar
 * scrollen comfortabel.
 */
export function HoldingSourceBadge({
  source,
  lastSyncedAt = null,
  lastSyncError = null,
  className = '',
}: HoldingSourceBadgeProps) {
  if (source.kind === 'manual') return null

  // Resolve label + icon + href per bron-soort.
  let label: string
  let Icon: LucideIcon = Plug
  let href: string | null = null

  if (source.kind === 'exchange') {
    label = EXCHANGE_LABEL[source.exchangeId]
    href = `/identity/koppelingen#exchange-${source.connectionId}`
  } else if (source.kind === 'wallet') {
    label = CHAIN_LABEL[source.walletChain]
    Icon = Wallet
    href = `/identity/koppelingen#wallet-${source.walletAddressId}`
  } else {
    // CSV-broker
    label = CSV_BROKER_LABEL[source.broker] ?? source.broker
    Icon = FileSpreadsheet
    href = '/core/assets/holdings/import'
  }

  // Status-tint alleen relevant voor live bronnen (exchange/wallet). Voor
  // CSV-imports is "freshness" een datum-eigenschap van het laatste import-
  // moment — die context tonen we hier nog niet, dus we laten de status op
  // `fresh` (neutrale ink-3 tint) staan.
  const status: FreshnessStatus =
    source.kind === 'csv'
      ? 'fresh'
      : computeFreshness(lastSyncedAt, lastSyncError)

  const statusHint =
    status === 'error' ? ' — open de koppeling om te herstellen' : ''
  const tooltip =
    source.kind === 'csv'
      ? `Geïmporteerd via ${label} (CSV)`
      : `Automatisch gesynchroniseerd via ${label} — ${STATUS_LABEL[status]}${statusHint}`

  // Visuele opbouw: bron-icoon (12px) + bron-naam (10px UPPERCASE tracking) +
  // plug-icoon (10px, status-kleur). Border + subtle achtergrond op de hele
  // pill; geen rounded — krant-discipline.
  const inner = (
    <span
      className={`inline-flex h-6 max-w-[140px] shrink-0 items-center gap-1 border border-[var(--border-ed)] bg-[var(--paper)] px-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)] transition-colors hover:border-[var(--border-md)] hover:text-[var(--ink-2)] ${className}`}
      title={tooltip}
      aria-label={tooltip}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
      <Plug
        className={`ml-0.5 h-2.5 w-2.5 shrink-0 ${STATUS_COLOR_CLASS[status]}`}
        aria-hidden="true"
      />
    </span>
  )

  if (!href) return inner
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
    >
      {inner}
    </Link>
  )
}
