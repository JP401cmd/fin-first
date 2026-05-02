'use client'

// ISIN-resolver status card for /identity/koppelingen → Beleggingen.
//
// Polls /api/integrations/market-data/isin-lookup/status once on mount and
// renders one of three states:
//   - configured + within-quota   → "Actief" + "X/250 calls vandaag"
//   - configured + quota-exhausted → "Uitgeput" badge + reset-time
//   - not configured              → "Niet geconfigureerd" + setup hint

import { useEffect, useState } from 'react'

interface FmpStatus {
  callsToday: number
  dailyLimit: number
  resetAt: string
  configured: boolean
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; status: FmpStatus }
  | { kind: 'error' }

function formatResetTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('nl-NL', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}

export function IsinResolverStatus() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const res = await fetch('/api/integrations/market-data/isin-lookup/status', { cache: 'no-store' })
        if (!res.ok) {
          if (active) setState({ kind: 'error' })
          return
        }
        const json = (await res.json()) as FmpStatus
        if (active) setState({ kind: 'ready', status: json })
      } catch {
        if (active) setState({ kind: 'error' })
      }
    })()
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">ISIN/ticker-resolver</p>
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">
            Plak een ISIN bij een nieuwe holding, krijg ticker en naam terug. Gebruikt
            Financial Modeling Prep.
          </p>
          {state.kind === 'ready' && state.status.configured && (
            <p className="mt-1 font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
              {state.status.callsToday}/{state.status.dailyLimit} calls vandaag · reset om{' '}
              {formatResetTime(state.status.resetAt)}
            </p>
          )}
          {state.kind === 'ready' && !state.status.configured && (
            <p className="mt-1 font-serif text-[11px] italic text-[var(--ink-3)]">
              Voeg <code className="font-mono text-[10px] text-[var(--ink-2)]">FMP_API_KEY</code> toe
              aan environment om automatische ISIN-lookup te activeren.
            </p>
          )}
          {state.kind === 'error' && (
            <p className="mt-1 font-serif text-[11px] italic text-[var(--ink-3)]">
              Status onbekend. Controleer of je bent ingelogd en probeer opnieuw.
            </p>
          )}
        </div>
        <StatusBadge state={state} />
      </div>
    </div>
  )
}

function StatusBadge({ state }: { state: LoadState }) {
  if (state.kind === 'loading') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--ink-4)]" aria-hidden="true" />
        Laden…
      </span>
    )
  }

  if (state.kind === 'error') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--ink-4)]" aria-hidden="true" />
        Onbekend
      </span>
    )
  }

  const { status } = state
  if (!status.configured) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--ink-4)]" aria-hidden="true" />
        Niet geconfigureerd
      </span>
    )
  }

  const exhausted = status.callsToday >= status.dailyLimit
  if (exhausted) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 border border-[color-mix(in_oklab,var(--negative)_30%,transparent)] bg-[color-mix(in_oklab,var(--negative)_8%,transparent)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-negative">
        <span className="inline-block h-2 w-2 rounded-full bg-negative" aria-hidden="true" />
        Uitgeput
      </span>
    )
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 border border-[color-mix(in_oklab,var(--positive)_30%,transparent)] bg-[color-mix(in_oklab,var(--positive)_8%,transparent)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-positive">
      <span className="inline-block h-2 w-2 rounded-full bg-positive" aria-hidden="true" />
      Actief
    </span>
  )
}
