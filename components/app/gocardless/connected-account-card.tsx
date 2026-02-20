'use client'

import { useState } from 'react'
import { RefreshCw, Unlink, Building2, AlertTriangle } from 'lucide-react'
import { SyncStatusBadge } from './sync-status-badge'

type GCAccount = {
  id: string
  gc_account_id: string
  iban: string | null
  last_synced_at: string | null
  daily_requests: number
  rate_limit_reset_date: string | null
  is_active: boolean
  bank_account_id: string | null
  gocardless_requisitions: {
    institution_name: string
    institution_logo: string | null
    expires_at: string | null
    status: string
  }
}

type ConnectedAccountCardProps = {
  account: GCAccount
  onSync: () => void
  onDisconnect: () => void
  onReauthorize: () => void
}

export function ConnectedAccountCard({ account, onSync, onDisconnect, onReauthorize }: ConnectedAccountCardProps) {
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ new: number; duplicates: number } | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const req = account.gocardless_requisitions
  const isExpired = req.status === 'expired'
  const expiresAt = req.expires_at ? new Date(req.expires_at) : null
  const daysUntilExpiry = expiresAt
    ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null
  const expiryWarning = daysUntilExpiry !== null && daysUntilExpiry <= 14 && daysUntilExpiry > 0

  // Reset daily requests if date has changed
  const today = new Date().toISOString().split('T')[0]
  const dailyRequests = account.rate_limit_reset_date === today ? account.daily_requests : 0
  const canSync = dailyRequests < 10 && !isExpired

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/gocardless/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gc_account_id: account.id }),
      })
      const data = await res.json()
      if (res.ok) {
        setSyncResult({ new: data.new, duplicates: data.duplicates })
        onSync()
      } else {
        setSyncResult(null)
        alert(data.error || 'Synchronisatie mislukt')
      }
    } catch {
      alert('Synchronisatie mislukt')
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      const res = await fetch('/api/gocardless/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gc_account_id: account.id }),
      })
      if (res.ok) {
        onDisconnect()
      }
    } catch {
      alert('Verbinding verbreken mislukt')
    } finally {
      setDisconnecting(false)
      setConfirmDisconnect(false)
    }
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {req.institution_logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={req.institution_logo}
              alt={req.institution_name}
              className="h-10 w-10 rounded-lg object-contain"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
              <Building2 className="h-5 w-5 text-[var(--ink-3)]" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">{req.institution_name}</p>
            {account.iban && (
              <p className="text-xs text-[var(--ink-3)]">{account.iban}</p>
            )}
          </div>
        </div>

        <SyncStatusBadge
          lastSyncedAt={account.last_synced_at}
          dailyRequests={dailyRequests}
          expiresAt={req.expires_at}
        />
      </div>

      {/* Expiry warning */}
      {(expiryWarning || isExpired) && (
        <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
          isExpired
            ? 'bg-red-50 text-red-700'
            : 'bg-orange-50 text-orange-700'
        }`}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            {isExpired
              ? 'Autorisatie verlopen. Vernieuw de verbinding om te blijven synchroniseren.'
              : `Autorisatie verloopt over ${daysUntilExpiry} dagen. Vernieuw de verbinding tijdig.`}
          </span>
          <button
            onClick={onReauthorize}
            className="ml-auto shrink-0 rounded-md bg-[var(--paper)] px-2 py-1 font-medium shadow-[var(--s0)] hover:bg-[var(--subtle)]"
          >
            Vernieuwen
          </button>
        </div>
      )}

      {/* Sync result */}
      {syncResult && (
        <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          {syncResult.new} nieuwe transacties, {syncResult.duplicates} duplicaten overgeslagen
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleSync}
          disabled={!canSync || syncing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Synchroniseren...' : 'Synchroniseer'}
        </button>

        {confirmDisconnect ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600">Zeker weten?</span>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Ja, verbreken
            </button>
            <button
              onClick={() => setConfirmDisconnect(false)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-zinc-100"
            >
              Annuleer
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDisconnect(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            <Unlink className="h-3.5 w-3.5" />
            Verbreken
          </button>
        )}

        <span className="ml-auto text-xs text-[var(--ink-3)]">
          {dailyRequests}/10 verzoeken vandaag
        </span>
      </div>
    </div>
  )
}
