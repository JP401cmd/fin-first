'use client'

// Header-knop voor globale sync. Drie visuele states:
//
//   - idle    → roterend `RefreshCw` icoon, geen indicator
//   - syncing → spin-animation + kleine "3/7" tekst onder het icoon (desktop)
//   - partial → grijze icoon met rode dot rechtsboven; klik opent het rapport
//
// De leesronde ("welke doelen mogen nu mee?") en het starten van de ronde staan
// bewust NIET hier maar in `useGlobalSyncRunner` — het ⌘K-palet start dezelfde
// ronde en moet dezelfde doelen meekrijgen. Deze knop is alleen nog de drie
// visuele states plus de klik.

import { useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { useGlobalSync } from './global-sync-provider'
import { useGlobalSyncRunner } from './use-global-sync-runner'
import {
  formatAmsterdamDayMonth,
  formatAmsterdamDayMonthYear,
  formatAmsterdamTime,
  isSameAmsterdamDay,
  isSameAmsterdamYear,
} from '@/lib/tz'

interface GlobalSyncButtonProps {
  onOpenReport: () => void
}

// Krant-stijl tijdnotatie (zie FreshnessLabel): HH:mm vandaag, d MMM dit
// jaar, d MMM yyyy ouder — geen relatieve tijden ("2 uur geleden").
//
// Uur en kalenderdag komen uit `lib/tz.ts` (Europe/Amsterdam), niet uit de
// lokale getters: de server draait in UTC en zou dan een ander uur renderen dan
// de browser — de #418-klasse.
function formatRelative(iso: string | null): string {
  if (!iso) return 'Nog niet gesynchroniseerd'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return 'Onbekend'
  const now = new Date()
  if (now.getTime() - d.getTime() < 60_000) return 'zojuist gesynchroniseerd'
  if (isSameAmsterdamDay(d, now)) return `laatste sync ${formatAmsterdamTime(d)}`
  if (isSameAmsterdamYear(d, now)) return `laatste sync ${formatAmsterdamDayMonth(d)}`
  return `laatste sync ${formatAmsterdamDayMonthYear(d)}`
}

export function GlobalSyncButton({ onOpenReport }: GlobalSyncButtonProps) {
  const { state } = useGlobalSync()
  const { runGlobalSync, loadingTargets } = useGlobalSyncRunner()

  const isSyncing = state.phase === 'syncing'
  const isPartial = state.phase === 'partial'
  const disabled = isSyncing || loadingTargets

  const handleClick = useCallback(async () => {
    if (isPartial) {
      // Klik tijdens partial-state opent het rapport zodat user de fouten ziet.
      onOpenReport()
      return
    }
    if (disabled) return
    await runGlobalSync()
  }, [isPartial, disabled, onOpenReport, runGlobalSync])

  // Bronnen, niet koppelingen: de prijzenverversing telt net zo goed mee als een
  // exchange- of bankkoppeling. Zelfde noemer als de eindmelding ("2 van 2
  // bronnen") — die twee liepen uiteen en spraken elkaar tegen; zie de noot bij
  // `State.totalJobs`. Overgeslagen bankkoppelingen zitten hier niet in: ze zijn
  // geen job en hebben hun eigen melding.
  const tooltip = isSyncing
    ? `Synchroniseren… ${state.completedJobs}/${state.totalJobs} ${
        state.totalJobs === 1 ? 'bron' : 'bronnen'
      }`
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
      {isSyncing && state.totalJobs > 1 && (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 right-0.5 rounded bg-[var(--ink)] px-1 font-mono text-[9px] leading-3 tabular-nums text-[var(--paper)]"
        >
          {state.completedJobs}/{state.totalJobs}
        </span>
      )}
    </button>
  )
}
