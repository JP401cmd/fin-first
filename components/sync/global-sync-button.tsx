'use client'

// Header-knop voor globale sync. Drie visuele states:
//
//   - idle    → roterend `RefreshCw` icoon, geen indicator
//   - syncing → spin-animation + kleine "3/7" tekst onder het icoon (desktop)
//   - partial → grijze icoon met rode dot rechtsboven; klik opent het rapport
//
// De knop fetcht de connections-lijst zelf bij click — anders zou hij telkens
// een server-component moeten zijn. Voor wallets/exchanges met veel rijen valt
// dit binnen <200ms (één Supabase round-trip).

import { useCallback, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useGlobalSync } from './global-sync-provider'
import { useToast } from '@/components/app/toast-provider'
import type { ConnectionsData } from '@/lib/connections-data'

interface GlobalSyncButtonProps {
  onOpenReport: () => void
}

const NL_MONTH_ABBR = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

// Krant-stijl tijdnotatie (zie FreshnessLabel): HH:mm vandaag, d MMM dit
// jaar, d MMM yyyy ouder — geen relatieve tijden ("2 uur geleden").
function formatRelative(iso: string | null): string {
  if (!iso) return 'Nog niet gesynchroniseerd'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return 'Onbekend'
  const now = new Date()
  if (now.getTime() - d.getTime() < 60_000) return 'zojuist gesynchroniseerd'
  const pad = (n: number) => String(n).padStart(2, '0')
  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (isSameDay) return `laatste sync ${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.getFullYear() === now.getFullYear()) {
    return `laatste sync ${d.getDate()} ${NL_MONTH_ABBR[d.getMonth()]}`
  }
  return `laatste sync ${d.getDate()} ${NL_MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`
}

export function GlobalSyncButton({ onOpenReport }: GlobalSyncButtonProps) {
  const { state, triggerGlobalSync } = useGlobalSync()
  const { addToast } = useToast()
  const [loadingConnections, setLoadingConnections] = useState(false)

  const isSyncing = state.phase === 'syncing'
  const isPartial = state.phase === 'partial'
  const disabled = isSyncing || loadingConnections

  const handleClick = useCallback(async () => {
    if (isPartial) {
      // Klik tijdens partial-state opent het rapport zodat user de fouten ziet.
      onOpenReport()
      return
    }
    if (disabled) return

    setLoadingConnections(true)
    try {
      const res = await fetch('/api/integrations/connections', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error('Kon koppelingen niet laden')
      }
      const data = (await res.json()) as ConnectionsData
      const totalConnections = data.exchanges.length + data.wallets.length

      await triggerGlobalSync({
        exchanges: data.exchanges,
        wallets: data.wallets,
        pricesOnly: totalConnections === 0,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout'
      addToast({ type: 'error', title: 'Sync mislukt', message })
    } finally {
      setLoadingConnections(false)
    }
  }, [isPartial, disabled, onOpenReport, triggerGlobalSync, addToast])

  const completedConnections = Object.values(state.perConnection).filter(
    (r) => r.kind !== 'prices',
  ).length
  const tooltip = isSyncing
    ? state.totalConnections > 0
      ? `Synchroniseren… ${completedConnections}/${state.totalConnections} koppelingen`
      : 'Prijzen verversen…'
    : isPartial
      ? 'Laatste sync had fouten — klik voor rapport'
      : `Synchroniseer nu · ${formatRelative(state.lastFinishedAt)}`

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled && !isPartial}
      aria-label="Synchroniseer alle koppelingen"
      aria-busy={isSyncing}
      title={tooltip}
      className="relative flex h-8 w-8 items-center justify-center text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] disabled:cursor-wait md:h-11 md:w-11"
    >
      <RefreshCw
        className={`h-3.5 w-3.5 md:h-5 md:w-5 ${isSyncing ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      {isPartial && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[var(--paper)]"
        />
      )}
      {isSyncing && state.totalConnections > 1 && (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 right-0.5 rounded bg-[var(--ink)] px-1 font-mono text-[9px] leading-3 tabular-nums text-[var(--paper)]"
        >
          {completedConnections}/{state.totalConnections}
        </span>
      )}
    </button>
  )
}
