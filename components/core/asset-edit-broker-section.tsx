'use client'

// Broker-koppeling sectie op de asset-edit pagina, voor `investment`-assets.
// Het beleggings-tweelingbroertje van `asset-edit-connection-section.tsx`
// (crypto). Toont één van twee states:
//   A) geen koppeling → uitleg + TWEE keuzes:
//        (a) "Koppel Trading 212" → AddBrokerModal (automatische read-only sync)
//        (b) "Importeer CSV"      → /core/assets/holdings/import?asset=<id>
//            (volledige-portfolio-snapshot voor andere brokers: DEGIRO/Saxo/ING)
//   B) bestaande koppeling → ConnectionCard met sync-actie + loskoppelen.
//
// 1-op-1 contract: per asset hooguit één broker-koppeling (database-unique op
// `linked_asset_id`). Loskoppelen behoudt holdings.

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { ConnectionCard } from '@/components/connections/connection-card'
import { AddBrokerModal } from '@/components/connections/add-broker-modal'
import { useToast } from '@/components/app/toast-provider'
import { triggerBrokerSync } from '@/lib/integrations/trigger-sync'
import { computeFreshness } from '@/lib/connections-data'
import type { BrokerConnectionRow } from '@/lib/broker-connections-data'

// ── Display-mapping ──────────────────────────────────────────

const BROKER_LABEL: Record<BrokerConnectionRow['broker'], string> = {
  trading212: 'Trading 212',
}

function maskApiKey(last4: string | null): string {
  if (!last4) return '•••• ••••'
  return `•••• ${last4}`
}

// ── Props ────────────────────────────────────────────────────

interface AssetEditBrokerSectionProps {
  assetId: string
  assetName: string
  /** Initial connection state, server/client-loaded via `loadBrokerConnectionForAsset()`. */
  initialConnection: BrokerConnectionRow | null
}

// ── Component ────────────────────────────────────────────────

export function AssetEditBrokerSection({
  assetId,
  assetName,
  initialConnection,
}: AssetEditBrokerSectionProps) {
  const router = useRouter()
  const { addToast } = useToast()

  const [connection, setConnection] = useState<BrokerConnectionRow | null>(initialConnection)
  const [modalOpen, setModalOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const refresh = useCallback(() => router.refresh(), [router])

  // ── Connect-flow ─────────────────────────────────────────

  const handleConnected = useCallback(
    (row: BrokerConnectionRow) => {
      setConnection(row)
      addToast({
        type: 'success',
        title: `${BROKER_LABEL[row.broker]} gekoppeld`,
        message: `${assetName} is verbonden. Klik op "Synchroniseer nu" om je posities op te halen.`,
      })
      refresh()
    },
    [addToast, assetName, refresh],
  )

  // CSV-import: navigeer naar de holdings-import met asset-context. Die route
  // activeert automatisch de volledige-portfolio-snapshot-modus voor dit asset.
  const handleImportCsv = useCallback(() => {
    router.push(`/core/assets/holdings/import?asset=${assetId}`)
  }, [router, assetId])

  // ── Sync-flow ────────────────────────────────────────────

  const handleSync = useCallback(async () => {
    if (syncing || !connection) return
    setSyncing(true)
    try {
      const result = await triggerBrokerSync(connection.id)
      if (!result.ok) {
        const message = result.error ?? 'Synchronisatie mislukt.'
        addToast({ type: 'error', title: 'Sync-fout', message })
        // Stamp local row zodat de badge rood wordt zonder volledige refresh.
        setConnection((prev) => (prev ? { ...prev, lastSyncError: message } : prev))
        return
      }
      const lastSyncedAt = result.lastSyncedAt ?? new Date().toISOString()
      addToast({
        type: 'success',
        title: 'Bijgewerkt',
        message: 'Posities opgehaald.',
      })
      setConnection((prev) => (prev ? { ...prev, lastSyncedAt, lastSyncError: null } : prev))
      refresh()
    } finally {
      setSyncing(false)
    }
  }, [addToast, connection, refresh, syncing])

  // ── Disconnect-flow ──────────────────────────────────────

  const handleConfirmDisconnect = useCallback(async () => {
    if (disconnecting || !connection) return
    setDisconnecting(true)
    try {
      const res = await fetch(`/api/integrations/brokers/${connection.id}`, { method: 'DELETE' })
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
        message: `${assetName} is niet meer gekoppeld. Je posities blijven bewaard.`,
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
        // State A — geen koppeling: twee keuzes (T212 sync vs CSV-snapshot)
        <div className="space-y-3">
          <p className="font-serif italic text-[13px] leading-relaxed text-[var(--ink-2)]">
            Houd je posities automatisch up-to-date. Koppel <strong>Trading 212</strong> voor
            een read-only sync, of importeer een <strong>CSV-afschrift</strong> van een andere
            broker. Wij lezen alleen — wij plaatsen nooit orders en bewegen geen geld.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* ── Keuze A: Trading 212 (automatische sync) ──────────── */}
            <div className="border border-kern-200 bg-kern-50/40 p-4">
              <p className="text-sm font-semibold text-[var(--ink)]">Trading 212</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-3)]">
                Automatische read-only sync van je posities en historie via een API-key.
              </p>
              <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-[11px] leading-relaxed text-[var(--ink-3)]">
                <li>Trading 212 → Instellingen → API (Beta)</li>
                <li>Genereer een key met alleen leesrechten</li>
                <li>Plak de key en koppel</li>
              </ol>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="mt-3 inline-flex h-11 items-center gap-2 border border-kern-300 bg-kern-50 px-3 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Koppel Trading 212
              </button>
            </div>

            {/* ── Keuze B: CSV-import (volledige-portfolio-snapshot) ── */}
            <div className="border border-[var(--border-md)] bg-[var(--paper)] p-4">
              <p className="text-sm font-semibold text-[var(--ink)]">CSV-import</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-3)]">
                Voor andere brokers. Een portefeuille-export stemt deze belegging volledig
                af; een transactie-export vult alleen aan — upload zelf opnieuw bij
                wijzigingen.
              </p>
              <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-[11px] leading-relaxed text-[var(--ink-3)]">
                <li>Exporteer een afschrift bij je broker</li>
                <li>Ondersteund: DEGIRO, Saxo, ING</li>
                <li>Upload — de wizard toont welk bestand werkt</li>
              </ol>
              <button
                type="button"
                onClick={handleImportCsv}
                className="mt-3 inline-flex h-11 items-center gap-2 border border-[var(--border-md)] bg-[var(--paper)] px-3 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                Importeer CSV
              </button>
            </div>
          </div>
        </div>
      ) : (
        // State B — broker-koppeling
        <ConnectionCard
          status={computeFreshness(connection.lastSyncedAt, connection.lastSyncError)}
          label={`${BROKER_LABEL[connection.broker]}${connection.label ? ` · ${connection.label}` : ''}`}
          sublabel={`API-key ${maskApiKey(connection.apiKeyLast4)}`}
          lastSyncedAt={connection.lastSyncedAt}
          errorMessage={connection.lastSyncError}
          syncing={syncing}
          onSync={handleSync}
          onDisconnect={() => setConfirmDisconnect(true)}
        />
      )}

      {/* ── Broker-modal ───────────────────────────────────── */}
      <AddBrokerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        linkedAssetId={assetId}
        linkedAssetName={assetName}
        onConnected={handleConnected}
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
                Je posities blijven behouden — alleen de automatische sync stopt. Je kunt later
                opnieuw koppelen.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-ed)] pt-3">
            <button
              type="button"
              onClick={handleConfirmDisconnect}
              disabled={disconnecting}
              className="inline-flex items-center gap-1.5 border border-negative/40 bg-negative px-4 py-2 text-sm font-medium text-[var(--paper)] transition-all hover:-translate-y-px hover:bg-negative/90 disabled:cursor-not-allowed disabled:opacity-50"
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
