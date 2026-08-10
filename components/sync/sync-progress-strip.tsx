'use client'

// Compacte progress-strip die zowel onder de header-knop als bovenin het sync-
// rapport gebruikt wordt. Balk én tekst tellen BRONNEN: elke job die een verzoek
// doet, de prijzenverversing daarbij inbegrepen.
//
// De tekst telde tot 10 aug 2026 alleen "koppelingen" en liet de prijsrefresh
// bewust weg. Dat was een tweede noemer naast die van de eindmelding, en dan
// spreekt één ronde zichzelf tegen ("2 van 2 bronnen" naast een teller die er 1
// ziet). Eén definitie — zie de noot bij `State.totalJobs`. Welke bron nú aan de
// beurt is, staat er in de `full`-variant naast (`currentJob.label`).

import { useGlobalSync } from './global-sync-provider'

interface SyncProgressStripProps {
  /** When true, render a wider strip with extra context (used in the modal header). */
  variant?: 'compact' | 'full'
}

export function SyncProgressStrip({ variant = 'compact' }: SyncProgressStripProps) {
  const { state } = useGlobalSync()

  if (state.phase !== 'syncing') return null

  const pct = state.totalJobs > 0
    ? Math.round((state.completedJobs / state.totalJobs) * 100)
    : 0

  const errors = Object.values(state.perConnection).filter((r) => r.outcome === 'error').length

  const countLabel = `${state.completedJobs}/${state.totalJobs} ${
    state.totalJobs === 1 ? 'bron' : 'bronnen'
  }`

  if (variant === 'compact') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-[var(--ink-3)]"
      >
        <span>{countLabel}</span>
        {errors > 0 && (
          <span className="text-red-600" aria-label={`${errors} fout${errors === 1 ? '' : 'en'}`}>
            · {errors} fout
          </span>
        )}
      </div>
    )
  }

  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-[var(--ink)]">
          Synchroniseren…
          {state.currentJob && (
            <span className="ml-2 font-normal text-[var(--ink-3)]">{state.currentJob.label}</span>
          )}
        </p>
        <p className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
          {countLabel}
          {errors > 0 && (
            <span className="ml-2 text-red-600">· {errors} fout{errors === 1 ? '' : 'en'}</span>
          )}
        </p>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
        <div
          className="h-full bg-[var(--ink)] transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
