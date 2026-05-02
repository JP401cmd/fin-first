'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { SyncStatusBadge } from './sync-status-badge'
import type { FreshnessStatus } from '@/lib/connections-data'

interface ConnectionCardProps {
  status: FreshnessStatus
  label: string
  sublabel?: string
  amount?: string
  amountLabel?: string
  lastSyncedAt?: Date | string | null
  errorMessage?: string | null
  onSync?: () => void
  onTest?: () => void
  onEdit?: () => void
  onDisconnect?: () => void
  syncing?: boolean
  testing?: boolean
  /** Optional deeplink to the linked asset; rendered as small inline link in the card header. */
  linkedAssetHref?: string
  linkedAssetName?: string
  children?: ReactNode
}

export function ConnectionCard({
  status,
  label,
  sublabel,
  amount,
  amountLabel,
  lastSyncedAt,
  errorMessage,
  onSync,
  onTest,
  onEdit,
  onDisconnect,
  syncing = false,
  testing = false,
  linkedAssetHref,
  linkedAssetName,
  children,
}: ConnectionCardProps) {
  return (
    <article className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 transition-shadow hover:shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">{label}</p>
          {sublabel && (
            <p className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
              {sublabel}
            </p>
          )}
          {linkedAssetHref && linkedAssetName && (
            <Link
              href={linkedAssetHref}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ink-2)] underline decoration-[var(--border-ed)] underline-offset-4 transition-colors hover:text-[var(--ink)] hover:decoration-[var(--ink-2)]"
            >
              <span className="truncate">Gekoppeld aan {linkedAssetName}</span>
              <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            </Link>
          )}
          <div className="mt-2">
            <SyncStatusBadge status={status} lastSyncedAt={lastSyncedAt} />
          </div>
        </div>
        {amount && (
          <div className="text-right">
            <p className="font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
              {amount}
            </p>
            {amountLabel && (
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                {amountLabel}
              </p>
            )}
          </div>
        )}
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {errorMessage}
        </div>
      )}

      {children && <div className="mt-3">{children}</div>}

      {(onSync || onTest || onEdit || onDisconnect) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-ed)] pt-3">
          {onSync && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing || testing}
              className="inline-flex items-center gap-1.5 border border-[var(--border-md)] bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-[var(--paper)] transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing ? 'Synchroniseren…' : 'Synchroniseer nu'}
            </button>
          )}
          {onTest && (
            <button
              type="button"
              onClick={onTest}
              disabled={testing || syncing}
              className="inline-flex items-center gap-1.5 border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-all hover:-translate-y-px hover:bg-[var(--subtle)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? 'Testen…' : 'Test verbinding'}
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-all hover:-translate-y-px hover:bg-[var(--subtle)]"
            >
              Bewerk
            </button>
          )}
          {onDisconnect && (
            <button
              type="button"
              onClick={onDisconnect}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:text-red-700"
            >
              Ontkoppel
            </button>
          )}
        </div>
      )}
    </article>
  )
}
