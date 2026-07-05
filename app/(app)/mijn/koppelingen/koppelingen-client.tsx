'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ExternalLink, FileSpreadsheet, Landmark, Building2, PiggyBank, FileText, Trash2, Link2 } from 'lucide-react'
import Link from 'next/link'
import { ConnectionSection } from '@/components/connections/connection-section'
import { ConnectionCard } from '@/components/connections/connection-card'
import { IsinResolverStatus } from '@/components/connections/isin-resolver-status'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { useToast } from '@/components/app/toast-provider'
import { WidgetEmpty } from '@/components/widgets/widget-empty'
import { PageOpening } from '@/components/editorial'
import { computeFreshness, type ConnectionsData, type ExchangeConnectionRow, type ExchangeId, type WalletAddressRow, type WalletChain } from '@/lib/connections-data'
import type { BrokerConnectionRow, BrokerId } from '@/lib/broker-connections-data'
import type { AangifteImportSummary } from '@/lib/aangifte/imports-loader'
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
  /**
   * Broker-koppelingen (Trading 212, …) van de gebruiker, nieuwste eerst.
   * Server-loaded via `loadBrokerConnectionsForUser()`. Beheer (koppelen/
   * loskoppelen) leeft per-asset; hier tonen we een overzicht + sync/test.
   */
  brokerConnections: BrokerConnectionRow[]
  /**
   * Lijst van eerdere aangifte-imports, gegroepeerd op `imported_peildatum`.
   * Server-loaded via `loadAangifteImports()`. Lege array als de gebruiker
   * nog niets heeft geïmporteerd — het component toont dan een empty-state
   * met de "Importeer aangifte"-CTA.
   */
  aangifteImports: AangifteImportSummary[]
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

const BROKER_LABEL: Record<BrokerId, string> = {
  trading212: 'Trading 212',
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

export function KoppelingenClient({ initialData, brokerConnections, aangifteImports }: KoppelingenClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const moduleContext = pathname?.startsWith('/mijn') ? 'Mijn' : 'Identiteit'
  const { addToast } = useToast()
  const { masked } = useMaskedAmounts()

  const [exchanges, setExchanges] = useState<ExchangeConnectionRow[]>(initialData.exchanges)
  const [wallets, setWallets] = useState<WalletAddressRow[]>(initialData.wallets)
  const [brokers, setBrokers] = useState<BrokerConnectionRow[]>(brokerConnections)
  const [imports, setImports] = useState<AangifteImportSummary[]>(aangifteImports)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  // Pane open-state: true → render <AangifteImportPane>. We lazy-load
  // the pane component via dynamic import so the koppelingen-page bundle
  // stays small for users who never trigger the import.
  const [importPaneOpen, setImportPaneOpen] = useState(false)
  // Confirm-dialog state for "delete all imports of peildatum X". When
  // the user clicks the trash icon we stash the peildatum here; the
  // ShellOverlay renders only when this is non-null.
  const [confirmDeletePeildatum, setConfirmDeletePeildatum] = useState<string | null>(null)
  const [deletingPeildatum, setDeletingPeildatum] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const refresh = () => startTransition(() => router.refresh())

  // ── Aangifte-import-acties ──────────────────────────────────
  // Bulk-delete loopt via DELETE /api/onboarding/aangifte-import?peildatum=...
  // dat in dezelfde POST-route is geïmplementeerd (één endpoint, twee
  // verbs). De server gooit zowel assets als debts als snapshots weg
  // voor die peildatum; de client refresht de pagina-state na succes.
  async function handleDeleteImports(peildatum: string) {
    if (deletingPeildatum) return
    setDeletingPeildatum(peildatum)
    try {
      const url = `/api/onboarding/aangifte-import?peildatum=${encodeURIComponent(peildatum)}`
      const res = await fetch(url, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.ok === false) {
        const reason = typeof json?.error === 'string' ? json.error : 'Verwijderen mislukt.'
        addToast({ type: 'error', title: 'Niet verwijderd', message: reason })
        return
      }
      // Optimistic local removal — the server-state is the source of
      // truth via router.refresh(), but stripping the row immediately
      // avoids a flicker of the deleted entry between the toast and
      // the refresh.
      setImports((prev) => prev.filter((row) => row.peildatum !== peildatum))
      addToast({
        type: 'success',
        title: 'Verwijderd',
        message: `Aangifte-import ${peildatum.slice(0, 4)} is volledig verwijderd.`,
      })
      refresh()
    } catch {
      addToast({ type: 'error', title: 'Netwerkfout', message: 'Verwijderen kon niet worden uitgevoerd.' })
    } finally {
      setDeletingPeildatum(null)
      setConfirmDeletePeildatum(null)
    }
  }

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

  // ── Broker-acties (Trading 212) ──────────────────────────────
  async function handleBrokerSync(id: string) {
    if (syncingId || testingId) return
    setSyncingId(id)
    try {
      const res = await fetch(`/api/integrations/brokers/${id}/sync`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.status === 'error') {
        const message = typeof json?.error === 'string' ? json.error : 'Synchronisatie mislukt.'
        addToast({ type: 'error', title: 'Sync-fout', message })
        setBrokers((prev) => prev.map((r) => (r.id === id ? { ...r, lastSyncError: message } : r)))
      } else {
        const total = typeof json?.totalEur === 'number' ? formatMaskedCurrency(json.totalEur, masked) : null
        addToast({
          type: 'success',
          title: 'Posities opgehaald',
          message: total ? `Bijgewerkt — ${total}.` : 'Bijgewerkt.',
        })
        setBrokers((prev) =>
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

  async function handleBrokerTest(id: string) {
    if (testingId || syncingId) return
    setTestingId(id)
    try {
      const res = await fetch(`/api/integrations/brokers/${id}/test`, { method: 'POST' })
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
      {/* Editorial pagina-opening — blueprint Type 2 (List) */}
      <PageOpening
        className="mb-6"
        kicker={`${moduleContext} · automatische koppelingen`}
        titleBefore="Koppelingen "
        emphasis="automatisch"
        titleAfter=""
        deck="Houd je vermogen automatisch up-to-date. Koppel je crypto-exchanges, wallets, beleggingsbroker en bankrekeningen — of laat het bij handmatige invoer."
      />

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
          <WidgetEmpty
            variant="first-use"
            icon={Link2}
            title="Nog geen koppelingen"
            description="Koppel je crypto-exchange om saldi automatisch op te halen."
            action={{ label: 'Koppeling toevoegen', href: '/core/assets/crypto' }}
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
          <WidgetEmpty
            variant="first-use"
            icon={Link2}
            title="Nog geen wallets"
            description="Voeg een wallet-adres toe om je crypto-saldo automatisch bij te houden."
            action={{ label: 'Koppeling toevoegen', href: '/core/assets/crypto' }}
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

      {/* ── Beleggingen — broker-koppelingen ───────────────────────── */}
      <ConnectionSection
        title="Beleggingen — broker-koppelingen"
        description="Trading 212 levert read-only sync van je posities. Koppelen doe je per belegging."
      >
        {brokers.length === 0 ? (
          <WidgetEmpty
            variant="first-use"
            icon={Link2}
            title="Nog geen broker gekoppeld"
            description="Koppel Trading 212 op een belegging om je posities automatisch op te halen."
            action={{ label: 'Naar beleggingen', href: '/core/assets/investment' }}
          />
        ) : (
          brokers.map((conn) => {
            const fullLabel = `${BROKER_LABEL[conn.broker]}${conn.label ? ` · ${conn.label}` : ''}`
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
                onSync={() => handleBrokerSync(conn.id)}
                onTest={() => handleBrokerTest(conn.id)}
                linkedAssetHref={linkedAssetHref(conn.linkedAssetType)}
                linkedAssetName={conn.linkedAssetName}
              />
            )
          })
        )}
      </ConnectionSection>

      {/* ── Beleggingen — CSV-import ────────────────────────────────── */}
      <ConnectionSection
        title="Beleggingen — CSV-import"
        description="Andere brokers leveren geen consumer-API. Werk met CSV-import of een ISIN-resolver."
      >
        <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--subtle)] text-[var(--ink-2)]">
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">CSV-importers</p>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                Ondersteund: DEGIRO, Saxo, ING. Importeer een afschrift direct op de belegging.
              </p>
              <Link
                href="/core/assets/investment"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--ink)] underline underline-offset-4 hover:text-[var(--ink-2)]"
              >
                Naar beleggingen
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

      {/* ── Belastingaangifte ─────────────────────────────────────────
          Eénmalige import per peildatum. De aangifte-import-pane biedt
          een PDF-upload of een 12-veld handmatige wizard; beide leveren
          dezelfde review-state op. Eerdere imports staan boven de CTA en
          kunnen per peildatum bulk-verwijderd worden. */}
      <AangifteImportSection
        imports={imports}
        deletingPeildatum={deletingPeildatum}
        onOpenImport={() => setImportPaneOpen(true)}
        onConfirmDelete={(peildatum) => setConfirmDeletePeildatum(peildatum)}
      />

      {/* Confirm-overlay voor bulk-delete per peildatum (driewegregel
          §5.3 — onomkeerbare actie hoort in een echte confirm-modal). */}
      <ShellOverlay
        open={confirmDeletePeildatum !== null}
        onClose={() => setConfirmDeletePeildatum(null)}
        kind="confirm"
        title="Aangifte-import verwijderen?"
        destructive
      >
        <div className="space-y-4 p-5">
          <p className="font-serif text-base leading-relaxed text-[var(--ink-2)]">
            Alle bezittingen en schulden die op{' '}
            <strong className="text-[var(--ink)]">
              {confirmDeletePeildatum
                ? `peildatum ${confirmDeletePeildatum}`
                : 'deze peildatum'}
            </strong>{' '}
            zijn geïmporteerd worden definitief verwijderd, inclusief de bijbehorende
            balance-snapshots. Handmatig toegevoegde rijen blijven bewaard.
          </p>
          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setConfirmDeletePeildatum(null)}
              className="border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)]"
              style={{ minHeight: 44 }}
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmDeletePeildatum) {
                  void handleDeleteImports(confirmDeletePeildatum)
                }
              }}
              disabled={deletingPeildatum !== null}
              className="border border-red-600 bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              style={{ minHeight: 44 }}
            >
              {deletingPeildatum ? 'Verwijderen…' : 'Definitief verwijderen'}
            </button>
          </div>
        </div>
      </ShellOverlay>

      {/* Import-pane — geleverd door agent B2. We laden 'm lazy via
          dynamic import zodat de koppelingen-page bundle-grootte niet
          stijgt voor gebruikers die nooit importeren. */}
      {importPaneOpen && (
        <AangifteImportPaneLoader
          onClose={() => setImportPaneOpen(false)}
          onImported={() => {
            setImportPaneOpen(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

// ── Aangifte-import sectie ───────────────────────────────────────────
// Aparte sub-component zodat de hoofd-render-tree niet uitwaaiert tot
// onleesbaar. Bevat: lijst van eerdere imports + import-CTA. Empty-state
// + ingevulde lijst delen dezelfde sectie-header.

interface AangifteImportSectionProps {
  imports: AangifteImportSummary[]
  deletingPeildatum: string | null
  onOpenImport: () => void
  onConfirmDelete: (peildatum: string) => void
}

const CURRENT_TAX_YEAR = new Date().getFullYear() - 1

function AangifteImportSection({
  imports,
  deletingPeildatum,
  onOpenImport,
  onConfirmDelete,
}: AangifteImportSectionProps) {
  return (
    <ConnectionSection
      title="Belastingaangifte"
      description="Importeer in één keer alle bezittingen en schulden uit je IB-aangifte."
    >
      {imports.length === 0 ? (
        <div className="border border-dashed border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--paper)] text-[var(--ink-2)]">
              <FileText className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">
                Nog geen aangifte geïmporteerd
              </p>
              <p className="mt-0.5 font-serif italic text-[13px] leading-relaxed text-[var(--ink-3)]">
                Importeer je belastingaangifte voor een snelle start van je
                vermogensoverzicht. Je controleert elke regel voor we iets
                opslaan.
              </p>
              <button
                type="button"
                onClick={onOpenImport}
                className="mt-3 inline-flex items-center gap-1.5 border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-all hover:-translate-y-px hover:bg-[var(--subtle)] hover:shadow-sm"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Importeer aangifte {CURRENT_TAX_YEAR}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {imports.map((row) => {
            const totalCount = row.assetCount + row.debtCount
            const formattedDate = formatDutchDate(row.peildatum)
            return (
              <div
                key={row.peildatum}
                className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--subtle)] text-[var(--ink-2)]">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      Aangifte {row.taxYear}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                      Peildatum {formattedDate} · {totalCount}{' '}
                      {totalCount === 1 ? 'item' : 'items'} ({row.assetCount}{' '}
                      bezitting{row.assetCount === 1 ? '' : 'en'},{' '}
                      {row.debtCount} schuld{row.debtCount === 1 ? '' : 'en'})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onConfirmDelete(row.peildatum)}
                    disabled={deletingPeildatum === row.peildatum}
                    aria-label={`Verwijder alle items van peildatum ${row.peildatum}`}
                    className="inline-flex shrink-0 items-center justify-center border border-red-200 bg-[var(--paper)] px-2 py-2 text-xs font-medium text-red-600 transition-all hover:bg-red-50 disabled:opacity-50"
                    style={{ minHeight: 32, minWidth: 32 }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )
          })}
          <button
            type="button"
            onClick={onOpenImport}
            className="mt-3 inline-flex items-center gap-1.5 border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-all hover:-translate-y-px hover:bg-[var(--subtle)] hover:shadow-sm"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Importeer aangifte {CURRENT_TAX_YEAR}
          </button>
        </>
      )}
    </ConnectionSection>
  )
}

// ── Date helper ──────────────────────────────────────────────────────
// Formats `yyyy-mm-dd` as Dutch `1 januari 2024`. Pure helper; the
// parsing is defensive because a malformed peildatum should never crash
// the page — fall back to the raw string in that case.
const DUTCH_MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
] as const

function formatDutchDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  const monthIdx = Number.parseInt(month ?? '', 10) - 1
  if (
    !year || !month || !day ||
    monthIdx < 0 || monthIdx > 11 ||
    !Number.isFinite(Number(day))
  ) {
    return iso
  }
  return `${Number(day)} ${DUTCH_MONTHS[monthIdx]} ${year}`
}

// ── AangifteImportPane lazy-loader ───────────────────────────────────
// The pane itself is delivered by Phase B2. We use a runtime-resolved
// import so this file builds even before B2 has merged. When the pane
// component is missing the user sees a friendly toast and the pane
// stays closed — never crashes the koppelingen-page.

interface AangifteImportPaneLoaderProps {
  onClose: () => void
  onImported: () => void
}

type AangifteImportPaneComponent = React.ComponentType<{
  open: boolean
  mode: 'direct-import'
  onClose: () => void
  onImported: () => void
}>

function AangifteImportPaneLoader({ onClose, onImported }: AangifteImportPaneLoaderProps) {
  const [Pane, setPane] = useState<AangifteImportPaneComponent | null>(null)
  const { addToast } = useToast()

  // Dynamic import — pane is delivered by Phase B2 in parallel. We use
  // a `@ts-expect-error` here so this file builds before B2 has merged;
  // once B2's `aangifte-import-pane.tsx` lands the directive should be
  // removed (the comment below documents that follow-up). Webpack/Next
  // handle the dynamic import lazily so the koppelingen-page bundle
  // stays small for users who never trigger the import.
  useEffect(() => {
    let cancelled = false
    // Dynamic import keeps the koppelingen-page bundle small for users
    // who never trigger the import flow. The catch-branch below stays
    // as a deploy-time defence against transient import errors.
    import('@/components/onboarding/aangifte-import-pane')
      .then((mod: Record<string, unknown>) => {
        if (cancelled) return
        const Component = mod.AangifteImportPane as AangifteImportPaneComponent | undefined
        if (Component) {
          setPane(() => Component)
        } else {
          throw new Error('AangifteImportPane export missing')
        }
      })
      .catch(() => {
        if (cancelled) return
        addToast({
          type: 'error',
          title: 'Import-flow niet beschikbaar',
          message: 'De aangifte-import is nog niet geactiveerd. Probeer het later opnieuw.',
        })
        onClose()
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!Pane) return null
  return <Pane open mode="direct-import" onClose={onClose} onImported={onImported} />
}

