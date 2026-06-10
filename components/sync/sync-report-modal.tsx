'use client'

// Sync-rapport-modal — bereikbaar vanuit het account-dropdown ("Sync-rapport")
// of via een klik op de globale sync-knop wanneer er fouten zijn. Toont:
//
//   • Header-strip met "Alles synchroniseren"-knop + samenvatting
//   • Sectie "Exchanges" — Bitvavo/Kraken/Coinbase met test/sync per rij
//   • Sectie "Wallets"   — BTC/ETH/Polygon/Arbitrum/Base/Solana
//   • Sectie "Marktdata" — ISIN-resolver status (read-only)
//
// Hergebruikt `ConnectionCard`, `ConnectionSection`, `IsinResolverStatus` en
// `SyncProgressStrip`. De per-rij sync/test-handlers zijn een lichtgewicht
// versie van `koppelingen-client.tsx:81-200` — ze updaten alleen de modal-
// local state (dus geen `router.refresh()`); de globale knop heeft zijn eigen
// state via `<GlobalSyncProvider>`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, RefreshCw, AlertTriangle } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { ConnectionCard } from '@/components/connections/connection-card'
import { ConnectionSection } from '@/components/connections/connection-section'
import { IsinResolverStatus } from '@/components/connections/isin-resolver-status'
import { MarketDataSourcesCard } from '@/components/connections/market-data-sources-card'
import { BlockchainSourcesCard } from '@/components/connections/blockchain-sources-card'
import { SyncProgressStrip } from './sync-progress-strip'
import { useGlobalSync } from './global-sync-provider'
import { useToast } from '@/components/app/toast-provider'
import { computeFreshness, type ConnectionsData, type ExchangeConnectionRow, type ExchangeId, type WalletAddressRow, type WalletChain } from '@/lib/connections-data'
import { formatCurrency } from '@/lib/format'

interface SyncReportModalProps {
  open: boolean
  onClose: () => void
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

export function SyncReportModal({ open, onClose }: SyncReportModalProps) {
  const { state, triggerGlobalSync, acknowledgePartial } = useGlobalSync()
  const { addToast } = useToast()

  const [data, setData] = useState<ConnectionsData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  // Acknowledge partial-state zodra de modal opent — de gebruiker ziet de
  // fouten hier en de rode dot mag weg.
  const acknowledgedRef = useRef(false)
  useEffect(() => {
    if (open && state.phase === 'partial' && !acknowledgedRef.current) {
      acknowledgePartial()
      acknowledgedRef.current = true
    }
    if (!open) {
      acknowledgedRef.current = false
    }
  }, [open, state.phase, acknowledgePartial])

  const loadConnections = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/integrations/connections', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ConnectionsData
      setData(json)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout'
      setLoadError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadConnections()
  }, [open, loadConnections])

  // Wanneer de globale sync afrondt en de modal openstaat, herlaad de data
  // zodat last_synced_at/last_sync_error vers zijn.
  const prevPhaseRef = useRef(state.phase)
  useEffect(() => {
    if (!open) return
    if (prevPhaseRef.current === 'syncing' && state.phase !== 'syncing') {
      void loadConnections()
    }
    prevPhaseRef.current = state.phase
  }, [open, state.phase, loadConnections])

  // ── Per-rij acties (modal-scoped, niet de globale provider-state) ────

  async function handleExchangeSync(id: string) {
    if (syncingId || testingId) return
    setSyncingId(id)
    try {
      const res = await fetch(`/api/integrations/exchanges/${id}/sync`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json?.status === 'error') {
        const message = typeof json?.error === 'string' ? json.error : 'Synchronisatie mislukt.'
        addToast({ type: 'error', title: 'Sync-fout', message })
        setData((prev) => prev && {
          ...prev,
          exchanges: prev.exchanges.map((r) => (r.id === id ? { ...r, lastSyncError: message } : r)),
        })
      } else {
        const count = Number(json?.itemsSynced ?? 0)
        const total = typeof json?.totalEur === 'number' ? formatCurrency(json.totalEur) : null
        addToast({
          type: 'success',
          title: 'Saldi opgehaald',
          message: `${count} ${count === 1 ? 'munt' : 'munten'} bijgewerkt${total ? ` · ${total}` : ''}.`,
        })
        setData((prev) => prev && {
          ...prev,
          exchanges: prev.exchanges.map((r) =>
            r.id === id
              ? {
                  ...r,
                  lastSyncedAt: typeof json?.lastSyncedAt === 'string' ? json.lastSyncedAt : new Date().toISOString(),
                  lastSyncError: null,
                }
              : r,
          ),
        })
      }
    } catch {
      addToast({ type: 'error', title: 'Netwerkfout', message: 'Sync kon niet worden uitgevoerd.' })
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
      addToast({ type: 'error', title: 'Netwerkfout', message: 'Test kon niet worden uitgevoerd.' })
    } finally {
      setTestingId(null)
    }
  }

  async function handleWalletSync(id: string) {
    if (syncingId || testingId) return
    setSyncingId(id)
    try {
      const res = await fetch(`/api/integrations/wallets/${id}/sync`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json?.status === 'error') {
        const message = typeof json?.error === 'string' ? json.error : 'Synchronisatie mislukt.'
        addToast({ type: 'error', title: 'Sync-fout', message })
        setData((prev) => prev && {
          ...prev,
          wallets: prev.wallets.map((r) => (r.id === id ? { ...r, lastSyncError: message } : r)),
        })
      } else {
        const total = typeof json?.totalEur === 'number' ? formatCurrency(json.totalEur) : null
        addToast({
          type: 'success',
          title: 'Saldo opgehaald',
          message: total ? `Bijgewerkt — ${total}.` : 'Bijgewerkt.',
        })
        setData((prev) => prev && {
          ...prev,
          wallets: prev.wallets.map((r) =>
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
        })
      }
    } catch {
      addToast({ type: 'error', title: 'Netwerkfout', message: 'Sync kon niet worden uitgevoerd.' })
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
      addToast({ type: 'error', title: 'Netwerkfout', message: 'Test kon niet worden uitgevoerd.' })
    } finally {
      setTestingId(null)
    }
  }

  // ── Globale "Alles synchroniseren"-knop ─────────────────────────────

  const handleSyncAll = useCallback(async () => {
    if (!data) return
    if (state.phase === 'syncing') return
    await triggerGlobalSync({
      exchanges: data.exchanges,
      wallets: data.wallets,
      pricesOnly: data.exchanges.length + data.wallets.length === 0,
    })
  }, [data, state.phase, triggerGlobalSync])

  // ── Render ─────────────────────────────────────────────────────────

  const totalConnections = (data?.exchanges.length ?? 0) + (data?.wallets.length ?? 0)

  const summary = useMemo(() => {
    if (!data) return null
    const all = [...data.exchanges, ...data.wallets]
    const errored = all.filter((c) => c.lastSyncError).length
    const synced = all.filter((c) => c.lastSyncedAt && !c.lastSyncError).length
    const never = all.filter((c) => !c.lastSyncedAt && !c.lastSyncError).length
    return { errored, synced, never, total: all.length }
  }, [data])

  return (
    <BottomSheet open={open} onClose={onClose} title="Sync-rapport" size="full" initialMobileHeight="80vh">
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        {/* Header-strip ─────────────────────────────────────────────── */}
        <div className="mb-6 border border-[var(--border-ed)] bg-[var(--subtle)] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-[var(--ink)]">Alle koppelingen</h4>
              <p className="mt-1 font-serif text-[13px] italic text-[var(--ink-3)]">
                Test en synchroniseer al je verbindingen op één plek.
              </p>
              {summary && (
                <p className="mt-2 font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                  {summary.total} koppelingen · {summary.synced} actueel
                  {summary.errored > 0 && (
                    <span className="text-red-600"> · {summary.errored} met fout</span>
                  )}
                  {summary.never > 0 && (
                    <span> · {summary.never} nog niet gesynced</span>
                  )}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleSyncAll}
              disabled={state.phase === 'syncing' || loading}
              className="inline-flex shrink-0 items-center gap-2 border border-[var(--border-md)] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] transition-all hover:-translate-y-px disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${state.phase === 'syncing' ? 'animate-spin' : ''}`} aria-hidden="true" />
              {state.phase === 'syncing' ? 'Bezig…' : 'Alles synchroniseren'}
            </button>
          </div>

          {state.phase === 'syncing' && (
            <div className="mt-4">
              <SyncProgressStrip variant="full" />
            </div>
          )}
        </div>

        {/* Loading / error state ───────────────────────────────────── */}
        {loading && !data && (
          <div className="py-12 text-center text-sm text-[var(--ink-3)]">Koppelingen worden geladen…</div>
        )}
        {loadError && !loading && (
          <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Kon koppelingen niet laden: {loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadConnections()}
              className="mt-3 text-xs font-medium underline hover:no-underline"
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {/* Empty state ─────────────────────────────────────────────── */}
        {data && totalConnections === 0 && (
          <div className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] p-6 text-center">
            <p className="font-display text-base font-semibold text-[var(--ink)]">Nog geen koppelingen</p>
            <p className="mt-2 font-serif text-sm italic text-[var(--ink-3)]">
              Koppel een exchange of wallet om automatische saldi en transacties te ontvangen.
            </p>
            <Link
              href="/mijn/koppelingen"
              onClick={onClose}
              className="mt-4 inline-flex items-center gap-1.5 border border-[var(--border-md)] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] transition-all hover:-translate-y-px"
            >
              Koppeling toevoegen
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}

        {/* Exchanges ───────────────────────────────────────────────── */}
        {data && data.exchanges.length > 0 && (
          <ConnectionSection title="Exchanges" description="API-koppelingen voor crypto-saldi en handelsgeschiedenis.">
            {data.exchanges.map((row: ExchangeConnectionRow) => {
              const status = computeFreshness(row.lastSyncedAt, row.lastSyncError)
              return (
                <ConnectionCard
                  key={row.id}
                  status={status}
                  label={row.label?.trim() ? row.label : EXCHANGE_LABEL[row.exchange]}
                  sublabel={`${EXCHANGE_LABEL[row.exchange]} · ${maskApiKey(row.apiKeyLast4)}`}
                  lastSyncedAt={row.lastSyncedAt}
                  errorMessage={row.lastSyncError}
                  syncing={syncingId === row.id || state.phase === 'syncing'}
                  testing={testingId === row.id}
                  onSync={() => void handleExchangeSync(row.id)}
                  onTest={() => void handleExchangeTest(row.id)}
                  linkedAssetHref={`/core/assets/${row.linkedAssetType}`}
                  linkedAssetName={row.linkedAssetName}
                />
              )
            })}
          </ConnectionSection>
        )}

        {/* Wallets ─────────────────────────────────────────────────── */}
        {data && data.wallets.length > 0 && (
          <ConnectionSection title="Wallets" description="Publieke blockchain-adressen — alleen-lezen.">
            {data.wallets.map((row: WalletAddressRow) => {
              const status = computeFreshness(row.lastSyncedAt, row.lastSyncError)
              const balanceLabel = row.lastBalanceEur != null ? formatCurrency(row.lastBalanceEur) : undefined
              const nativeLabel = row.lastBalanceNative != null
                ? `${row.lastBalanceNative.toFixed(6)} ${CHAIN_TICKER[row.chain]}`
                : undefined
              return (
                <ConnectionCard
                  key={row.id}
                  status={status}
                  label={row.label?.trim() ? row.label : `${CHAIN_LABEL[row.chain]}-wallet`}
                  sublabel={`${CHAIN_LABEL[row.chain]} · ${maskAddress(row.address)}`}
                  amount={balanceLabel}
                  amountLabel={nativeLabel}
                  lastSyncedAt={row.lastSyncedAt}
                  errorMessage={row.lastSyncError}
                  syncing={syncingId === row.id || state.phase === 'syncing'}
                  testing={testingId === row.id}
                  onSync={() => void handleWalletSync(row.id)}
                  onTest={() => void handleWalletTest(row.id)}
                  linkedAssetHref={`/core/assets/${row.linkedAssetType}`}
                  linkedAssetName={row.linkedAssetName}
                />
              )
            })}
          </ConnectionSection>
        )}

        {/* Externe bronnen ─────────────────────────────────────────── */}
        {data && (
          <ConnectionSection
            title="Externe bronnen"
            description="Publieke API's zonder credentials. Automatisch aangeroepen tijdens elke sync."
          >
            <MarketDataSourcesCard />
            <BlockchainSourcesCard />
            <IsinResolverStatus />
          </ConnectionSection>
        )}

        {/* Footer link naar volledige beheerpagina ───────────────── */}
        {data && totalConnections > 0 && (
          <div className="mt-4 border-t border-[var(--border-ed)] pt-4 text-center">
            <Link
              href="/mijn/koppelingen"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink-2)] underline decoration-[var(--border-ed)] underline-offset-4 hover:text-[var(--ink)] hover:decoration-[var(--ink-2)]"
            >
              Beheer koppelingen (toevoegen, bewerken, ontkoppelen)
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
