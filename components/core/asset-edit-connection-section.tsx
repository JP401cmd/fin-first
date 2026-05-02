'use client'

// Externe-koppeling sectie op de asset-edit pagina (R2). Toont één van twee
// states:
//   A) geen koppeling → uitleg + CTA "+ Koppel externe bron" → type-picker
//      modal → Bitvavo/Kraken/Coinbase exchange OF Bitcoin/Ethereum/.../Solana
//      wallet → opent de bestaande exchange/wallet-modal met asset-context
//      al voorgevuld.
//   B) bestaande koppeling → ConnectionCard met sync-actie + loskoppelen.
//
// 1-op-1 contract uit R1: per asset hooguit één exchange OF één wallet
// (database-uniques op `linked_asset_id`).

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Link as LinkIcon, AlertCircle } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { ConnectionCard } from '@/components/connections/connection-card'
import {
  AddExchangeModal,
  type ExchangeKey,
} from '@/components/connections/add-exchange-modal'
import { AddWalletModal } from '@/components/connections/add-wallet-modal'
import { useToast } from '@/components/app/toast-provider'
import { formatCurrency } from '@/lib/format'
import {
  computeFreshness,
  type AssetConnectionSummary,
  type ExchangeConnectionRow,
  type WalletAddressRow,
  type WalletChain,
} from '@/lib/connections-data'

// ── Display-mappings ─────────────────────────────────────────

const EXCHANGE_OPTIONS: ReadonlyArray<{ key: ExchangeKey; label: string; accent: string }> = [
  { key: 'bitvavo', label: 'Bitvavo', accent: '#1a73e8' },
  { key: 'kraken', label: 'Kraken', accent: '#5d4ec8' },
  { key: 'coinbase', label: 'Coinbase', accent: '#0052ff' },
]

interface ChainOption {
  id: WalletChain
  label: string
  ticker: string
  badge: string
  accent: string
}

const CHAIN_OPTIONS: ReadonlyArray<ChainOption> = [
  { id: 'bitcoin', label: 'Bitcoin', ticker: 'BTC', badge: 'BTC', accent: '#f7931a' },
  { id: 'ethereum', label: 'Ethereum', ticker: 'ETH', badge: 'ETH', accent: '#627eea' },
  { id: 'polygon', label: 'Polygon', ticker: 'MATIC', badge: 'POLY', accent: '#8247e5' },
  { id: 'arbitrum', label: 'Arbitrum', ticker: 'ETH', badge: 'ARB', accent: '#28a0f0' },
  { id: 'base', label: 'Base', ticker: 'ETH', badge: 'BASE', accent: '#0052ff' },
  { id: 'solana', label: 'Solana', ticker: 'SOL', badge: 'SOL', accent: '#14b58a' },
]

const EXCHANGE_LABEL: Record<ExchangeKey, string> = {
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

// ── Props ────────────────────────────────────────────────────

interface AssetEditConnectionSectionProps {
  assetId: string
  assetName: string
  /** Initial connection state, server-loaded via `loadConnectionForAsset()`. */
  initialConnection: AssetConnectionSummary | null
}

// ── Component ────────────────────────────────────────────────

export function AssetEditConnectionSection({
  assetId,
  assetName,
  initialConnection,
}: AssetEditConnectionSectionProps) {
  const router = useRouter()
  const { addToast } = useToast()

  const [connection, setConnection] = useState<AssetConnectionSummary | null>(initialConnection)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [exchangeModal, setExchangeModal] = useState<{ open: boolean; initial: ExchangeKey }>({
    open: false,
    initial: 'bitvavo',
  })
  const [walletModal, setWalletModal] = useState<{ open: boolean; initial: WalletChain }>({
    open: false,
    initial: 'bitcoin',
  })
  const [syncing, setSyncing] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const refresh = useCallback(() => router.refresh(), [router])

  // ── Connect-flow ─────────────────────────────────────────

  const handleExchangePicked = useCallback((key: ExchangeKey) => {
    setPickerOpen(false)
    setExchangeModal({ open: true, initial: key })
  }, [])

  const handleWalletPicked = useCallback((chain: WalletChain) => {
    setPickerOpen(false)
    setWalletModal({ open: true, initial: chain })
  }, [])

  const handleExchangeConnected = useCallback(
    (row: ExchangeConnectionRow) => {
      setConnection({ exchange: row })
      addToast({
        type: 'success',
        title: `${EXCHANGE_LABEL[row.exchange]} gekoppeld`,
        message: `${assetName} is verbonden. Klik op "Synchroniseer nu" om saldi op te halen.`,
      })
      refresh()
    },
    [addToast, assetName, refresh],
  )

  const handleWalletConnected = useCallback(
    (row: WalletAddressRow) => {
      setConnection({ wallet: row })
      addToast({
        type: 'success',
        title: 'Wallet gekoppeld',
        message: `${assetName} is verbonden met ${CHAIN_LABEL[row.chain]}.`,
      })
      refresh()
    },
    [addToast, assetName, refresh],
  )

  // ── Sync-flow ────────────────────────────────────────────

  const handleSync = useCallback(async () => {
    if (syncing || !connection) return
    setSyncing(true)
    try {
      const isExchange = !!connection.exchange
      const id = (connection.exchange?.id ?? connection.wallet?.id) as string
      const endpoint = isExchange
        ? `/api/integrations/exchanges/${id}/sync`
        : `/api/integrations/wallets/${id}/sync`
      const res = await fetch(endpoint, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.status === 'error') {
        const message = typeof json?.error === 'string' ? json.error : 'Synchronisatie mislukt.'
        addToast({ type: 'error', title: 'Sync-fout', message })
        // Stamp local row so badge flips red zonder volledige refresh.
        setConnection((prev) => {
          if (!prev) return prev
          if (prev.exchange) return { ...prev, exchange: { ...prev.exchange, lastSyncError: message } }
          if (prev.wallet) return { ...prev, wallet: { ...prev.wallet, lastSyncError: message } }
          return prev
        })
        return
      }
      const lastSyncedAt = typeof json?.lastSyncedAt === 'string' ? json.lastSyncedAt : new Date().toISOString()
      const totalEur = typeof json?.totalEur === 'number' ? formatCurrency(json.totalEur) : null
      addToast({
        type: 'success',
        title: 'Bijgewerkt',
        message: totalEur ? `Saldo opgehaald — ${totalEur}.` : 'Saldo opgehaald.',
      })
      setConnection((prev) => {
        if (!prev) return prev
        if (prev.exchange) {
          return {
            ...prev,
            exchange: { ...prev.exchange, lastSyncedAt, lastSyncError: null },
          }
        }
        if (prev.wallet) {
          return {
            ...prev,
            wallet: {
              ...prev.wallet,
              lastSyncedAt,
              lastBalanceEur: typeof json?.totalEur === 'number' ? json.totalEur : prev.wallet.lastBalanceEur,
              lastBalanceNative:
                typeof json?.nativeBalance === 'number' ? json.nativeBalance : prev.wallet.lastBalanceNative,
              lastSyncError: null,
            },
          }
        }
        return prev
      })
      refresh()
    } catch {
      addToast({ type: 'error', title: 'Netwerkfout', message: 'Sync kon niet worden uitgevoerd. Probeer opnieuw.' })
    } finally {
      setSyncing(false)
    }
  }, [addToast, connection, refresh, syncing])

  // ── Disconnect-flow ──────────────────────────────────────

  const handleConfirmDisconnect = useCallback(async () => {
    if (disconnecting || !connection) return
    setDisconnecting(true)
    try {
      const isExchange = !!connection.exchange
      const id = (connection.exchange?.id ?? connection.wallet?.id) as string
      const endpoint = isExchange
        ? `/api/integrations/exchanges/${id}`
        : `/api/integrations/wallets/${id}`
      const res = await fetch(endpoint, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        const message = typeof json?.error === 'string' ? json.error : 'Loskoppelen mislukt.'
        addToast({ type: 'error', title: 'Fout', message })
        return
      }
      setConnection(null)
      setConfirmDisconnect(false)
      addToast({
        type: 'success',
        title: 'Losgekoppeld',
        message: `${assetName} is niet meer gekoppeld. De waarde blijft bewaard.`,
      })
      refresh()
    } catch {
      addToast({ type: 'error', title: 'Netwerkfout', message: 'Loskoppelen kon niet worden uitgevoerd.' })
    } finally {
      setDisconnecting(false)
    }
  }, [addToast, assetName, connection, disconnecting, refresh])

  // ── Render ───────────────────────────────────────────────

  return (
    <section className="space-y-3 border-t border-[var(--border-ed)] pt-5">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Externe koppeling
        </p>
        <h3 className="mt-0.5 font-display text-[16px] font-semibold text-[var(--ink)]" style={{ letterSpacing: '-0.01em' }}>
          {connection ? 'Beheer koppeling' : 'Automatische updates'}
        </h3>
      </header>

      {!connection ? (
        // State A — geen koppeling
        <div className="space-y-3">
          <p className="font-serif italic text-[13px] leading-relaxed text-[var(--ink-2)]">
            Houd de waarde automatisch up-to-date door dit asset te koppelen aan een
            crypto-exchange of een publiek wallet-adres. Wij lezen alleen — wij
            plaatsen nooit orders en bewegen geen geld.
          </p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex h-11 items-center gap-2 border border-kern-300 bg-kern-50 px-4 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Koppel externe bron
          </button>
        </div>
      ) : connection.exchange ? (
        // State B — exchange-koppeling
        <ConnectionCard
          status={computeFreshness(connection.exchange.lastSyncedAt, connection.exchange.lastSyncError)}
          label={`${EXCHANGE_LABEL[connection.exchange.exchange]}${connection.exchange.label ? ` · ${connection.exchange.label}` : ''}`}
          sublabel={`API-key ${maskApiKey(connection.exchange.apiKeyLast4)}`}
          lastSyncedAt={connection.exchange.lastSyncedAt}
          errorMessage={connection.exchange.lastSyncError}
          syncing={syncing}
          onSync={handleSync}
          onDisconnect={() => setConfirmDisconnect(true)}
        />
      ) : connection.wallet ? (
        // State B — wallet-koppeling
        <ConnectionCard
          status={computeFreshness(connection.wallet.lastSyncedAt, connection.wallet.lastSyncError)}
          label={`${CHAIN_LABEL[connection.wallet.chain]}${connection.wallet.label ? ` · ${connection.wallet.label}` : ''}`}
          sublabel={maskAddress(connection.wallet.address)}
          amount={connection.wallet.lastBalanceEur != null ? formatCurrency(connection.wallet.lastBalanceEur) : undefined}
          amountLabel={
            connection.wallet.lastBalanceNative != null
              ? `${connection.wallet.lastBalanceNative.toLocaleString('nl-NL', { maximumFractionDigits: 6 })} ${CHAIN_TICKER[connection.wallet.chain]}`
              : undefined
          }
          lastSyncedAt={connection.wallet.lastSyncedAt}
          errorMessage={connection.wallet.lastSyncError}
          syncing={syncing}
          onSync={handleSync}
          onDisconnect={() => setConfirmDisconnect(true)}
        />
      ) : null}

      {/* ── Type-picker modal ──────────────────────────────── */}
      <ConnectionTypePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        assetName={assetName}
        onPickExchange={handleExchangePicked}
        onPickWallet={handleWalletPicked}
      />

      {/* ── Exchange / Wallet modals ───────────────────────── */}
      <AddExchangeModal
        open={exchangeModal.open}
        onClose={() => setExchangeModal((s) => ({ ...s, open: false }))}
        linkedAssetId={assetId}
        linkedAssetName={assetName}
        initialExchange={exchangeModal.initial}
        onConnected={handleExchangeConnected}
      />
      <AddWalletModal
        open={walletModal.open}
        onClose={() => setWalletModal((s) => ({ ...s, open: false }))}
        linkedAssetId={assetId}
        linkedAssetName={assetName}
        initialChain={walletModal.initial}
        onConnected={handleWalletConnected}
      />

      {/* ── Disconnect-bevestiging ─────────────────────────── */}
      <BottomSheet
        open={confirmDisconnect}
        onClose={() => !disconnecting && setConfirmDisconnect(false)}
        title="Koppeling verwijderen?"
        size="sm"
      >
        <div className="space-y-4 px-1 pb-4">
          <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 px-3 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="text-[13px] leading-relaxed text-amber-900">
              <p className="font-semibold">{assetName} wordt losgekoppeld.</p>
              <p className="mt-1 text-amber-800">
                De huidige waarde en eventuele holdings blijven behouden — alleen de
                automatische sync stopt. Je kunt later opnieuw koppelen.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-ed)] pt-3">
            <button
              type="button"
              onClick={handleConfirmDisconnect}
              disabled={disconnecting}
              className="inline-flex items-center gap-1.5 border border-red-300 bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-px hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {disconnecting ? 'Loskoppelen…' : 'Ja, ontkoppel'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDisconnect(false)}
              disabled={disconnecting}
              className="ml-auto px-3 py-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Annuleer
            </button>
          </div>
        </div>
      </BottomSheet>
    </section>
  )
}

// ── Type-picker modal ────────────────────────────────────────

interface ConnectionTypePickerModalProps {
  open: boolean
  onClose: () => void
  assetName: string
  onPickExchange: (key: ExchangeKey) => void
  onPickWallet: (chain: WalletChain) => void
}

/**
 * Eerste stap van de connect-flow: kies een bron-type. Twee subkoppen
 * (Crypto-exchange / Wallet-adres), elk met een grid van klikbare opties.
 * Klik op een optie → sluit deze modal en opent de bijbehorende
 * AddExchangeModal of AddWalletModal met de keuze al voorgevuld.
 */
function ConnectionTypePickerModal({
  open,
  onClose,
  assetName,
  onPickExchange,
  onPickWallet,
}: ConnectionTypePickerModalProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={`Kies een bron voor ${assetName}`} size="md">
      <div className="space-y-6 px-1 pb-4">
        <p className="font-serif italic text-[13px] leading-relaxed text-[var(--ink-2)]">
          Waar wil je dit asset aan koppelen? Kies een crypto-exchange voor
          API-gebaseerde sync, of een publiek wallet-adres voor on-chain lookup.
        </p>

        {/* ── Crypto-exchange ───────────────────────────────── */}
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Crypto-exchange
          </p>
          <p className="mb-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
            API-key met alleen leesrechten — wij plaatsen nooit orders.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {EXCHANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onPickExchange(opt.key)}
                className="group flex flex-col items-center gap-2 border border-[var(--border-md)] bg-[var(--paper)] p-4 text-center transition-all hover:-translate-y-px hover:bg-[var(--subtle)] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--ink-3)]"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 items-center justify-center px-2 font-mono text-[11px] font-bold tabular-nums"
                  style={{ backgroundColor: `${opt.accent}1f`, color: opt.accent }}
                >
                  {opt.label.toUpperCase()}
                </span>
                <span className="text-[12px] font-semibold text-[var(--ink)]">{opt.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Wallet-adres ──────────────────────────────────── */}
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Wallet-adres
          </p>
          <p className="mb-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
            Plak je publieke adres — wij vragen nooit om je private key of seed phrase.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {CHAIN_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onPickWallet(opt.id)}
                className="group flex flex-col items-center gap-1.5 border border-[var(--border-md)] bg-[var(--paper)] p-3 text-center transition-all hover:-translate-y-px hover:bg-[var(--subtle)] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--ink-3)]"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center font-mono text-[10px] font-bold tabular-nums"
                  style={{ backgroundColor: `${opt.accent}1f`, color: opt.accent }}
                >
                  {opt.badge}
                </span>
                <span className="text-[11px] font-semibold text-[var(--ink)] leading-tight">{opt.label}</span>
                <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  {opt.ticker}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Footer-actie ──────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-ed)] pt-4">
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--ink-4)]">
            <LinkIcon className="h-3 w-3" aria-hidden="true" />
            Eén koppeling per asset — je kunt later wisselen.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
          >
            Annuleer
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
