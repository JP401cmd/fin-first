'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, FileSpreadsheet, Landmark, Building2, PiggyBank, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { ConnectionSection } from '@/components/connections/connection-section'
import { ConnectionCard } from '@/components/connections/connection-card'
import { IsinResolverStatus } from '@/components/connections/isin-resolver-status'
import { useToast } from '@/components/app/toast-provider'
import { computeFreshness, type ConnectionsData, type ExchangeConnectionRow, type ExchangeId, type WalletAddressRow, type WalletChain } from '@/lib/connections-data'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

// Picker-source shape consumed by AddExchangeModal / AddWalletModal (R2 uses
// these from the asset-edit page). Re-exported here to keep the existing import
// path stable while the koppelingen-page itself no longer hosts the modals.
export interface CryptoAssetOption {
  id: string
  name: string
  currentValue: number | null
}

interface KoppelingenClientProps {
  initialData: ConnectionsData
}

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

const CHAIN_TICKER: Record<WalletChain, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  polygon: 'MATIC',
  arbitrum: 'ETH',
  base: 'ETH',
  solana: 'SOL',
}

function maskAddress(address: string): string {
  if (address.length <= 14) return address
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

function maskApiKey(last4: string | null): string {
  if (!last4) return '•••• ••••'
  return `•••• ${last4}`
}

// Linked-asset deeplink: the category-overview is the canonical destination —
// individual asset detail routes don't exist for crypto. The user lands on the
// page that lists this asset (and from there can open its edit-flow).
function linkedAssetHref(linkedAssetType: string): string {
  return `/core/assets/${linkedAssetType}`
}

export function KoppelingenClient({ initialData }: KoppelingenClientProps) {
  const router = useRouter()
  const { addToast } = useToast()
  const { masked } = useMaskedAmounts()

  const [exchanges, setExchanges] = useState<ExchangeConnectionRow[]>(initialData.exchanges)
  const [wallets, setWallets] = useState<WalletAddressRow[]>(initialData.wallets)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const refresh = () => startTransition(() => router.refresh())

  // ── Exchange-acties ──────────────────────────────────────────
  async function handleExchangeSync(id: string) {
    if (syncingId || testingId) return
    setSyncingId(id)
    try {
      const res = await fetch(`/api/integrations/exchanges/${id}/sync`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json?.status === 'error') {
        const message = typeof json?.error === 'string' ? json.error : 'Synchronisatie mislukt.'
        addToast({ type: 'error', title: 'Sync-fout', message })
        setExchanges((prev) => prev.map((r) => (r.id === id ? { ...r, lastSyncError: message } : r)))
      } else {
        const count = Number(json?.itemsSynced ?? 0)
        const total = typeof json?.totalEur === 'number' ? formatMaskedCurrency(json.totalEur, masked) : null
        addToast({
          type: 'success',
          title: 'Saldi opgehaald',
          message: `${count} ${count === 1 ? 'munt' : 'munten'} bijgewerkt${total ? ` · ${total}` : ''}.`,
        })
        setExchanges((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  lastSyncedAt: typeof json?.lastSyncedAt === 'string' ? json.lastSyncedAt : new Date().toISOString(),
                  lastSyncError: null,
                }
              : r,
          ),
        )
        refresh()
      }
    } catch {
      addToast({ type: 'error', title: 'Netwerkfout', message: 'Sync kon niet worden uitgevoerd. Probeer opnieuw.' })
    } finally {
      setSyncingId(null)
    }
  }

  async function handleExchangeTest(id: string) {
    if (testingId || syncingId) return
    setTestingId(id)
    try {
      const res = await fetch(`/api/integrations/exchanges/${id}/test`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      const latency = typeof json?.latencyMs === 'number' ? `${json.latencyMs}ms` : null
      if (res.ok && json?.ok === true) {
        addToast({
          type: 'success',
          title: 'Verbinding OK',
          message: latency ? `Reactie binnen ${latency}.` : 'Reactie ontvangen.',
        })
      } else {
        const reason = typeof json?.error === 'string' ? json.error : 'Onbekende fout.'
        addToast({ type: 'error', title: 'Test mislukt', message: reason })
      }
    } catch {
      addToast({ type: 'error', title: 'Netwerkfout', message: 'Test kon niet worden uitgevoerd. Probeer opnieuw.' })
    } finally {
      setTestingId(null)
    }
  }

  // ── Wallet-acties ────────────────────────────────────────────
  async function handleWalletSync(id: string) {
    if (syncingId || testingId) return
    setSyncingId(id)
    try {
      const res = await fetch(`/api/integrations/wallets/${id}/sync`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json?.status === 'error') {
        const message = typeof json?.error === 'string' ? json.error : 'Synchronisatie mislukt.'
        addToast({ type: 'error', title: 'Sync-fout', message })
        setWallets((prev) => prev.map((r) => (r.id === id ? { ...r, lastSyncError: message } : r)))
      } else {
        const total = typeof json?.totalEur === 'number' ? formatMaskedCurrency(json.totalEur, masked) : null
        addToast({
          type: 'success',
          title: 'Saldo opgehaald',
          message: total ? `Bijgewerkt — ${total}.` : 'Bijgewerkt.',
        })
        setWallets((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  lastSyncedAt: typeof json?.lastSyncedAt === 'string' ? json.lastSyncedAt : new Date().toISOString(),
                  lastBalanceNative: typeof json?.nativeBalance === 'number' ? json.nativeBalance : r.lastBalanceNative,
                  lastBalanceEur: typeof json?.totalEur === 'number' ? json.totalEur : r.lastBalanceEur,
                  lastSyncError: null,
                }
              : r,
          ),
        )
        refresh()
      }
    } catch {
      addToast({ type: 'error', title: 'Netwerkfout', message: 'Sync kon niet worden uitgevoerd. Probeer opnieuw.' })
    } finally {
      setSyncingId(null)
    }
  }

  async function handleWalletTest(id: string) {
    if (testingId || syncingId) return
    setTestingId(id)
    try {
      const res = await fetch(`/api/integrations/wallets/${id}/test`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      const latency = typeof json?.latencyMs === 'number' ? `${json.latencyMs}ms` : null
      if (res.ok && json?.ok === true) {
        addToast({
          type: 'success',
          title: 'Verbinding OK',
          message: latency ? `Reactie binnen ${latency}.` : 'Reactie ontvangen.',
        })
      } else {
        const reason = typeof json?.error === 'string' ? json.error : 'Onbekende fout.'
        addToast({ type: 'error', title: 'Test mislukt', message: reason })
      }
    } catch {
      addToast({ type: 'error', title: 'Netwerkfout', message: 'Test kon niet worden uitgevoerd. Probeer opnieuw.' })
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Editorial header — blueprint Type 2 (List) */}
      <header className="mb-6 space-y-2">
        {/* Kicker met streep */}
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Identiteit · automatische koppelingen
        </div>
        {/* Headline met italic-em "automatisch" */}
        <h1
          className="font-bold text-[28px] tracking-[-0.02em] leading-tight"
          style={{ fontFamily: 'var(--font-playfair, serif)', letterSpacing: '-0.03em' }}
        >
          Koppelingen{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            automatisch
          </em>
        </h1>
        {/* Editorial deck */}
        <p
          className="italic text-[14px] leading-snug max-w-[60ch] text-[var(--ink-2)] pl-4 mt-2"
          style={{
            fontFamily: 'var(--font-source-serif, Georgia, serif)',
            borderLeft: '2px solid var(--module-active-500)',
          }}
        >
          Houd je vermogen automatisch up-to-date. Koppel je crypto-exchanges, wallets,
          beleggingsbroker en bankrekeningen — of laat het bij handmatige invoer.
        </p>
      </header>

      {/* Sectie-uitleg strip */}
      <div className="mb-8 border-y border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3">
        <p className="font-serif italic text-[13px] leading-relaxed text-[var(--ink-2)]">
          Beheer je koppelingen vanuit de bezittingen of schulden. Hier vind je een
          overzicht en kun je de verbinding testen.
        </p>
      </div>

      {/* ── Crypto ─────────────────────────────────────────────────── */}
      <ConnectionSection
        title="Crypto — Exchange-koppelingen"
        description="Lees-rechten via een API-key. Wij plaatsen nooit orders of bewegen geld."
      >
        {exchanges.length === 0 ? (
          <EmptyConnectionState
            message="Nog geen exchange-koppelingen."
            hint="Voeg een koppeling toe vanuit een crypto-bezitting."
            ctaHref="/core/assets/crypto"
            ctaLabel="Naar Crypto"
          />
        ) : (
          exchanges.map((conn) => {
            const fullLabel = `${EXCHANGE_LABEL[conn.exchange]}${conn.label ? ` · ${conn.label}` : ''}`
            return (
              <ConnectionCard
                key={conn.id}
                status={computeFreshness(conn.lastSyncedAt, conn.lastSyncError)}
                label={fullLabel}
                sublabel={`API-key ${maskApiKey(conn.apiKeyLast4)}`}
                lastSyncedAt={conn.lastSyncedAt}
                errorMessage={conn.lastSyncError}
                syncing={syncingId === conn.id}
                testing={testingId === conn.id}
                onSync={() => handleExchangeSync(conn.id)}
                onTest={() => handleExchangeTest(conn.id)}
                linkedAssetHref={linkedAssetHref(conn.linkedAssetType)}
                linkedAssetName={conn.linkedAssetName}
              />
            )
          })
        )}
      </ConnectionSection>

      <ConnectionSection
        title="Crypto — Wallet-adressen"
        description="Publieke adressen. Wij vragen nooit om je private key of seed-phrase."
      >
        {wallets.length === 0 ? (
          <EmptyConnectionState
            message="Nog geen wallet-adressen."
            hint="Voeg een wallet toe vanuit een crypto-bezitting."
            ctaHref="/core/assets/crypto"
            ctaLabel="Naar Crypto"
          />
        ) : (
          wallets.map((w) => {
            const fullLabel = `${CHAIN_LABEL[w.chain]}${w.label ? ` · ${w.label}` : ''}`
            return (
              <ConnectionCard
                key={w.id}
                status={computeFreshness(w.lastSyncedAt, w.lastSyncError)}
                label={fullLabel}
                sublabel={maskAddress(w.address)}
                amount={w.lastBalanceEur != null ? formatMaskedCurrency(w.lastBalanceEur, masked) : undefined}
                amountLabel={
                  w.lastBalanceNative != null
                    ? `${w.lastBalanceNative.toLocaleString('nl-NL', { maximumFractionDigits: 6 })} ${CHAIN_TICKER[w.chain]}`
                    : undefined
                }
                lastSyncedAt={w.lastSyncedAt}
                errorMessage={w.lastSyncError}
                syncing={syncingId === w.id}
                testing={testingId === w.id}
                onSync={() => handleWalletSync(w.id)}
                onTest={() => handleWalletTest(w.id)}
                linkedAssetHref={linkedAssetHref(w.linkedAssetType)}
                linkedAssetName={w.linkedAssetName}
              />
            )
          })
        )}
      </ConnectionSection>

      {/* ── Beleggingen ────────────────────────────────────────────── */}
      <ConnectionSection
        title="Beleggingen"
        description="Brokers leveren geen consumer-API. Werk met CSV-import of een ISIN-resolver."
      >
        <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--subtle)] text-[var(--ink-2)]">
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">CSV-importers</p>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                Ondersteund: DEGIRO, Saxo, ING. Trading 212 en eToro volgen binnenkort.
              </p>
              <Link
                href="/core/assets/holdings"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--ink)] underline underline-offset-4 hover:text-[var(--ink-2)]"
              >
                Open holdings-import
              </Link>
            </div>
          </div>
        </div>

        <IsinResolverStatus />
      </ConnectionSection>

      {/* ── Bankrekeningen ─────────────────────────────────────────── */}
      <ConnectionSection title="Bankrekeningen" description="Saldi en transacties via PSD2.">
        <div className="border border-dashed border-[var(--border-ed)] bg-[var(--subtle)] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--paper)] text-[var(--ink-2)]">
              <Landmark className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">PSD2-koppelingen</p>
              <p className="mt-0.5 font-serif italic text-xs text-[var(--ink-3)]">
                Binnenkort beschikbaar via PSD2. Tot die tijd voer je je banksaldo
                handmatig in op de cash-pagina.
              </p>
            </div>
          </div>
        </div>
      </ConnectionSection>

      {/* ── Vastgoed ──────────────────────────────────────────────── */}
      <ConnectionSection title="Vastgoed" description="WOZ-waarde via het officiële waardeloket.">
        <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--subtle)] text-[var(--ink-2)]">
              <Building2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">WOZ-waardeloket</p>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                Geen API beschikbaar. Open het waardeloket en vul de waarde handmatig in
                op de eigen-huis asset.
              </p>
              <a
                href="https://www.wozwaardeloket.nl/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--ink)] underline underline-offset-4 hover:text-[var(--ink-2)]"
              >
                Open wozwaardeloket.nl
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </ConnectionSection>

      {/* ── Pensioen ──────────────────────────────────────────────── */}
      <ConnectionSection title="Pensioen" description="DigiD-vereist — alleen via de overheidssite.">
        <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--subtle)] text-[var(--ink-2)]">
              <PiggyBank className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">Mijnpensioenoverzicht</p>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                Geen automatische sync mogelijk — Mijnpensioenoverzicht vereist
                DigiD-login op de overheidssite. Open het overzicht en update je
                waarde handmatig.
              </p>
              <a
                href="https://www.mijnpensioenoverzicht.nl/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--ink)] underline underline-offset-4 hover:text-[var(--ink-2)]"
              >
                Open mijnpensioenoverzicht.nl
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </ConnectionSection>
    </div>
  )
}

interface EmptyConnectionStateProps {
  message: string
  hint: string
  ctaHref: string
  ctaLabel: string
}

function EmptyConnectionState({ message, hint, ctaHref, ctaLabel }: EmptyConnectionStateProps) {
  return (
    <div className="border border-dashed border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-6 text-center">
      <p className="text-sm font-semibold text-[var(--ink-2)]">{message}</p>
      <p className="mt-1 font-serif italic text-[13px] leading-relaxed text-[var(--ink-3)]">{hint}</p>
      <Link
        href={ctaHref}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--ink)] underline underline-offset-4 transition-colors hover:text-[var(--ink-2)]"
      >
        {ctaLabel}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  )
}
