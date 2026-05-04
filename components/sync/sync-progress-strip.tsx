'use client'

// Compacte progress-strip die zowel onder de header-knop als bovenin het sync-
// rapport gebruikt wordt. Toont een determinate progress bar over álle jobs
// (koppelingen + prijsrefresh) maar in de tekst tellen we alleen koppelingen
// — de prijsrefresh is een impliciete vervolgstap, geen aparte "koppeling".

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

  const completedConnections = Object.values(state.perConnection).filter(
    (r) => r.kind !== 'prices',
  ).length
  const totalConnections = state.totalConnections
  const pricesDone = Boolean(state.perConnection.prices)
  const onPricesStep = state.currentJob?.kind === 'prices'

  const errors = Object.values(state.perConnection).filter((r) => r.outcome === 'error').length

  // Bouw de count-tekst contextueel op:
  //   • Tijdens koppelingen-fase: "1/2 koppelingen"
  //   • Tijdens prijzen-fase:     "2 koppelingen · prijzen verversen…"
  //   • Geen koppelingen, alleen prijzen: "Prijzen verversen…"
  let countLabel: string
  if (totalConnections === 0 && state.pricesIncluded) {
    countLabel = onPricesStep || !pricesDone ? 'Prijzen verversen…' : 'Prijzen ververst'
  } else if (onPricesStep) {
    const word = totalConnections === 1 ? 'koppeling' : 'koppelingen'
    countLabel = `${completedConnections} ${word} · prijzen verversen…`
  } else {
    const word = totalConnections === 1 ? 'koppeling' : 'koppelingen'
    countLabel = `${completedConnections}/${totalConnections} ${word}`
    if (state.pricesIncluded && !pricesDone) {
      countLabel += ' · + prijzen'
    }
  }

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
